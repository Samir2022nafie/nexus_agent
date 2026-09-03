// src/app/api/v1/communities/[slug]/route.ts
// GET    /api/v1/communities/:slug — Get single community
// PATCH  /api/v1/communities/:slug — Update community (owner only)
// DELETE /api/v1/communities/:slug — Soft delete community (owner only)

import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/get-current-user';
import { uuidSchema } from '@/lib/zod-utils';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const patchBodySchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(1000).optional().nullable(),
    rules: z.string().optional().nullable(),
    bannerUrl: z.string().url().optional().nullable(),
    profilePictureUrl: z.string().url().optional().nullable(),
    isPrivate: z.boolean().optional(),
    // Location update — either an existing locationId or raw coords
    locationId: uuidSchema.optional().nullable(),
    locationName: z.string().max(255).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    // Explicitly forbidden fields — catch attempts to change them
    slug: z.never({ message: 'slug cannot be changed after creation' }).optional(),
    categoryId: z.never({ message: 'categoryId is immutable after creation' }).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// GET /api/v1/communities/:slug
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const currentUser = await getCurrentUser(req);

    const community = await prisma.communities.findUnique({
      where: { slug, deleted_at: null },
      include: {
        category: { select: { id: true, name: true } },
        location: true,
        owner: {
          select: {
            id: true,
            username: true,
            first_name: true,
            last_name: true,
            profile_picture_url: true,
          },
        },
        _count: { select: { members: true } },
      },
    });

    if (!community) {
      return Response.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Community not found' } },
        { status: 404 }
      );
    }

    // Privacy check: private communities are members-only
    if (community.is_private) {
      if (!currentUser) {
        return Response.json(
          {
            success: false,
            error: {
              code: 'FORBIDDEN',
              message: 'This community is private. Authentication required.',
            },
          },
          { status: 403 }
        );
      }

      // Check if user is owner OR a member
      const isOwner = community.creator_id === currentUser.id;
      if (!isOwner) {
        const membership = await prisma.community_members.findUnique({
          where: {
            community_id_user_id: {
              community_id: community.id,
              user_id: currentUser.id,
            },
          },
        });
        if (!membership) {
          return Response.json(
            {
              success: false,
              error: { code: 'FORBIDDEN', message: 'You must be a member to view this community.' },
            },
            { status: 403 }
          );
        }
      }
    }

    // Compute isMember for authenticated callers
    let isMember = false;
    let currentUserRole: string | null = null;
    if (currentUser) {
      if (community.creator_id === currentUser.id) {
        isMember = true;
        currentUserRole = 'owner';
      } else {
        const membership = await prisma.community_members.findUnique({
          where: {
            community_id_user_id: {
              community_id: community.id,
              user_id: currentUser.id,
            },
          },
        });
        if (membership) {
          isMember = true;
          currentUserRole = membership.role;
        }
      }
    }

    return Response.json({
      success: true,
      data: {
        id: community.id,
        name: community.name,
        slug: community.slug,
        description: community.description,
        rules: community.rules,
        bannerUrl: community.banner_url,
        profilePictureUrl: community.profile_picture_url,
        isPrivate: community.is_private,
        memberCount: community._count.members,
        category: community.category,
        location: community.location
          ? {
              id: community.location.id,
              placeName: community.location.place_name,
              latitude: Number(community.location.latitude),
              longitude: Number(community.location.longitude),
            }
          : null,
        owner: {
          id: community.owner.id,
          username: community.owner.username,
          firstName: community.owner.first_name,
          lastName: community.owner.last_name,
          profilePictureUrl: community.owner.profile_picture_url,
        },
        createdAt: community.created_at,
        updatedAt: community.updated_at,
        ...(currentUser ? { isMember, currentUserRole } : {}),
      },
    });
  } catch (err) {
    console.error('[GET /communities/:slug]', err);
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/v1/communities/:slug
// ---------------------------------------------------------------------------

export async function PATCH(
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

    // Owner-only check via Prisma (not CASL)
    if (community.creator_id !== currentUser.id) {
      return Response.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Only the community owner can update settings.' },
        },
        { status: 403 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
        { status: 400 }
      );
    }

    const parsed = patchBodySchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: parsed.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const {
      name,
      description,
      rules,
      bannerUrl,
      profilePictureUrl,
      isPrivate,
      locationId,
      locationName,
      latitude,
      longitude,
    } = parsed.data;

    // Resolve location if raw coordinates provided
    let resolvedLocationId: string | null | undefined = locationId;
    if (resolvedLocationId === undefined && latitude !== undefined && longitude !== undefined) {
      const loc = await prisma.locations.upsert({
        where: {
          latitude_longitude: {
            latitude: latitude,
            longitude: longitude,
          },
        },
        create: {
          place_name: locationName ?? `${latitude},${longitude}`,
          latitude: latitude,
          longitude: longitude,
        },
        update: {},
      });
      resolvedLocationId = loc.id;
    }

    const updated = await prisma.communities.update({
      where: { id: community.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(rules !== undefined ? { rules } : {}),
        ...(bannerUrl !== undefined ? { banner_url: bannerUrl } : {}),
        ...(profilePictureUrl !== undefined
          ? { profile_picture_url: profilePictureUrl }
          : {}),
        ...(isPrivate !== undefined ? { is_private: isPrivate } : {}),
        ...(resolvedLocationId !== undefined
          ? { location_id: resolvedLocationId }
          : {}),
      },
      include: {
        category: { select: { id: true, name: true } },
        location: true,
        _count: { select: { members: true } },
      },
    });

    return Response.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        description: updated.description,
        rules: updated.rules,
        bannerUrl: updated.banner_url,
        profilePictureUrl: updated.profile_picture_url,
        isPrivate: updated.is_private,
        memberCount: updated._count.members,
        category: updated.category,
        location: updated.location
          ? {
              id: updated.location.id,
              placeName: updated.location.place_name,
              latitude: Number(updated.location.latitude),
              longitude: Number(updated.location.longitude),
            }
          : null,
        updatedAt: updated.updated_at,
      },
    });
  } catch (err) {
    console.error('[PATCH /communities/:slug]', err);
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/v1/communities/:slug
// ---------------------------------------------------------------------------

export async function DELETE(
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

    // Owner-only check via Prisma
    if (community.creator_id !== currentUser.id) {
      return Response.json(
        {
          success: false,
          error: { code: 'FORBIDDEN', message: 'Only the community owner can delete this community.' },
        },
        { status: 403 }
      );
    }

    // Soft delete
    await prisma.communities.update({
      where: { id: community.id },
      data: { deleted_at: new Date() },
    });

    return Response.json({
      success: true,
      data: { message: 'Community deleted successfully.' },
    });
  } catch (err) {
    console.error('[DELETE /communities/:slug]', err);
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}
