// src/app/api/auth/[...all]/route.ts
// Mounts every Better-Auth endpoint under /api/auth/**.
// The [...all] catch-all captures Better-Auth's internal route tree
// (sign-in/email, sign-out, session, social callbacks, etc.).

import { auth } from '@/lib/auth';
import type { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
  return auth.handler(req);
}

export async function POST(req: NextRequest) {
  return auth.handler(req);
}
