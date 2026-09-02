# Database Schema Reference
> **Version:** 2.0 (Consolidated — matches `schema.prisma` exactly)
> **Database:** PostgreSQL
> **Style:** Modular Relational
> **Primary Keys:** UUID (`gen_random_uuid()` via Prisma `@default(uuid())`) everywhere
> **Extensions:** `pgcrypto`
> **Ground truth note:** This document was reconciled against the live `schema.prisma` (which already includes the Better-Auth integration tables and columns). If anything here ever conflicts with `schema.prisma`, **the `.prisma` file wins** — treat this document as the human-readable explanation of it, not a competing source.

---

## Naming Conventions
- Every table primary key is `id` (UUID), except pure join/bridge tables, which use composite primary keys.
- Foreign keys use `{table}_id` (e.g., `creator_id`, `community_id`).
- Timestamps: `created_at`, `updated_at`, `deleted_at` (soft delete), `joined_at`, `reacted_at`, etc.
- Enum types are lowercase with underscores.

---

## ENUM Types

```
visibility_scope        :: public | community | subcommunity
community_role          :: member | moderator | admin
event_approval_status   :: proposed | approved | rejected
hangout_join_type       :: open | request_based
hangout_request_status  :: pending | approved | rejected
report_status           :: pending | reviewing | resolved | dismissed
moderation_action_type  :: warn | suspend | ban | unban | content_removed | content_restored | promote_moderator | demote_moderator
notification_type       :: post_reaction | comment_reply | event_approved | event_reminder | hangout_request | hangout_approved | report_resolved | moderation_action | follow | mention
subscription_status     :: active | canceled | expired | trial
```

---

## Table Reference

### locations
Reusable geographic points. Uniqueness by `(latitude, longitude)`.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| place_name | VARCHAR(255) | NOT NULL |
| latitude | NUMERIC(9,6) | NOT NULL |
| longitude | NUMERIC(9,6) | NOT NULL |
| place_id | VARCHAR(255) | Map API reference, nullable |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**Indexes:** `uq_locations_coordinates` UNIQUE (latitude, longitude)

---

### categories
System-defined only. Preloaded with 14 values.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| name | VARCHAR(50) | NOT NULL, UNIQUE |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**Preloaded:** technology, gaming, anime_manga, movies_tv, arts_creativity, education_study_groups, books_writing, music_entertainment, health_fitness, outdoor_adventure, sports, social_lifestyle, culture_language, other

---

### tags
User-created. Case-insensitive unique.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| name | VARCHAR(50) | NOT NULL, UNIQUE |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

---

