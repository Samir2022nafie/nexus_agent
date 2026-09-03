// src/app/api/v1/admin/communities/[slug]/route.ts
// GET /api/v1/admin/communities/:slug -- Admin community overview (admin/mod/owner)

import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/get-current-user";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;

    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return Response.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    // Resolve community with all details needed for the overview
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
        { success: false, error: { code: "NOT_FOUND", message: "Community not found" } },
        { status: 404 }
      );
    }

    // Auth check: admin/mod/owner via Prisma
    const isOwner = community.creator_id === currentUser.id;
    let currentUserRole: string | null = null;

    if (isOwner) {
      currentUserRole = "owner";
    } else {
      const callerMembership = await prisma.community_members.findUnique({
        where: {
          community_id_user_id: {
            community_id: community.id,
            user_id: currentUser.id,
          },
        },
      });
      if (!callerMembership || !["admin", "moderator"].includes(callerMembership.role)) {
        return Response.json(
          {
            success: false,
            error: {
              code: "FORBIDDEN",
              message: "Only admins, moderators, and owners can access the admin overview.",
            },
          },
          { status: 403 }
        );
      }
      currentUserRole = callerMembership.role;
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
        currentUserRole,
      },
    });
  } catch (err) {
    console.error("[GET /admin/communities/:slug]", err);
    return Response.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}