// src/app/api/v1/communities/[slug]/members/[userId]/route.ts
// PATCH /api/v1/communities/:slug/members/:userId -- Update member role (OWNER ONLY)

import { type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/get-current-user";
import { uuidSchema } from "@/lib/zod-utils";

const patchBodySchema = z.object({
  role: z.enum(["member", "moderator", "admin"]),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; userId: string }> }
) {
  try {
    const { slug, userId: targetUserId } = await params;

    // Validate targetUserId is a valid UUID
    const idParsed = uuidSchema.safeParse(targetUserId);
    if (!idParsed.success) {
      return Response.json(
        { success: false, error: { code: "NOT_FOUND", message: "Member not found" } },
        { status: 404 }
      );
    }

    const currentUser = await getCurrentUser(req);
    if (!currentUser) {
      return Response.json(
        { success: false, error: { code: "UNAUTHORIZED", message: "Authentication required" } },
        { status: 401 }
      );
    }

    // Resolve community
    const community = await prisma.communities.findUnique({
      where: { slug, deleted_at: null },
    });
    if (!community) {
      return Response.json(
        { success: false, error: { code: "NOT_FOUND", message: "Community not found" } },
        { status: 404 }
      );
    }

    // OWNER ONLY -- Prisma check, not CASL
    if (community.creator_id !== currentUser.id) {
      return Response.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "Only the community owner can change member roles." },
        },
        { status: 403 }
      );
    }

    // Owner protection: cannot target the owner themselves
    if (targetUserId === community.creator_id) {
      return Response.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "The community owner's role cannot be changed." },
        },
        { status: 403 }
      );
    }

    // Confirm target is an existing member
    const targetMembership = await prisma.community_members.findUnique({
      where: {
        community_id_user_id: {
          community_id: community.id,
          user_id: targetUserId,
        },
      },
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
      },
    });
    if (!targetMembership) {
      return Response.json(
        { success: false, error: { code: "NOT_FOUND", message: "Member not found in this community" } },
        { status: 404 }
      );
    }

    // Parse and validate body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json(
        { success: false, error: { code: "VALIDATION_ERROR", message: "Invalid JSON body" } },
        { status: 400 }
      );
    }

    const parsed = patchBodySchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Validation failed",
            details: parsed.error.issues,
          },
        },
        { status: 400 }
      );
    }

    const { role } = parsed.data;

    // Update role + set appointed_by / appointed_at
    const updated = await prisma.community_members.update({
      where: {
        community_id_user_id: {
          community_id: community.id,
          user_id: targetUserId,
        },
      },
      data: {
        role,
        appointed_by: currentUser.id,
        appointed_at: new Date(),
      },
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
    });

    return Response.json({
      success: true,
      data: {
        userId: updated.user_id,
        username: updated.user.username,
        firstName: updated.user.first_name,
        lastName: updated.user.last_name,
        profilePictureUrl: updated.user.profile_picture_url,
        role: updated.role,
        joinedAt: updated.joined_at,
        appointedBy: updated.appointedBy
          ? { id: updated.appointedBy.id, username: updated.appointedBy.username }
          : null,
        appointedAt: updated.appointed_at,
      },
    });
  } catch (err) {
    console.error("[PATCH /communities/:slug/members/:userId]", err);
    return Response.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}