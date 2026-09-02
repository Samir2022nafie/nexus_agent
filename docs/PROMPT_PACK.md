# HobbyHub — Complete Prompt Pack for All Future Chats
> **Version:** 3.0 (Re-optimized for Antigravity — this file and its four companion docs now live in `docs/`/`docs/context/` inside the repo and are read directly by the agent; nothing needs to be attached or pasted per chat anymore)
> **Purpose:** One batch prompt per Antigravity task. Reference by path, paste in full when you want precise control.

---

## CONTEXT THE AGENT NEEDS (For EVERY Batch)

These already live in the repo, and `AGENTS.md` at the project root points to them — you don't attach them, the agent reads them itself:

1. `docs/context/00-SYSTEM_CONTEXT.md`
2. `prisma/schema.prisma` (ground truth) — `docs/context/DATABASE_SCHEMA.md` for the rationale behind it
3. `docs/context/API_SPECIFICATION.md`
4. `docs/context/AUTH_SPECIFICATION.md`

For **dashboard batches**, also point it at the relevant section of this file (Part B) — no separate dashboard handoff file exists, it's folded into `00-SYSTEM_CONTEXT.md` §2.4 and this prompt pack.

For **mobile app batches**, same four files, plus Part C below — but remember the mobile app is a *separate* Antigravity workspace/repo, so it needs its own copy of `docs/context/` and its own `AGENTS.md`.

---

## PART A: API ENDPOINT PROMPTS

Build in order. One batch per chat session. Batch 1 (auth core) is done. Start with Batch 1.5.

### BATCH 1.5: Auth Deltas (Phone Login + Telegram Widget)

**Paste this prompt:**
```
I am building a community platform. Before writing any code, read docs/context/00-SYSTEM_CONTEXT.md,
prisma/schema.prisma (or docs/context/DATABASE_SCHEMA.md for rationale), docs/context/API_SPECIFICATION.md,
and docs/context/AUTH_SPECIFICATION.md.

Today I need to build Batch 1.5: the two auth deltas described in AUTH_SPECIFICATION.md
§3 and §4.

Build:
1. Update POST /api/v1/auth/register — body becomes { username, email?, phoneNumber?,
   password, firstName, lastName, birthDate }. At least one of email/phoneNumber required
   (Zod .refine()). phoneNumber is stored unverified.
2. Update POST /api/v1/auth/login — body becomes { identifier, password }. Resolve
   identifier to a user via email OR verified phone_number (unverified phone must NOT
   resolve). If the resolved user has an email, delegate to Better-Auth's signInEmail.
   If phone-only (no email), check the 'credential' row in user_external_accounts
   directly and issue a session via createManualSession() from manual-session.ts.
3. Add a 'telegram' case to POST /api/v1/auth/oauth/[provider]/route.ts using the
   existing (currently unused) hash verifier in src/lib/telegram.ts. Same
   ACCOUNT_EXISTS_NOT_LINKED behavior as google/apple. Prompt for missing birth_date
   on new Telegram signups the same way google/apple already do.

Requirements:
- Do NOT modify auth.ts, casl.ts, prisma.ts, zod-utils.ts unless a change is specifically
  required by one of the three items above.
- Reuse getCurrentUser, createManualSession, and the standard response envelope.
- Use Zod .safeParse() everywhere.
- Follow AUTH_SPECIFICATION.md exactly for the identifier-resolution logic.

Write the complete code, organized by file path.
```

### BATCH 2: Communities