### users
Core identity, owned by Better-Auth via table mapping (not Better-Auth's default schema).

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| username | VARCHAR(30) | NOT NULL, UNIQUE |
| email | VARCHAR(255) | NULLABLE, UNIQUE |
| email_verified_at | TIMESTAMPTZ | nullable |
| email_verified | BOOLEAN | DEFAULT false |
| phone_number | VARCHAR(20) | NULLABLE, UNIQUE |
| phone_verified_at | TIMESTAMPTZ | nullable — gates phone login, see `AUTH_SPECIFICATION.md` |
| password_hash | TEXT | NULLABLE, **unused** — see §"Auth column notes" below |
| first_name | VARCHAR(50) | NOT NULL |
| last_name | VARCHAR(50) | NOT NULL |
| name | VARCHAR(100) | nullable — Better-Auth's generic display-name field |
| birth_date | DATE | NOT NULL, CHECK >= 13 years old |
| bio | VARCHAR(500) | nullable |
| profile_picture_url | TEXT | nullable |
| trust_score | INTEGER | DEFAULT 50, CHECK 0-100 |
| trust_score_updated_at | TIMESTAMPTZ | nullable |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | auto |
| deleted_at | TIMESTAMPTZ | Soft delete |

**Business Rules:**
- Backend must block password login if no matching `credential` row exists in `user_external_accounts` for the resolved user.
- Backend must collect `first_name`, `last_name`, `birth_date` before creating a user, for every signup method.
- `phone_verified_at` must be set before the phone number can be used to log in, and before it contributes to trust score.
- A user may have both `email` and `phone_number` set, either alone, or (for pure OAuth/Telegram signups) neither — identity in that case rests entirely in `user_external_accounts`.

#### Auth column notes (why `password_hash` exists but is unused)
Better-Auth owns the credential flow. Passwords are stored as a row in `user_external_accounts` with `provider = 'credential'`, and the `password` column on that table holds the hash. `users.password_hash` is a legacy column kept for schema compatibility — never read or written by application code. Do not "fix" this back to writing `password_hash` directly.

---

### user_external_accounts
Links users to OAuth providers, Telegram login, and stores the password credential row. One row per provider per user.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | NOT NULL, FK → users(id) CASCADE |
| provider | VARCHAR(50) | NOT NULL — `credential`, `google`, `apple`, `telegram` (v1); `whatsapp` reserved for v1.2 |
| provider_user_id | VARCHAR(255) | NOT NULL |
| provider_username | VARCHAR(100) | nullable |
| provider_email | VARCHAR(255) | nullable |
| provider_phone | VARCHAR(50) | nullable |
| access_token | TEXT | Encrypt at app level before storing |
| refresh_token | TEXT | Encrypt at app level before storing |
| token_expires_at | TIMESTAMPTZ | nullable |
| raw_profile | JSONB | DEFAULT '{}' |
| is_active | BOOLEAN | DEFAULT TRUE |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | auto |
| password | TEXT | Better-Auth credential hash (provider='credential' rows only) |
| id_token | TEXT | Google/Apple raw ID token (OIDC) |
| scope | TEXT | OAuth scopes granted |
| access_token_expires_at | TIMESTAMPTZ | nullable |
| refresh_token_expires_at | TIMESTAMPTZ | nullable |
| issuer | TEXT | nullable |

**Indexes:** `uq_external_account` UNIQUE (provider, provider_user_id); `idx_external_accounts_user`; `idx_external_accounts_provider_lookup` (provider, provider_user_id)

**How the Telegram Login Widget uses this table:** a successful widget verification (see `AUTH_SPECIFICATION.md`) creates/looks up a row with `provider = 'telegram'`, `provider_user_id` = the Telegram numeric user ID, `provider_username` = the Telegram `@username` if present. No `password` column is populated for this provider.

---

### sessions
Better-Auth's bearer-token session store. Fully owned by Better-Auth; do not query this table with hand-written logic outside `lib/auth.ts` / `lib/get-current-user.ts` / `lib/manual-session.ts`.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| token | TEXT | NOT NULL, UNIQUE |
| user_id | UUID | NOT NULL, FK → users(id) CASCADE |
| expires_at | TIMESTAMPTZ | NOT NULL |
| ip_address | TEXT | nullable |
| user_agent | TEXT | nullable |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | auto |

Bot/manual logins (v1.2) insert directly into this table via `createManualSession()` rather than going through Better-Auth's own sign-in flow — the bearer plugin recognizes such tokens identically to ones it created itself.

---

### verification
Generic short-lived verification/OTP storage, owned by Better-Auth but reused by application code for phone OTP.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| identifier | TEXT | NOT NULL — e.g. `phone:<E.164 number>` for phone OTP |
| value | TEXT | NOT NULL — the OTP code (or Better-Auth's own token, for email flows) |
| expires_at | TIMESTAMPTZ | NOT NULL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | auto |

Do not assume this table is email-only — the `identifier` prefix distinguishes use cases.

---

### subscription_tiers
Defines monetization plans.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| name | VARCHAR(50) | NOT NULL |
| description | TEXT | nullable |
| price | NUMERIC(10,2) | NOT NULL |
| currency | VARCHAR(3) | DEFAULT 'USD' |
| features | JSONB | DEFAULT '{}' |
| is_active | BOOLEAN | DEFAULT TRUE |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | auto |

---

### user_subscriptions
Tracks who is premium. No boolean on the users table.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | NOT NULL, FK → users(id) CASCADE |
| tier_id | UUID | NOT NULL, FK → subscription_tiers(id) RESTRICT |
| status | subscription_status | DEFAULT 'active' |
| starts_at | TIMESTAMPTZ | NOT NULL |
| ends_at | TIMESTAMPTZ | NOT NULL, CHECK ends_at > starts_at |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | auto |

**Query Pattern:** User is premium if `status = 'active' AND ends_at > NOW()`.

---

### user_devices
Push notification tokens.

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | NOT NULL, FK → users(id) CASCADE |
| device_token | TEXT | NOT NULL |
| platform | VARCHAR(20) | NOT NULL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | auto |

**Indexes:** `idx_devices_user`

---

### user_follows

| Column | Type | Constraints |
|--------|------|-------------|
| follower_id | UUID | FK → users(id) CASCADE |
| following_id | UUID | FK → users(id) CASCADE |
| followed_at | TIMESTAMPTZ | DEFAULT NOW() |

**PK:** (follower_id, following_id) · **Check:** follower_id <> following_id · **Indexes:** `idx_following`

---

### user_blocks

| Column | Type | Constraints |
|--------|------|-------------|
| blocker_id | UUID | FK → users(id) CASCADE |
| blocked_id | UUID | FK → users(id) CASCADE |
| blocked_at | TIMESTAMPTZ | DEFAULT NOW() |

**PK:** (blocker_id, blocked_id) · **Check:** blocker_id <> blocked_id · **Indexes:** `idx_userblocks_blocked`

---

### communities

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| name | VARCHAR(100) | NOT NULL |
| slug | VARCHAR(120) | NOT NULL, UNIQUE |
| description | VARCHAR(1000) | nullable |
| rules | TEXT | nullable |
| creator_id | UUID | NOT NULL, FK → users(id) RESTRICT |
| location_id | UUID | FK → locations(id) SET NULL |
| category_id | UUID | NOT NULL, FK → categories(id) RESTRICT |
| banner_url | TEXT | nullable |
| profile_picture_url | TEXT | nullable |
| is_private | BOOLEAN | DEFAULT FALSE |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | auto |
| deleted_at | TIMESTAMPTZ | Soft delete |

**Indexes:** `idx_communities_creator`, `idx_communities_category`, `idx_communities_location`, `idx_communities_deleted`

**Business Rules:**
- Name is NOT unique. Slug IS unique.
- Creator is the Owner. Cannot delete a user who owns active communities (RESTRICT).
- Backend must insert creator into `community_members(role='admin')` on creation.
- `category_id` is immutable after creation — no endpoint changes it (confirmed v1 scope decision).

---

### community_members
Single source of truth for membership + roles.

| Column | Type | Constraints |
|--------|------|-------------|
| community_id | UUID | FK → communities(id) CASCADE |
| user_id | UUID | FK → users(id) CASCADE |
| role | community_role | DEFAULT 'member' |
| joined_at | TIMESTAMPTZ | DEFAULT NOW() |
| appointed_by | UUID | FK → users(id) SET NULL |
| appointed_at | TIMESTAMPTZ | nullable |

**PK:** (community_id, user_id) · **Indexes:** `idx_cm_user`

**Business Rules:**
- v1: `role IN ('admin', 'moderator')` = same permissions.
- v2: Split permissions by role.
- Owner must have a row here with `role = 'admin'` (Option A pattern).
- Backend must prevent demoting/kicking the owner.

---

### community_tags

| Column | Type | Constraints |
|--------|------|-------------|
| community_id | UUID | FK → communities(id) CASCADE |
| tag_id | UUID | FK → tags(id) CASCADE |

**PK:** (community_id, tag_id) · **Indexes:** `idx_ct_tag`

---

### subcommunities

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| community_id | UUID | NOT NULL, FK → communities(id) CASCADE |
| creator_id | UUID | NOT NULL, FK → users(id) RESTRICT |
| name | VARCHAR(100) | NOT NULL |
| description | VARCHAR(1000) | nullable |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | auto |
| deleted_at | TIMESTAMPTZ | Soft delete |

**Indexes:** `idx_subcommunity_parent`, `idx_subcommunity_creator`

**Business Rules:** Always belongs to exactly one community. Backend should allow posts/events/hangouts to reference `subcommunity_id`, even if UI hides it in v1.

---

### subcommunity_tags

| Column | Type | Constraints |
|--------|------|-------------|
| subcommunity_id | UUID | FK → subcommunities(id) CASCADE |
| tag_id | UUID | FK → tags(id) CASCADE |

**PK:** (subcommunity_id, tag_id) · **Indexes:** `idx_sct_tag`

---

### posts

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| community_id | UUID | NOT NULL, FK → communities(id) CASCADE |
| subcommunity_id | UUID | FK → subcommunities(id) CASCADE, nullable (future) |
| author_id | UUID | NOT NULL, FK → users(id) CASCADE |
| title | VARCHAR(150) | nullable |
| content | TEXT | nullable |
| media_url | TEXT | nullable |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | auto |
| deleted_at | TIMESTAMPTZ | Soft delete |

**Check:** At least one of title, content, media_url must be non-null.
**Indexes:** `idx_posts_community`, `idx_posts_author`, `idx_posts_subcommunity`, `idx_posts_created`, `idx_posts_deleted`

---

### post_tags

| Column | Type | Constraints |
|--------|------|-------------|
| post_id | UUID | FK → posts(id) CASCADE |
| tag_id | UUID | FK → tags(id) CASCADE |

**PK:** (post_id, tag_id) · **Indexes:** `idx_posttags_tag`

---

### comments

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| post_id | UUID | NOT NULL, FK → posts(id) CASCADE |
| author_id | UUID | NOT NULL, FK → users(id) CASCADE |
| parent_comment_id | UUID | FK → comments(id) CASCADE, nullable |
| content | VARCHAR(1000) | NOT NULL |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | auto |
| deleted_at | TIMESTAMPTZ | Soft delete |

**Indexes:** `idx_comments_post`, `idx_comments_author`, `idx_comments_parent`, `idx_comments_deleted`

---

### post_reactions
One like per user per post.

| Column | Type | Constraints |
|--------|------|-------------|
| post_id | UUID | FK → posts(id) CASCADE |
| user_id | UUID | FK → users(id) CASCADE |
| reacted_at | TIMESTAMPTZ | DEFAULT NOW() |

**PK:** (post_id, user_id) · **Indexes:** `idx_postreaction_user`

---

### comment_reactions
One like per user per comment.

| Column | Type | Constraints |
|--------|------|-------------|
| comment_id | UUID | FK → comments(id) CASCADE |
| user_id | UUID | FK → users(id) CASCADE |
| reacted_at | TIMESTAMPTZ | DEFAULT NOW() |

**PK:** (comment_id, user_id) · **Indexes:** `idx_commentreaction_user`

---

### saved_posts (Bookmarks)

| Column | Type | Constraints |
|--------|------|-------------|
| user_id | UUID | FK → users(id) CASCADE |
| post_id | UUID | FK → posts(id) CASCADE |
| saved_at | TIMESTAMPTZ | DEFAULT NOW() |

**PK:** (user_id, post_id) · **Indexes:** `idx_saved_posts_post`

---

### events

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| creator_id | UUID | NOT NULL, FK → users(id) RESTRICT |
| community_id | UUID | NOT NULL, FK → communities(id) CASCADE |
| subcommunity_id | UUID | FK → subcommunities(id) CASCADE, nullable |
| location_id | UUID | FK → locations(id) SET NULL |
| title | VARCHAR(150) | NOT NULL |
| description | VARCHAR(3000) | nullable |
| cover_image_url | TEXT | nullable |
| starts_at | TIMESTAMPTZ | NOT NULL |
| ends_at | TIMESTAMPTZ | nullable |
| visibility | visibility_scope | DEFAULT 'public' |
| approval_status | event_approval_status | DEFAULT 'approved' |
| is_verified | BOOLEAN | DEFAULT FALSE |
| max_participants | INTEGER | nullable (future enforcement) |
| price | NUMERIC(10,2) | nullable, CHECK > 0 if set (future) |
| currency | VARCHAR(3) | nullable (future) |
| external_event_id | VARCHAR(255) | nullable (future) |
| external_provider | VARCHAR(50) | nullable (future) |
| rsvp_required | BOOLEAN | DEFAULT FALSE |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | auto |
| deleted_at | TIMESTAMPTZ | Soft delete |

**Checks:** ends_at > starts_at (if set); price > 0 (if set).
**Indexes:** `idx_events_creator`, `idx_events_community`, `idx_events_subcommunity`, `idx_events_start`, `idx_events_deleted`, `idx_events_approval`

**Business Rules:**
- Proposed events (`approval_status = 'proposed'`) created by regular members.
- Verified events created by admin/owner OR approved proposed events.
- Join button means "support" for proposed, "attend" for approved.

---

### event_allowed_communities

| Column | Type | Constraints |
|--------|------|-------------|
| event_id | UUID | FK → events(id) CASCADE |
| community_id | UUID | FK → communities(id) CASCADE |

**PK:** (event_id, community_id)

---

### event_allowed_subcommunities

| Column | Type | Constraints |
|--------|------|-------------|
| event_id | UUID | FK → events(id) CASCADE |
| subcommunity_id | UUID | FK → subcommunities(id) CASCADE |

**PK:** (event_id, subcommunity_id)

---

### event_participants

| Column | Type | Constraints |
|--------|------|-------------|
| event_id | UUID | FK → events(id) CASCADE |
| user_id | UUID | FK → users(id) CASCADE |
| joined_at | TIMESTAMPTZ | DEFAULT NOW() |

**PK:** (event_id, user_id) · **Indexes:** `idx_event_participants_user`

---

### event_bans

| Column | Type | Constraints |
|--------|------|-------------|
| event_id | UUID | FK → events(id) CASCADE |
| user_id | UUID | FK → users(id) CASCADE |
| banned_by | UUID | NOT NULL, FK → users(id) RESTRICT |
| reason | VARCHAR(500) | nullable |
| banned_at | TIMESTAMPTZ | DEFAULT NOW() |

**PK:** (event_id, user_id) · **Indexes:** `idx_eventban_user`

---

### saved_events

| Column | Type | Constraints |
|--------|------|-------------|
| user_id | UUID | FK → users(id) CASCADE |
| event_id | UUID | FK → events(id) CASCADE |
| saved_at | TIMESTAMPTZ | DEFAULT NOW() |

**PK:** (user_id, event_id) · **Indexes:** `idx_saved_events_event`

---

### hangouts

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| creator_id | UUID | NOT NULL, FK → users(id) RESTRICT |
| community_id | UUID | FK → communities(id) CASCADE, nullable = standalone |
| subcommunity_id | UUID | FK → subcommunities(id) CASCADE, nullable |
| location_id | UUID | FK → locations(id) SET NULL |
| title | VARCHAR(150) | NOT NULL |
| description | VARCHAR(3000) | nullable |
| cover_image_url | TEXT | nullable |
| starts_at | TIMESTAMPTZ | NOT NULL |
| ends_at | TIMESTAMPTZ | nullable |
| visibility | visibility_scope | DEFAULT 'public' |
| join_type | hangout_join_type | DEFAULT 'open' |
| max_participants | INTEGER | nullable (future) |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | auto |
| deleted_at | TIMESTAMPTZ | Soft delete |

**Check:** ends_at > starts_at (if set).
**Indexes:** `idx_hangouts_creator`, `idx_hangouts_community`, `idx_hangouts_start`, `idx_hangouts_deleted`

**Business Rules:**
- No approval workflow. Immediately live.
- Can be standalone (`community_id IS NULL`) or tied to a community.
- `join_type = 'request_based'` requires creator approval via `hangout_join_requests`.

---

### hangout_allowed_communities

| Column | Type | Constraints |
|--------|------|-------------|
| hangout_id | UUID | FK → hangouts(id) CASCADE |
| community_id | UUID | FK → communities(id) CASCADE |

**PK:** (hangout_id, community_id)

---

### hangout_allowed_subcommunities

| Column | Type | Constraints |
|--------|------|-------------|
| hangout_id | UUID | FK → hangouts(id) CASCADE |
| subcommunity_id | UUID | FK → subcommunities(id) CASCADE |

**PK:** (hangout_id, subcommunity_id)

---

### hangout_participants

| Column | Type | Constraints |
|--------|------|-------------|
| hangout_id | UUID | FK → hangouts(id) CASCADE |
| user_id | UUID | FK → users(id) CASCADE |
| joined_at | TIMESTAMPTZ | DEFAULT NOW() |

**PK:** (hangout_id, user_id) · **Indexes:** `idx_hangout_participants_user`

---

### hangout_join_requests
For request-based hangouts.

| Column | Type | Constraints |
|--------|------|-------------|
| hangout_id | UUID | FK → hangouts(id) CASCADE |
| user_id | UUID | FK → users(id) CASCADE |
| status | hangout_request_status | DEFAULT 'pending' |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | auto |
| responded_at | TIMESTAMPTZ | nullable |

**PK:** (hangout_id, user_id)

---

### hangout_bans

| Column | Type | Constraints |
|--------|------|-------------|
| hangout_id | UUID | FK → hangouts(id) CASCADE |
| user_id | UUID | FK → users(id) CASCADE |
| banned_by | UUID | NOT NULL, FK → users(id) RESTRICT |
| reason | VARCHAR(500) | nullable |
| banned_at | TIMESTAMPTZ | DEFAULT NOW() |

**PK:** (hangout_id, user_id) · **Indexes:** `idx_hangoutban_user`

---

### saved_hangouts

| Column | Type | Constraints |
|--------|------|-------------|
| user_id | UUID | FK → users(id) CASCADE |
| hangout_id | UUID | FK → hangouts(id) CASCADE |
| saved_at | TIMESTAMPTZ | DEFAULT NOW() |

**PK:** (user_id, hangout_id) · **Indexes:** `idx_saved_hangouts_hangout`

---

### reports

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| reporter_id | UUID | NOT NULL, FK → users(id) CASCADE |
| reported_user_id | UUID | FK → users(id) SET NULL, nullable |
| reported_post_id | UUID | FK → posts(id) SET NULL, nullable |
| reported_comment_id | UUID | FK → comments(id) SET NULL, nullable |
| reported_event_id | UUID | FK → events(id) SET NULL, nullable |
| reported_hangout_id | UUID | FK → hangouts(id) SET NULL, nullable |
| reason | VARCHAR(500) | NOT NULL |
| status | report_status | DEFAULT 'pending' |
| reviewed_by | UUID | FK → users(id) SET NULL, nullable |
| reviewed_at | TIMESTAMPTZ | nullable |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**Check:** Exactly one target column must be non-null.
**Indexes:** `idx_reports_reporter`, `idx_reports_status`, `idx_reports_created`

---

### moderation_actions

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| moderator_id | UUID | NOT NULL, FK → users(id) RESTRICT |
| target_user_id | UUID | FK → users(id) SET NULL, nullable |
| report_id | UUID | FK → reports(id) SET NULL, nullable |
| action_type | moderation_action_type | NOT NULL |
| notes | VARCHAR(500) | nullable |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**Indexes:** `idx_modactions_moderator`, `idx_modactions_report`

---

### audit_logs

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| actor_id | UUID | FK → users(id) SET NULL, nullable |
| action | VARCHAR(100) | NOT NULL |
| entity_type | VARCHAR(50) | NOT NULL |
| entity_id | UUID | nullable |
| description | TEXT | nullable |
| ip_address | INET | nullable |
| user_agent | TEXT | nullable |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**Indexes:** `idx_audit_actor`, `idx_audit_entity` (entity_type, entity_id)

---

### notifications

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | NOT NULL, FK → users(id) CASCADE |
| type | notification_type | NOT NULL |
| title | VARCHAR(120) | NOT NULL |
| message | VARCHAR(500) | NOT NULL |
| related_entity_type | VARCHAR(50) | nullable |
| related_entity_id | UUID | nullable |
| is_read | BOOLEAN | DEFAULT FALSE |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |

**Indexes:** `idx_notifications_user`, `idx_notifications_created`

---

### search_history

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| user_id | UUID | NOT NULL, FK → users(id) CASCADE |
| search_text | VARCHAR(150) | NOT NULL |
| searched_at | TIMESTAMPTZ | DEFAULT NOW() |

**Indexes:** `idx_search_user`, `idx_search_time`

---

### conversations (Future-ready)

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | auto |

---

### conversation_members

| Column | Type | Constraints |
|--------|------|-------------|
| conversation_id | UUID | FK → conversations(id) CASCADE |
| user_id | UUID | FK → users(id) CASCADE |
| joined_at | TIMESTAMPTZ | DEFAULT NOW() |

**PK:** (conversation_id, user_id) · **Indexes:** `idx_convmember_user`

---

### messages

| Column | Type | Constraints |
|--------|------|-------------|
| id | UUID | PK |
| conversation_id | UUID | NOT NULL, FK → conversations(id) CASCADE |
| sender_id | UUID | NOT NULL, FK → users(id) CASCADE |
| message_text | TEXT | nullable |
| media_url | TEXT | nullable |
| sent_at | TIMESTAMPTZ | DEFAULT NOW() |
| edited_at | TIMESTAMPTZ | nullable |
| deleted_at | TIMESTAMPTZ | Soft delete |

**Check:** At least one of message_text or media_url must be non-null.
**Indexes:** `idx_messages_conversation`, `idx_messages_sender`, `idx_messages_sent`

---

## Relationship Diagram (Text)

```
users
├── communities (creator_id)
├── community_members (user_id, appointed_by)
├── posts (author_id)
├── comments (author_id)
├── events (creator_id)
├── hangouts (creator_id)
├── user_external_accounts (user_id)
├── sessions (user_id)
├── user_subscriptions (user_id)
├── user_devices (user_id)
├── user_follows (follower_id / following_id)
├── user_blocks (blocker_id / blocked_id)
├── reports (reporter_id, reported_user_id, reviewed_by)
├── moderation_actions (moderator_id, target_user_id)
├── notifications (user_id)
├── search_history (user_id)
├── audit_logs (actor_id)
└── messages (sender_id)

communities
├── community_members (community_id)
├── community_tags (community_id)
├── subcommunities (community_id)
├── posts (community_id)
├── events (community_id)
└── hangouts (community_id)

subcommunities
├── subcommunity_tags (subcommunity_id)
├── posts (subcommunity_id)
├── events (subcommunity_id)
└── hangouts (subcommunity_id)

posts
├── comments (post_id)
├── post_tags (post_id)
├── post_reactions (post_id)
├── saved_posts (post_id)
└── reports (reported_post_id)

comments
├── comment_reactions (comment_id)
└── reports (reported_comment_id)

events
├── event_participants (event_id)
├── event_bans (event_id)
├── saved_events (event_id)
├── reports (reported_event_id)
└── event_allowed_communities / event_allowed_subcommunities

hangouts
├── hangout_participants (hangout_id)
├── hangout_join_requests (hangout_id)
├── hangout_bans (hangout_id)
├── saved_hangouts (hangout_id)
├── reports (reported_hangout_id)
└── hangout_allowed_communities / hangout_allowed_subcommunities

categories → communities
tags → community_tags, subcommunity_tags, post_tags
locations → communities, events, hangouts
subscription_tiers → user_subscriptions
conversations → conversation_members → messages
sessions, verification, user_external_accounts → Better-Auth identity layer
```

---

*Use this reference when writing Prisma queries, API endpoints, or validation logic. The canonical, executable definition is `schema.prisma` — this file is its documentation.*
