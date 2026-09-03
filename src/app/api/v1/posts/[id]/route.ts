// src/app/api/v1/posts/[id]/route.ts
// GET   /api/v1/posts/:id  — Get single post (same privacy rules as list)
// PATCH /api/v1/posts/:id  — Update post (self only)
// DELETE /api/v1/posts/:id — Soft delete (self / admin/mod/owner)

import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/get-current-user';
import { defineAbilityFor, getUserCommunityRoles } from '@/lib/casl';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const updatePostSchema = z
  .object({
    title: z.string().min(1).max(150).optional(),
    content: z.string().min(1).optional(),
    mediaUrl: z.string().url().optional(),
  })
  .refine(
    (d) => d.title !== undefined || d.content !== undefined || d.mediaUrl !== undefined,
    { message: 'At least one of title, content, or mediaUrl must be provided to update.' }
  );

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Load a post with its community, verifying it isn't soft-deleted. */
async function loadPost(id: string) {
  return prisma.posts.findUnique({
    where: { id, deleted_at: null },
    include: {
      community: { select: { id: true, creator_id: true, is_private: true } },
    },
  });
}

/** Check if userId is blocked by or has blocked the given targetId. */
async function isBlocked(userId: string, targetId: string): Promise<boolean> {
  if (userId === targetId) return false;
  const block = await prisma.user_blocks.findFirst({
    where: {
      OR: [
        { blocker_id: userId, blocked_id: targetId },
        { blocker_id: targetId, blocked_id: userId },
      ],
    },
    select: { blocker_id: true },
  });
  return block !== null;
}

/** True if the user is the community owner or has admin/moderator role. */
async function isAdminOrOwner(communityId: string, creatorId: string, userId: string): Promise<boolean> {
  if (userId === creatorId) return true;
  const membership = await prisma.community_members.findUnique({
    where: { community_id_user_id: { community_id: communityId, user_id: userId } },
    select: { role: true },
  });
  return membership !== null && ['admin', 'moderator'].includes(membership.role);
}

