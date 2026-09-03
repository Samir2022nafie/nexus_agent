// src/app/api/v1/communities/[slug]/members/route.ts
// GET /api/v1/communities/:slug/members -- List all members with roles (admin/mod/owner only)

import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/get-current-user";
import { paginationSchema } from "@/lib/zod-utils";

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

    const community = await prisma.communities.findUnique({
      where: { slug, deleted_at: null },
    });
    if (!community) {
      return Response.json(
        { success: false, error: { code: "NOT_FOUND", message: "Community not found" } },
        { status: 404 }
      );
    }

    const isOwner = community.creator_id === currentUser.id;
    if (!isOwner) {
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
              message: "Only admins, moderators, and owners can view the member list.",
            },
          },
          { status: 403 }
        );
      }
    }

    const queryParams = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = paginationSchema.safeParse(queryParams);
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid query parameters",
            details: parsed.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const { page, limit } = parsed.data;

    const [total, members] = await Promise.all([
      prisma.community_members.count({
        where: { community_id: community.id },
      }),
      prisma.community_members.findMany({
        where: { community_id: community.id },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              first_name: true,
              last_name: true,
              profile_picture_url: true,
            },
          },
          appointedBy: {
            select: {
              id: true,
              username: true,
            },
          },
        },
        orderBy: { joined_at: "asc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const data = members.map((m) => ({
      userId: m.user_id,
      username: m.user.username,
      firstName: m.user.first_name,
      lastName: m.user.last_name,
      profilePictureUrl: m.user.profile_picture_url,
      // Surface the community creator with role "owner" in the response.
      // The DB row stays "admin" (Option A pattern -- see 00-SYSTEM_CONTEXT.md ss2.3).
      role: m.user_id === community.creator_id ? "owner" : m.role,
      joinedAt: m.joined_at,
      appointedBy: m.appointedBy
        ? { id: m.appointedBy.id, username: m.appointedBy.username }
        : null,
      appointedAt: m.appointed_at,
    }));

    return Response.json({
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("[GET /communities/:slug/members]", err);
    return Response.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}