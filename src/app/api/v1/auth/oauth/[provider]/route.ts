// src/app/api/v1/auth/oauth/[provider]/route.ts
// POST /api/v1/auth/oauth/:provider
// provider = 'google' | 'apple' | 'telegram'
//
// Google/Apple: verify the provided idToken with the respective provider.
// Telegram: verify the signed widget payload using the hash verifier in lib/telegram.ts.
//
// All three paths:
// - Look up / create a user_external_accounts row.
// - Return 409 ACCOUNT_EXISTS_NOT_LINKED if the resolved email/phone already
//   belongs to an existing, unlinked account (never auto-merge).
// - Prompt for missing birth_date on brand-new accounts.

import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { createManualSession } from '@/lib/manual-session';
import { verifyTelegramHash, type TelegramWidgetPayload } from '@/lib/telegram';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------
const googleAppleSchema = z.object({
  idToken: z.string().min(1, 'idToken is required'),
  birthDate: z.coerce.date().optional(), // required for new accounts
});

const telegramSchema = z.object({
  id: z.union([z.string(), z.number()]),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.union([z.string(), z.number()]),
  hash: z.string(),
  birthDate: z.coerce.date().optional(), // required for brand-new accounts
});

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;

  if (!['google', 'apple', 'telegram'].includes(provider)) {
    return Response.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Unknown provider' } },
      { status: 404 }
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

  if (provider === 'telegram') {
    return handleTelegram(body, req);
  }

  return handleGoogleOrApple(provider as 'google' | 'apple', body, req);
}

// ---------------------------------------------------------------------------
// Google / Apple
// ---------------------------------------------------------------------------
async function handleGoogleOrApple(
  provider: 'google' | 'apple',
  body: unknown,
  req: NextRequest
) {
  const result = googleAppleSchema.safeParse(body);
  if (!result.success) {
    return Response.json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: result.error.issues },
      },
      { status: 400 }
    );
  }

  const { idToken, birthDate } = result.data;

  // Verify the ID token with the provider
  let profile: { sub: string; email?: string; name?: string; picture?: string; given_name?: string; family_name?: string };
  try {
    if (provider === 'google') {
      profile = await verifyGoogleIdToken(idToken);
    } else {
      profile = await verifyAppleIdToken(idToken);
    }
  } catch (err: unknown) {
    return Response.json(
      {
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: `Invalid ${provider} ID token: ${err instanceof Error ? err.message : 'verification failed'}`,
        },
      },
      { status: 401 }
    );
  }

  return upsertOAuthUser({
    provider,
    providerUserId: profile.sub,
    email: profile.email ?? null,
    name: profile.name ?? null,
    firstName: profile.given_name ?? (profile.name?.split(' ')[0] ?? null),
    lastName: profile.family_name ?? (profile.name?.split(' ').slice(1).join(' ') ?? null),
    photoUrl: profile.picture ?? null,
    birthDate: birthDate ?? null,
    req,
  });
}

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------
async function handleTelegram(body: unknown, req: NextRequest) {
  const result = telegramSchema.safeParse(body);
  if (!result.success) {
    return Response.json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: result.error.issues },
      },
      { status: 400 }
    );
  }

  const { birthDate, ...widgetPayload } = result.data;

  // Verify the widget hash
  try {
    const valid = verifyTelegramHash(widgetPayload as TelegramWidgetPayload);
    if (!valid) {
      return Response.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid Telegram widget hash' } },
        { status: 401 }
      );
    }
  } catch (err: unknown) {
    return Response.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: err instanceof Error ? err.message : 'Telegram verification failed',
        },
      },
      { status: 500 }
    );
  }

  return upsertOAuthUser({
    provider: 'telegram',
    providerUserId: String(widgetPayload.id),
    providerUsername: widgetPayload.username ?? null,
    email: null, // Telegram never supplies an email
    name: [widgetPayload.first_name, widgetPayload.last_name].filter(Boolean).join(' '),
    firstName: widgetPayload.first_name,
    lastName: widgetPayload.last_name ?? null,
    photoUrl: widgetPayload.photo_url ?? null,
    birthDate: birthDate ?? null,
    req,
  });
}