**Paste this prompt:**
```
I am building a community platform. Before writing any code, read docs/context/00-SYSTEM_CONTEXT.md,
prisma/schema.prisma (or docs/context/DATABASE_SCHEMA.md for rationale), docs/context/API_SPECIFICATION.md,
and docs/context/AUTH_SPECIFICATION.md.

Today I need to build Batch 2: Communities.

Build these 8 endpoints:
1. POST /api/v1/communities — Create community (auth required, auto-inserts creator as
   admin member, Zod validates slug)
2. GET /api/v1/communities — List public communities (?page, ?limit, ?categoryId, ?q,
   ?lat&lng&radius; filter deleted_at=null; if auth, include joined status)
3. GET /api/v1/communities/:slug — Get single community (public if not private; private
   = members only; include member count, isMember, category, location)
4. PATCH /api/v1/communities/:slug — Update community (owner only; name, description,
   rules, bannerUrl, profilePictureUrl, isPrivate; cannot change slug or categoryId — ever)
5. DELETE /api/v1/communities/:slug — Soft delete (owner only)
6. POST /api/v1/communities/:slug/join — Join (auth; public = insert member role=member;
   private = reject for now)
7. POST /api/v1/communities/:slug/leave — Leave (auth; NOT owner)
8. GET /api/v1/users/me/communities — List communities where the current user is
   owner/admin/moderator, with their role in each (feeds the dashboard home page and the
   mobile app's management-switch visibility check)

Requirements:
- Use getCurrentUser(req). NEVER call auth.api.getSession() directly.
- Use Zod with .safeParse(). Return VALIDATION_ERROR with details on fail.
- Use the standard response envelope from API_SPECIFICATION.md §2.
- Reuse uuidSchema, paginationSchema, slugSchema from @/lib/zod-utils.
- Check community roles via Prisma query (NOT just CASL) for owner-only actions.
- Filter deleted_at: null in every list/get query.
- Category is immutable after creation — reject any attempt to change categoryId in PATCH.
- Do NOT modify any existing files under src/lib/ or src/app/api/v1/auth/ or
  src/app/api/v1/users/me/route.ts.

Write the complete code for all 8 endpoints, organized by file path.
```

### BATCH 3: Community Members + Admin Overview

**Paste this prompt:**
```
[Same context-reading preamble as Batch 2]

Today I need to build Batch 3: Community Members + Admin Overview.

Build these 5 endpoints:
1. GET /api/v1/communities/:slug/members — List all members with roles (admin/mod/owner
   only)
2. PATCH /api/v1/communities/:slug/members/:userId — Update member role (OWNER ONLY;
   body: { role: 'member' | 'moderator' | 'admin' }; cannot target owner; set
   appointed_by = currentUserId, appointed_at = NOW())
3. DELETE /api/v1/communities/:slug/members/:userId/kick — Kick member (admin/mod/owner;
   cannot target owner)
4. GET /api/v1/admin/communities/:slug — Admin community overview (admin/mod/owner;
   community details + current user's role in it)
5. GET /api/v1/admin/communities/:slug/stats — Community stats (admin/mod/owner;
   totalMembers, totalPosts, totalEvents, pendingReports, pendingEvents,
   newMembersThisWeek)

Requirements: same as Batch 2, plus:
- Owner protection: check communities.creator_id !== targetUserId before allowing kick
  or role change.

Write the complete code for all 5 endpoints, organized by file path.
```

### BATCH 4: Posts

```
[Same context-reading preamble]

Today I need to build Batch 4: Posts.

Build these 7 endpoints:
1. POST /api/v1/communities/:slug/posts — Create post (member+ only; { title?, content?,
   mediaUrl?, tags? }; at least one of title/content/mediaUrl required; auto-create tags
   via post_tags)
2. GET /api/v1/communities/:slug/posts — List posts (public/member; ?page, ?limit, ?sort;
   filter deleted_at=null; if auth, exclude blocked users' posts; if private community,
   auth user must be member; return author, reaction count, hasReacted, comment count)
3. GET /api/v1/posts/:id — Get single post (same privacy rules; author, reactions,
   comments first 10, tags)
4. PATCH /api/v1/posts/:id — Update post (self only)
5. DELETE /api/v1/posts/:id — Soft delete (self / admin/mod/owner)
6. POST /api/v1/posts/:id/react — Toggle like
7. POST /api/v1/posts/:id/save — Toggle save

Requirements: same base requirements as prior batches, plus:
- Use CASL (defineAbilityFor + getUserCommunityRoles) combined with Prisma queries for
  post authorization. Pass raw Prisma rows (snake_case) into CASL unmodified.

Write the complete code for all 7 endpoints, organized by file path.
```

### BATCH 5: Comments

