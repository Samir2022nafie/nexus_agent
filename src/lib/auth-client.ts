// src/lib/auth-client.ts
// Frontend Better-Auth client — used by the Admin Dashboard only.
// The mobile app never imports this; it builds its own API calls over the REST endpoints.
//
// Note: The bearer plugin is server-only. The dashboard attaches the stored
// bearer token manually in Authorization headers when calling /api/v1/* routes.
// This client is used for Better-Auth's own endpoints (/api/auth/*).

import { createAuthClient } from 'better-auth/client';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000',
});

export type AuthClient = typeof authClient;
