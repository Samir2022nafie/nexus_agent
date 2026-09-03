// src/app/api/v1/communities/[slug]/join/route.ts
// POST /api/v1/communities/:slug/join — Join a community

import { type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/get-current-user';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return Response.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    const community = await prisma.communities.findUnique({
      where: { slug, deleted_at: null },
    });
    if (!community) {
      return Response.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Community not found' } },
        { status: 404 }
      );
    }

    // Private communities are not joinable in v1 via this endpoint
    if (community.is_private) {
      return Response.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'This community is private. Join requests are not supported in v1.',
          },
        },
        { status: 403 }
      );
    }

    // Owner is already an implicit member — prevent double-insert
    if (community.creator_id === currentUser.id) {
      return Response.json(
        { success: false, error: { code: 'CONFLICT', message: 'You are already a member of this community.' } },
        { status: 409 }
      );
    }

    // Check if already a member
    const existing = await prisma.community_members.findUnique({
      where: {
        community_id_user_id: {
          community_id: community.id,
          user_id: currentUser.id,
        },
      },
    });
    if (existing) {
      return Response.json(
        { success: false, error: { code: 'CONFLICT', message: 'You are already a member of this community.' } },
        { status: 409 }
      );
    }

    const membership = await prisma.community_members.create({
      data: {
        community_id: community.id,
        user_id: currentUser.id,
        role: 'member',
      },
    });

    return Response.json(
      {
        success: true,
        data: {
          communityId: community.id,
          communitySlug: community.slug,
          userId: currentUser.id,
          role: membership.role,
          joinedAt: membership.joined_at,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[POST /communities/:slug/join]', err);
    // Prisma unique constraint fallback
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      return Response.json(
        { success: false, error: { code: 'CONFLICT', message: 'You are already a member of this community.' } },
        { status: 409 }
      );
    }
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}
