# HobbyHub — System Context Document
> **Version:** 2.0 (Consolidated)
> **Purpose:** Single source of truth for AI-assisted development. Paste this entire file at the start of any conversation before requesting code.
> **Status:** Final (v1 MVP) — supersedes all prior `00-SYSTEM_CONTEXT.md` versions.
> **Companion files:** `DATABASE_SCHEMA.md`, `API_SPECIFICATION.md`, `AUTH_SPECIFICATION.md`, `PROMPT_PACK.md`, `schema.prisma`. Attach the relevant subset per the Prompt Pack's attachment checklist — this file alone does not contain endpoint or schema detail.

---

## 1. Project Vision

A location-aware community platform that blends Reddit (communities/sub-communities), Discord (channels within servers), and Meetup (events/hangouts). The core differentiator is **location + interests**: users discover communities and people near them who share their passions.

### Core Goal
Help people find communities, attend low-commitment events, and meet strangers safely through shared interests and geographic proximity.

### Key Principles
1. **Community First** — Communities are the primary unit. Users do not just follow individuals; they join communities.
2. **Low Commitment** — Events and hangouts are "I'm interested," not full attendance management. No waitlists, no-shows, or QR codes in v1.
3. **Simplicity Over Complexity** — Simpler implementation chosen unless it significantly limits future expansion.
4. **Database Protects Integrity** — Business logic lives in the backend, but the database enforces valid states (foreign keys, constraints, soft deletes).
5. **Backend Controls Behavior** — Auth, permissions, recommendations, and moderation decisions live in the backend. The frontend (dashboard or mobile app) is never a security boundary — see `AUTH_SPECIFICATION.md` §"Security Doctrine."
6. **Modular & Extensible** — Architecture must support v2 features (paid events, AI moderation, advanced analytics, split admin/moderator roles) without redesign.

---

## 2. User Roles & Hierarchy

### Global Roles (Platform Level)
- **System Owner** — You (the developer). Manages categories, subscription tiers, platform-wide bans. No dedicated UI in v1; direct DB/admin access only.
- **Regular User** — Anyone with an account. Nobody registers "as" anything more than this — see §2.3.

### Community Roles (Per Community)
1. **Owner** — Exactly one per community. Stored in `communities.creator_id`. Can delete community, transfer ownership, appoint/demote admins/moderators. Cannot be demoted or removed by others.
2. **Admin / Moderator (merged in v1)** — Stored in `community_members.role = 'admin'` or `'moderator'`. In v1, these are functionally identical. In v2, they will split:
   - **Admin**: Can change community settings, appoint moderators, manage billing.
   - **Moderator**: Can remove posts, approve/reject events, ban users from community, review reports.
3. **Member** — `community_members.role = 'member'`. Can post, comment, react, join events/hangouts.

A single user can hold different roles in different communities simultaneously (owner of one, member of another, admin of a third). Every role check is always scoped to a specific `community_id` — there is no such thing as a global "admin" flag on the `users` table.

### Role Rules (Backend Must Enforce)
- Owner is NOT in `community_members` by default; the backend must insert the creator into `community_members` with `role = 'admin'` during community creation (Option A pattern).
- Owner cannot be demoted or kicked.
- Owner must transfer ownership before leaving.
- Only admins/moderators/owners can access the Admin Dashboard for a given community.

### 2.3 How Owners and Admins/Moderators Actually Come to Exist

There is **one** registration flow (email+password, phone+password, or OAuth/Telegram — see `AUTH_SPECIFICATION.md`) and it produces a plain `member`-level user with no community affiliations. Nobody ever registers directly as an "owner" or "admin." The only paths to elevated roles are:

1. **Owner:** A regular user calls `POST /communities` (from the mobile app). The backend auto-inserts them into `community_members` with `role = 'admin'` and sets `communities.creator_id` to their user ID. This is the *only* way to become an owner.
2. **Admin/Moderator:** An existing owner calls `PATCH /communities/:slug/members/:userId` to promote an existing member of their community. This is the *only* way to become an admin/moderator.

