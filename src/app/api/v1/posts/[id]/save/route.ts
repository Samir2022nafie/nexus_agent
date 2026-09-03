// src/app/api/v1/posts/[id]/save/route.ts
// POST /api/v1/posts/:id/save — Toggle save (auth required)
//
// If a saved_posts row exists for this user → delete (unsave).
// If no row exists            → create (save).
// Returns: { saved: boolean }

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
      select: { id: true },
    });

    if (!post) {
      return Response.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Post not found.' } },
        { status: 404 }
      );
    }

    // --- Toggle ---
    const existing = await prisma.saved_posts.findUnique({
      where: { user_id_post_id: { user_id: currentUser.id, post_id: postId } },
      select: { user_id: true },
    });

    if (existing) {
      // Unsave
      await prisma.saved_posts.delete({
        where: { user_id_post_id: { user_id: currentUser.id, post_id: postId } },
      });
    } else {
      // Save
      await prisma.saved_posts.create({
        data: { user_id: currentUser.id, post_id: postId },
      });
    }

    return Response.json({
      success: true,
      data: { saved: !existing },
    });
  } catch (err) {
    console.error('[POST /posts/:id/save]', err);
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } },
      { status: 500 }
    );
  }
}
