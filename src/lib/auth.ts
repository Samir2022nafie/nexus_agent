// src/lib/auth.ts
// Better-Auth instance mapped onto the project's own `users` table.
//
// Key design decisions (see AUTH_SPECIFICATION.md §8):
// - bearer() plugin only — no cookie sessions anywhere.
// - advanced.database.generateId: false — Prisma's @default(uuid()) generates every ID.
// - Google / Apple registered conditionally on env var presence.
// - Field mapping covers every column the session object may need; the full row is
//   fetched in getCurrentUser() via a Prisma query, not from the session alone.

import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer } from 'better-auth/plugins';
import { prisma } from '@/lib/prisma';

const plugins = [bearer()];

// ---------------------------------------------------------------------------
// Social providers — registered only when their env vars are present.
// ---------------------------------------------------------------------------
const socialProviders: Record<string, unknown> = {};

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}

if (process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET) {
  socialProviders.apple = {
    clientId: process.env.APPLE_CLIENT_ID,
    clientSecret: process.env.APPLE_CLIENT_SECRET,
  };
}

export const auth = betterAuth({
  // ---------------------------------------------------------------------------
  // Database adapter
  // ---------------------------------------------------------------------------
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),

  // ---------------------------------------------------------------------------
  // Advanced: let Prisma own ID generation.
  // ---------------------------------------------------------------------------
  advanced: {
    database: {
      generateId: false,
    },
  },

  // ---------------------------------------------------------------------------
  // Base URL (needed for OAuth redirect URIs, etc.)
  // ---------------------------------------------------------------------------
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET,

  // ---------------------------------------------------------------------------
  // Email / password via credential provider (stored in user_external_accounts).
  // ---------------------------------------------------------------------------
  emailAndPassword: {
    enabled: true,
    // We handle register manually in /api/v1/auth/register — Better-Auth's
    // built-in sign-up is disabled to enforce our own validation (age, username, etc.).
    // Only signInEmail is used programmatically from the login route.
  },

  // ---------------------------------------------------------------------------
  // User table mapping.
  // The users table uses snake_case column names; Better-Auth expects camelCase.
  // ---------------------------------------------------------------------------
  user: {
    modelName: 'users',
    fields: {
      // Standard Better-Auth fields mapped to our column names
      email: 'email',
      name: 'name',
      image: 'profile_picture_url',
      emailVerified: 'email_verified',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    additionalFields: {
      username: {
        type: 'string',
        fieldName: 'username',
        required: false,
      },
      firstName: {
        type: 'string',
        fieldName: 'first_name',
        required: false,
      },
      lastName: {
        type: 'string',
        fieldName: 'last_name',
        required: false,
      },
      birthDate: {
        type: 'date',
        fieldName: 'birth_date',
        required: false,
      },
      phoneNumber: {
        type: 'string',
        fieldName: 'phone_number',
        required: false,
      },
    },
  },

  // ---------------------------------------------------------------------------
  // Session table mapping.
  // ---------------------------------------------------------------------------
  session: {
    modelName: 'sessions',
    fields: {
      userId: 'user_id',
      expiresAt: 'expires_at',
      ipAddress: 'ip_address',
      userAgent: 'user_agent',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

  // ---------------------------------------------------------------------------
  // Account (external) table mapping.
  // ---------------------------------------------------------------------------
  account: {
    modelName: 'user_external_accounts',
    fields: {
      userId: 'user_id',
      accountId: 'provider_user_id',
      providerId: 'provider',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      accessTokenExpiresAt: 'access_token_expires_at',
      refreshTokenExpiresAt: 'refresh_token_expires_at',
      scope: 'scope',
      idToken: 'id_token',
      password: 'password',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

  // ---------------------------------------------------------------------------
  // Verification table mapping.
  // ---------------------------------------------------------------------------
  verification: {
    modelName: 'verification',
    fields: {
      identifier: 'identifier',
      value: 'value',
      expiresAt: 'expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

  // ---------------------------------------------------------------------------
  // Social providers (conditionally registered above).
  // ---------------------------------------------------------------------------
  socialProviders,

  // ---------------------------------------------------------------------------
  // Plugins
  // ---------------------------------------------------------------------------
  plugins,
});

export type Auth = typeof auth;