**This means the Admin Dashboard's login page needs no special "owner registration" flow.** It calls the exact same `POST /auth/login` as the mobile app. Any registered user can technically log into the dashboard — if they don't own or manage any community, they simply see the "You don't manage any communities yet" empty state (per `PROMPT_PACK.md`, Dashboard Chat 2). This is not a security gap: every dashboard page still independently verifies the caller's role via a Prisma query before returning data or allowing an action (see `AUTH_SPECIFICATION.md` §"Security Doctrine" / "Dev Tools Test"). The dashboard login page being "open" to any account is exactly as safe as a login page being open to any account on any app — authorization, not authentication, is the gate.

**Practical implication for early development:** before the mobile app exists, you can still reach "owner" state by calling `POST /communities` directly via Postman/curl with a bearer token from a normal `POST /auth/register` + `POST /auth/login` call. No special seeding trick is required.

### 2.4 Mobile App ↔ Admin Dashboard Relationship (v1)

- The **React Native app** is the only app regular members ever use. It is also what owners/admins/moderators use for all their own normal member activity (posting, joining events, etc.).
- The **Admin Dashboard** (Next.js web app) is used by owners/admins/moderators only, for management tasks (members, posts, events, reports, settings).
- **The "switch":** once a user has at least one managed community (owner/admin/moderator in any community — determined via `GET /users/me/communities`, see `API_SPECIFICATION.md`), the mobile app shows a management entry point. **In v1, this entry point opens the Admin Dashboard in an in-app browser / WebView (deep link), it does not reimplement dashboard screens natively.** The dashboard remains the single implementation of all management UI; the mobile app is a launcher for it. Revisit a fully-native admin experience in v2 if needed.
- The dashboard's own login page is a permanent, small part of the product, not a scaffolding step you throw away — it's what the WebView deep-link opens into, authenticated with the same bearer token the mobile app already holds (pass it via URL param or a short-lived link on deep-link, then let the dashboard store it in its own `localStorage` for subsequent calls).

### API Endpoint Separation (v1 Architecture)
In v1, admin and moderator roles share the `/api/v1/communities/:slug/*` admin-capable routes (members list, kick, reports, moderation-actions, etc.) and the `/api/v1/admin/communities/:slug/*` namespace. Owner-exclusive actions (transfer ownership, promote/demote admins, delete community, update community settings) live under owner-only checks inside `/api/v1/communities/:slug/*` (see the Authorization Matrix in `API_SPECIFICATION.md` — v1 does not use a separate `/owner/*` path prefix; the distinction is enforced by role check, not by route). In v2, splitting moderator from admin will be as simple as adding a `moderator`-specific permission check layer — the architecture and route paths do not need to change.

---

## 3. Core Entities & Concepts

### Communities
- The primary building block.
- Belongs to exactly one **Category** (system-defined, 14 options).
- Can have optional **Location** (lat/lng/place_name from Map API).
- Has a unique **Slug** (URL-friendly, globally unique). Name is NOT unique (e.g., "Photography Club" can exist in Addis and London).
- Contains: posts, events, hangouts, subcommunities (future), members, moderators.
- Supports soft delete (`deleted_at`).
- **Category is locked after creation in v1** — no PATCH endpoint changes `category_id`. This is intentional (confirmed decision) — do not add category-editing UI or endpoints without a deliberate v2 scope change.

### Subcommunities (v2 Ready)
- Exist strictly under one parent Community. Never standalone.
- Example: "Anime Ethiopia" community → subcommunities: "One Piece", "Naruto", "Cosplay".
- Backend must be open for subcommunity posts, events, and hangouts, but UI may hide it in v1.

### Posts
- Belong to exactly one Community. Optionally to one Subcommunity (future).
- Must contain at least one of: title, content, media_url.
- Support soft delete.
- Can have tags.

### Comments
- Nested replies via `parent_comment_id`.
- Soft delete.

### Reactions
- **Only "Like"** — no emoji reactions. One per user per post/comment.

### Events
- **Official** community gatherings. Created by community members, but require admin approval if proposed by a regular member.
- Two types in one table:
  - **Verified Event**: Created by admin/owner. `approval_status = 'approved'`, `is_verified = true`.
  - **Proposed Event**: Created by regular member. `approval_status = 'proposed'`. Appears in community feed. Users can "support" (join button means "I support this idea" before approval, "I will attend" after approval). Admin approves or rejects.
