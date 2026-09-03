// src/app/api/v1/users/me/route.ts
// GET  /api/v1/users/me — returns the full user row for the authenticated caller.
// PATCH /api/v1/users/me — updates profile fields.
// DELETE /api/v1/users/me — soft deletes the account (deleted_at = NOW()).

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/get-current-user';
import { prisma } from '@/lib/prisma';
import { phoneNumberSchema } from '@/lib/zod-utils';

// ---------------------------------------------------------------------------
// GET /api/v1/users/me
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return Response.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 }
    );
  }

  return Response.json({ success: true, data: { user: serializeUser(user) } }, { status: 200 });
}

// ---------------------------------------------------------------------------
// PATCH /api/v1/users/me
// ---------------------------------------------------------------------------
const patchSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  bio: z.string().max(500).optional(),
  profilePictureUrl: z.string().url('Must be a valid URL').optional().nullable(),
  phoneNumber: phoneNumberSchema.optional().nullable(),
});

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return Response.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
      { status: 400 }
    );
  }

  const result = patchSchema.safeParse(body);
  if (!result.success) {
    return Response.json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: result.error.issues },
      },
      { status: 400 }
    );
  }

  const { firstName, lastName, bio, profilePictureUrl, phoneNumber } = result.data;

  // If phoneNumber is changing, reset phone_verified_at
  const phoneChanging =
    phoneNumber !== undefined && phoneNumber !== user.phone_number;

  const updatedUser = await prisma.users.update({
    where: { id: user.id },
    data: {
      ...(firstName !== undefined && { first_name: firstName }),
      ...(lastName !== undefined && { last_name: lastName }),
      ...(bio !== undefined && { bio }),
      ...(profilePictureUrl !== undefined && { profile_picture_url: profilePictureUrl }),
      ...(phoneNumber !== undefined && { phone_number: phoneNumber }),
      ...(phoneChanging && { phone_verified_at: null }),
    },
  });

  return Response.json(
    { success: true, data: { user: serializeUser(updatedUser) } },
    { status: 200 }
  );
}

// ---------------------------------------------------------------------------
// DELETE /api/v1/users/me — soft delete
// ---------------------------------------------------------------------------
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return Response.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 }
    );
  }

  await prisma.users.update({
    where: { id: user.id },
    data: { deleted_at: new Date() },
  });

  // Revoke all sessions
  await prisma.sessions.deleteMany({ where: { user_id: user.id } });

  return Response.json(
    { success: true, data: { message: 'Account soft-deleted successfully.' } },
    { status: 200 }
  );
}

// ---------------------------------------------------------------------------
// Serializer — returns full user row (safe subset for API response)
// ---------------------------------------------------------------------------
function serializeUser(user: {
  id: string;
  username: string;
  email?: string | null;
  email_verified: boolean;
  email_verified_at?: Date | null;
  first_name: string;
  last_name: string;
  name?: string | null;
  bio?: string | null;
  phone_number?: string | null;
  phone_verified_at?: Date | null;
  profile_picture_url?: string | null;
  birth_date: Date;
  trust_score: number;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date | null;
}) {
  return {
    id: user.id,
    username: user.username,
    email: user.email ?? null,
    emailVerified: user.email_verified,
    emailVerifiedAt: user.email_verified_at ?? null,
    firstName: user.first_name,
    lastName: user.last_name,
    name: user.name ?? null,
    bio: user.bio ?? null,
    phoneNumber: user.phone_number ?? null,
    phoneVerifiedAt: user.phone_verified_at ?? null,
    profilePictureUrl: user.profile_picture_url ?? null,
    birthDate: user.birth_date,
    trustScore: user.trust_score,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}
