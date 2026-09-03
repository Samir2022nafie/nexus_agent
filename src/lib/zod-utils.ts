// src/lib/zod-utils.ts
// Shared Zod schemas reused across all API routes.
// Add new shared primitives here as later batches need them — do NOT write one-off schemas per route.

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** UUID v4 string */
export const uuidSchema = z.string().uuid();

/** Standard pagination query params */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * Community / subcommunity slug: lowercase alphanumeric + hyphens, 3–120 chars.
 * Matches: AUTH_SPECIFICATION.md §9 rule 9.
 */
export const slugSchema = z
  .string()
  .min(3, 'Slug must be at least 3 characters')
  .max(120, 'Slug must be at most 120 characters')
  .regex(/^[a-z0-9-]+$/, 'Slug may only contain lowercase letters, digits, and hyphens');

/**
 * Login identifier — accepts either an email address or a phone number string.
 * The route handler determines which type it is (via email regex or phone_verified_at lookup).
 */
export const identifierSchema = z
  .string()
  .min(1, 'Identifier is required')
  .max(255, 'Identifier is too long');

/** E.164-ish phone — allow + prefix + digits, length 7-20 */
export const phoneNumberSchema = z
  .string()
  .regex(/^\+?[0-9]{7,20}$/, 'Invalid phone number format');

/** visibility scope enum */
export const visibilitySchema = z.enum(['public', 'community', 'subcommunity']);