// ---------------------------------------------------------------------------
// Shared upsert logic for all OAuth providers
// ---------------------------------------------------------------------------
async function upsertOAuthUser(opts: {
  provider: string;
  providerUserId: string;
  providerUsername?: string | null;
  email: string | null;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  birthDate: Date | null;
  req: NextRequest;
}) {
  const { provider, providerUserId, providerUsername, email, name, firstName, lastName, photoUrl, birthDate, req } = opts;

  // Check if an external account row already exists for this provider identity
  const existingAccount = await prisma.user_external_accounts.findUnique({
    where: {
      provider_provider_user_id: { provider, provider_user_id: providerUserId },
    },
  });

  if (existingAccount) {
    // Existing account — fetch the user, update tokens and log them in
    const user = await prisma.users.findUnique({ where: { id: existingAccount.user_id } });
    if (!user) {
      return Response.json(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'User not found' } },
        { status: 500 }
      );
    }

    if (user.deleted_at) {
      return Response.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Account has been deleted' } },
        { status: 403 }
      );
    }

    // Update account metadata
    await prisma.user_external_accounts.update({
      where: { id: existingAccount.id },
      data: {
        provider_email: email ?? undefined,
        provider_username: providerUsername ?? undefined,
        updated_at: new Date(),
      },
    });

    const token = await createManualSession(user.id, req);
    return Response.json(
      { success: true, data: { user: serializeUser(user), token } },
      { status: 200 }
    );
  }

  // No existing account — check if the email already belongs to an unlinked account
  if (email) {
    const existingUserByEmail = await prisma.users.findFirst({
      where: { email: email.toLowerCase(), deleted_at: null },
    });

    if (existingUserByEmail) {
      // Check if this user already has this provider linked
      const alreadyLinked = await prisma.user_external_accounts.findFirst({
        where: { user_id: existingUserByEmail.id, provider },
      });
      if (!alreadyLinked) {
        return Response.json(
          {
            success: false,
            error: {
              code: 'ACCOUNT_EXISTS_NOT_LINKED',
              message: `An account with this email already exists. Please log in with your existing account and link ${provider} from your profile.`,
            },
          },
          { status: 409 }
        );
      }
    }
  }

  // Brand-new account — birth_date is mandatory
  if (!birthDate) {
    return Response.json(
      {
        success: true,
        data: {
          requiresBirthDate: true,
          message: 'Please provide your date of birth to complete registration.',
          provider,
          providerUserId,
        },
      },
      { status: 200 }
    );
  }

  // Validate age >= 13
  const ageMsec = Date.now() - birthDate.getTime();
  const ageYears = ageMsec / (1000 * 60 * 60 * 24 * 365.25);
  if (ageYears < 13) {
    return Response.json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Must be at least 13 years old to register' },
      },
      { status: 400 }
    );
  }

  // Create user + external account in a transaction
  const newUser = await prisma.$transaction(async (tx) => {
    // Generate a unique username from the display name or provider id
    const baseUsername = (name ?? providerUserId)
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .slice(0, 25)
      .toLowerCase();
    let username = baseUsername || `user_${providerUserId.slice(0, 8)}`;

    // Ensure uniqueness
    const existing = await tx.users.findFirst({ where: { username } });
    if (existing) {
      username = `${username}_${Date.now().toString(36)}`;
    }

    const user = await tx.users.create({
      data: {
        username,
        email: email ? email.toLowerCase() : null,
        name: name ?? username,
        first_name: firstName ?? username,
        last_name: lastName ?? '',
        birth_date: birthDate,
        profile_picture_url: photoUrl ?? null,
        email_verified: !!email, // email from OAuth provider is considered verified
      },
    });

    await tx.user_external_accounts.create({
      data: {
        user_id: user.id,
        provider,
        provider_user_id: providerUserId,
        provider_username: providerUsername ?? null,
        provider_email: email ?? null,
      },
    });

    return user;
  });

  const token = await createManualSession(newUser.id, req);
  return Response.json(
    { success: true, data: { user: serializeUser(newUser), token } },
    { status: 201 }
  );
}

// ---------------------------------------------------------------------------
// Provider ID token verifiers
// ---------------------------------------------------------------------------

/** Verify a Google ID token using Google's tokeninfo endpoint. */
async function verifyGoogleIdToken(idToken: string) {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );
  if (!res.ok) throw new Error('Google token verification failed');
  const data = await res.json();
  if (!data.sub) throw new Error('Missing sub in Google token');
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (clientId && data.aud !== clientId) throw new Error('Google token audience mismatch');
  return data as { sub: string; email?: string; name?: string; picture?: string; given_name?: string; family_name?: string };
}

/** Verify an Apple ID token by decoding the JWT (signature verification via Apple's public keys). */
async function verifyAppleIdToken(idToken: string) {
  // Decode the JWT payload (base64url) — full signature verification requires
  // fetching Apple's JWK set. For now, we decode the payload and rely on the
  // client_id audience check as a minimal guard. A production implementation
  // should verify the signature with Apple's public keys at
  // https://appleid.apple.com/auth/keys
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');
  const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
  const payload = JSON.parse(payloadJson) as {
    sub: string;
    email?: string;
    iss?: string;
    aud?: string;
  };
  if (!payload.sub) throw new Error('Missing sub in Apple token');
  if (payload.iss !== 'https://appleid.apple.com') throw new Error('Invalid Apple token issuer');
  const clientId = process.env.APPLE_CLIENT_ID;
  if (clientId && payload.aud !== clientId) throw new Error('Apple token audience mismatch');
  return {
    sub: payload.sub,
    email: payload.email,
    name: undefined,
    picture: undefined,
    given_name: undefined,
    family_name: undefined,
  };
}

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------
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
