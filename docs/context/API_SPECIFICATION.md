# API Specification & Authorization Matrix
> **Version:** 2.0 (Consolidated — merges the old `02-API_SPECIFICATION.md` and `05-API_ENDPOINTS_PROMPT.md`, which had drifted from each other)
> **Style:** RESTful JSON API
> **Base Path:** `/api/v1`
> **Auth:** Bearer token via `Authorization: Bearer <token>` header — no cookies, ever (see `AUTH_SPECIFICATION.md`)
> **Content-Type:** `application/json`
> **Status column:** ✅ = already built and tested (Batch 1). Everything else is ⬜ to be built, in the batch order given in `PROMPT_PACK.md`.

---

## 0. Role-Based Access Architecture

| Role | Admin Dashboard | Mobile App | API Access Level |
|------|----------------|------------|------------------|
| **Owner** | ✅ Full access | ✅ Full member access | Highest — can manage admins/moderators, delete community, transfer ownership |
| **Admin** | ✅ Full access | ✅ Full member access | High — can manage posts, events, members, reports, approve/reject events |
| **Moderator** | ✅ Full access (v1 merged with Admin) | ✅ Full member access | Same as Admin in v1. In v2: reduced permissions (no billing, no settings changes) |
| **Member** | ❌ No access (dashboard shows empty state, not an error) | ✅ Full member access | Standard — can post, comment, react, join events/hangouts, create hangouts, propose events |
| **Visitor** (not authenticated) | ❌ No access | ✅ Read public communities only | Read-only public content |

### v1 Role Merge
`admin` and `moderator` are functionally identical in v1. Both can: manage posts (remove/restore), manage events (approve/reject proposed, edit, delete), manage members (kick, ban from community), review and resolve reports, access all admin dashboard pages.

The Owner additionally can: transfer ownership, promote/demote admins/moderators, delete the community, change community settings.

### v1 Route Convention (no `/owner/*` prefix)
Owner-only actions live at the same route paths as admin/mod actions (e.g., `PATCH /communities/:slug/members/:userId`) — the distinction is enforced by a role check inside the handler, not by a separate URL namespace. This intentionally differs from an earlier draft that proposed splitting `/api/owner/*` from `/api/admin/*`; the simpler single-namespace-with-role-check approach is what's actually implemented.

---

## 1. Authentication Endpoints

Full behavioral detail (Better-Auth internals, `getCurrentUser`, CASL, deviations) lives in `AUTH_SPECIFICATION.md`. This section is the wire contract only.

| Method | Path | Status | Auth required? | Notes |
|---|---|---|---|---|
| POST | `/auth/register` | ✅ | No | `{ username, email?, phoneNumber?, password, firstName, lastName, birthDate }` → `{ user, token }`. At least one of `email`/`phoneNumber` required. Enforces age ≥ 13. |
| POST | `/auth/login` | ✅ (needs identifier update — see `AUTH_SPECIFICATION.md`) | No | `{ identifier, password }` where `identifier` is an email or a verified phone number → `{ user, token }` |
| POST | `/auth/logout` | ✅ | Yes | Revokes the session tied to the bearer token |
| POST | `/auth/oauth/:provider` | ✅ (google, apple) / ⬜ (telegram) | No | `provider` = `google`, `apple`, `telegram`. Body varies by provider — see `AUTH_SPECIFICATION.md`. 409 `ACCOUNT_EXISTS_NOT_LINKED` if identity collides with an unlinked account. |
| POST | `/auth/bot/:provider` | ✅ implemented, **dormant in v1** | Bot server only (`x-bot-webhook-secret` header) | `provider` = `telegram`, `whatsapp`. Reserved for the v1.2 bot feature — not wired into any v1 UI flow. |
| POST | `/auth/link-external` | ✅ | Yes | `{ provider, ... }` → `{ linkedProviders: [...] }` |
| POST | `/auth/verify-phone` | ✅ | Yes | `{ phoneNumber }` → sends OTP (console-logged in dev) |
| POST | `/auth/verify-phone/confirm` | ✅ | Yes | `{ phoneNumber, otp }` → sets `phone_verified_at = NOW()`, unlocking phone login |

---

