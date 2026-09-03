// src/lib/get-current-user.ts
// Canonical per-request auth helper — see AUTH_SPECIFICATION.md §2.
//
// ALWAYS use this in route handlers. NEVER call auth.api.getSession() directly.
//
// What this does that auth.api.getSession() alone does not:
// 1. Returns the FULL users row (not just Better-Auth's mapped session fields).
// 2. Filters out soft-deleted accounts (deleted_at IS NOT NULL).
// 3. Returns null for both unauthenticated AND soft-deleted callers.

import type { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * Returns the full `users` row for the authenticated caller, or null if:
 * - No valid bearer token is present in the request.
 * - The session is expired / invalid.
 * - The user account has been soft-deleted (deleted_at IS NOT NULL).
 */
export async function getCurrentUser(req: NextRequest) {
  // Let Better-Auth resolve the bearer token from the Authorization header.
  const session = await auth.api.getSession({ headers: req.headers });

  if (!session?.user?.id) {
    return null;
  }

  // Fetch the FULL row — Better-Auth's session only contains the fields
  // explicitly mapped in auth.ts (id, email, name, image, username, firstName,
  // lastName, birthDate, phoneNumber). bio, trust_score, deleted_at, etc. are
  // NOT in the session object.
  const user = await prisma.users.findUnique({
    where: {
      id: session.user.id,
      deleted_at: null, // soft-delete gate
    },
  });

  return user; // null if not found or soft-deleted
}
