-- CreateEnum
CREATE TYPE "visibility_scope" AS ENUM ('public', 'community', 'subcommunity');

-- CreateEnum
CREATE TYPE "community_role" AS ENUM ('member', 'moderator', 'admin');

-- CreateEnum
CREATE TYPE "event_approval_status" AS ENUM ('proposed', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "hangout_join_type" AS ENUM ('open', 'request_based');

-- CreateEnum
CREATE TYPE "hangout_request_status" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('pending', 'reviewing', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "moderation_action_type" AS ENUM ('warn', 'suspend', 'ban', 'unban', 'content_removed', 'content_restored', 'promote_moderator', 'demote_moderator');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('post_reaction', 'comment_reply', 'event_approved', 'event_reminder', 'hangout_request', 'hangout_approved', 'report_resolved', 'moderation_action', 'follow', 'mention');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('active', 'canceled', 'expired', 'trial');

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "place_name" VARCHAR(255) NOT NULL,
    "latitude" DECIMAL(9,6) NOT NULL,
    "longitude" DECIMAL(9,6) NOT NULL,
    "place_id" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(30) NOT NULL,
    "email" VARCHAR(255),
    "email_verified_at" TIMESTAMPTZ(6),
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "phone_number" VARCHAR(20),
    "phone_verified_at" TIMESTAMPTZ(6),
    "password_hash" TEXT,
    "first_name" VARCHAR(50) NOT NULL,
    "last_name" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100),
    "birth_date" DATE NOT NULL,
    "bio" VARCHAR(500),
    "profile_picture_url" TEXT,
    "trust_score" INTEGER NOT NULL DEFAULT 50,
    "trust_score_updated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_external_accounts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "provider" VARCHAR(50) NOT NULL,
    "provider_user_id" VARCHAR(255) NOT NULL,
    "provider_username" VARCHAR(100),
    "provider_email" VARCHAR(255),
    "provider_phone" VARCHAR(50),
    "access_token" TEXT,
    "refresh_token" TEXT,
    "token_expires_at" TIMESTAMPTZ(6),
    "raw_profile" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "password" TEXT,
    "id_token" TEXT,
    "scope" TEXT,
    "access_token_expires_at" TIMESTAMPTZ(6),
    "refresh_token_expires_at" TIMESTAMPTZ(6),
    "issuer" TEXT,

    CONSTRAINT "user_external_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_tiers" (
    "id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "features" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_subscriptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tier_id" UUID NOT NULL,
    "status" "subscription_status" NOT NULL DEFAULT 'active',
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_token" TEXT NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_follows" (
    "follower_id" UUID NOT NULL,
    "following_id" UUID NOT NULL,
    "followed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_follows_pkey" PRIMARY KEY ("follower_id","following_id")
);

-- CreateTable
CREATE TABLE "user_blocks" (
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "blocked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_id","blocked_id")
);

-- CreateTable
CREATE TABLE "communities" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "description" VARCHAR(1000),
    "rules" TEXT,
    "creator_id" UUID NOT NULL,
    "location_id" UUID,
    "category_id" UUID NOT NULL,
    "banner_url" TEXT,
    "profile_picture_url" TEXT,
    "is_private" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "communities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_members" (
    "community_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "community_role" NOT NULL DEFAULT 'member',
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appointed_by" UUID,
    "appointed_at" TIMESTAMPTZ(6),

    CONSTRAINT "community_members_pkey" PRIMARY KEY ("community_id","user_id")
);

-- CreateTable
CREATE TABLE "community_tags" (
    "community_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "community_tags_pkey" PRIMARY KEY ("community_id","tag_id")
);

-- CreateTable
CREATE TABLE "subcommunities" (
    "id" UUID NOT NULL,
    "community_id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "subcommunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subcommunity_tags" (
    "subcommunity_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "subcommunity_tags_pkey" PRIMARY KEY ("subcommunity_id","tag_id")
);

-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "community_id" UUID NOT NULL,
    "subcommunity_id" UUID,
    "author_id" UUID NOT NULL,
    "title" VARCHAR(150),
    "content" TEXT,
    "media_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_tags" (
    "post_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "post_tags_pkey" PRIMARY KEY ("post_id","tag_id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "parent_comment_id" UUID,
    "content" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_reactions" (
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reacted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_reactions_pkey" PRIMARY KEY ("post_id","user_id")
);

-- CreateTable
CREATE TABLE "comment_reactions" (
    "comment_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "reacted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_reactions_pkey" PRIMARY KEY ("comment_id","user_id")
);

-- CreateTable
CREATE TABLE "saved_posts" (
    "user_id" UUID NOT NULL,
    "post_id" UUID NOT NULL,
    "saved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_posts_pkey" PRIMARY KEY ("user_id","post_id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "community_id" UUID NOT NULL,
    "subcommunity_id" UUID,
    "location_id" UUID,
    "title" VARCHAR(150) NOT NULL,
    "description" VARCHAR(3000),
    "cover_image_url" TEXT,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "visibility" "visibility_scope" NOT NULL DEFAULT 'public',
    "approval_status" "event_approval_status" NOT NULL DEFAULT 'approved',
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "max_participants" INTEGER,
    "price" DECIMAL(10,2),
    "currency" VARCHAR(3),
    "external_event_id" VARCHAR(255),
    "external_provider" VARCHAR(50),
    "rsvp_required" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_allowed_communities" (
    "event_id" UUID NOT NULL,
    "community_id" UUID NOT NULL,

    CONSTRAINT "event_allowed_communities_pkey" PRIMARY KEY ("event_id","community_id")
);

-- CreateTable
CREATE TABLE "event_allowed_subcommunities" (
    "event_id" UUID NOT NULL,
    "subcommunity_id" UUID NOT NULL,

    CONSTRAINT "event_allowed_subcommunities_pkey" PRIMARY KEY ("event_id","subcommunity_id")
);

-- CreateTable
CREATE TABLE "event_participants" (
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_participants_pkey" PRIMARY KEY ("event_id","user_id")
);

-- CreateTable
CREATE TABLE "event_bans" (
    "event_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "banned_by" UUID NOT NULL,
    "reason" VARCHAR(500),
    "banned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_bans_pkey" PRIMARY KEY ("event_id","user_id")
);

-- CreateTable
CREATE TABLE "saved_events" (
    "user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "saved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_events_pkey" PRIMARY KEY ("user_id","event_id")
);

-- CreateTable
CREATE TABLE "hangouts" (
    "id" UUID NOT NULL,
    "creator_id" UUID NOT NULL,
    "community_id" UUID,
    "subcommunity_id" UUID,
    "location_id" UUID,
    "title" VARCHAR(150) NOT NULL,
    "description" VARCHAR(3000),
    "cover_image_url" TEXT,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "visibility" "visibility_scope" NOT NULL DEFAULT 'public',
    "join_type" "hangout_join_type" NOT NULL DEFAULT 'open',
    "max_participants" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "hangouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hangout_allowed_communities" (
    "hangout_id" UUID NOT NULL,
    "community_id" UUID NOT NULL,

    CONSTRAINT "hangout_allowed_communities_pkey" PRIMARY KEY ("hangout_id","community_id")
);

-- CreateTable
CREATE TABLE "hangout_allowed_subcommunities" (
    "hangout_id" UUID NOT NULL,
    "subcommunity_id" UUID NOT NULL,

    CONSTRAINT "hangout_allowed_subcommunities_pkey" PRIMARY KEY ("hangout_id","subcommunity_id")
);

-- CreateTable
CREATE TABLE "hangout_participants" (
    "hangout_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hangout_participants_pkey" PRIMARY KEY ("hangout_id","user_id")
);

-- CreateTable
CREATE TABLE "hangout_join_requests" (
    "hangout_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" "hangout_request_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMPTZ(6),

    CONSTRAINT "hangout_join_requests_pkey" PRIMARY KEY ("hangout_id","user_id")
);

-- CreateTable
CREATE TABLE "hangout_bans" (
    "hangout_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "banned_by" UUID NOT NULL,
    "reason" VARCHAR(500),
    "banned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hangout_bans_pkey" PRIMARY KEY ("hangout_id","user_id")
);

-- CreateTable
CREATE TABLE "saved_hangouts" (
    "user_id" UUID NOT NULL,
    "hangout_id" UUID NOT NULL,
    "saved_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_hangouts_pkey" PRIMARY KEY ("user_id","hangout_id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "reported_user_id" UUID,
    "reported_post_id" UUID,
    "reported_comment_id" UUID,
    "reported_event_id" UUID,
    "reported_hangout_id" UUID,
    "reason" VARCHAR(500) NOT NULL,
    "status" "report_status" NOT NULL DEFAULT 'pending',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_actions" (
    "id" UUID NOT NULL,
    "moderator_id" UUID NOT NULL,
    "target_user_id" UUID,
    "report_id" UUID,
    "action_type" "moderation_action_type" NOT NULL,
    "notes" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID,
    "description" TEXT,
    "ip_address" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "related_entity_type" VARCHAR(50),
    "related_entity_id" UUID,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_history" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "search_text" VARCHAR(150) NOT NULL,
    "searched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_members" (
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_members_pkey" PRIMARY KEY ("conversation_id","user_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "message_text" TEXT,
    "media_url" TEXT,
    "sent_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "edited_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_locations_coordinates" ON "locations"("latitude", "longitude");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_number_key" ON "users"("phone_number");

-- CreateIndex
CREATE INDEX "idx_external_accounts_user" ON "user_external_accounts"("user_id");

-- CreateIndex
CREATE INDEX "idx_external_accounts_provider_lookup" ON "user_external_accounts"("provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_external_account" ON "user_external_accounts"("provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "idx_devices_user" ON "user_devices"("user_id");

-- CreateIndex
CREATE INDEX "idx_following" ON "user_follows"("following_id");

-- CreateIndex
CREATE INDEX "idx_userblocks_blocked" ON "user_blocks"("blocked_id");

-- CreateIndex
CREATE UNIQUE INDEX "communities_slug_key" ON "communities"("slug");

-- CreateIndex
CREATE INDEX "idx_communities_creator" ON "communities"("creator_id");

-- CreateIndex
CREATE INDEX "idx_communities_category" ON "communities"("category_id");

-- CreateIndex
CREATE INDEX "idx_communities_location" ON "communities"("location_id");

-- CreateIndex
CREATE INDEX "idx_communities_deleted" ON "communities"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_cm_user" ON "community_members"("user_id");

-- CreateIndex
CREATE INDEX "idx_ct_tag" ON "community_tags"("tag_id");

-- CreateIndex
CREATE INDEX "idx_subcommunity_parent" ON "subcommunities"("community_id");

-- CreateIndex
CREATE INDEX "idx_subcommunity_creator" ON "subcommunities"("creator_id");

-- CreateIndex
CREATE INDEX "idx_sct_tag" ON "subcommunity_tags"("tag_id");

-- CreateIndex
CREATE INDEX "idx_posts_community" ON "posts"("community_id");

-- CreateIndex
CREATE INDEX "idx_posts_author" ON "posts"("author_id");

-- CreateIndex
CREATE INDEX "idx_posts_subcommunity" ON "posts"("subcommunity_id");

-- CreateIndex
CREATE INDEX "idx_posts_created" ON "posts"("created_at");

-- CreateIndex
CREATE INDEX "idx_posts_deleted" ON "posts"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_posttags_tag" ON "post_tags"("tag_id");

-- CreateIndex
CREATE INDEX "idx_comments_post" ON "comments"("post_id");

-- CreateIndex
CREATE INDEX "idx_comments_author" ON "comments"("author_id");

-- CreateIndex
CREATE INDEX "idx_comments_parent" ON "comments"("parent_comment_id");

-- CreateIndex
CREATE INDEX "idx_comments_deleted" ON "comments"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_postreaction_user" ON "post_reactions"("user_id");

-- CreateIndex
CREATE INDEX "idx_commentreaction_user" ON "comment_reactions"("user_id");

-- CreateIndex
CREATE INDEX "idx_saved_posts_post" ON "saved_posts"("post_id");

-- CreateIndex
CREATE INDEX "idx_events_creator" ON "events"("creator_id");

-- CreateIndex
CREATE INDEX "idx_events_community" ON "events"("community_id");

-- CreateIndex
CREATE INDEX "idx_events_subcommunity" ON "events"("subcommunity_id");

-- CreateIndex
CREATE INDEX "idx_events_start" ON "events"("starts_at");

-- CreateIndex
CREATE INDEX "idx_events_deleted" ON "events"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_events_approval" ON "events"("approval_status");

-- CreateIndex
CREATE INDEX "idx_event_participants_user" ON "event_participants"("user_id");

-- CreateIndex
CREATE INDEX "idx_eventban_user" ON "event_bans"("user_id");

-- CreateIndex
CREATE INDEX "idx_saved_events_event" ON "saved_events"("event_id");

-- CreateIndex
CREATE INDEX "idx_hangouts_creator" ON "hangouts"("creator_id");

-- CreateIndex
CREATE INDEX "idx_hangouts_community" ON "hangouts"("community_id");

-- CreateIndex
CREATE INDEX "idx_hangouts_start" ON "hangouts"("starts_at");

-- CreateIndex
CREATE INDEX "idx_hangouts_deleted" ON "hangouts"("deleted_at");

-- CreateIndex
CREATE INDEX "idx_hangout_participants_user" ON "hangout_participants"("user_id");

-- CreateIndex
CREATE INDEX "idx_hangoutban_user" ON "hangout_bans"("user_id");

-- CreateIndex
CREATE INDEX "idx_saved_hangouts_hangout" ON "saved_hangouts"("hangout_id");

-- CreateIndex
CREATE INDEX "idx_reports_reporter" ON "reports"("reporter_id");

-- CreateIndex
CREATE INDEX "idx_reports_status" ON "reports"("status");

-- CreateIndex
CREATE INDEX "idx_reports_created" ON "reports"("created_at");

-- CreateIndex
CREATE INDEX "idx_modactions_moderator" ON "moderation_actions"("moderator_id");

-- CreateIndex
CREATE INDEX "idx_modactions_report" ON "moderation_actions"("report_id");

-- CreateIndex
CREATE INDEX "idx_audit_actor" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "idx_audit_entity" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "idx_notifications_user" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "idx_notifications_created" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "idx_search_user" ON "search_history"("user_id");

-- CreateIndex
CREATE INDEX "idx_search_time" ON "search_history"("searched_at");

-- CreateIndex
CREATE INDEX "idx_convmember_user" ON "conversation_members"("user_id");

-- CreateIndex
CREATE INDEX "idx_messages_conversation" ON "messages"("conversation_id");

-- CreateIndex
CREATE INDEX "idx_messages_sender" ON "messages"("sender_id");

-- CreateIndex
CREATE INDEX "idx_messages_sent" ON "messages"("sent_at");

-- AddForeignKey
ALTER TABLE "user_external_accounts" ADD CONSTRAINT "user_external_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_tier_id_fkey" FOREIGN KEY ("tier_id") REFERENCES "subscription_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_follower_id_fkey" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_follows" ADD CONSTRAINT "user_follows_following_id_fkey" FOREIGN KEY ("following_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communities" ADD CONSTRAINT "communities_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communities" ADD CONSTRAINT "communities_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communities" ADD CONSTRAINT "communities_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_appointed_by_fkey" FOREIGN KEY ("appointed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_tags" ADD CONSTRAINT "community_tags_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_tags" ADD CONSTRAINT "community_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcommunities" ADD CONSTRAINT "subcommunities_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcommunities" ADD CONSTRAINT "subcommunities_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcommunity_tags" ADD CONSTRAINT "subcommunity_tags_subcommunity_id_fkey" FOREIGN KEY ("subcommunity_id") REFERENCES "subcommunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subcommunity_tags" ADD CONSTRAINT "subcommunity_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_subcommunity_id_fkey" FOREIGN KEY ("subcommunity_id") REFERENCES "subcommunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_comment_id_fkey" FOREIGN KEY ("parent_comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_reactions" ADD CONSTRAINT "post_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_reactions" ADD CONSTRAINT "comment_reactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_posts" ADD CONSTRAINT "saved_posts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_posts" ADD CONSTRAINT "saved_posts_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_subcommunity_id_fkey" FOREIGN KEY ("subcommunity_id") REFERENCES "subcommunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_allowed_communities" ADD CONSTRAINT "event_allowed_communities_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_allowed_communities" ADD CONSTRAINT "event_allowed_communities_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_allowed_subcommunities" ADD CONSTRAINT "event_allowed_subcommunities_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_allowed_subcommunities" ADD CONSTRAINT "event_allowed_subcommunities_subcommunity_id_fkey" FOREIGN KEY ("subcommunity_id") REFERENCES "subcommunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_participants" ADD CONSTRAINT "event_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_bans" ADD CONSTRAINT "event_bans_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_bans" ADD CONSTRAINT "event_bans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_bans" ADD CONSTRAINT "event_bans_banned_by_fkey" FOREIGN KEY ("banned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_events" ADD CONSTRAINT "saved_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_events" ADD CONSTRAINT "saved_events_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangouts" ADD CONSTRAINT "hangouts_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangouts" ADD CONSTRAINT "hangouts_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangouts" ADD CONSTRAINT "hangouts_subcommunity_id_fkey" FOREIGN KEY ("subcommunity_id") REFERENCES "subcommunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangouts" ADD CONSTRAINT "hangouts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_allowed_communities" ADD CONSTRAINT "hangout_allowed_communities_hangout_id_fkey" FOREIGN KEY ("hangout_id") REFERENCES "hangouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_allowed_communities" ADD CONSTRAINT "hangout_allowed_communities_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "communities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_allowed_subcommunities" ADD CONSTRAINT "hangout_allowed_subcommunities_hangout_id_fkey" FOREIGN KEY ("hangout_id") REFERENCES "hangouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_allowed_subcommunities" ADD CONSTRAINT "hangout_allowed_subcommunities_subcommunity_id_fkey" FOREIGN KEY ("subcommunity_id") REFERENCES "subcommunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_participants" ADD CONSTRAINT "hangout_participants_hangout_id_fkey" FOREIGN KEY ("hangout_id") REFERENCES "hangouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_participants" ADD CONSTRAINT "hangout_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_join_requests" ADD CONSTRAINT "hangout_join_requests_hangout_id_fkey" FOREIGN KEY ("hangout_id") REFERENCES "hangouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_join_requests" ADD CONSTRAINT "hangout_join_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_bans" ADD CONSTRAINT "hangout_bans_hangout_id_fkey" FOREIGN KEY ("hangout_id") REFERENCES "hangouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_bans" ADD CONSTRAINT "hangout_bans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hangout_bans" ADD CONSTRAINT "hangout_bans_banned_by_fkey" FOREIGN KEY ("banned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_hangouts" ADD CONSTRAINT "saved_hangouts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_hangouts" ADD CONSTRAINT "saved_hangouts_hangout_id_fkey" FOREIGN KEY ("hangout_id") REFERENCES "hangouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_user_id_fkey" FOREIGN KEY ("reported_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_post_id_fkey" FOREIGN KEY ("reported_post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_comment_id_fkey" FOREIGN KEY ("reported_comment_id") REFERENCES "comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_event_id_fkey" FOREIGN KEY ("reported_event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_hangout_id_fkey" FOREIGN KEY ("reported_hangout_id") REFERENCES "hangouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_moderator_id_fkey" FOREIGN KEY ("moderator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_target_user_id_fkey" FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_history" ADD CONSTRAINT "search_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_members" ADD CONSTRAINT "conversation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- users: minimum age 13
ALTER TABLE "users"
  ADD CONSTRAINT "chk_users_age"
  CHECK (birth_date <= (NOW() - INTERVAL '13 years'));

-- user_subscriptions: ends_at must be after starts_at
ALTER TABLE "user_subscriptions"
  ADD CONSTRAINT "chk_user_subscriptions_dates"
  CHECK (ends_at > starts_at);

-- user_follows: cannot follow yourself
ALTER TABLE "user_follows"
  ADD CONSTRAINT "chk_user_follows_not_self"
  CHECK (follower_id != following_id);

-- user_blocks: cannot block yourself
ALTER TABLE "user_blocks"
  ADD CONSTRAINT "chk_user_blocks_not_self"
  CHECK (blocker_id != blocked_id);

-- posts: at least one of title / content / media_url must be present
ALTER TABLE "posts"
  ADD CONSTRAINT "chk_posts_content"
  CHECK (title IS NOT NULL OR content IS NOT NULL OR media_url IS NOT NULL);

-- events: ends_at (if set) must be after starts_at
ALTER TABLE "events"
  ADD CONSTRAINT "chk_events_dates"
  CHECK (ends_at IS NULL OR ends_at > starts_at);

-- events: price (if set) must be positive
ALTER TABLE "events"
  ADD CONSTRAINT "chk_events_price"
  CHECK (price IS NULL OR price > 0);

-- hangouts: ends_at (if set) must be after starts_at
ALTER TABLE "hangouts"
  ADD CONSTRAINT "chk_hangouts_dates"
  CHECK (ends_at IS NULL OR ends_at > starts_at);

-- reports: exactly one target column must be set
ALTER TABLE "reports"
  ADD CONSTRAINT "chk_reports_target"
  CHECK (
    (
      (reported_user_id IS NOT NULL)::int +
      (reported_post_id IS NOT NULL)::int +
      (reported_comment_id IS NOT NULL)::int +
      (reported_event_id IS NOT NULL)::int +
      (reported_hangout_id IS NOT NULL)::int
    ) = 1
  );

-- messages: at least one of message_text / media_url must be present
ALTER TABLE "messages"
  ADD CONSTRAINT "chk_messages_content"
  CHECK (message_text IS NOT NULL OR media_url IS NOT NULL);