// src/app/api/v1/communities/[slug]/members/[userId]/kick/route.ts
// DELETE /api/v1/communities/:slug/members/:userId/kick -- Kick a member (admin/mod/owner)

import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/get-current-user";
import { uuidSchema } from "@/lib/zod-utils";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string; userId: string }> }
) {
  try {
    const { slug, userId: targetUserId } = await params;

    // Validate targetUserId
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

    // Owner protection: cannot kick the owner
    if (targetUserId === community.creator_id) {
      return Response.json(
        {
          success: false,
          error: { code: "FORBIDDEN", message: "The community owner cannot be kicked." },
        },
        { status: 403 }
      );
    }

    // Auth check: admin/mod/owner via Prisma
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
              message: "Only admins, moderators, and owners can kick members.",
            },
          },
          { status: 403 }
        );
      }
    }

    // Confirm the target is actually a member
    const targetMembership = await prisma.community_members.findUnique({
      where: {
        community_id_user_id: {
          community_id: community.id,
          user_id: targetUserId,
        },
      },
    });
    if (!targetMembership) {
      return Response.json(
        { success: false, error: { code: "NOT_FOUND", message: "Member not found in this community" } },
        { status: 404 }
      );
    }

    // Hard-delete the membership row.
    // Memberships are hard deleted per the soft-delete philosophy -- see 00-SYSTEM_CONTEXT.md ss10.
    await prisma.community_members.delete({
      where: {
        community_id_user_id: {
          community_id: community.id,
          user_id: targetUserId,
        },
      },
    });

    return Response.json({
      success: true,
      data: { message: "Member kicked successfully." },
    });
  } catch (err) {
    console.error("[DELETE /communities/:slug/members/:userId/kick]", err);
    return Response.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}