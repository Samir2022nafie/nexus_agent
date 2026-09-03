// src/app/api/v1/communities/route.ts
// GET  /api/v1/communities — List public communities
// POST /api/v1/communities — Create a community

import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/get-current-user';
import { paginationSchema, slugSchema, uuidSchema } from '@/lib/zod-utils';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const listQuerySchema = paginationSchema.extend({
  categoryId: uuidSchema.optional(),
  q: z.string().max(150).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius: z.coerce.number().positive().optional(), // km
});

const createBodySchema = z.object({
  name: z.string().min(1).max(100),
  slug: slugSchema,
  description: z.string().max(1000).optional(),
  rules: z.string().optional(),
  categoryId: uuidSchema,
  isPrivate: z.boolean().optional().default(false),
  bannerUrl: z.string().url().optional(),
  profilePictureUrl: z.string().url().optional(),
  // Location — either an existing location_id OR raw coordinates to upsert
  locationId: uuidSchema.optional(),
  locationName: z.string().max(255).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Haversine distance in km between two lat/lng points */
function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// GET /api/v1/communities
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser(req);

    const params = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = listQuerySchema.safeParse(params);
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
            details: parsed.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const { page, limit, categoryId, q, lat, lng, radius } = parsed.data;

    // Determine which communities the user is a member of (for isMember + private visibility)
    let memberCommunityIds: Set<string> = new Set();
    if (currentUser) {
      const memberships = await prisma.community_members.findMany({
        where: { user_id: currentUser.id },
        select: { community_id: true },
      });
      // Also include owned communities
      const owned = await prisma.communities.findMany({
        where: { creator_id: currentUser.id, deleted_at: null },
        select: { id: true },
      });
      memberships.forEach((m) => memberCommunityIds.add(m.community_id));
      owned.forEach((c) => memberCommunityIds.add(c.id));
    }

    // Build the visibility filter: private communities only visible to members
    const memberIds = [...memberCommunityIds];
    const visibilityFilter = currentUser
      ? { OR: [{ is_private: false }, { is_private: true, id: { in: memberIds } }] }
      : { is_private: false as const };

    // Build search filter
    const searchFilter = q
      ? { OR: [{ name: { contains: q, mode: 'insensitive' as const } }, { description: { contains: q, mode: 'insensitive' as const } }] }
      : undefined;

    const where = {
      deleted_at: null,
      ...visibilityFilter,
      ...(categoryId ? { category_id: categoryId } : {}),
      ...(searchFilter ?? {}),
    };

    // Fetch count and rows separately to avoid $transaction array type inference issues
    const total = await prisma.communities.count({ where });
    const communities = await prisma.communities.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
        location: true,
        _count: { select: { members: true } },
      },
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Geo-filter in application layer (Haversine) if lat/lng/radius provided
    let filtered = communities;
    if (lat !== undefined && lng !== undefined && radius !== undefined) {
      filtered = communities.filter((c) => {
        if (!c.location) return false;
        const dist = haversineKm(
          lat,
          lng,
          Number(c.location.latitude),
          Number(c.location.longitude)
        );
        return dist <= radius;
      });
    }

    const data = filtered.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      bannerUrl: c.banner_url,
      profilePictureUrl: c.profile_picture_url,
      isPrivate: c.is_private,
      memberCount: c._count.members,
      category: c.category,
      location: c.location
        ? {
            id: c.location.id,
            placeName: c.location.place_name,
            latitude: Number(c.location.latitude),
            longitude: Number(c.location.longitude),
          }
        : null,
      createdAt: c.created_at,
      ...(currentUser
        ? { isMember: memberCommunityIds.has(c.id) }
        : {}),
    }));

    const effectiveTotal =
      lat !== undefined && lng !== undefined && radius !== undefined
        ? filtered.length
        : total;
    const totalPages = Math.ceil(effectiveTotal / limit);

    return Response.json({
      success: true,
      data,
      meta: { page, limit, total: effectiveTotal, totalPages },
    });
  } catch (err) {
    console.error('[GET /communities]', err);
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/v1/communities
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return Response.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
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

    const parsed = createBodySchema.safeParse(body);
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
      slug,
      description,
      rules,
      categoryId,
      isPrivate,
      bannerUrl,
      profilePictureUrl,
      locationId,
      locationName,
      latitude,
      longitude,
    } = parsed.data;

    // Verify category exists
    const category = await prisma.categories.findUnique({
      where: { id: categoryId },
    });
    if (!category) {
      return Response.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Category not found' } },
        { status: 404 }
      );
    }

    // Check slug uniqueness upfront for a cleaner error message
    const existing = await prisma.communities.findUnique({
      where: { slug },
    });
    if (existing) {
      return Response.json(
        { success: false, error: { code: 'CONFLICT', message: 'Slug is already taken' } },
        { status: 409 }
      );
    }

    // Resolve or create location
    let resolvedLocationId: string | undefined = locationId;
    if (!resolvedLocationId && latitude !== undefined && longitude !== undefined) {
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

    // Atomic: create community + auto-insert creator as admin member
    const community = await prisma.$transaction(async (tx) => {
      const created = await tx.communities.create({
        data: {
          name,
          slug,
          description,
          rules,
          creator_id: currentUser.id,
          category_id: categoryId,
          is_private: isPrivate,
          banner_url: bannerUrl,
          profile_picture_url: profilePictureUrl,
          location_id: resolvedLocationId,
        },
        include: {
          category: { select: { id: true, name: true } },
          location: true,
        },
      });

      // Auto-insert creator as admin member (Option A pattern — see 00-SYSTEM_CONTEXT.md §2)
      await tx.community_members.create({
        data: {
          community_id: created.id,
          user_id: currentUser.id,
          role: 'admin',
        },
      });

      return created;
    });

    return Response.json(
      {
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
          creatorId: community.creator_id,
          category: community.category,
          location: community.location
            ? {
                id: community.location.id,
                placeName: community.location.place_name,
                latitude: Number(community.location.latitude),
                longitude: Number(community.location.longitude),
              }
            : null,
          memberCount: 1, // creator just joined
          createdAt: community.created_at,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('[POST /communities]', err);
    // Prisma unique constraint fallback (slug race)
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      return Response.json(
        { success: false, error: { code: 'CONFLICT', message: 'Slug is already taken' } },
        { status: 409 }
      );
    }
    return Response.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
      { status: 500 }
    );
  }
}
