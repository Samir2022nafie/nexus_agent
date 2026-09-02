# Authentication & Authorization Specification
> **Version:** 2.0 (Consolidated — merges `AUTH_INTEGRATION_REFERENCE.md` and `HOBBYHUB_AUTH_HANDOFF.md`, which were near-duplicates of each other, plus the new phone/Telegram requirements)
> **Status:** Batch 1 (register, login, logout, users/me, Google/Apple OAuth, bot webhooks, phone OTP) is built and tested. Batch additions described in §3 and §4 below (identifier-based login, Telegram widget login) are **not yet built** — build them as part of Batch 2 alongside communities, or as a small Batch 1.5 if you want them isolated.
> **Paste this file alongside** `00-SYSTEM_CONTEXT.md`, `DATABASE_SCHEMA.md` (or `schema.prisma`), and `API_SPECIFICATION.md` at the start of any new chat before requesting endpoint code. **This file is ground truth over anything the other files imply about auth internals.**

---

## 1. Stack

- **Better-Auth** (`better-auth` npm package) — mapped onto the project's own custom `users` table (not Better-Auth's default schema).
- Session strategy: **Bearer token only**, via Better-Auth's `bearer()` plugin. No cookie-based session anywhere. Every authenticated request uses `Authorization: Bearer <token>`.
- **Zod** for all input validation.
- **CASL** (`@casl/ability`) for permission checks, combined with real Prisma queries for community-scoped roles (CASL alone doesn't know DB state).

---

## 2. How to Authenticate a Request in ANY New Route

### Never call `auth.api.getSession()` directly in new route code. Always use the canonical helper.

```ts
import { getCurrentUser } from '@/lib/get-current-user';

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req);
  if (!user) {
    return Response.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
      { status: 401 }
    );
  }
  // `user` is the FULL `users` row — user.id, user.username, user.trust_score,
  // user.bio, everything — not just the handful of fields Better-Auth's own
  // session object exposes. Guaranteed NOT soft-deleted.
}
```

`src/lib/get-current-user.ts` does two things `auth.api.getSession()` alone does not:
1. Returns every column on the user's row (Better-Auth's own session object only contains the fields explicitly mapped in `lib/auth.ts` — id, email, name, image, username, firstName, lastName, birthDate, phoneNumber — NOT bio, trust_score, profile_picture_url, deleted_at, etc.).
2. Filters out soft-deleted accounts (`deleted_at: null`) — Better-Auth's own session lookup does not do this automatically.

### Optional auth (public endpoints)
Same helper. If unauthenticated, `user` is `null` — proceed with public-only behavior instead of returning 401:
```ts
const user = await getCurrentUser(req); // may be null
```

---

## 3. Login Identifier: Email OR Verified Phone (New in v2 spec)

Phone number is an **alternative** login identifier, not a mandatory extra field. A user may register and log in with email only, phone only, or both.

### Registration
`POST /auth/register` body: `{ username, email?, phoneNumber?, password, firstName, lastName, birthDate }`. At least one of `email` / `phoneNumber` must be present (Zod `.refine()`). If `phoneNumber` is provided, it is stored unverified (`phone_verified_at: null`) — it does **not** unlock phone login or its trust-score bonus until confirmed via `POST /auth/verify-phone/confirm`.

### Login resolution logic
`POST /auth/login` body becomes `{ identifier, password }` (replacing the old `{ email, password }` shape). Resolution order in the route handler, **before** calling into Better-Auth's credential check:

```ts
// 1. Try to resolve `identifier` to a user by email OR verified phone.
const user = await prisma.users.findFirst({
  where: {
    deleted_at: null,
    OR: [
      { email: identifier.toLowerCase() },
      { phone_number: identifier, phone_verified_at: { not: null } }, // unverified phone cannot log in
    ],
  },
});

if (!user) {
  return Response.json(
    { success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } },
    { status: 401 }
  );
}

// 2. Delegate the actual password check to Better-Auth's signInEmail using the
//    resolved user's email if they have one, OR a direct credential-row check
//    (see below) if they registered with phone only and have no email.
```