- Can have optional location, max participants, price (future), external_event_id (future).
- Visibility: `public`, `community`, `subcommunity`.
- Soft delete.

### Hangouts
- **Casual, user-created meetups.** NOT proposed to admins. Immediately live.
- Examples: "Coffee at 3pm?", "Spider-Man movie tonight?"
- Can be standalone (no community) OR tied to a community/subcommunity.
- **Join Types:**
  - `open` — anyone can join.
  - `request_based` — creator must approve join requests.
- Visibility: `public`, `community`, `subcommunity`.
- No approval workflow. No verification.
- Soft delete.

### Locations
- Reusable table. Uniqueness by `(latitude, longitude)`.
- Stores: `place_name`, `latitude`, `longitude`, `place_id` (for Map API reference).
- No address hierarchy (no city, country, district). Map API handles that.

### Categories
- System-defined only. Users cannot create/edit.
- 14 categories: technology, gaming, anime_manga, movies_tv, arts_creativity, education_study_groups, books_writing, music_entertainment, health_fitness, outdoor_adventure, sports, social_lifestyle, culture_language, other.

### Tags
- User-created. Case-insensitive unique. Max 50 chars.
- Can belong to communities, posts, subcommunities, events, hangouts.

---

## 4. Trust Score (Behavioral Safety Metric)

**NOT a user rating.** Computed by the backend based on behavior signals. Displayed as a badge, not a number.

### Signals (Backend Computes)
| Signal | Weight |
|--------|--------|
| Verified email | +10 |
| Verified phone | +20 |
| Account age (per month) | +2 (max +24) |
| Community posts | +1 each (max +15) |
| Event/hangout participation | +3 each (max +30) |
| Valid reports filed by user | +5 each |
| Valid reports against user | -15 each |
| Event/hangout ban | -25 each |
| Profile completeness | +5 |

Verified phone contributes to trust score **only after OTP confirmation** (`phone_verified_at IS NOT NULL`) — this is the same gate that enables phone-based login (see `AUTH_SPECIFICATION.md` §"Phone-Based Login").

### Display Tiers
- 80–100: "Trusted" (green shield)
- 50–79: "Member"
- 0–49: "New" or "Caution"

Stored in `users.trust_score` (cached). Updated by backend job.

---

## 5. Authentication & Identity (Summary — see `AUTH_SPECIFICATION.md` for full detail)

### Signup / Login Methods (v1)
1. **Email + Password**
2. **Phone Number + Password** — phone is an *alternative* login identifier to email, not a mandatory extra field. A user can register with just email, just phone, or both. See `AUTH_SPECIFICATION.md` for the exact login-resolution logic and the OTP-gate rule.
3. **OAuth** — Google, Apple.
4. **Telegram** — login/register only in v1, using the Telegram Login Widget (same UX pattern as Google/Apple, not a bot conversation). A full Telegram/WhatsApp **bot** (invite management, lightweight in-chat moderator actions) is deferred to **v1.2** — the webhook endpoints for it already exist in the codebase and are documented as dormant/reserved, not built out further in v1.

### Rules
- `users.email` and `users.password_hash` are nullable (in practice, `password_hash` is unused — see `AUTH_SPECIFICATION.md`).
- `users.phone_number` is nullable and unique when present.
- `first_name`, `last_name`, `birth_date` are **NOT NULL** — must be collected at registration regardless of method.
- Minimum age: 13 years (`chk_users_age`).
- Phone verification (OTP) required before phone can be used as a login identifier and before it contributes to trust score.
- External accounts stored in `user_external_accounts` (one user can have multiple providers, including a synthetic `credential` provider for password auth).

### Security
- UUID primary keys everywhere.
- Passwords hashed (never plaintext).
- Soft deletes on all user-generated content.
- Audit logs with `ip_address` and `user_agent`.

---

## 6. Monetization (Future-Ready)