// ---------------------------------------------------------------------------
// GET /api/v1/posts/:id
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const post = await prisma.posts.findUnique({
      where: { id, deleted_at: null },
      include: {
        community: { select: { id: true, creator_id: true, is_private: true, slug: true } },
        author: {
          select: {
            id: true,
            username: true,
            first_name: true,
            last_name: true,
            profile_picture_url: true,
            deleted_at: true,
          },
        },
        tags: { include: { tag: { select: { id: true, name: true } } } },
        _count: { select: { reactions: true } },
      },
    });

    if (!post) {
      return Response.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Post not found.' } },
        { status: 404 }
      );
    }

    const currentUser = await getCurrentUser(req);

    // --- Private community gate ---
    if (post.community.is_private) {
      if (!currentUser) {
        return Response.json(
          { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } },
          { status: 401 }
        );
      }
      const isMember =
        currentUser.id === post.community.creator_id ||
        (await prisma.community_members.findUnique({
          where: {
            community_id_user_id: { community_id: post.community.id, user_id: currentUser.id },
          },
          select: { role: true },
        })) !== null;

      if (!isMember) {
        return Response.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'This post is in a private community.' } },
          { status: 403 }
        );
      }
    }

    // --- Block check ---
    if (currentUser && post.author.id !== currentUser.id) {
      const blocked = await isBlocked(currentUser.id, post.author.id);
      if (blocked) {
        return Response.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Post not found.' } },
          { status: 404 }
        );
      }
    }

    // --- hasReacted ---
    let hasReacted = false;
    if (currentUser) {
      const reaction = await prisma.post_reactions.findUnique({
        where: { post_id_user_id: { post_id: post.id, user_id: currentUser.id } },
        select: { post_id: true },
      });
      hasReacted = reaction !== null;
    }

    // --- First 10 non-deleted comments ---
    const comments = await prisma.comments.findMany({
      where: { post_id: post.id, deleted_at: null, parent_comment_id: null },
      include: {
        author: {
          select: { id: true, username: true, profile_picture_url: true },
        },
        _count: { select: { reactions: true, replies: true } },
      },
      orderBy: { created_at: 'asc' },
      take: 10,
    });

    return Response.json({
      success: true,
      data: {
        id: post.id,
        communityId: post.community.id,
        communitySlug: post.community.slug,
        author: {
          id: post.author.id,
          username: post.author.username,
          firstName: post.author.first_name,
          lastName: post.author.last_name,
          profilePictureUrl: post.author.profile_picture_url,
          isDeleted: post.author.deleted_at !== null,
        },
        title: post.title,
        content: post.content,
        mediaUrl: post.media_url,
        tags: post.tags.map((pt) => ({ id: pt.tag.id, name: pt.tag.name })),
        reactionCount: post._count.reactions,
        hasReacted,
        comments: comments.map((c) => ({
          id: c.id,
          author: {
            id: c.author.id,
            username: c.author.username,
            profilePictureUrl: c.author.profile_picture_url,
          },
          content: c.content,
          reactionCount: c._count.reactions,
          replyCount: c._count.replies,
          createdAt: c.created_at,
          updatedAt: c.updated_at,
        })),
        createdAt: post.created_at,
        updatedAt: post.updated_at,
      },
    });
  } catch (err) {
    console.error('[GET /posts/:id]', err);
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/v1/posts/:id
// ---------------------------------------------------------------------------

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return Response.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } },
        { status: 401 }
      );
    }

    const post = await loadPost(id);
    if (!post) {
      return Response.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Post not found.' } },
        { status: 404 }
      );
    }

    // --- CASL: self-only update ---
    const ctx = await getUserCommunityRoles(currentUser.id);
    const ability = defineAbilityFor(currentUser, ctx);

    if (!ability.can('update', post as any)) {
      return Response.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'You can only edit your own posts.' } },
        { status: 403 }
      );
    }

    // --- Validate body ---
    const body = await req.json().catch(() => ({}));
    const parsed = updatePostSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Validation failed.', details: parsed.error.issues },
        },
        { status: 400 }
      );
    }

    const { title, content, mediaUrl } = parsed.data;

    const updated = await prisma.posts.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(content !== undefined ? { content } : {}),
        ...(mediaUrl !== undefined ? { media_url: mediaUrl } : {}),
      },
      include: {
        author: {
          select: { id: true, username: true, first_name: true, last_name: true, profile_picture_url: true },
        },
        tags: { include: { tag: { select: { id: true, name: true } } } },
        _count: { select: { reactions: true, comments: true } },
      },
    });

    return Response.json({
      success: true,
      data: {
        id: updated.id,
        communityId: updated.community_id,
        author: {
          id: updated.author.id,
          username: updated.author.username,
          firstName: updated.author.first_name,
          lastName: updated.author.last_name,
          profilePictureUrl: updated.author.profile_picture_url,
        },
        title: updated.title,
        content: updated.content,
        mediaUrl: updated.media_url,
        tags: updated.tags.map((pt) => ({ id: pt.tag.id, name: pt.tag.name })),
        reactionCount: updated._count.reactions,
        commentCount: updated._count.comments,
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
      },
    });
  } catch (err) {
    console.error('[PATCH /posts/:id]', err);
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/v1/posts/:id
// ---------------------------------------------------------------------------

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return Response.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } },
        { status: 401 }
      );
    }

    const post = await loadPost(id);
    if (!post) {
      return Response.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Post not found.' } },
        { status: 404 }
      );
    }

    // --- CASL + Prisma dual check ---
    // Allow: self (author) OR admin/mod/owner of the community
    const ctx = await getUserCommunityRoles(currentUser.id);
    const ability = defineAbilityFor(currentUser, ctx);

    const canDeleteOwn = ability.can('delete', post as any);
    const canDeleteAsAdmin = await isAdminOrOwner(
      post.community.id,
      post.community.creator_id,
      currentUser.id
    );

    if (!canDeleteOwn && !canDeleteAsAdmin) {
      return Response.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'You do not have permission to delete this post.' },
        },
        { status: 403 }
      );
    }

    await prisma.posts.update({
      where: { id },
      data: { deleted_at: new Date() },
    });

    return Response.json({ success: true, data: { id } });
  } catch (err) {
    console.error('[DELETE /posts/:id]', err);
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } },
      { status: 500 }
    );
  }
}