## 2. Response Standard

### Success
```json
{
  "success": true,
  "data": { ... },
  "meta": { "page": 1, "limit": 20, "total": 100, "totalPages": 5 }
}
```

### Error
```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [ ... ] }
}
```

**Standard Error Codes:**
| Code | HTTP | Meaning |
|------|------|---------|
| `VALIDATION_ERROR` | 400 | Zod validation failed |
| `UNAUTHORIZED` | 401 | Missing/invalid token |
| `FORBIDDEN` | 403 | Valid auth but insufficient permissions |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Unique constraint violation |
| `ACCOUNT_EXISTS_NOT_LINKED` | 409 | OAuth/Telegram identity's email or phone already belongs to an existing, unlinked account |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

---

## 3. Authorization Matrix

### Legend
- **Owner** = `communities.creator_id == current_user_id`
- **Admin/Mod** = `community_members.role IN ('admin', 'moderator')` for that specific community
- **Member** = `community_members.role = 'member'` for that specific community
- **Self** = `resource.user_id == current_user_id` or `resource.author_id == current_user_id`
- **Public** = No auth required (but still respects visibility/blocks/soft-delete)
- **Auth** = Any logged-in user

### Users
| Endpoint | Method | Who | Status |
|----------|--------|-----|---|
| `/users/me` | GET | Self | ✅ |
| `/users/me` | PATCH | Self | ✅ |
| `/users/me` | DELETE | Self (soft delete) | ✅ |
| `/users/me/communities` | GET | Self — returns every community where the caller is owner/admin/moderator, with their role in each. Backs both the dashboard's "My Communities" home and the mobile app's management-switch visibility check. | ⬜ **new — gap fix** |
| `/users/:id` | GET | Auth (respect blocks + deleted_at) | ⬜ |
| `/users/:id/follow` | POST / DELETE | Auth (not self) | ⬜ |
| `/users/:id/block` | POST / DELETE | Auth (not self) | ⬜ |
| `/users/:id/trust-score` | GET | Auth | ⬜ |

### Communities
| Endpoint | Method | Who | Status |
|----------|--------|-----|---|
| `/communities` | GET | Public (filter by category, location, tags, search) | ⬜ |
| `/communities` | POST | Auth (creates owner + admin member row) | ⬜ |
| `/communities/:slug` | GET | Public (if not private) / Members (if private) | ⬜ |
| `/communities/:slug` | PATCH | Owner (name, description, rules, bannerUrl, profilePictureUrl, isPrivate — **not** slug or categoryId) | ⬜ |
| `/communities/:slug` | DELETE | Owner (soft delete) | ⬜ |
| `/communities/:slug/join` | POST | Auth | ⬜ |
| `/communities/:slug/leave` | POST | Auth (NOT owner) | ⬜ |
| `/communities/:slug/members` | GET | Admin/Mod / Owner | ⬜ |
| `/communities/:slug/members/:userId` | PATCH | Owner only (promote/demote; cannot target owner) | ⬜ |
| `/communities/:slug/members/:userId/kick` | DELETE | Admin/Mod / Owner (cannot target owner) | ⬜ |
| `/communities/:slug/reports` | GET | Admin/Mod / Owner | ⬜ |
| `/communities/:slug/moderation-actions` | GET | Admin/Mod / Owner | ⬜ |

### Posts
| Endpoint | Method | Who | Status |
|----------|--------|-----|---|
| `/communities/:slug/posts` | GET / POST | Public/Member (GET) · Member+ (POST) | ⬜ |
| `/posts/:id` | GET | Public/Member (respect privacy + blocks + soft delete) | ⬜ |
| `/posts/:id` | PATCH | Self | ⬜ |
| `/posts/:id` | DELETE | Self / Admin/Mod / Owner | ⬜ |
| `/posts/:id/react` | POST | Auth (toggle) | ⬜ |
| `/posts/:id/save` | POST | Auth (toggle) | ⬜ |

### Comments
| Endpoint | Method | Who | Status |
|----------|--------|-----|---|
| `/posts/:id/comments` | GET / POST | Public/Member (GET) · Member+ (POST) | ⬜ |
| `/comments/:id` | GET | Public/Member | ⬜ |
| `/comments/:id` | PATCH | Self | ⬜ |
| `/comments/:id` | DELETE | Self / Admin/Mod / Owner | ⬜ |
| `/comments/:id/react` | POST | Auth (toggle) | ⬜ |