- **Subscription Tiers** table defines plans (price, currency, features as JSONB).
- **User Subscriptions** tracks active/past subscriptions.
- A user is "premium" if they have an active subscription row where `ends_at > NOW()`.
- **Do NOT use a boolean flag** like `is_premium` on users table.

---

## 7. Notifications

- Type-based (enum): `post_reaction`, `comment_reply`, `event_approved`, `event_reminder`, `hangout_request`, `hangout_approved`, `report_resolved`, `moderation_action`, `follow`, `mention`.
- Deep-linking support: `related_entity_type` + `related_entity_id`.
- Simple read/unread boolean. No "read at" timestamp.
- Deleted when user is deleted.

---

## 8. Moderation & Reporting

### Report Targets
Users, Posts, Comments, Events, Hangouts.

### Report Status
`pending` → `reviewing` → `resolved` / `dismissed`.

### Moderation Actions
`warn`, `suspend`, `ban`, `unban`, `content_removed`, `content_restored`, `promote_moderator`, `demote_moderator`.

### Rules
- Exactly one target per report (`chk_reports_target`).
- Moderation actions linked to moderator and optional report.
- Banned users removed from event/hangout participants and blocked from rejoining.

---

## 9. Visibility System

Applies to Events and Hangouts.

| Scope | Meaning |
|-------|---------|
| `public` | Visible to everyone |
| `community` | Visible only to selected communities (via `*_allowed_communities` bridge) |
| `subcommunity` | Visible only to selected subcommunities (via `*_allowed_subcommunities` bridge) |

- Banning integrates with visibility: banned users cannot see the event/hangout at all.

---

## 10. Soft Delete Philosophy

**Soft deleted:** Users, Communities, Posts, Comments, Events, Hangouts, Subcommunities, Messages (future).

**Hard deleted (no recovery):** Memberships, reactions, tags associations, device tokens, search history, join requests, bans.

Reason: preserve historical integrity, allow moderation review, enable future restoration.

---

## 11. What Is Intentionally NOT in v1

- Waitlists, attendance tracking, QR codes for events.
- AI moderation.
- Community analytics dashboard (beyond the basic stats cards already spec'd).
- Direct messaging (schema ready but UI deferred).
- Advanced recommendation algorithms.
- Paid events (schema has `price` but backend ignores it in v1).
- A full Telegram/WhatsApp **bot** (invite acceptance, lightweight moderator actions in-chat) — deferred to v1.2. Telegram is login-only in v1.
- Changing a community's category after creation.
- A native (non-WebView) admin experience inside the mobile app.

---

## 12. Critical Backend Enforcement (Not in DB)

The database stores facts. The backend writes laws. The following MUST be enforced in application code:

1. **Owner Protection**: Owner cannot be demoted, kicked, or leave without transferring ownership.
2. **Password Gate**: Reject password login if no `credential` external-account row exists for the resolved user (see `AUTH_SPECIFICATION.md`).
3. **OAuth Merge Safety**: Do not auto-merge OAuth/Telegram accounts by email or phone. Prompt user to link explicitly.
4. **Phone-Login Gate**: Do not allow phone-number login until `phone_verified_at IS NOT NULL`.
5. **Bot Signup Completeness** (v1.2, when built): Bot must collect `first_name`, `last_name`, `birth_date` before creating user.
6. **External Token Encryption**: Encrypt `access_token`/`refresh_token` before storing.
7. **Admin Dashboard Authorization**: Every admin endpoint must verify `community_members.role IN ('admin', 'moderator')` OR ownership, via a Prisma query against the specific community — never a global flag.
8. **Trust Score Calculation**: Nightly job or trigger updates `users.trust_score`.
9. **No Row Level Security (RLS)**: Authorization lives entirely in the backend query layer.
10. **Feed Authorization**: Every feed query must filter by: soft-delete, community privacy, user blocks, visibility scope, and event approval status.
11. **Category Immutability**: Reject any attempt to change `communities.category_id` after creation.

---

*End of System Context. Use this as the preamble for every AI-assisted coding session. For endpoint detail see `API_SPECIFICATION.md`; for auth implementation detail see `AUTH_SPECIFICATION.md`; for exact table definitions see `DATABASE_SCHEMA.md` and `schema.prisma`.*
