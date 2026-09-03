// src/app/api/v1/auth/login/route.ts
// POST /api/v1/auth/login
//
// Body: { identifier, password }
//   identifier = email address OR a phone number where phone_verified_at IS NOT NULL
//
// Resolution logic (AUTH_SPECIFICATION.md §3):
// 1. Try to find user by email OR verified phone (unverified phone cannot log in).
// 2a. If found user has an email → delegate to Better-Auth's signInEmail.
// 2b. If phone-only (no email) → verify password directly against credential row,
//     then issue a session via createManualSession().

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { identifierSchema } from '@/lib/zod-utils';
import { createManualSession } from '@/lib/manual-session';

const loginSchema = z.object({
  identifier: identifierSchema,
  password: z.string().min(1, 'Password is required'),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 }
    );
  }

  const result = loginSchema.safeParse(body);
  if (!result.success) {
    return Response.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: result.error.issues,
        },
      },
      { status: 400 }
    );
  }

  const { identifier, password } = result.data;

  // Step 1: Resolve identifier → user
  const user = await prisma.users.findFirst({
    where: {
      deleted_at: null,
      OR: [
        { email: identifier.toLowerCase() },
        // Unverified phone CANNOT be used as a login identifier
        { phone_number: identifier, phone_verified_at: { not: null } },
      ],
    },
  });

  if (!user) {
    return Response.json(
      {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
      },
      { status: 401 }
    );
  }

  // Step 2a: User has an email — delegate to Better-Auth
  if (user.email) {
    try {
      const response = await auth.api.signInEmail({
        body: { email: user.email, password },
        asResponse: true,
      }) as Response;

      if (!response.ok) {
        return Response.json(
          {
            success: false,
            error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
          },
          { status: 401 }
        );
      }

      const data = await response.json() as { token?: string; user?: unknown };

      return Response.json(
        {
          success: true,
          data: {
            user: serializeUser(user),
            token: data.token ?? null,
          },
        },
        { status: 200 }
      );
    } catch {
      return Response.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
        },
        { status: 401 }
      );
    }
  }

  // Step 2b: Phone-only user — check credential row directly
  const credentialAccount = await prisma.user_external_accounts.findFirst({
    where: {
      user_id: user.id,
      provider: 'credential',
    },
  });

  if (!credentialAccount?.password) {
    return Response.json(
      {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
      },
      { status: 401 }
    );
  }

  const { verifyPassword } = await import('better-auth/crypto');
  const passwordValid = await verifyPassword({
    password,
    hash: credentialAccount.password,
  });

  if (!passwordValid) {
    return Response.json(
      {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' },
      },
      { status: 401 }
    );
  }

  // Issue a manual session (phone-only, no email for Better-Auth signInEmail)
  const token = await createManualSession(user.id, req);

  return Response.json(
    {
      success: true,
      data: {
        user: serializeUser(user),
        token,
      },
    },
    { status: 200 }
  );
}

function serializeUser(user: {
  id: string;
  username: string;
  email?: string | null;
  first_name: string;
  last_name: string;
  phone_number?: string | null;
  trust_score: number;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email ?? null,
    firstName: user.first_name,
    lastName: user.last_name,
    phoneNumber: user.phone_number ?? null,
    trustScore: user.trust_score,
  };
}
