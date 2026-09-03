// src/app/api/v1/auth/verify-phone/route.ts
// POST /api/v1/auth/verify-phone
// Body: { phoneNumber }
//
// Sends an OTP for phone verification.
// OTP is stored in the `verification` table with identifier: "phone:<number>".
// In dev: OTP is console.log'd (no SMS provider wired yet).

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { randomInt } from 'crypto';
import { getCurrentUser } from '@/lib/get-current-user';
import { prisma } from '@/lib/prisma';
import { phoneNumberSchema } from '@/lib/zod-utils';

const schema = z.object({
  phoneNumber: phoneNumberSchema,
});

/** OTP expiry: 10 minutes */
const OTP_TTL_MS = 10 * 60 * 1000;

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

  const { phoneNumber } = result.data;

  // Check the phone isn't already verified by another account
  const existingUser = await prisma.users.findFirst({
    where: {
      phone_number: phoneNumber,
      phone_verified_at: { not: null },
      id: { not: user.id },
      deleted_at: null,
    },
  });

  if (existingUser) {
    return Response.json(
      {
        success: false,
        error: { code: 'CONFLICT', message: 'This phone number is already verified on another account.' },
      },
      { status: 409 }
    );
  }

  // Generate a 6-digit OTP
  const otp = randomInt(100000, 999999).toString();
  const identifier = `phone:${phoneNumber}`;
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  // Upsert the OTP record (replace existing if present)
  await prisma.verification.deleteMany({ where: { identifier } });
  await prisma.verification.create({
    data: { identifier, value: otp, expires_at: expiresAt },
  });

  // Store / update the phone number on the user (unverified)
  if (user.phone_number !== phoneNumber) {
    await prisma.users.update({
      where: { id: user.id },
      data: { phone_number: phoneNumber, phone_verified_at: null },
    });
  }

  // TODO: integrate SMS provider here. For now, log to console in dev.
  console.log(`[DEV] OTP for ${phoneNumber}: ${otp} (expires at ${expiresAt.toISOString()})`);

  return Response.json(
    { success: true, data: { message: 'OTP sent. Check console in dev mode.', phoneNumber } },
    { status: 200 }
  );
}
