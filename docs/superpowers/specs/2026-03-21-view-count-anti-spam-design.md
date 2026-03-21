# View Count Anti-Spam Design

**Date:** 2026-03-21
**Status:** Approved

## Problem

Users can artificially inflate view counts for members and groups by repeatedly refreshing detail pages. The home page leaderboard ranks by view count, so this distorts rankings.

## Solution Overview

Two-layer defense:

1. **Frontend localStorage cooldown** — prevents redundant API calls; stops casual refresh spam
2. **Backend DB session cooldown** — server-side enforcement using a browser-generated session token; effective even if localStorage is bypassed

## Architecture

```
User navigates to member/group page
    ↓
ViewCountService.increment(type, id)
    ↓
Check localStorage: viewed_${type}_${id}
    ├── Within 10 min → return (skip API call)
    └── Expired / first visit
            ↓
        Read sessionToken from localStorage['view_session_token']
        (generate UUID v4 on first use, persist permanently)
            ↓
        Call Supabase RPC: increment_view(type, id, sessionToken)
            ↓
        RPC checks view_session_log
            ├── Same token + entity within 10 min → return (no increment)
            └── Passed
                    ↓
                UPSERT view_session_log (token, type, id, now())
                UPSERT page_views (increment view_count)
            ↓
        Update localStorage['viewed_${type}_${id}'] = now()
```

## Components

### Frontend: `ViewCountService`

**File:** `src/app/core/view-count.service.ts`

**Changes:**
- On service init, read or generate `sessionToken` from `localStorage['view_session_token']`
- In `increment(type, id)`:
  1. Check `localStorage['viewed_${type}_${id}']`; if within 10 minutes, return early
  2. Call RPC with `p_session_token` parameter
  3. On success, write current timestamp to `localStorage['viewed_${type}_${id}']`

**localStorage keys:**
- `view_session_token` — persistent UUID identifying this browser session
- `viewed_member_${id}` — timestamp of last counted view for a member
- `viewed_group_${id}` — timestamp of last counted view for a group

### Backend: Supabase Migration `033_view_session_cooldown.sql`

**New table: `view_session_log`**

```sql
CREATE TABLE view_session_log (
  session_token uuid        NOT NULL,
  entity_type   text        NOT NULL,
  entity_id     uuid        NOT NULL,
  viewed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_token, entity_type, entity_id)
);
```

**Modified RPC: `increment_view`**

New signature: `increment_view(p_type text, p_id uuid, p_session_token uuid)`

Logic:
1. Check `view_session_log` for same `(p_session_token, p_type, p_id)` with `viewed_at > now() - interval '10 minutes'`
2. If found → return without incrementing
3. If not found → UPSERT `view_session_log`, then UPSERT `page_views` to increment `view_count`

## Cooldown Period

Both layers use **10 minutes**.

## Security Considerations

- `sessionToken` is client-generated and client-stored — a determined attacker can clear it and get a new token, resetting the cooldown. This is acceptable for a small fan site; the goal is stopping casual spam, not adversarial abuse.
- The DB layer ensures even direct API calls (bypassing the frontend) are rate-limited per session token.
- IP-based rate limiting was considered but ruled out: Supabase RPCs do not expose client IP, and users behind shared NAT would be incorrectly blocked.

## Files Changed

| File | Change |
|------|--------|
| `src/app/core/view-count.service.ts` | Add localStorage cooldown + sessionToken logic |
| `supabase/migrations/033_view_session_cooldown.sql` | New table + modified RPC |