**Why the OTP gate matters:** this is a deliberate confirmed decision — an unverified phone number must never work as a login identifier, both to prevent account-takeover via a phone number someone doesn't actually control, and to keep the trust-score phone bonus meaningful (it should only apply to phone numbers that were actually proven reachable).

**Users with phone-only registration (no email):** Better-Auth's `signInEmail` API expects an email. For phone-only accounts, do not force-generate a fake email — instead check the `credential` row in `user_external_accounts` directly (`provider = 'credential'`, matched by `user_id`) using the same password-hashing/verification utility Better-Auth uses internally, then issue a session the same way `manual-session.ts` does for bot logins. Reuse `createManualSession(userId, req)` for this rather than writing a second session-issuance path.

---

## 4. Telegram: Login Widget, Not Bot (New in v2 spec)

v1 uses the **Telegram Login Widget** (the same "Login with Telegram" button pattern used by thousands of sites) purely as an OAuth-style identity provider — conceptually identical to Google/Apple. It is a single HTTP callback with a signed payload, not a bot conversation.

- Endpoint: `POST /auth/oauth/telegram` (same route family as `/auth/oauth/google` and `/auth/oauth/apple`, handled by the existing `[provider]` dynamic route).
- Body: the payload Telegram's widget returns — `{ id, first_name, last_name?, username?, photo_url?, auth_date, hash }`.
- Verification: use `src/lib/telegram.ts`'s existing hash verifier (already in the codebase, described as *"optional Telegram Login Widget hash verifier (unused by current bot flow)"* — it was built but never wired up; wire it up now).
- On success: look up/create a `user_external_accounts` row with `provider = 'telegram'`, `provider_user_id = id`, `provider_username = username`. Same "if email/phone matches an existing unlinked account, return 409 `ACCOUNT_EXISTS_NOT_LINKED`, do not auto-merge" rule as Google/Apple.
- Telegram never supplies an email or phone number verified to platform standard, so a Telegram-only account has `email: null`, `phone_number: null` until the user separately links or adds one. `first_name`/`last_name`/`birth_date` must still be collected — prompt for missing `birth_date` post-signup the same way Google/Apple does for new accounts.

### What is explicitly deferred to v1.2
The **Telegram/WhatsApp bot** (accepting community/event/hangout invites in-chat, a lightweight moderator action surface) is out of scope for v1. The webhook endpoints for it already exist and work (`POST /auth/bot/telegram`, `POST /auth/bot/whatsapp`, gated by `x-bot-webhook-secret`) — leave them in place as dormant, tested code. Do not build any new bot conversation logic, invite flows, or in-chat moderator commands in v1. When v1.2 starts, these endpoints are the starting point, not a rewrite.

---

## 5. How to Authorize (Permissions)

### Step 1: Get community roles
```ts
import { getUserCommunityRoles } from '@/lib/casl';
const ctx = await getUserCommunityRoles(user.id);
// ctx = { ownedCommunityIds: ['uuid', ...], adminCommunityIds: ['uuid', ...] }
```

### Step 2: Build ability
```ts
import { defineAbilityFor } from '@/lib/casl';
const ability = defineAbilityFor({ id: user.id }, ctx);
```

### Step 3: Check permission
```ts
// Pass raw Prisma row UNMODIFIED (snake_case fields)
const canAsSelf = ability.can('delete', { ...post, __caslSubjectType__: 'Post' } as any);
const canAsMod  = ability.can('manage', { ...post, __caslSubjectType__: 'Post' } as any);

if (!canAsSelf && !canAsMod) {
  return Response.json(
    { success: false, error: { code: 'FORBIDDEN', message: 'Insufficient permissions' } },
    { status: 403 }
  );
}
```

### ⚠️ CASL condition fields are snake_case — do not camelCase them
`defineAbilityFor`'s conditions check literal object keys: `author_id`, `community_id`, `creator_id`, matching Prisma's raw output exactly. Pass Prisma rows straight into `ability.can(...)` unmodified.

