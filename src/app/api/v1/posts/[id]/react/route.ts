// src/app/api/v1/posts/[id]/react/route.ts
// POST /api/v1/posts/:id/react — Toggle like (auth required)
//
// If a post_reactions row exists for this user → delete (unlike).
// If no row exists            → create (like).
// Returns: { reacted: boolean, reactionCount: number }

import { type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/get-current-user';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params;

    // --- Auth ---
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return Response.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } },
        { status: 401 }
      );
    }

    // --- Verify post exists and is not soft-deleted ---
    const post = await prisma.posts.findUnique({
      where: { id: postId, deleted_at: null },
      select: { id: true, community_id: true },
    });

    if (!post) {
      return Response.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Post not found.' } },
        { status: 404 }
      );
    }

    // --- Toggle ---
    const existing = await prisma.post_reactions.findUnique({
      where: { post_id_user_id: { post_id: postId, user_id: currentUser.id } },
      select: { post_id: true },
    });

    if (existing) {
      // Unlike
      await prisma.post_reactions.delete({
        where: { post_id_user_id: { post_id: postId, user_id: currentUser.id } },
      });
    } else {
      // Like
      await prisma.post_reactions.create({
        data: { post_id: postId, user_id: currentUser.id },
      });
    }

    const reactionCount = await prisma.post_reactions.count({ where: { post_id: postId } });

    return Response.json({
      success: true,
      data: { reacted: !existing, reactionCount },
    });
  } catch (err) {
    console.error('[POST /posts/:id/react]', err);
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } },
      { status: 500 }
    );
  }
}