```
[Same context-reading preamble]

Today I need to build Batch 5: Comments.

Build these 6 endpoints:
1. POST /api/v1/posts/:id/comments — Create comment (member+ only; { content,
   parentCommentId? })
2. GET /api/v1/posts/:id/comments — List comments (top-level + first-level replies;
   filter deleted_at=null)
3. GET /api/v1/comments/:id — Get single comment
4. PATCH /api/v1/comments/:id — Update (self only)
5. DELETE /api/v1/comments/:id — Soft delete (self / admin/mod/owner)
6. POST /api/v1/comments/:id/react — Toggle like

Requirements: same as Batch 4.

Write the complete code for all 6 endpoints, organized by file path.
```

### BATCH 6: Events

```
[Same context-reading preamble]

Today I need to build Batch 6: Events. This is a large batch — take your time.

Build these 12 endpoints:
1. POST /api/v1/communities/:slug/events — Create event (member+ only; if admin/mod/
   owner: approval_status='approved', is_verified=true; if regular member:
   approval_status='proposed', is_verified=false)
2. GET /api/v1/communities/:slug/events — List (public/member; ?status, ?visibility,
   ?page, ?limit; filter deleted_at=null; non-admins see approved OR proposed only;
   check event_bans)
3. GET /api/v1/communities/:slug/events/:id — Get single (check visibility + bans;
   creator, participants count + list, isParticipant, isBanned)
4. PATCH /api/v1/communities/:slug/events/:id — Update (self / admin/mod/owner; cannot
   change approval_status via PATCH)
5. DELETE /api/v1/communities/:slug/events/:id — Soft delete (self / admin/mod/owner)
6. POST .../events/:id/join — Join (check bans, check max_participants)
7. POST .../events/:id/leave — Leave (must be participant)
8. POST .../events/:id/approve — Approve proposed (admin/mod/owner only; set
   is_verified=true; notify creator)
9. POST .../events/:id/reject — Reject proposed (admin/mod/owner only; notify creator)
10. POST .../events/:id/ban — Ban user from event (admin/mod/owner; remove from
    participants if present)
11. POST .../events/:id/save — Toggle save
12. GET /api/v1/admin/communities/:slug/pending-events — List proposed events

Requirements: same as prior batches, plus:
- Check community roles via Prisma query for admin/mod/owner actions; use CASL for self
  checks.
- Create notifications rows for approve/reject actions.

Write the complete code for all 12 endpoints, organized by file path.
```

### BATCH 7: Hangouts

```
[Same context-reading preamble]

Today I need to build Batch 7: Hangouts.

Build these 11 endpoints:
1. POST /api/v1/hangouts — Create (auth required; if communityId provided, check
   membership; immediately live, no approval)
2. GET /api/v1/hangouts — List (public; ?page, ?limit, ?lat&lng&radius; filter
   deleted_at=null, visibility='public'; exclude blocked users' hangouts if auth)
3. GET /api/v1/hangouts/:id — Get single (check visibility + hangout_bans; participants,
   join requests if request_based and creator, isParticipant, hasRequested)
4. PATCH /api/v1/hangouts/:id — Update (self/creator only)
5. DELETE /api/v1/hangouts/:id — Soft delete (self / admin/mod/owner if community-tied)
6. POST .../hangouts/:id/join — Join (open type only; check bans)
7. POST .../hangouts/:id/leave — Leave
8. POST .../hangouts/:id/request — Request to join (request_based type)
9. PATCH .../hangouts/:id/requests/:userId — Approve/reject request (creator only)
10. POST .../hangouts/:id/ban — Ban user (creator / admin/mod/owner if community-tied)
11. POST .../hangouts/:id/save — Toggle save

Requirements: same as prior batches.

Write the complete code for all 11 endpoints, organized by file path.
```

### BATCH 8: Reports + Moderation

```
[Same context-reading preamble]

Today I need to build Batch 8: Reports + Moderation.

Build these 7 endpoints:
1. POST /api/v1/reports — Create (auth; exactly ONE target must be provided; status='pending')
2. GET /api/v1/reports — List (admin/mod/owner; filtered by communities they manage;
   ?status, ?page, ?limit)
3. PATCH /api/v1/reports/:id — Update status (admin/mod/owner; if resolved/dismissed:
   set reviewed_by, reviewed_at)
4. POST /api/v1/reports/:id/action — Take moderation action (admin/mod/owner; create
   moderation_actions row linked to report; if ban action, also remove from
   community_members or relevant ban table)
5. GET /api/v1/communities/:slug/reports — List reports for community
6. GET /api/v1/communities/:slug/moderation-actions — List moderation actions
7. GET /api/v1/admin/communities/:slug/banned-users — List banned users (from
   events/hangouts in this community)

Requirements: same as prior batches, plus:
- Create an audit_logs row on every moderation action.
- Create notifications rows where appropriate (report resolved, moderation action taken).

Write the complete code for all 7 endpoints, organized by file path.
```

