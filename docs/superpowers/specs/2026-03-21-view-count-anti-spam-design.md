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
Check localStorage: viewed_member_${id} or viewed_group_${id}
    ├── Within 10 min → return (skip API call)
    └── Expired / first visit
            ↓
        Read sessionToken from localStorage['view_session_token']
        (generate UUID v4 on first use via crypto.randomUUID(), persist permanently)
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
        Update localStorage['viewed_member_${id}'] or localStorage['viewed_group_${id}'] = now()
        (Update happens regardless of whether RPC skipped or actually incremented —
         this prevents extra API calls even when the DB layer rejects the increment)
```

## Components

### Frontend: `ViewCountService`

**File:** `src/app/core/view-count.service.ts`

**Changes:**
- On service init, read or generate `sessionToken` from `localStorage['view_session_token']` using `crypto.randomUUID()` (supported in all modern browsers; minimum: Chrome 92, Firefox 95, Safari 15.4)
- In `increment(type, id)`:
  1. Check `localStorage['viewed_member_${id}']` or `localStorage['viewed_group_${id}']`; if within 10 minutes, return early
  2. Call RPC with `p_session_token` parameter
  3. On RPC resolve (success or cooldown skip), write current timestamp to the localStorage key

**Note on call frequency:** `group-page.component.ts` calls `increment` inside a `paramMap.subscribe()`. The 10-minute localStorage cooldown correctly handles repeated emissions of the same route params — only the first call within the window hits the API.

**localStorage keys:**
- `view_session_token` — persistent UUID identifying this browser session
- `viewed_member_${id}` — timestamp of last view API call for a member
- `viewed_group_${id}` — timestamp of last view API call for a group

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

ALTER TABLE view_session_log ENABLE ROW LEVEL SECURITY;
-- No direct client access needed; all reads/writes go through the SECURITY DEFINER RPC
```

**Drop old overload and create new RPC: `increment_view`**

The old two-argument overload must be dropped to prevent callers from bypassing the session token check:

```sql
DROP FUNCTION IF EXISTS increment_view(text, uuid);

CREATE OR REPLACE FUNCTION increment_view(
  p_type         text,
  p_id           uuid,
  p_session_token uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Check cooldown: same session already counted this entity within 10 minutes
  IF EXISTS (
    SELECT 1 FROM view_session_log
    WHERE session_token = p_session_token
      AND entity_type   = p_type
      AND entity_id     = p_id
      AND viewed_at     > now() - interval '10 minutes'
  ) THEN
    RETURN;
  END IF;

  -- Log this view
  INSERT INTO view_session_log (session_token, entity_type, entity_id)
  VALUES (p_session_token, p_type, p_id)
  ON CONFLICT (session_token, entity_type, entity_id)
  DO UPDATE SET viewed_at = now();

  -- Increment view count
  INSERT INTO page_views (entity_type, entity_id, view_count)
  VALUES (p_type, p_id, 1)
  ON CONFLICT (entity_type, entity_id)
  DO UPDATE SET view_count = page_views.view_count + 1;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_view(text, uuid, uuid) TO anon;
```

## Cooldown Period

Both layers use **10 minutes**.

## Security Considerations

- `sessionToken` is client-generated and client-stored — a determined attacker can clear localStorage to get a new token and reset the cooldown. This is acceptable; the goal is stopping casual spam, not adversarial abuse.
- In private/incognito browsing, localStorage persists for the tab session only. Closing a tab resets the frontend cooldown, making only the DB layer (session token) effective. The DB layer still applies a 10-minute cooldown per token.
- The DB layer ensures even direct API calls (bypassing the frontend) are rate-limited per session token.
- IP-based rate limiting was considered but ruled out: Supabase SECURITY DEFINER RPCs do not expose client IP, and shared NAT would incorrectly block multiple legitimate users.
- The `view_session_log` table grows unboundedly (one row per unique session+entity combination, never deleted). For a small fan site this is acceptable. A periodic cleanup of old rows (`viewed_at < now() - interval '30 days'`) can be added later if needed.

## Files Changed

| File | Change |
|------|--------|
| `src/app/core/view-count.service.ts` | Add localStorage cooldown + sessionToken logic; pass token to RPC |
| `src/app/core/view-count.service.spec.ts` | Update tests to match new RPC call signature (3 args) |
| `supabase/migrations/033_view_session_cooldown.sql` | New table + drop old RPC + new RPC with session cooldown |
