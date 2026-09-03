// src/lib/casl.ts
// CASL ability definitions for HobbyHub.
//
// Rules:
// - defineAbilityFor(user, ctx): builds the ability object for a user.
// - getUserCommunityRoles(userId): fetches owned/admin community IDs from DB.
//
// See AUTH_SPECIFICATION.md §5 for usage patterns.
//
// IMPORTANT:
// - All condition objects are cast to `any` to avoid TS2769 errors.
// - Conditions use snake_case field names matching Prisma's raw output.
// - Pass Prisma rows UNMODIFIED into ability.can(...) checks.
// - CASL is broad strokes; per-community role verification uses Prisma queries in routes.

import {
  AbilityBuilder,
  createMongoAbility,
  type MongoAbility,
  type MongoQuery,
} from '@casl/ability';
import { prisma } from '@/lib/prisma';

// ---------------------------------------------------------------------------
// Subject types — extend this union as later batches add new entities.
// ---------------------------------------------------------------------------
export type SubjectType =
  | 'User'
  | 'Community'
  | 'CommunityMember'
  | 'Post'
  | 'Comment'
  | 'Event'
  | 'Hangout'
  | 'Report'
  | 'all';

export type Actions =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'manage'
  | 'join'
  | 'leave'
  | 'kick'
  | 'promote';

export type AppAbility = MongoAbility<[Actions, SubjectType | Record<string, unknown>]>;

// ---------------------------------------------------------------------------
// Community role context returned by getUserCommunityRoles()
// ---------------------------------------------------------------------------
export interface CommunityRoleCtx {
  /** community IDs where the user IS the owner (communities.creator_id) */
  ownedCommunityIds: string[];
  /** community IDs where the user has role = 'admin' or 'moderator' */
  adminCommunityIds: string[];
  /** community IDs where the user has any membership (member, admin, moderator) */
  memberCommunityIds: string[];
}

/**
 * Fetches the caller's community roles from the DB.
 * Call this once per request in routes that need community-scoped authorization.
 *
 * To extend for new role types (e.g. "banned communities"), add a field to
 * CommunityRoleCtx and a query here — do not write a parallel helper.
 */
export async function getUserCommunityRoles(userId: string): Promise<CommunityRoleCtx> {
  const [ownedRows, memberRows] = await Promise.all([
    // Communities the user owns (via communities.creator_id)
    prisma.communities.findMany({
      where: { creator_id: userId, deleted_at: null },
      select: { id: true },
    }),
    // All memberships (member / admin / moderator)
    prisma.community_members.findMany({
      where: { user_id: userId },
      select: { community_id: true, role: true },
    }),
  ]);

  const ownedCommunityIds = ownedRows.map((c) => c.id);

  const adminCommunityIds = memberRows
    .filter((m) => m.role === 'admin' || m.role === 'moderator')
    .map((m) => m.community_id);

  const memberCommunityIds = memberRows.map((m) => m.community_id);

  return { ownedCommunityIds, adminCommunityIds, memberCommunityIds };
}

/**
 * Builds the CASL ability object for a user.
 *
 * @param user   - Minimal user shape. Pass { id: user.id }.
 * @param ctx    - Output from getUserCommunityRoles(). Pass {} / empty arrays for unauthed users.
 */
export function defineAbilityFor(
  user: { id: string },
  ctx: CommunityRoleCtx = {
    ownedCommunityIds: [],
    adminCommunityIds: [],
    memberCommunityIds: [],
  }
): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  // -------------------------------------------------------------------------
  // Any authenticated user
  // -------------------------------------------------------------------------

  // A user can manage their own profile
  can('update', 'User', { id: user.id } as any);
  can('delete', 'User', { id: user.id } as any);
  can('read', 'User');

  // Communities — public read, create, join, leave (per-community checks in routes)
  can('read', 'Community');
  can('create', 'Community');
  can('join', 'Community');
  can('leave', 'Community');

  // Content — any auth user can create
  can('create', 'Post');
  can('create', 'Comment');
  can('create', 'Report');
  can('create', 'Hangout');
  can('create', 'Event');

  // Own content
  can('update', 'Post', { author_id: user.id } as any);
  can('delete', 'Post', { author_id: user.id } as any);

  can('update', 'Comment', { author_id: user.id } as any);
  can('delete', 'Comment', { author_id: user.id } as any);

  can('update', 'Hangout', { creator_id: user.id } as any);
  can('delete', 'Hangout', { creator_id: user.id } as any);

  can('update', 'Event', { creator_id: user.id } as any);
  can('delete', 'Event', { creator_id: user.id } as any);

  // -------------------------------------------------------------------------
  // Admin / Moderator — scoped to their communities
  // -------------------------------------------------------------------------
  if (ctx.adminCommunityIds.length > 0) {
    // Dashboard read access
    can('read', 'Community', { id: { $in: ctx.adminCommunityIds } } as any);

    // Manage posts and comments in their communities
    can('manage', 'Post', { community_id: { $in: ctx.adminCommunityIds } } as any);
    can('manage', 'Comment', { community_id: { $in: ctx.adminCommunityIds } } as any);

    // Manage events in their communities
    can('manage', 'Event', { community_id: { $in: ctx.adminCommunityIds } } as any);

    // Read and kick members (not owner — owner check happens in route)
    can('read', 'CommunityMember', { community_id: { $in: ctx.adminCommunityIds } } as any);
    can('kick', 'CommunityMember', { community_id: { $in: ctx.adminCommunityIds } } as any);

    // Read reports in their communities
    can('read', 'Report');
  }

  // -------------------------------------------------------------------------
  // Owner — scoped to communities they created
  // -------------------------------------------------------------------------
  if (ctx.ownedCommunityIds.length > 0) {
    can('update', 'Community', { id: { $in: ctx.ownedCommunityIds } } as any);
    can('delete', 'Community', { id: { $in: ctx.ownedCommunityIds } } as any);

    // Promote/demote members
    can('promote', 'CommunityMember', {
      community_id: { $in: ctx.ownedCommunityIds },
    } as any);
  }

  return build();
}