### Events
| Endpoint | Method | Who | Status |
|----------|--------|-----|---|
| `/communities/:slug/events` | GET | Public/Member (respect visibility + approval_status) | ⬜ |
| `/communities/:slug/events` | POST | Member+ (creates proposed; Admin/Mod creates verified) | ⬜ |
| `/communities/:slug/events/:id` | GET | Public/Member (respect visibility + bans) | ⬜ |
| `/communities/:slug/events/:id` | PATCH | Self / Admin/Mod / Owner (cannot change approval_status — use approve/reject) | ⬜ |
| `/communities/:slug/events/:id` | DELETE | Self / Admin/Mod / Owner | ⬜ |
| `/communities/:slug/events/:id/join` | POST | Auth (if not banned, not full) | ⬜ |
| `/communities/:slug/events/:id/leave` | POST | Self (participant) | ⬜ |
| `/communities/:slug/events/:id/approve` | POST | Admin/Mod / Owner | ⬜ |
| `/communities/:slug/events/:id/reject` | POST | Admin/Mod / Owner | ⬜ |
| `/communities/:slug/events/:id/ban` | POST | Admin/Mod / Owner | ⬜ |
| `/communities/:slug/events/:id/save` | POST | Auth (toggle) | ⬜ |

### Hangouts
| Endpoint | Method | Who | Status |
|----------|--------|-----|---|
| `/hangouts` | GET | Public (respect visibility + blocks + soft delete) | ⬜ |
| `/hangouts` | POST | Auth (standalone or community-tied) | ⬜ |
| `/hangouts/:id` | GET | Public/Member (respect visibility + bans) | ⬜ |
| `/hangouts/:id` | PATCH | Self | ⬜ |
| `/hangouts/:id` | DELETE | Self / Admin/Mod / Owner (if community-tied) | ⬜ |
| `/hangouts/:id/join` | POST | Auth (if open) | ⬜ |
| `/hangouts/:id/request` | POST | Auth (if request_based) | ⬜ |
| `/hangouts/:id/requests/:userId` | PATCH | Self (creator approves/rejects) | ⬜ |
| `/hangouts/:id/leave` | POST | Self (participant) | ⬜ |
| `/hangouts/:id/ban` | POST | Self (creator) / Admin/Mod / Owner (if community-tied) | ⬜ |
| `/hangouts/:id/save` | POST | Auth (toggle) | ⬜ |

### Reports
| Endpoint | Method | Who | Status |
|----------|--------|-----|---|
| `/reports` | POST | Auth | ⬜ |
| `/reports` | GET | Admin/Mod / Owner (filtered by their communities) | ⬜ |
| `/reports/:id` | PATCH | Admin/Mod / Owner (update status) | ⬜ |
| `/reports/:id/action` | POST | Admin/Mod / Owner (record moderation action) | ⬜ |

### Admin Dashboard
| Endpoint | Method | Who | Status |
|----------|--------|-----|---|
| `/admin/communities/:slug` | GET | Admin/Mod / Owner | ⬜ |
| `/admin/communities/:slug/stats` | GET | Admin/Mod / Owner | ⬜ |
| `/admin/communities/:slug/pending-events` | GET | Admin/Mod / Owner | ⬜ |
| `/admin/communities/:slug/banned-users` | GET | Admin/Mod / Owner | ⬜ |

### Notifications & Uploads
| Endpoint | Method | Who | Status |
|----------|--------|-----|---|
| `/notifications` | GET | Auth (`?page`, `?limit`, `?unreadOnly`) | ⬜ |
| `/notifications/:id/read` | PATCH | Auth | ⬜ |
| `/upload/presigned` | POST | Auth | ⬜ |

---

## 4. Query Parameters Standard

### Pagination
`?page=1&limit=20` (default limit: 20, max: 100). Response includes `meta: { page, limit, total, totalPages }`.

### Sorting
`?sort=created_at&order=desc` (default: `created_at DESC`)

