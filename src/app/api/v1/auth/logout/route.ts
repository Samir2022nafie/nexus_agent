// src/app/api/v1/auth/logout/route.ts
// POST /api/v1/auth/logout
// Revokes the session tied to the bearer token.

import type { NextRequest } from 'next/server';
import { getCurrentUser } from '@/lib/get-current-user';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return Response.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 }
    );
  }

  // Extract the bearer token from the Authorization header
  const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

  if (token) {
    // Delete the specific session associated with this token
    await prisma.sessions.deleteMany({
      where: { token, user_id: user.id },
    });
  }

  return Response.json({ success: true, data: { message: 'Logged out successfully' } }, { status: 200 });
}
