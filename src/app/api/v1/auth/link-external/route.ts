// src/app/api/v1/auth/link-external/route.ts
// POST /api/v1/auth/link-external
// Links an OAuth/Telegram identity to the logged-in user's existing account.
//
// Body: { provider: 'google'|'apple'|'telegram', idToken?, ...telegramPayload? }
// - Google/Apple: provide idToken.
// - Telegram: provide the full Telegram widget payload.
// - Never auto-merges accounts by email/phone — always requires explicit linking.

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/get-current-user';
import { prisma } from '@/lib/prisma';
import { verifyTelegramHash, type TelegramWidgetPayload } from '@/lib/telegram';

const linkSchema = z.union([
  z.object({
    provider: z.enum(['google', 'apple']),
    idToken: z.string().min(1),
  }),
  z.object({
    provider: z.literal('telegram'),
    id: z.union([z.string(), z.number()]),
    first_name: z.string(),
    last_name: z.string().optional(),
    username: z.string().optional(),
    photo_url: z.string().optional(),
    auth_date: z.union([z.string(), z.number()]),
    hash: z.string(),
  }),
]);

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

  const result = linkSchema.safeParse(body);
  if (!result.success) {
    return Response.json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: result.error.issues },
      },
      { status: 400 }
    );
  }

  const data = result.data;

  let providerUserId: string;
  let providerEmail: string | null = null;
  let providerUsername: string | null = null;

  if (data.provider === 'telegram') {
    // Verify Telegram widget hash
    try {
      const valid = verifyTelegramHash(data as TelegramWidgetPayload);
      if (!valid) {
        return Response.json(
          { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid Telegram hash' } },
          { status: 401 }
        );
      }
    } catch (err: unknown) {
      return Response.json(
        {
          success: false,
          error: { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Telegram verification failed' },
        },
        { status: 500 }
      );
    }
    providerUserId = String(data.id);
    providerUsername = data.username ?? null;
  } else {
    // Google / Apple — verify idToken
    try {
      const profile = await verifyProviderToken(data.provider, data.idToken);
      providerUserId = profile.sub;
      providerEmail = profile.email ?? null;
    } catch (err: unknown) {
      return Response.json(
        {
          success: false,
          error: { code: 'UNAUTHORIZED', message: `Invalid ${data.provider} token: ${err instanceof Error ? err.message : ''}` },
        },
        { status: 401 }
      );
    }
  }

  // Check if this provider identity is already linked to another account
  const existingAccount = await prisma.user_external_accounts.findUnique({
    where: {
      provider_provider_user_id: { provider: data.provider, provider_user_id: providerUserId },
    },
  });

  if (existingAccount && existingAccount.user_id !== user.id) {
    return Response.json(
      {
        success: false,
        error: {
          code: 'ACCOUNT_EXISTS_NOT_LINKED',
          message: 'This identity is already linked to a different account.',
        },
      },
      { status: 409 }
    );
  }

  if (existingAccount && existingAccount.user_id === user.id) {
    return Response.json(
      { success: false, error: { code: 'CONFLICT', message: 'This identity is already linked to your account.' } },
      { status: 409 }
    );
  }

  // Link the external identity
  await prisma.user_external_accounts.create({
    data: {
      user_id: user.id,
      provider: data.provider,
      provider_user_id: providerUserId,
      provider_email: providerEmail ?? null,
      provider_username: providerUsername ?? null,
    },
  });

  // Return the full list of linked providers
  const allAccounts = await prisma.user_external_accounts.findMany({
    where: { user_id: user.id },
    select: { provider: true, provider_username: true, provider_email: true },
  });

  return Response.json(
    { success: true, data: { linkedProviders: allAccounts } },
    { status: 200 }
  );
}

async function verifyProviderToken(provider: 'google' | 'apple', idToken: string) {
  if (provider === 'google') {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    if (!res.ok) throw new Error('Google token verification failed');
    const data = await res.json();
    if (!data.sub) throw new Error('Missing sub');
    return data as { sub: string; email?: string };
  } else {
    const parts = idToken.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      sub: string;
      email?: string;
      iss?: string;
    };
    if (!payload.sub) throw new Error('Missing sub');
    if (payload.iss !== 'https://appleid.apple.com') throw new Error('Invalid issuer');
    return payload;
  }
}
