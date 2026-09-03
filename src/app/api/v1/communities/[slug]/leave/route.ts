// src/app/api/v1/communities/[slug]/leave/route.ts
// POST /api/v1/communities/:slug/leave — Leave a community

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

    // Owner protection — owner must transfer ownership before leaving
    if (community.creator_id === currentUser.id) {
      return Response.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message:
              'The community owner cannot leave. Transfer ownership before leaving.',
          },
        },
        { status: 403 }
      );
    }

    // Check membership exists
    const existing = await prisma.community_members.findUnique({
      where: {
        community_id_user_id: {
          community_id: community.id,
          user_id: currentUser.id,
        },
      },
    });
    if (!existing) {
      return Response.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'You are not a member of this community.' } },
        { status: 404 }
      );
    }

    // Hard delete the membership row (memberships are hard-deleted per soft-delete philosophy)
    await prisma.community_members.delete({
      where: {
        community_id_user_id: {
          community_id: community.id,
          user_id: currentUser.id,
        },
      },
    });

    return Response.json({
      success: true,
      data: { message: 'You have left the community.' },
    });
  } catch (err) {
    console.error('[POST /communities/:slug/leave]', err);
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}