### BATCH 9: Social + Misc

```
[Same context-reading preamble]

Today I need to build Batch 9: Social + Misc. This is the final API batch.

Build these 9 endpoints:
1. GET /api/v1/users/:id — Public profile (check user_blocks — return 404 if blocked;
   check deleted_at)
2. POST /DELETE /api/v1/users/:id/follow
3. POST /DELETE /api/v1/users/:id/block
4. GET /api/v1/users/:id/trust-score — { trustScore, tier: 'Trusted'|'Member'|'New' }
5. GET /api/v1/notifications — ?page, ?limit, ?unreadOnly
6. PATCH /api/v1/notifications/:id/read
7. POST /api/v1/upload/presigned — validate contentType against the allowed list in
   API_SPECIFICATION.md §5

Requirements: same as prior batches.

Write the complete code for all endpoints, organized by file path.
```

---

## PART B: ADMIN DASHBOARD PROMPTS

**IMPORTANT:** Do not start these until Batches 1.5–9 are built and tested. The dashboard is a pure API consumer.

### Security Doctrine (already in `docs/context/00-SYSTEM_CONTEXT.md` §12 and summarized in `AGENTS.md` — reference it, don't re-paste it)

The frontend cannot enforce security. The dashboard is cosmetic and navigational — it makes the API usable, it does not make the API secure. Every role/ownership check happens in the backend. The frontend only hides UI elements it thinks the user can't use (UX, not security), redirects to `/login` on 401, and shows "Access Denied" on 403. If a user opens DevTools, sets `isAdmin: true` in local state, and clicks "Delete Community," the backend must return 403 regardless.

### DASHBOARD CHAT 1: Layout + Sidebar + API Client

```
I am building an admin dashboard for a community platform. Before writing any code, read
docs/context/00-SYSTEM_CONTEXT.md, prisma/schema.prisma (or docs/context/DATABASE_SCHEMA.md),
docs/context/API_SPECIFICATION.md, and docs/context/AUTH_SPECIFICATION.md.

Today I need to build the foundation: layout, sidebar navigation, and API client.

Build these files:
1. src/lib/api-client.ts — Fetch wrapper reading bearer_token from localStorage, attaches
   Authorization header, redirects to /login on 401, returns the standard API envelope.
2. src/lib/query-client.ts — React Query client (staleTime 5min, no retry on 401/403).
3. src/app/providers.tsx — QueryClientProvider wrapper.
4. src/app/(dashboard)/layout.tsx — shadcn Sidebar (persistent desktop, Sheet drawer
   mobile), breadcrumb, header with avatar + logout. Nav groups: "Dashboard" (home),
   "My Communities" (dynamic, from GET /api/v1/users/me/communities), "Community
   Management" (Overview, Members, Posts, Events, Reports, Settings — shown inside a
   community).
5. src/app/(auth)/login/page.tsx — shadcn Card/Input/Button/Label/Form. Calls
   POST /api/v1/auth/login with { identifier, password } (NOT { email, password } —
   the field is a single "email or phone" identifier per AUTH_SPECIFICATION.md §3).
   Stores token in localStorage, redirects to / on success.

Requirements:
- Use ONLY shadcn/ui components. Install with npx shadcn add <component>.
- Sonner for toasts.
- Responsive: sidebar collapses via Sheet on mobile.
- Do NOT modify any existing API route files.

Write the complete code for all files.
```

### DASHBOARD CHAT 2: Dashboard Home ("My Communities")

```
[Same context-reading preamble]

Today I need to build the Dashboard Home page.

Build: src/app/(dashboard)/page.tsx — fetch GET /api/v1/users/me/communities via React
Query. Grid of shadcn Cards: community name, slug, member count, role badge
(Owner/Admin/Moderator), "Manage" button → /communities/[slug]. Skeleton loading state.
Empty state: "You don't manage any communities yet."

Requirements:
- shadcn card, badge, button, skeleton, alert only.
- Handle 401 (redirect to login), 403, loading, empty states.
- Sonner for toasts.

Write the complete code for this page.
```

