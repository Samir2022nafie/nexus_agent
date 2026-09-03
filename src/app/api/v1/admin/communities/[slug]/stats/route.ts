// src/app/api/v1/admin/communities/[slug]/stats/route.ts
// GET /api/v1/admin/communities/:slug/stats -- Community stats (admin/mod/owner)
//
// Stats returned:
//   totalMembers       -- count of community_members rows
//   totalPosts         -- count of posts (deleted_at: null)
//   totalEvents        -- count of events (deleted_at: null)
//   pendingReports     -- count of pending reports targeting content in this community
//   pendingEvents      -- count of events with approval_status = "proposed"
//   newMembersThisWeek -- count of members who joined in the last 7 days

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

    // Resolve community
    const community = await prisma.communities.findUnique({
      where: { slug, deleted_at: null },
      select: { id: true, creator_id: true },
    });
    if (!community) {
      return Response.json(
        { success: false, error: { code: "NOT_FOUND", message: "Community not found" } },
        { status: 404 }
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
              message: "Only admins, moderators, and owners can access community stats.",
            },
          },
          { status: 403 }
        );
      }
    }

    const communityId = community.id;
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Fetch all stats in parallel for efficiency
    const [
      totalMembers,
      totalPosts,
      totalEvents,
      pendingEvents,
      newMembersThisWeek,
      // Pending reports broken down by target type scoped to this community
      pendingReportsByPost,
      pendingReportsByComment,
      pendingReportsByEvent,
      pendingReportsByHangout,
    ] = await Promise.all([
      // 1. Total members
      prisma.community_members.count({
        where: { community_id: communityId },
      }),

      // 2. Total posts (not soft-deleted)
      prisma.posts.count({
        where: { community_id: communityId, deleted_at: null },
      }),

      // 3. Total events (not soft-deleted)
      prisma.events.count({
        where: { community_id: communityId, deleted_at: null },
      }),

      // 4. Pending proposed events
      prisma.events.count({
        where: {
          community_id: communityId,
          deleted_at: null,
          approval_status: "proposed",
        },
      }),

      // 5. New members this week
      prisma.community_members.count({
        where: {
          community_id: communityId,
          joined_at: { gte: oneWeekAgo },
        },
      }),

      // 6a. Pending reports targeting posts in this community
      prisma.reports.count({
        where: {
          status: "pending",
          post: { community_id: communityId },
        },
      }),

      // 6b. Pending reports targeting comments on posts in this community
      prisma.reports.count({
        where: {
          status: "pending",
          comment: { post: { community_id: communityId } },
        },
      }),

      // 6c. Pending reports targeting events in this community
      prisma.reports.count({
        where: {
          status: "pending",
          event: { community_id: communityId },
        },
      }),

      // 6d. Pending reports targeting hangouts tied to this community
      prisma.reports.count({
        where: {
          status: "pending",
          hangout: { community_id: communityId },
        },
      }),
    ]);

    // Combine pending report counts. Each report targets exactly one entity
    // (chk_reports_target constraint), so these are non-overlapping sets.
    const pendingReports =
      pendingReportsByPost +
      pendingReportsByComment +
      pendingReportsByEvent +
      pendingReportsByHangout;

    return Response.json({
      success: true,
      data: {
        totalMembers,
        totalPosts,
        totalEvents,
        pendingReports,
        pendingEvents,
        newMembersThisWeek,
      },
    });
  } catch (err) {
    console.error("[GET /admin/communities/:slug/stats]", err);
    return Response.json(
      { success: false, error: { code: "INTERNAL_ERROR", message: "Internal server error" } },
      { status: 500 }
    );
  }
}