### ⚠️ Cast conditions to `any` in casl.ts
The file casts every condition object to `any` (e.g., `{ author_id: user.id } as any`) to avoid TS2769 errors. Do not remove these casts.

### What CASL currently covers
- **Self:** `User` (own profile), `Post` (own posts), `Comment` (own comments), `Hangout` (own hangouts)
- **Any auth user:** `read`/`create`/`join`/`leave` Community, `create` Report/Hangout/Event
- **Admin/Mod:** `manage` Post/Comment/Event in their communities, `read`/`kick` CommunityMember, `read` Community (dashboard access)
- **Owner:** `update`/`delete` Community, `promote` CommunityMember

**Community membership checks** (e.g., "is this user a member of community X?") are done via **Prisma queries in the route**, NOT in CASL. CASL handles broad strokes; DB queries handle granular per-community state — this is also how owner-only vs admin/mod-only actions get distinguished within a single route namespace (see `API_SPECIFICATION.md` §0).

### Extending CASL for new entities
`casl.ts` currently knows about `User`, `Community`, `CommunityMember`, `Post`, `Comment`, `Event`, `Hangout`, `Report`. When a new batch adds a model CASL should reason about, add it to the `Subjects` union type at the top of the file, then add `can(...)` rules inside `defineAbilityFor` following the existing pattern (self-scoped rules first, then admin/mod-scoped rules gated behind `ctx.adminCommunityIds`, then owner-scoped rules behind `ctx.ownedCommunityIds`). Extend the one `defineAbilityFor` function — do not create a second ability-definition function.

`getUserCommunityRoles(userId)` already returns everything community-scoped authorization needs. If a new batch needs a different kind of scoped role (e.g. "communities where I'm banned"), extend this function's return shape rather than writing a parallel role-fetching helper.

---

## 6. Response Envelope (Mandatory for Every Endpoint)

```ts
// success
Response.json({ success: true, data: { ... } }, { status: 200 }); // 201 for creation

// error
Response.json(
  { success: false, error: { code: 'VALIDATION_ERROR', message: '...', details: [...] } },
  { status: 400 }
);
```

See `API_SPECIFICATION.md` §2 for the full error code table.

---

## 7. Shared Utilities — Reuse, Don't Redeclare

```ts
import { uuidSchema, paginationSchema, slugSchema } from '@/lib/zod-utils';
// uuidSchema — z.string().uuid()
// paginationSchema — { page: z.coerce.number().min(1).default(1), limit: z.coerce.number().min(1).max(100).default(20) }
// slugSchema — z.string().min(3).max(120).regex(/^[a-z0-9-]+$/)

import { prisma } from '@/lib/prisma'; // singleton PrismaClient
```

Add new shared primitives (e.g. an `identifierSchema` for the login endpoint, a `visibilitySchema` for `public`/`community`/`subcommunity`) to `zod-utils.ts` as new batches need them, rather than scattering one-off schemas per route.

---

## 8. Canonical Facts About the Live Schema (read before touching auth code)

1. **`users.password_hash` exists but is NEVER read or written.** Passwords are stored as a row in `user_external_accounts` with `provider = 'credential'`, `password` column holding the hash. Better-Auth's `signInEmail` throws automatically if no `credential` row exists — no manual "reject if null" check is needed for the email path. For the phone-only path, replicate this check manually per §3 above.
2. **`user_external_accounts` has more columns than the original blueprint**: `password`, `id_token`, `scope`, `access_token_expires_at`, `refresh_token_expires_at`, `issuer` were added to satisfy Better-Auth's account model. `provider_username`, `provider_email`, `provider_phone`, `raw_profile`, `is_active`, `token_expires_at` still exist and are free to use in later batches.
3. **`sessions` and `verification` tables** are fully owned by Better-Auth. `verification` is reused as generic OTP storage for phone verification (`identifier: "phone:<number>"`) — don't assume it's email-only.
4. **IDs:** every Better-Auth-touched table uses `advanced.database.generateId: false` in `lib/auth.ts` — Prisma's own `@default(uuid())` generates every ID, not Better-Auth.
5. **Manual sessions:** bot logins (v1.2) and phone-only password logins (v1, per §3) both issue sessions by inserting directly into `sessions` via `createManualSession(userId, req)` in `src/lib/manual-session.ts`, rather than going through Better-Auth's own sign-in flow. The bearer plugin recognizes such tokens identically to ones it created itself. Reuse this helper — don't write a second implementation.

