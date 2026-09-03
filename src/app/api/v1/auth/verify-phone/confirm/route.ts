// src/app/api/v1/auth/verify-phone/confirm/route.ts
// POST /api/v1/auth/verify-phone/confirm
// Body: { phoneNumber, otp }
//
// On success: sets phone_verified_at = NOW(), which unlocks:
// - Phone-based login (AUTH_SPECIFICATION.md §3)
// - Phone trust-score bonus (00-SYSTEM_CONTEXT.md §4)

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/get-current-user';
import { prisma } from '@/lib/prisma';
import { phoneNumberSchema } from '@/lib/zod-utils';

const schema = z.object({
  phoneNumber: phoneNumberSchema,
  otp: z.string().length(6, 'OTP must be 6 digits').regex(/^\d+$/, 'OTP must be numeric'),
});

export async function POST(req: NextRequest) {
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

  const result = schema.safeParse(body);
  if (!result.success) {
    return Response.json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: result.error.issues },
      },
      { status: 400 }
    );
  }

  const { phoneNumber, otp } = result.data;

  // Look up the OTP record
  const identifier = `phone:${phoneNumber}`;
  const verification = await prisma.verification.findFirst({
    where: { identifier },
    orderBy: { created_at: 'desc' },
  });

  if (!verification) {
    return Response.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'No OTP found for this phone number. Please request a new one.' } },
      { status: 404 }
    );
  }

  // Check expiry
  if (verification.expires_at < new Date()) {
    await prisma.verification.deleteMany({ where: { identifier } });
    return Response.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'OTP has expired. Please request a new one.' } },
      { status: 401 }
    );
  }

  // Check OTP value
  if (verification.value !== otp) {
    return Response.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid OTP.' } },
      { status: 401 }
    );
  }

  // OTP is valid — verify the phone and delete the used OTP
  const [updatedUser] = await prisma.$transaction([
    prisma.users.update({
      where: { id: user.id },
      data: { phone_number: phoneNumber, phone_verified_at: new Date() },
    }),
    prisma.verification.deleteMany({ where: { identifier } }),
  ]);

  return Response.json(
    {
      success: true,
      data: {
        message: 'Phone number verified successfully.',
        phoneVerifiedAt: updatedUser.phone_verified_at,
      },
    },
    { status: 200 }
  );
}
