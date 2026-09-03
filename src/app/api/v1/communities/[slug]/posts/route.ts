// src/app/api/v1/communities/[slug]/posts/route.ts
// GET  /api/v1/communities/:slug/posts — List posts (public/member; filtered)
// POST /api/v1/communities/:slug/posts — Create post (member+ only)

import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/get-current-user';
import { paginationSchema } from '@/lib/zod-utils';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const listQuerySchema = paginationSchema.extend({
  sort: z.enum(['created_at', 'reaction_count']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

const createPostSchema = z
  .object({
    title: z.string().min(1).max(150).optional(),
    content: z.string().min(1).optional(),
    mediaUrl: z.string().url().optional(),
    tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  })
  .refine(
    (d) => d.title !== undefined || d.content !== undefined || d.mediaUrl !== undefined,
    { message: 'At least one of title, content, or mediaUrl is required.' }
  );

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Resolve community and check existence (soft-delete aware). */
async function resolveCommunity(slug: string) {
  return prisma.communities.findUnique({ where: { slug, deleted_at: null } });
}

/** Check if a user is a member or owner of a community. */
async function isCommunityMember(communityId: string, creatorId: string, userId: string) {
  if (userId === creatorId) return true;
  const membership = await prisma.community_members.findUnique({
    where: { community_id_user_id: { community_id: communityId, user_id: userId } },
    select: { role: true },
  });
  return membership !== null;
}

// ---------------------------------------------------------------------------
// GET /api/v1/communities/:slug/posts
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // --- Resolve community ---
    const community = await resolveCommunity(slug);
    if (!community) {
      return Response.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Community not found.' } },
        { status: 404 }
      );
    }

    // --- Auth / privacy gate ---
    const currentUser = await getCurrentUser(req);

    if (community.is_private) {
      if (!currentUser) {
        return Response.json(
          { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } },
          { status: 401 }
        );
      }
      const member = await isCommunityMember(community.id, community.creator_id, currentUser.id);
      if (!member) {
        return Response.json(
          { success: false, error: { code: 'FORBIDDEN', message: 'This is a private community.' } },
          { status: 403 }
        );
      }
    }

    // --- Parse query params ---
    const rawQuery = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = listQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters.', details: parsed.error.issues },
        },
        { status: 400 }
      );
    }
    const { page, limit, order } = parsed.data;

    // --- Build blocked-user exclusion list ---
    let blockedUserIds: string[] = [];
    if (currentUser) {
      const blocks = await prisma.user_blocks.findMany({
        where: {
          OR: [
            { blocker_id: currentUser.id },
            { blocked_id: currentUser.id },
          ],
        },
        select: { blocker_id: true, blocked_id: true },
      });
      const blockSet = new Set<string>();
      for (const b of blocks) {
        if (b.blocker_id !== currentUser.id) blockSet.add(b.blocker_id);
        if (b.blocked_id !== currentUser.id) blockSet.add(b.blocked_id);
      }
      blockedUserIds = [...blockSet];
    }

    // --- Query ---
    const where = {
      community_id: community.id,
      deleted_at: null,
      ...(blockedUserIds.length > 0 ? { author_id: { notIn: blockedUserIds } } : {}),
    };

    const [total, posts] = await Promise.all([
      prisma.posts.count({ where }),
      prisma.posts.findMany({
        where,
        include: {
          author: {
            select: { id: true, username: true, first_name: true, last_name: true, profile_picture_url: true },
          },
          tags: { include: { tag: { select: { id: true, name: true } } } },
          _count: { select: { reactions: true, comments: true } },
          ...(currentUser
            ? {
                reactions: {
                  where: { user_id: currentUser.id },
                  select: { user_id: true },
                },
              }
            : {}),
        },
        orderBy: { created_at: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const data = posts.map((p) => ({
      id: p.id,
      communityId: p.community_id,
      author: {
        id: p.author.id,
        username: p.author.username,
        firstName: p.author.first_name,
        lastName: p.author.last_name,
        profilePictureUrl: p.author.profile_picture_url,
      },
      title: p.title,
      content: p.content,
      mediaUrl: p.media_url,
      tags: p.tags.map((pt) => ({ id: pt.tag.id, name: pt.tag.name })),
      reactionCount: p._count.reactions,
      commentCount: p._count.comments,
      hasReacted: currentUser
        ? (p as any).reactions?.length > 0
        : false,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
    }));

    return Response.json({
      success: true,
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[GET /communities/:slug/posts]', err);
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/communities/:slug/posts
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    // --- Auth ---
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return Response.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required.' } },
        { status: 401 }
      );
    }

    // --- Resolve community ---
    const community = await resolveCommunity(slug);
    if (!community) {
      return Response.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Community not found.' } },
        { status: 404 }
      );
    }

    // --- Membership check ---
    const member = await isCommunityMember(community.id, community.creator_id, currentUser.id);
    if (!member) {
      return Response.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'You must be a community member to post.' },
        },
        { status: 403 }
      );
    }

    // --- Parse body ---
    const body = await req.json().catch(() => ({}));
    const parsed = createPostSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Validation failed.', details: parsed.error.issues },
        },
        { status: 400 }
      );
    }

    const { title, content, mediaUrl, tags = [] } = parsed.data;

    // --- Create post + resolve/create tags in a transaction ---
    const post = await prisma.$transaction(async (tx) => {
      // Create post
      const newPost = await tx.posts.create({
        data: {
          community_id: community.id,
          author_id: currentUser.id,
          title: title ?? null,
          content: content ?? null,
          media_url: mediaUrl ?? null,
        },
      });

      // Upsert tags and create post_tags links
      if (tags.length > 0) {
        for (const rawName of tags) {
          const name = rawName.toLowerCase().trim();
          if (!name) continue;

          const tag = await tx.tags.upsert({
            where: { name },
            create: { name },
            update: {},
            select: { id: true },
          });

          await tx.post_tags.upsert({
            where: { post_id_tag_id: { post_id: newPost.id, tag_id: tag.id } },
            create: { post_id: newPost.id, tag_id: tag.id },
            update: {},
          });
        }
      }

      return newPost;
    });

    // --- Fetch the created post with relations ---
    const created = await prisma.posts.findUnique({
      where: { id: post.id },
      include: {
        author: {
          select: { id: true, username: true, first_name: true, last_name: true, profile_picture_url: true },
        },
        tags: { include: { tag: { select: { id: true, name: true } } } },
        _count: { select: { reactions: true, comments: true } },
      },
    });

    return Response.json(
      {
        success: true,
        data: {
          id: created!.id,
          communityId: created!.community_id,
          author: {
            id: created!.author.id,
            username: created!.author.username,
            firstName: created!.author.first_name,
            lastName: created!.author.last_name,
            profilePictureUrl: created!.author.profile_picture_url,
          },
          title: created!.title,
          content: created!.content,
          mediaUrl: created!.media_url,
          tags: created!.tags.map((pt) => ({ id: pt.tag.id, name: pt.tag.name })),
          reactionCount: created!._count.reactions,
          commentCount: created!._count.comments,
          hasReacted: false,
          createdAt: created!.created_at,
          updatedAt: created!.updated_at,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[POST /communities/:slug/posts]', err);
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error.' } },
      { status: 500 }
    );
  }
}