### DASHBOARD CHAT 3: Community Overview

```
[Same context-reading preamble]

Build: src/app/(dashboard)/communities/[slug]/page.tsx — fetch GET /api/v1/admin/
communities/:slug and GET /api/v1/admin/communities/:slug/stats. 6 stat cards: Total
Members, Total Posts, Total Events, Pending Reports, Pending Events, New Members This
Week. Skeleton loading. 403 → "Access Denied" page.

Requirements: shadcn card, badge, skeleton, alert, tabs (optional). React Query. Sonner.

Write the complete code for this page.
```

### DASHBOARD CHAT 4: Members Page

```
[Same context-reading preamble]

Build: src/app/(dashboard)/communities/[slug]/members/page.tsx — Data Table pattern.
Columns: Avatar+Username, Name, Role (select dropdown, owner only; else read-only
badge), Joined At, Actions (Kick — alert-dialog, disabled for owner row). Fetch
GET /api/v1/communities/:slug/members; mutations PATCH role,
DELETE .../members/:userId/kick. Search filter. Skeleton loading.

Requirements: shadcn table/select/alert-dialog/avatar/skeleton. React Query. Sonner.
CRITICAL: kick endpoint has a /kick suffix — DELETE /api/v1/communities/:slug/members/:userId/kick.

Write the complete code for this page.
```

### DASHBOARD CHAT 5: Events Page

```
[Same context-reading preamble]

Build: src/app/(dashboard)/communities/[slug]/events/page.tsx — Tabs: "Upcoming Events"
(GET .../events?status=approved, Edit/Delete actions) and "Pending Proposals"
(GET /api/v1/admin/communities/:slug/pending-events, Approve/Reject/View actions via
POST .../events/:id/approve and .../reject). Create Event dialog with react-hook-form +
zod. Skeleton loading, empty states.

Requirements: shadcn tabs/table/dialog/form/calendar/popover. React Query. Sonner.

Write the complete code for this page.
```

### DASHBOARD CHAT 6: Reports Page

```
[Same context-reading preamble]

Build: src/app/(dashboard)/communities/[slug]/reports/page.tsx — table with Reporter,
Target Type, Reason, Status badge, Created At, Actions (Review dialog with moderation
action form → POST /api/v1/reports/:id/action, Resolve/Dismiss → PATCH
/api/v1/reports/:id). Status filter. Fetch GET /api/v1/communities/:slug/reports.

Requirements: shadcn table/dialog/form/select/textarea. React Query. Sonner.

Write the complete code for this page.
```

### DASHBOARD CHAT 7: Posts Page

```
[Same context-reading preamble]

Build: src/app/(dashboard)/communities/[slug]/posts/page.tsx — tabs "Active"/"Removed".
Columns: Author, Title, Date, Reactions, Comments, Status, Actions (View dialog,
Remove/Restore, Delete). Fetch GET /api/v1/communities/:slug/posts; mutations DELETE
/api/v1/posts/:id.

Requirements: shadcn tabs/table/dialog/alert-dialog. React Query. Sonner.

Write the complete code for this page.
```

### DASHBOARD CHAT 8: Settings Page

```
[Same context-reading preamble]

Build: src/app/(dashboard)/communities/[slug]/settings/page.tsx — owner-only form:
Name, Description, Rules, Location, Banner URL, Profile Picture URL, Is Private
(switch). Category field is READ-ONLY, disabled, with a tooltip explaining category
cannot be changed after creation (confirmed v1 decision — do not build an edit path for
it even behind a flag). Slug is also read-only. Submit → PATCH /api/v1/communities/:slug.
Danger Zone card: Delete Community (AlertDialog) → DELETE /api/v1/communities/:slug.
403 → "Owner access only" message.

Requirements: react-hook-form + zod. shadcn form/switch/alert-dialog. Sonner.

Write the complete code for this page.
```

### DASHBOARD CHAT 9 (Bonus): Notifications + Polish

