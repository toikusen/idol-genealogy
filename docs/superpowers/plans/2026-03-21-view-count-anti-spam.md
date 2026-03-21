# View Count Anti-Spam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent view count inflation by adding a two-layer cooldown — frontend localStorage and backend DB session tracking — so casual refresh spam no longer affects leaderboard rankings.

**Architecture:** The frontend `ViewCountService` checks localStorage before calling the Supabase RPC; if the same entity was viewed within 10 minutes, the API call is skipped. A persistent `sessionToken` (UUID stored in localStorage) is passed to the RPC. A new `view_session_log` table in Supabase tracks per-token cooldowns, and the RPC rejects duplicate increments from the same session within 10 minutes.

**Tech Stack:** Angular 19, TypeScript, Supabase (PostgreSQL + RLS), Karma/Jasmine for tests

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/033_view_session_cooldown.sql` | Create | New table + updated RPC |
| `src/app/core/view-count.service.ts` | Modify | localStorage cooldown + sessionToken + new RPC args |
| `src/app/core/view-count.service.spec.ts` | Modify | Update tests for new signature and new cooldown logic |

---

## Task 1: Write the Supabase migration

**Files:**
- Create: `supabase/migrations/033_view_session_cooldown.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/033_view_session_cooldown.sql
-- Apply manually in Supabase Dashboard SQL Editor

-- Track per-session cooldowns (one row per session+entity, upserted on each real view)
create table view_session_log (
  session_token uuid        not null,
  entity_type   text        not null,
  entity_id     uuid        not null,
  viewed_at     timestamptz not null default now(),
  primary key (session_token, entity_type, entity_id)
);

-- All reads/writes go through the SECURITY DEFINER RPC below, so no client policies needed.
alter table view_session_log enable row level security;

-- Drop the old two-argument overload so callers cannot bypass the session token check.
drop function if exists increment_view(text, uuid);

-- New three-argument increment_view with session cooldown
create or replace function increment_view(
  p_type          text,
  p_id            uuid,
  p_session_token uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- If the same session already counted this entity within 10 minutes, do nothing.
  if exists (
    select 1 from view_session_log
    where session_token = p_session_token
      and entity_type   = p_type
      and entity_id     = p_id
      and viewed_at     > now() - interval '10 minutes'
  ) then
    return;
  end if;

  -- Record this session's view (upsert so the primary key constraint is satisfied on re-entry after cooldown)
  insert into view_session_log (session_token, entity_type, entity_id)
  values (p_session_token, p_type, p_id)
  on conflict (session_token, entity_type, entity_id)
  do update set viewed_at = now();

  -- Increment the global view counter
  insert into page_views (entity_type, entity_id, view_count)
  values (p_type, p_id, 1)
  on conflict (entity_type, entity_id)
  do update set view_count = page_views.view_count + 1;
end;
$$;

grant execute on function increment_view(text, uuid, uuid) to anon;
```

- [ ] **Step 2: Apply the migration in Supabase Dashboard**

Open the Supabase Dashboard → SQL Editor, paste the contents of `033_view_session_cooldown.sql`, and run it.

Verify:
- Table `view_session_log` appears in Table Editor
- Old `increment_view(text, uuid)` is gone (run `\df increment_view` or check the Functions list — only the 3-arg version should exist)
- New `increment_view(text, uuid, uuid)` is listed with `security definer`

- [ ] **Step 3: Commit the migration file**

```bash
git add supabase/migrations/033_view_session_cooldown.sql
git commit -m "feat: add view_session_log table and update increment_view RPC with session cooldown"
```

---

## Task 2: Update `ViewCountService` — add localStorage cooldown and sessionToken

**Files:**
- Modify: `src/app/core/view-count.service.ts`

- [ ] **Step 1: Replace the service implementation**

Open `src/app/core/view-count.service.ts`. The current file (18 lines) calls the RPC with two args and has no localStorage logic. Replace it entirely with:

```typescript
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SupabaseService } from './supabase.service';

const COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
const SESSION_TOKEN_KEY = 'view_session_token';

function viewedKey(type: 'member' | 'group', id: string): string {
  return `viewed_${type}_${id}`;
}

@Injectable({ providedIn: 'root' })
export class ViewCountService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private sessionToken: string | null = null;

  constructor(private supabase: SupabaseService) {}

  private getSessionToken(): string {
    if (this.sessionToken) return this.sessionToken;
    let token = localStorage.getItem(SESSION_TOKEN_KEY);
    if (!token) {
      token = crypto.randomUUID();
      localStorage.setItem(SESSION_TOKEN_KEY, token);
    }
    this.sessionToken = token;
    return token;
  }

  private isOnCooldown(type: 'member' | 'group', id: string): boolean {
    const raw = localStorage.getItem(viewedKey(type, id));
    if (!raw) return false;
    return Date.now() - parseInt(raw, 10) < COOLDOWN_MS;
  }

  private markViewed(type: 'member' | 'group', id: string): void {
    localStorage.setItem(viewedKey(type, id), String(Date.now()));
  }

  async increment(type: 'member' | 'group', id: string): Promise<void> {
    if (!this.isBrowser) return;
    if (this.isOnCooldown(type, id)) return;

    await this.supabase.client.rpc('increment_view', {
      p_type: type,
      p_id: id,
      p_session_token: this.getSessionToken()
    });
    // Write timestamp unconditionally — whether the DB skipped or incremented,
    // we want the frontend to avoid redundant calls during the cooldown window.
    this.markViewed(type, id);
  }
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
npx ng build --configuration development 2>&1 | tail -20
```

Expected: no TypeScript errors (warnings about bundle size are fine).

---

## Task 3: Update `ViewCountService` tests

**Files:**
- Modify: `src/app/core/view-count.service.spec.ts`

- [ ] **Step 1: Write the updated test file**

The existing tests assert the old 2-arg RPC call and have no localStorage coverage. Replace the file with:

```typescript
import { TestBed } from '@angular/core/testing';
import { ViewCountService } from './view-count.service';
import { SupabaseService } from './supabase.service';

const mockRpc = jasmine.createSpy('rpc').and.returnValue(
  Promise.resolve({ error: null })
);

const mockSupabaseService = {
  client: { rpc: mockRpc }
};

