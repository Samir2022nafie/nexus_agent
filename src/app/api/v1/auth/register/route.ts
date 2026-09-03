// src/app/api/v1/auth/register/route.ts
// POST /api/v1/auth/register
//
// Body: { username, email?, phoneNumber?, password, firstName, lastName, birthDate }
// - At least one of email / phoneNumber is required (Zod .refine()).
// - Age >= 13 enforced in Zod (in addition to DB-level chk_users_age constraint).
// - phoneNumber, if provided, is stored unverified (phone_verified_at remains null).
// - Password is stored as a `credential` row in user_external_accounts — never in users.password_hash.

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { slugSchema, phoneNumberSchema } from '@/lib/zod-utils';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const registerSchema = z
  .object({
    username: z
      .string()
      .min(3, 'Username must be at least 3 characters')
      .max(30, 'Username must be at most 30 characters')
      .regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, digits, and underscores'),
    email: z.email('Invalid email address').optional(),
    phoneNumber: phoneNumberSchema.optional(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    firstName: z.string().min(1).max(50),
    lastName: z.string().min(1).max(50),
    birthDate: z.coerce
      .date()
      .refine((d) => {
        const ageMsec = Date.now() - d.getTime();
        const ageYears = ageMsec / (1000 * 60 * 60 * 24 * 365.25);
        return ageYears >= 13;
      }, 'Must be at least 13 years old to register'),
  })
  .refine((data) => data.email || data.phoneNumber, {
    message: 'At least one of email or phoneNumber is required',
    path: ['email'],
  });

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
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

  const result = registerSchema.safeParse(body);
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

  const { username, email, phoneNumber, password, firstName, lastName, birthDate } = result.data;

  // Check for existing username / email / phone
  const existingUser = await prisma.users.findFirst({
    where: {
      OR: [
        { username },
        ...(email ? [{ email }] : []),
        ...(phoneNumber ? [{ phone_number: phoneNumber }] : []),
      ],
    },
  });

  if (existingUser) {
    let field = 'username';
    if (existingUser.email === email) field = 'email';
    if (existingUser.phone_number === phoneNumber) field = 'phoneNumber';
    return Response.json(
      {
        success: false,
        error: {
          code: 'CONFLICT',
          message: `An account with this ${field} already exists`,
        },
      },
      { status: 409 }
    );
  }

  // Use Better-Auth's signUpEmail to create the user + credential account row.
  // We must supply an email (even a placeholder isn't allowed), so for phone-only
  // accounts we create the user manually via Prisma + hash the password ourselves.
  if (email) {
    // Email path — delegate to Better-Auth so it handles hashing + account row.
    const response = await auth.api.signUpEmail({
      body: {
        email,
        password,
        name: `${firstName} ${lastName}`,
      },
      asResponse: true,
    }) as Response;

    if (!response.ok) {
      const errBody = await response.json() as { message?: string };
      // Check for duplicate email (409)
      if (response.status === 409) {
        return Response.json(
          { success: false, error: { code: 'CONFLICT', message: errBody.message ?? 'Email already registered' } },
          { status: 409 }
        );
      }
      return Response.json(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'Registration failed' } },
        { status: 500 }
      );
    }

    const signUpData = await response.json() as { user?: { id?: string }; token?: string };

    if (!signUpData?.user?.id) {
      return Response.json(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'Registration failed' } },
        { status: 500 }
      );
    }

    // Patch extra fields Better-Auth doesn't know about yet
    const user = await prisma.users.update({
      where: { id: signUpData.user.id },
      data: {
        username,
        first_name: firstName,
        last_name: lastName,
        birth_date: birthDate,
        phone_number: phoneNumber ?? null,
        phone_verified_at: null,
      },
    });

    return Response.json(
      {
        success: true,
        data: {
          user: serializeUser(user),
          token: signUpData.token ?? null,
        },
      },
      { status: 201 }
    );
  } else {
    // Phone-only path — create user row manually, then create credential account row
    // with hashed password the same way Better-Auth would.
    const { hashPassword } = await import('better-auth/crypto');

    const passwordHash = await hashPassword(password);

    const user = await prisma.users.create({
      data: {
        username,
        first_name: firstName,
        last_name: lastName,
        name: `${firstName} ${lastName}`,
        phone_number: phoneNumber!,
        phone_verified_at: null,
        birth_date: birthDate,
        email_verified: false,
      },
    });

    // Credential row — provider_user_id is the user's own id for credential provider
    await prisma.user_external_accounts.create({
      data: {
        user_id: user.id,
        provider: 'credential',
        provider_user_id: user.id,
        password: passwordHash,
      },
    });

    // Issue a session (phone-only user has no email, so Better-Auth signIn won't work)
    const { createManualSession } = await import('@/lib/manual-session');
    const token = await createManualSession(user.id, req);

    return Response.json(
      {
        success: true,
        data: {
          user: serializeUser(user),
          token,
        },
      },
      { status: 201 }
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function serializeUser(user: {
  id: string;
  username: string;
  email?: string | null;
  first_name: string;
  last_name: string;
  phone_number?: string | null;
  birth_date: Date;
  created_at: Date;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email ?? null,
    firstName: user.first_name,
    lastName: user.last_name,
    phoneNumber: user.phone_number ?? null,
    birthDate: user.birth_date,
    createdAt: user.created_at,
  };
}