```
[Same context-reading preamble]

Build: notifications dropdown in header (bell icon, unread badge, last 5 unread via
GET /api/v1/notifications?unreadOnly=true) + full page at
src/app/(dashboard)/notifications/page.tsx (all notifications, mark-as-read, mark-all).
Add breadcrumbs to all sub-pages. Verify mobile responsiveness across every page built
in Chats 1-8.

Requirements: shadcn dropdown-menu/popover/card/badge. Sonner.

Write the complete code.
```

---

## PART C: REACT NATIVE MOBILE APP PROMPTS

**IMPORTANT:** Do not start these until the API (Part A) is complete. The mobile app is the second API consumer, same rules as the dashboard: it enforces nothing, it only reflects what the backend allows.

**Setup (do this once, outside a chat):**
```
npx create-expo-app hobbyhub-mobile
cd hobbyhub-mobile
npm install @tanstack/react-query axios zustand @react-navigation/native @react-navigation/native-stack expo-secure-store
```

Use `expo-secure-store` for the bearer token on mobile (not AsyncStorage) — same "never store the token in a way that leaks" principle as the dashboard, adapted to native storage.

### MOBILE CHAT 1: API Client + Auth Screens

```
I am building the React Native mobile app for a community platform (second API consumer,
after the admin dashboard). Before writing any code, read docs/context/00-SYSTEM_CONTEXT.md,
prisma/schema.prisma (or docs/context/DATABASE_SCHEMA.md), docs/context/API_SPECIFICATION.md,
and docs/context/AUTH_SPECIFICATION.md — copies of these should live in this repo too, even
though the API itself is built elsewhere.

Today I need to build the API client and auth screens.

Build:
1. src/api/client.ts — Axios instance with baseURL from an env var, interceptor that
   attaches Authorization: Bearer <token> from expo-secure-store, and a response
   interceptor that clears the token and navigates to Login on 401.
2. src/stores/authStore.ts — Zustand store: { user, token, isLoggedIn, login, logout,
   hydrate }. hydrate() reads the token from SecureStore on app boot.
3. src/screens/LoginScreen.tsx — email-OR-phone identifier field + password field,
   calling POST /api/v1/auth/login with { identifier, password } per
   AUTH_SPECIFICATION.md §3. Also a "Continue with Google" and "Continue with Telegram"
   button (Telegram per AUTH_SPECIFICATION.md §4 — Telegram Login Widget flow adapted
   to a WebView-based OAuth redirect, same pattern as Google's).
4. src/screens/RegisterScreen.tsx — username, first/last name, birth date picker, and
   EITHER an email field OR a phone field (a toggle/segmented control lets the user pick
   which one to provide — do not require both). Calls POST /api/v1/auth/register.
5. src/navigation/AuthNavigator.tsx — stack navigator wrapping Login/Register, shown
   when !isLoggedIn.

Requirements:
- Use React Navigation native-stack.
- Token in expo-secure-store, not AsyncStorage.
- Match the response envelope and error codes in API_SPECIFICATION.md §2 exactly.
- Do NOT build any bot-related UI — Telegram is login-only in v1 (AUTH_SPECIFICATION.md §4).

Write the complete code for all files.
```

### MOBILE CHAT 2: Discovery — Home, Communities List, Community Detail

```
[Same context-reading preamble]

Today I need to build the discovery screens.

Build:
1. src/screens/HomeScreen.tsx — feed combining nearby communities and upcoming events/
   hangouts (use device location via expo-location; fall back to a manual location
   picker if permission denied). Calls GET /api/v1/communities?lat&lng&radius and
   GET /api/v1/hangouts?lat&lng&radius.
2. src/screens/CommunitiesScreen.tsx — searchable/filterable list (category filter,
   text search) via GET /api/v1/communities.
3. src/screens/CommunityDetailScreen.tsx — community header, Join/Leave button (POST
   .../join, .../leave), tabs for Posts/Events/Hangouts/Members, and — if the current
   user is owner/admin/moderator of THIS community — a "Manage" button.

The "Manage" button is the owner/admin "switch" described in 00-SYSTEM_CONTEXT.md §2.4:
in v1 it opens a WebView pointed at the Admin Dashboard's URL for this community
(`{DASHBOARD_BASE_URL}/communities/{slug}`), passing the current bearer token via a
short-lived query param so the dashboard can pick it up and store it in its own
localStorage on load. It does NOT reimplement any dashboard screen natively. Only show
this button for communities returned by GET /api/v1/users/me/communities — do not
compute "is manager" from any other signal.

Requirements: React Query for all data fetching. Respect visibility/soft-delete/blocks
per the feed rules in AUTH_SPECIFICATION.md §9.

Write the complete code for all three screens.
```

