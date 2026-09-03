// src/lib/manual-session.ts
// Creates a bearer session by inserting directly into the `sessions` table.
//
// Used for:
// - Phone-only password logins (no email on the account) — AUTH_SPECIFICATION.md §3
// - Bot logins (v1.2, reserved) — AUTH_SPECIFICATION.md §4
//
// The bearer() plugin in auth.ts recognizes these tokens exactly like tokens it
// created itself, because they live in the same `sessions` table with the same schema.
//
// Do NOT write a second session-issuance path — always reuse this helper.

import type { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';

/** Session lifetime — 30 days, matching Better-Auth's default. */
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Inserts a new session row and returns the bearer token string.
 *
 * @param userId - The `users.id` to associate with the session.
 * @param req    - The incoming Next.js request (used to capture ip_address / user_agent).
 * @returns      The raw 64-char hex bearer token.
 */
export async function createManualSession(
  userId: string,
  req: NextRequest
): Promise<string> {
  const token = randomBytes(32).toString('hex'); // 64 hex chars
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  // Extract ip / ua for audit purposes
  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null;
  const userAgent = req.headers.get('user-agent') ?? null;

  await prisma.sessions.create({
    data: {
      user_id: userId,
      token,
      expires_at: expiresAt,
      ip_address: ipAddress,
      user_agent: userAgent,
    },
  });

  return token;
}
