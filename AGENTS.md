<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project Rules — Always-On

This file is read automatically at the start of every Antigravity session.
Full detail lives in `docs/context/` — read the relevant file before
implementing any batch (don't rely on this summary alone for anything
non-trivial).

- `docs/context/00-SYSTEM_CONTEXT.md` — architecture, principles, entities
- `docs/context/API_SPECIFICATION.md` — every route, request/response shape, error codes
- `docs/context/AUTH_SPECIFICATION.md` — auth flows, session handling, CASL
- `docs/context/DATABASE_SCHEMA.md` — table-by-table rationale (schema.prisma is the live source of truth)
- `docs/PROMPT_PACK.md` — the batch-by-batch build plan; work through it in order

## Stack

Next.js (App Router) monorepo serving both the public API and the Admin
Dashboard. Prisma 5.22.0 against the schema in `prisma/schema.prisma`.
Better-Auth for session/auth plumbing. Zod for all validation. CASL for
coarse-grained ability checks, backed by Prisma queries for the real
per-community authorization decision.

## Do not touch without explicit instruction

`src/lib/auth.ts`, `src/lib/casl.ts`, `src/lib/get-current-user.ts`,
`src/lib/manual-session.ts`, `src/lib/prisma.ts`, `src/lib/zod-utils.ts`,
or any existing API route not named in the current batch. If a task seems
to require changing one of these, stop and flag it instead of proceeding.

## Non-negotiable rules for every endpoint

1. **Zod validation** on every endpoint that accepts a body or query params.
   Use `.safeParse()`; on failure return `VALIDATION_ERROR` (400) with
   `details: result.error.issues`. Reuse `uuidSchema`, `paginationSchema`,
   `slugSchema` from `@/lib/zod-utils` — add new shared primitives there,
   don't write one-off schemas per route.
2. **Auth check on every endpoint** except public GETs. Use
   `getCurrentUser(req)` — never call `auth.api.getSession()` directly.
3. **Role checks are always scoped to a specific `community_id`** via a
   Prisma query against `community_members` — there is no global admin
   flag on `users`. CASL gives broad strokes; the DB query confirms
   admin/mod/owner status for *that* community.
4. **Standard response envelope, always:**
   ```ts
   // success
   Response.json({ success: true, data: { ... } }, { status: 200 }); // 201 on create
   // error
   Response.json(
     { success: false, error: { code: 'VALIDATION_ERROR', message: '...', details: [...] } },
     { status: 400 }
   );
   ```
5. **Soft-delete checks** (`deleted_at: null`) in every list/query touching
   users, communities, posts, comments, events, hangouts, subcommunities.
6. **User block checks** in feed queries — exclude content from blocked users.
7. **Owner protection** — owner cannot be demoted, kicked, or leave without
   transferring ownership first. Check `communities.creator_id !== targetUserId`
   in every member-management endpoint.
8. **Category is immutable** — no endpoint may change `communities.category_id`
   after creation. Don't add category-editing UI or endpoints.
9. **Phone-login gate** — never authenticate via `phone_number` unless
   `phone_verified_at IS NOT NULL`.
10. **No Row Level Security** — authorization lives entirely in the backend
    query layer, never in the DB.
11. **OAuth/Telegram accounts are never auto-merged** by email or phone —
    always prompt the user to link explicitly.

## Frontend is never a security boundary

The Admin Dashboard's login page is the same `POST /auth/login` the mobile
app uses — any registered user can hit it. That's fine: every dashboard
page independently re-verifies the caller's role via a Prisma query before
returning data or allowing an action. Don't try to "protect" routes by
hiding UI — protect them by checking authorization server-side, every time.

## Style

- TypeScript, App Router conventions, named exports over default exports.
- Match the exact error codes and response shapes in
  `docs/context/API_SPECIFICATION.md` §2 — don't invent new ones.
- When a batch says "reuse X helper," reuse it — don't write a parallel
  implementation that does the same thing slightly differently.