describe('ViewCountService', () => {
  let service: ViewCountService;

  beforeEach(() => {
    mockRpc.calls.reset();
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        ViewCountService,
        { provide: SupabaseService, useValue: mockSupabaseService }
      ]
    });
    service = TestBed.inject(ViewCountService);
  });

  it('should be created', () => expect(service).toBeTruthy());

  it('increment() should call rpc with type, id, and a session token', async () => {
    await service.increment('member', 'uuid-1');
    expect(mockRpc).toHaveBeenCalledOnceWith('increment_view', {
      p_type: 'member',
      p_id: 'uuid-1',
      p_session_token: jasmine.any(String)
    });
  });

  it('increment() should reuse the same session token across calls', async () => {
    await service.increment('member', 'uuid-1');
    localStorage.removeItem('viewed_member_uuid-1'); // clear cooldown so second call goes through
    await service.increment('group', 'uuid-2');

    const calls = mockRpc.calls.all();
    expect(calls.length).toBe(2);
    const token1 = calls[0].args[1].p_session_token;
    const token2 = calls[1].args[1].p_session_token;
    expect(token1).toBe(token2);
  });

  it('increment() should persist session token in localStorage', async () => {
    await service.increment('member', 'uuid-1');
    const stored = localStorage.getItem('view_session_token');
    expect(stored).toBeTruthy();
    expect(stored).toMatch(/^[0-9a-f-]{36}$/); // UUID format
  });

  it('increment() should not call rpc when entity is on cooldown', async () => {
    await service.increment('member', 'uuid-1');
    mockRpc.calls.reset();

    // Second call within cooldown window should be skipped
    await service.increment('member', 'uuid-1');
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('increment() should call rpc again after cooldown expires', async () => {
    // Simulate an old timestamp (15 minutes ago)
    localStorage.setItem('viewed_member_uuid-1', String(Date.now() - 15 * 60 * 1000));

    await service.increment('member', 'uuid-1');
    expect(mockRpc).toHaveBeenCalledOnceWith('increment_view', jasmine.objectContaining({
      p_type: 'member',
      p_id: 'uuid-1'
    }));
  });

  it('increment() should mark entity as viewed in localStorage after rpc call', async () => {
    await service.increment('group', 'uuid-2');
    const raw = localStorage.getItem('viewed_group_uuid-2');
    expect(raw).toBeTruthy();
    expect(Number(raw)).toBeCloseTo(Date.now(), -3); // within ~1 second
  });

  it('increment() should resolve when rpc returns an error object', async () => {
    mockRpc.and.returnValue(Promise.resolve({ error: { message: 'fail' } }));
    await expectAsync(service.increment('group', 'uuid-2')).toBeResolved();
  });

  it('increment() should reject when rpc rejects (network error)', async () => {
    mockRpc.and.returnValue(Promise.reject(new Error('network error')));
    await expectAsync(service.increment('group', 'uuid-3')).toBeRejected();
  });
});
```

- [ ] **Step 2: Run the tests and confirm they pass**

```bash
npx ng test --watch=false --browsers=ChromeHeadless 2>&1 | tail -30
```

Expected output includes:
```
ViewCountService
  ✓ should be created
  ✓ increment() should call rpc with type, id, and a session token
  ✓ increment() should reuse the same session token across calls
  ✓ increment() should persist session token in localStorage
  ✓ increment() should not call rpc when entity is on cooldown
  ✓ increment() should call rpc again after cooldown expires
  ✓ increment() should mark entity as viewed in localStorage after rpc call
  ✓ increment() should resolve when rpc returns an error object
  ✓ increment() should reject when rpc rejects (network error)
```

All 9 tests should pass. If any fail, read the error carefully — the most common issue will be `localStorage` not being cleared between tests (check `beforeEach` has `localStorage.clear()`).

- [ ] **Step 3: Commit**

```bash
git add src/app/core/view-count.service.ts src/app/core/view-count.service.spec.ts
git commit -m "feat: add localStorage cooldown and session token to ViewCountService"
```

---

## Task 4: Manual end-to-end verification

No automated E2E tests exist for this project, so verify manually in the browser.

- [ ] **Step 1: Run the dev server**

```bash
npm start
```

- [ ] **Step 2: Open DevTools → Application → Local Storage**

Navigate to a member detail page (e.g., `/member/<some-id>`).

Expected:
- `view_session_token` key appears with a UUID value
- `viewed_member_<id>` key appears with a timestamp number

- [ ] **Step 3: Reload the page and confirm no duplicate API call**

In DevTools → Network, filter by `rpc`. Reload the page.

Expected: no `increment_view` request fires on the reload (within 10 minutes of first visit).

- [ ] **Step 4: Verify DB-level cooldown in Supabase Dashboard**

In Supabase Dashboard → Table Editor → `view_session_log`:
- One row should exist for the member you visited
- `viewed_at` should match the time of your first visit

Reload the member page multiple times. The `viewed_at` timestamp in the DB should not change (frontend cooldown blocks the RPC call), and `page_views.view_count` for that member should not increase.

- [ ] **Step 5: Verify cooldown reset after clearing localStorage**

In DevTools → Application → Local Storage, delete `viewed_member_<id>` and `view_session_token`. Reload the page.

Expected:
- A new `increment_view` RPC call fires (visible in Network tab)
- A new `view_session_token` is generated
- `page_views.view_count` increments by 1 in the DB

---

## Done

Both layers are now active:
- **Frontend**: 10-minute localStorage cooldown prevents redundant API calls
- **Backend**: `view_session_log` table enforces 10-minute per-session cooldown at the DB level
