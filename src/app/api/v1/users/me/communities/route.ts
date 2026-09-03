// src/app/api/v1/users/me/communities/route.ts
// GET /api/v1/users/me/communities
//
// Returns every community where the caller is owner, admin, or moderator,
// along with their role in each.
//
// Powers:
// - Admin Dashboard home page ("My Communities" grid)
// - Mobile app management-switch visibility check (shows "Manage" button
//   only if this list is non-empty for the community in question)

import { type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/get-current-user';

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return Response.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    // Fetch communities the user owns (via communities.creator_id)
    const ownedCommunitiesPromise = prisma.communities.findMany({
      where: { creator_id: currentUser.id, deleted_at: null },
      include: {
        category: { select: { id: true, name: true } },
        location: { select: { id: true, place_name: true } },
        _count: { select: { members: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    // Fetch communities where the user is admin or moderator
    const managedMembershipsPromise = prisma.community_members.findMany({
      where: {
        user_id: currentUser.id,
        role: { in: ['admin', 'moderator'] },
        community: { deleted_at: null },
      },
      include: {
        community: {
          include: {
            category: { select: { id: true, name: true } },
            location: { select: { id: true, place_name: true } },
            _count: { select: { members: true } },
          },
        },
      },
      orderBy: { joined_at: 'desc' },
    });

    const [owned, managedMemberships] = await Promise.all([
      ownedCommunitiesPromise,
      managedMembershipsPromise,
    ]);

    // Build the deduplicated list — owned communities come first
    const seenIds = new Set<string>();
    const result: Array<{
      id: string;
      name: string;
      slug: string;
      description: string | null;
      bannerUrl: string | null;
      profilePictureUrl: string | null;
      isPrivate: boolean;
      memberCount: number;
      role: string;
      category: { id: string; name: string };
      location: { id: string; placeName: string } | null;
      createdAt: Date;
    }> = [];

    for (const c of owned) {
      seenIds.add(c.id);
      result.push({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        bannerUrl: c.banner_url,
        profilePictureUrl: c.profile_picture_url,
        isPrivate: c.is_private,
        memberCount: c._count.members,
        role: 'owner',
        category: c.category,
        location: c.location
          ? { id: c.location.id, placeName: c.location.place_name }
          : null,
        createdAt: c.created_at,
      });
    }

    for (const m of managedMemberships) {
      const c = m.community;
      if (seenIds.has(c.id)) continue; // already included as owner
      seenIds.add(c.id);
      result.push({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        bannerUrl: c.banner_url,
        profilePictureUrl: c.profile_picture_url,
        isPrivate: c.is_private,
        memberCount: c._count.members,
        role: m.role, // 'admin' | 'moderator'
        category: c.category,
        location: c.location
          ? { id: c.location.id, placeName: c.location.place_name }
          : null,
        createdAt: c.created_at,
      });
    }

    return Response.json({
      success: true,
      data: result,
      meta: { total: result.length },
    });
  } catch (err) {
    console.error('[GET /users/me/communities]', err);
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}