---

## 9. Critical Rules for Every New Endpoint

1. **Zod validation on EVERY endpoint** that accepts a body or query params. Use `.safeParse()`, return `VALIDATION_ERROR` with `details: result.error.issues`.
2. **Auth check on EVERY endpoint** except public GETs. Use `getCurrentUser(req)`, never `auth.api.getSession()` directly.
3. **Community role check via Prisma query** — NOT just CASL. CASL is broad strokes; DB queries confirm admin/mod/owner status for the SPECIFIC community.
4. **Soft delete checks** in every list/query: `deleted_at: null` on users, communities, posts, comments, events, hangouts, subcommunities.
5. **User block checks** in feed queries: exclude content from blocked users.
6. **Event approval_status** — non-admins should not see unapproved events in feeds (except proposed events in their own community, to show activity).
7. **Owner protection** — every member management endpoint must check `communities.creator_id !== targetUserId`. Owner cannot be demoted or kicked.
8. **Category immutability** — no endpoint may change `communities.category_id` after creation (confirmed v1 decision).
9. **Slug validation** — lowercase, alphanumeric + hyphens only, max 120 chars.
10. **Phone-login gate** — never authenticate via `phone_number` unless `phone_verified_at IS NOT NULL`.
11. **Use Prisma 5.22.0** — reference the exact version in CLI commands.
12. **No Row Level Security (RLS)** — authorization lives entirely in the backend query layer.

---

## 10. Files Already in the Project (Batch 1 — do not recreate)

```
src/lib/auth.ts                 — Better-Auth instance, table mapping, Google/Apple providers, bearer plugin
src/lib/auth-client.ts          — frontend client (Admin Dashboard only)
src/lib/casl.ts                 — defineAbilityFor + getUserCommunityRoles
src/lib/get-current-user.ts     — canonical per-request auth helper (§2)
src/lib/manual-session.ts       — manual bearer-session creation (bot logins, and now phone-only password logins)
src/lib/telegram.ts             — Telegram Login Widget hash verifier (wire up for §4 — was unused, now needed)
src/lib/prisma.ts, zod-utils.ts, utils.ts
src/app/api/auth/[...all]/route.ts             — mounts every Better-Auth endpoint
src/app/api/v1/auth/register/route.ts          — needs the phoneNumber-optional update per §3
src/app/api/v1/auth/login/route.ts             — needs the identifier-resolution update per §3
src/app/api/v1/auth/logout/route.ts
src/app/api/v1/auth/oauth/[provider]/route.ts  — needs a 'telegram' case added per §4
src/app/api/v1/auth/bot/[provider]/route.ts    — leave as-is, dormant
src/app/api/v1/auth/link-external/route.ts
src/app/api/v1/auth/verify-phone/route.ts
src/app/api/v1/auth/verify-phone/confirm/route.ts
src/app/api/v1/users/me/route.ts
```

---

## 11. Environment Variables

`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_API_URL`, `BOT_WEBHOOK_SECRET` are set. Google/Apple/Telegram-widget/SMS-provider variables are intentionally NOT set yet — `lib/auth.ts` only registers a provider with Better-Auth when its env vars are present, so absence causes no errors. Add `TELEGRAM_BOT_TOKEN` (used by the widget hash verifier, not the bot) when wiring up §4.

---

*Authentication's core (register/login/logout/OAuth-google-apple/bot-webhooks/phone-OTP) is complete and tested. The phone-identifier login and Telegram widget login described in §3-4 are the two small deltas still to build — do them first, before Batch 2, so every later batch can assume both login paths work.*