### MOBILE CHAT 3: Content — Posts, Comments, Create Post

```
[Same context-reading preamble]

Build: PostDetailScreen.tsx (post + comments, reply threading via
parent_comment_id, react button), CreatePostScreen.tsx (title/content/media picker,
tag input), and a Post card component reused in feeds. Wire to
POST/GET /api/v1/communities/:slug/posts, GET/PATCH/DELETE /api/v1/posts/:id,
POST /api/v1/posts/:id/react, POST /api/v1/posts/:id/comments.

Requirements: React Query with optimistic updates for react/save toggles. Respect
soft-delete and block rules.

Write the complete code.
```

### MOBILE CHAT 4: Events + Hangouts

```
[Same context-reading preamble]

Build: EventsScreen.tsx (list + detail, join/leave, "support" vs "attend" label based
on approval_status per 00-SYSTEM_CONTEXT.md §3), HangoutsScreen.tsx (list + detail,
open vs request_based join flow), CreateHangoutScreen.tsx (standalone or
community-tied, per hangouts.community_id being nullable).

Requirements: React Query. Respect visibility scopes and bans (event_bans/hangout_bans)
per the Authorization Matrix in API_SPECIFICATION.md.

Write the complete code.
```

### MOBILE CHAT 5: Social + Profile + Notifications

```
[Same context-reading preamble]

Build: ProfileScreen.tsx (own + others', follow/block buttons, trust score badge using
the tiers in 00-SYSTEM_CONTEXT.md §4), NotificationsScreen.tsx (list, mark read, mark
all read), SavedItemsScreen.tsx (saved posts/events/hangouts).

Requirements: React Query. Trust score badge shows tier label only (Trusted/Member/New),
never the raw number, per 00-SYSTEM_CONTEXT.md §4.

Write the complete code.
```

---

## PART D: Quick Reference — What Each Chat Reads

| Chat | Files the agent should read |
|---|---|
| API Batch 1.5–9 | `docs/context/00-SYSTEM_CONTEXT.md`, `prisma/schema.prisma` (or `docs/context/DATABASE_SCHEMA.md` for rationale), `docs/context/API_SPECIFICATION.md`, `docs/context/AUTH_SPECIFICATION.md` |
| Dashboard Chats 1–9 | Same four, plus this file's Part B for the batch in question |
| Mobile Chats 1–5 | Same four, plus Part C — note this is a *separate* Antigravity workspace (its own repo), so it needs its own `docs/context/` copy |

These live in the repo already — AGENTS.md points the agent at them, so you don't need to attach anything per chat. Just tell the agent which batch to build and, if you want to be explicit, which file to read for it.

---

## PART E: Pro Tips

1. **Reference by path, don't paste the whole prompt if you don't need to.** A short instruction like "build batch 1.5, using the prompt in docs/PROMPT_PACK.md for that batch" works — the agent can open this file itself. Paste the full batch prompt instead when you want to add something batch-specific on the fly, or when you're not confident the agent picked the right batch.
2. **If an AI tries to recreate existing files, stop it.** Say: *"Do NOT modify src/lib/auth.ts, src/lib/casl.ts, src/lib/get-current-user.ts, src/lib/prisma.ts, src/lib/zod-utils.ts, or any existing API routes."*
3. **If an AI uses `auth.api.getSession()` directly, correct it immediately.** It must use `getCurrentUser(req)`.
4. **Test each batch before moving to the next.** Postman/curl/browser.
5. **Commit to git after every batch.**
6. **One batch per chat.** Long chats degrade code quality.
7. **Category is locked, always.** If any AI session tries to add a "change category" feature anywhere (schema, API, dashboard, or mobile), stop it — this was a deliberate, confirmed v1 decision.

---

*End of prompt pack. Copy, paste, build.*