### Filtering
`?status=pending` (reports, events) · `?visibility=public` (events/hangouts) · `?categoryId=uuid` (communities) · `?lat=9.03&lng=38.74&radius=10km` (location-based discovery)

### Search
`?q=keyword` (full-text search on names, titles, descriptions)

---

## 5. File Uploads

### POST /upload/presigned
Generates a presigned URL for direct-to-S3 (or Cloudflare R2) upload.
**Body:** `{ "filename": "...", "contentType": "image/jpeg" }`
**Response:** `{ "uploadUrl": "...", "publicUrl": "...", "key": "..." }`

**Rules:** Max 10MB images, 50MB videos. Allowed types: `image/jpeg`, `image/png`, `image/webp`, `video/mp4`. Backend validates the uploaded file exists before saving the URL to the database.

---

## 6. WebSocket / Realtime (Future)

v1 uses polling for notifications. v2 may introduce Socket.io/SSE channels for real-time notifications and messaging.

---

## 7. Rate Limiting

| Endpoint Group | Limit |
|----------------|-------|
| Auth (login, register) | 5 requests / minute |
| General API | 100 requests / minute |
| Uploads | 10 requests / minute |
| Search | 30 requests / minute |

---

## 8. File Structure Convention

```
src/app/api/v1/
├── auth/                                    # ✅ done — do not modify
│   ├── register/route.ts
│   ├── login/route.ts
│   ├── logout/route.ts
│   ├── oauth/[provider]/route.ts            # add 'telegram' case here
│   ├── bot/[provider]/route.ts              # dormant, do not extend in v1
│   ├── link-external/route.ts
│   ├── verify-phone/route.ts
│   └── verify-phone/confirm/route.ts
├── users/
│   ├── me/route.ts                          # ✅ done — do not modify
│   ├── me/communities/route.ts              # ⬜ new
│   └── [id]/
│       ├── route.ts
│       ├── follow/route.ts
│       ├── block/route.ts
│       └── trust-score/route.ts
├── communities/
│   ├── route.ts                             # GET list, POST create
│   └── [slug]/
│       ├── route.ts                         # GET single, PATCH, DELETE
│       ├── join/route.ts
│       ├── leave/route.ts
│       ├── members/
│       │   ├── route.ts                     # GET list
│       │   └── [userId]/
│       │       ├── route.ts                 # PATCH (role update — OWNER ONLY)
│       │       └── kick/route.ts             # DELETE (admin/mod, not owner)
│       ├── posts/
│       │   ├── route.ts                     # GET list, POST create
│       │   └── [postId]/
│       │       ├── route.ts
│       │       ├── react/route.ts
│       │       └── save/route.ts
│       ├── events/
│       │   ├── route.ts
│       │   └── [eventId]/
│       │       ├── route.ts
│       │       ├── join/route.ts
│       │       ├── leave/route.ts
│       │       ├── approve/route.ts
│       │       ├── reject/route.ts
│       │       ├── ban/route.ts
│       │       └── save/route.ts
│       ├── reports/
│       │   └── route.ts
│       └── moderation-actions/
│           └── route.ts
├── posts/
│   └── [id]/
│       ├── route.ts
│       └── comments/
│           ├── route.ts
│           └── [commentId]/
│               ├── route.ts
│               └── react/route.ts
├── hangouts/
│   ├── route.ts
│   └── [id]/
│       ├── route.ts
│       ├── join/route.ts
│       ├── leave/route.ts
│       ├── request/route.ts
│       ├── requests/[userId]/route.ts
│       ├── ban/route.ts
│       └── save/route.ts
├── reports/
│   ├── route.ts
│   └── [id]/
│       ├── route.ts
│       └── action/route.ts
├── admin/communities/[slug]/
│   ├── route.ts
│   ├── stats/route.ts
│   ├── pending-events/route.ts
│   └── banned-users/route.ts
├── notifications/
│   ├── route.ts
│   └── [id]/read/route.ts
└── upload/
    └── presigned/route.ts
```

---

*All endpoints must validate input with Zod before touching the database. For implementation patterns (getCurrentUser, CASL, response envelope helpers) see `AUTH_SPECIFICATION.md`.*
