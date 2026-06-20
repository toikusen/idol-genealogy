# Recent-Heat & Trending Leaderboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the homepage's all-time cumulative view-count leaderboard with a recency-weighted "近期熱度" ranking, add a new "上升最快" trending ranking, and surface both on a new `/leaderboard` page.

**Architecture:** A new `page_view_daily` Postgres table rolls up daily view counts (written by an extended `increment_view` RPC). Four new read-only RPCs compute "near-term distinct visitors" (using the existing `view_session_log` table) and "7-day-over-7-day view delta" (using `page_view_daily`). Angular services wrap the RPCs; the homepage resolver and a new `/leaderboard` resolver/component consume them. No frontend state library changes — this codebase uses plain class properties with async/await, not signals or RxJS for this kind of data.

**Tech Stack:** Angular 19.2 (standalone components, `@if`/`@for` control flow), Supabase Postgres (plpgsql RPCs, RLS), Karma/Jasmine for tests.

**Spec:** `docs/superpowers/specs/2026-06-18-leaderboard-recent-trending-design.md`

---

## Important context gathered before writing this plan

- `increment_view`, `page_views`, and `view_session_log` already exist in the **live** Supabase database but are **not captured in any tracked migration file** — they predate this repo's migration history. This plan's migration (077) is the first tracked record of `increment_view`'s real definition, reconstructed from `pg_get_functiondef` output the user ran directly against production. Do not deviate from this exact reconstruction — any difference (parameter type, security context) risks creating a duplicate overloaded function or breaking the existing call site in `view-count.service.ts`.
- Confirmed live signature: `increment_view(p_type text, p_id uuid, p_session_token uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'`. Note `p_session_token` is `uuid`, not `text`.
- Confirmed live column types: `page_views.view_count` is `bigint`; `view_session_log` columns are `session_token uuid`, `entity_type text`, `entity_id uuid`, `viewed_at timestamptz`, all `not null`.
- `isPublicMemberRecord()` / `isPublicGroupRecord()` (`src/app/core/public-record.utils.ts:15-46`) only read `name`/`name_roman`/`nickname` (member) or `name`/`name_jp` (group) to filter out test accounts. They don't care about `view_count` or any other field, so the new leaderboard entry shapes (different field names) are safe to filter with the same utilities.
- This repo has no migration-apply automation visible in this plan's scope — apply migration 077 manually via the Supabase SQL editor, the same way prior schema drift happened. After applying, paste `pg_get_functiondef` output for `increment_view` back for confirmation before moving past Task 1.

---

### Task 1: Database migration — `page_view_daily` table, indexes, extended `increment_view`, and four new RPCs

**Files:**
- Create: `supabase/migrations/077_recent_heat_and_trending_leaderboard.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- Recent-heat and trending leaderboard support.
--
-- increment_view's body below is a verbatim reconstruction of the live
-- production function (confirmed via `select pg_get_functiondef(oid) from
-- pg_proc where proname = 'increment_view'` on 2026-06-18) plus one new
-- insert into page_view_daily. It was not previously tracked in any
-- migration file. Do not change p_session_token's type (uuid) or the
-- security/search_path settings — they must match production exactly.

create table page_view_daily (
  entity_type text not null check (entity_type in ('member','group')),
  entity_id   uuid not null,
  view_date   date not null,
  view_count  bigint not null default 0,
  primary key (entity_type, entity_id, view_date)
);

create index idx_page_view_daily_lookup on page_view_daily (entity_type, view_date);

alter table page_view_daily enable row level security;

create policy page_view_daily_no_direct_access on page_view_daily
  for all using (false) with check (false);

-- Supports get_recent_popular_members/groups: filters by entity_type +
-- viewed_at range, then counts distinct session_token per entity_id.
create index idx_view_session_log_recent
  on view_session_log (entity_type, viewed_at, entity_id);

create or replace function public.increment_view(p_type text, p_id uuid, p_session_token uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  -- Increment today's daily rollup, used by the trending leaderboard.
  insert into page_view_daily (entity_type, entity_id, view_date, view_count)
  values (p_type, p_id, current_date, 1)
  on conflict (entity_type, entity_id, view_date)
  do update set view_count = page_view_daily.view_count + 1;
end;
$function$;

create or replace function public.get_recent_popular_members(p_limit int default 10, p_window_days int default 7)
returns table (
  id uuid,
  name text,
  name_roman text,
  photo_url text,
  color text,
  recent_visitors bigint
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_window_days int := least(greatest(coalesce(p_window_days, 7), 1), 30);
begin
  return query
  select m.id, m.name, m.name_roman, m.photo_url, m.color,
         count(distinct vsl.session_token) as recent_visitors
  from members m
  join view_session_log vsl
    on vsl.entity_type = 'member'
    and vsl.entity_id = m.id
    and vsl.viewed_at >= now() - (v_window_days || ' days')::interval
  group by m.id, m.name, m.name_roman, m.photo_url, m.color
  order by recent_visitors desc
  limit v_limit;
end;
$function$;

create or replace function public.get_recent_popular_groups(p_limit int default 10, p_window_days int default 7)
returns table (
  id uuid,
  name text,
  photo_url text,
  color text,
  recent_visitors bigint
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_window_days int := least(greatest(coalesce(p_window_days, 7), 1), 30);
begin
  return query
  select g.id, g.name, g.photo_url, g.color,
         count(distinct vsl.session_token) as recent_visitors
  from groups g
  join view_session_log vsl
    on vsl.entity_type = 'group'
    and vsl.entity_id = g.id
    and vsl.viewed_at >= now() - (v_window_days || ' days')::interval
  group by g.id, g.name, g.photo_url, g.color
  order by recent_visitors desc
  limit v_limit;
end;
$function$;

create or replace function public.get_trending_members(p_limit int default 10)
returns table (
  id uuid,
  name text,
  name_roman text,
  photo_url text,
  color text,
  recent_view_count bigint,
  trend_delta bigint
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 50);
begin
  return query
  with recent as (
    select entity_id, sum(view_count) as v
    from page_view_daily
    where entity_type = 'member'
      and view_date >= current_date - 7
      and view_date <  current_date
    group by entity_id
  ),
  previous as (
    select entity_id, sum(view_count) as v
    from page_view_daily
    where entity_type = 'member'
      and view_date >= current_date - 14
      and view_date <  current_date - 7
    group by entity_id
  )
  select m.id, m.name, m.name_roman, m.photo_url, m.color,
         coalesce(r.v, 0) as recent_view_count,
         coalesce(r.v, 0) - coalesce(p.v, 0) as trend_delta
  from members m
  join recent r on r.entity_id = m.id
  left join previous p on p.entity_id = m.id
  order by trend_delta desc
  limit v_limit;
end;
$function$;

create or replace function public.get_trending_groups(p_limit int default 10)
returns table (
  id uuid,
  name text,
  photo_url text,
  color text,
  recent_view_count bigint,
  trend_delta bigint
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 50);
begin
  return query
  with recent as (
    select entity_id, sum(view_count) as v
    from page_view_daily
    where entity_type = 'group'
      and view_date >= current_date - 7
      and view_date <  current_date
    group by entity_id
  ),
  previous as (
    select entity_id, sum(view_count) as v
    from page_view_daily
    where entity_type = 'group'
      and view_date >= current_date - 14
      and view_date <  current_date - 7
    group by entity_id
  )
  select g.id, g.name, g.photo_url, g.color,
         coalesce(r.v, 0) as recent_view_count,
         coalesce(r.v, 0) - coalesce(p.v, 0) as trend_delta
  from groups g
  join recent r on r.entity_id = g.id
  left join previous p on p.entity_id = g.id
  order by trend_delta desc
  limit v_limit;
end;
$function$;

revoke all on function public.get_recent_popular_members(int, int) from public;
grant execute on function public.get_recent_popular_members(int, int) to anon, authenticated;

revoke all on function public.get_recent_popular_groups(int, int) from public;
grant execute on function public.get_recent_popular_groups(int, int) to anon, authenticated;

revoke all on function public.get_trending_members(int) from public;
grant execute on function public.get_trending_members(int) to anon, authenticated;

revoke all on function public.get_trending_groups(int) from public;
grant execute on function public.get_trending_groups(int) to anon, authenticated;
```

- [ ] **Step 2: Apply the migration manually in the Supabase SQL editor**

Paste the full file content into the Supabase project's SQL editor and run it. There is no CI-driven migration apply step for this repo (confirmed: prior schema, like the original `increment_view`, exists live without a tracked migration), so this is a manual, deliberate action against the production database.

- [ ] **Step 3: Verify `increment_view` still behaves identically**

Run in the SQL editor:

```sql
select pg_get_functiondef(oid) from pg_proc where proname = 'increment_view';
```

Expected: signature still `increment_view(p_type text, p_id uuid, p_session_token uuid) RETURNS void`, body now also contains the new `insert into page_view_daily ...` block. Confirm no second overloaded `increment_view` was created (only one row returned).

- [ ] **Step 4: Verify the new RPCs work and reject unauthenticated-but-too-large input safely**

```sql
select * from get_recent_popular_members(5, 7);
select * from get_trending_members(5);
select * from get_recent_popular_members(9999, 9999); -- should clamp, not error or return unlimited rows
```

Expected: first two return rows (or empty array if no data yet — not an error). Third returns at most 50 rows.

- [ ] **Step 5: Verify anon role can call the new RPCs but not read the underlying tables directly**

```sql
set role anon;
select * from get_recent_popular_members(5, 7); -- should succeed
select * from page_view_daily; -- should be denied or return 0 rows due to RLS
reset role;
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/077_recent_heat_and_trending_leaderboard.sql
git commit -m "$(cat <<'EOF'
✨ feat(db): add page_view_daily rollup and recent-heat/trending RPCs

Extends increment_view (reconstructed from production, previously
untracked in migrations) to also write a daily view rollup, and adds
four new RPCs backing the recency-weighted leaderboard: distinct-visitor
counts from view_session_log for "near-term heat", and 7-day-over-7-day
view deltas from page_view_daily for "trending".
EOF
)"
```

---

### Task 2: TypeScript models for the new leaderboard entry shapes

**Files:**
- Modify: `src/app/models/index.ts`

- [ ] **Step 1: Add the four new interfaces immediately after the existing `MemberLeaderboardEntry`/`GroupLeaderboardEntry` interfaces** (around line 186)

```typescript
export interface MemberRecentHeatEntry {
  id: string;
  name: string;
  name_roman: string | null;
  photo_url: string | null;
  color: string | null;
  recent_visitors: number;
}

export interface GroupRecentHeatEntry {
  id: string;
  name: string;
  photo_url: string | null;
  color: string | null;
  recent_visitors: number;
}

export interface MemberTrendingEntry {
  id: string;
  name: string;
  name_roman: string | null;
  photo_url: string | null;
  color: string | null;
  recent_view_count: number;
  trend_delta: number;
}

export interface GroupTrendingEntry {
  id: string;
  name: string;
  photo_url: string | null;
  color: string | null;
  recent_view_count: number;
  trend_delta: number;
}
```

`MemberLeaderboardEntry`/`GroupLeaderboardEntry` (the old `view_count`-based shape) stay untouched — `get_top_members_by_views`/`get_top_groups_by_views` still exist and are still typed by them, just no longer called from the homepage resolver after Task 5.

- [ ] **Step 2: Commit**

```bash
git add src/app/models/index.ts
git commit -m "feat(models): add recent-heat and trending leaderboard entry types"
```

---

### Task 3: `MemberService` — `getRecentPopular()` and `getTrending()`

**Files:**
- Modify: `src/app/core/member.service.ts:190` (right after the existing `getTopByViews` method)
- Test: `src/app/core/member.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/app/core/member.service.spec.ts` (follow the existing mock-client pattern already in that file — add a `rpc` spy if one doesn't already cover this, and reset it in `beforeEach` the same way `group.service.spec.ts` does):

```typescript
  it('getRecentPopular() should call get_recent_popular_members with clamped defaults', async () => {
    const results = await service.getRecentPopular(5);
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'get_recent_popular_members', { p_limit: 5, p_window_days: 7 }
    );
    expect(Array.isArray(results)).toBeTrue();
  });

  it('getRecentPopular() should pass a custom window when provided', async () => {
    await service.getRecentPopular(5, 30);
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'get_recent_popular_members', { p_limit: 5, p_window_days: 30 }
    );
  });

  it('getTrending() should call get_trending_members', async () => {
    const results = await service.getTrending(10);
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'get_trending_members', { p_limit: 10 }
    );
    expect(Array.isArray(results)).toBeTrue();
  });
```

Make sure the mock `rpc` spy in this spec file returns `{ data: [], error: null }` by default (or extend it per-test with `.and.returnValue(...)` if the existing mock is method-specific) — match whatever convention `member.service.spec.ts` already uses for `getTopByViews`'s test.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx ng test --include='src/app/core/member.service.spec.ts' --watch=false`
Expected: FAIL — `getRecentPopular is not a function` / `getTrending is not a function`.

- [ ] **Step 3: Implement the methods**

Add directly below `getTopByViews` in `src/app/core/member.service.ts`:

```typescript
  async getRecentPopular(limit: number, windowDays = 7): Promise<MemberRecentHeatEntry[]> {
    const { data, error } = await this.supabase.client.rpc(
      'get_recent_popular_members', { p_limit: limit, p_window_days: windowDays }
    );
    if (error) throw error;
    return (data ?? []) as MemberRecentHeatEntry[];
  }

  async getTrending(limit: number): Promise<MemberTrendingEntry[]> {
    const { data, error } = await this.supabase.client.rpc(
      'get_trending_members', { p_limit: limit }
    );
    if (error) throw error;
    return (data ?? []) as MemberTrendingEntry[];
  }
```

Add `MemberRecentHeatEntry, MemberTrendingEntry` to the existing import from `'../models'` at the top of the file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx ng test --include='src/app/core/member.service.spec.ts' --watch=false`
Expected: PASS, all `MemberService` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/member.service.ts src/app/core/member.service.spec.ts
git commit -m "feat(member): add getRecentPopular() and getTrending() RPC wrappers"
```

---

### Task 4: `GroupService` — `getRecentPopular()` and `getTrending()`

**Files:**
- Modify: `src/app/core/group.service.ts:165` (right after the existing `getTopByViews` method)
- Test: `src/app/core/group.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/app/core/group.service.spec.ts`, reusing the existing `mockClient.rpc` spy already defined in that file (it currently always resolves with one canned row regardless of which RPC name is passed — extend assertions to check the call args, the same way the existing `getTopByViews()` test does):

```typescript
  it('getRecentPopular() should call get_recent_popular_groups with clamped defaults', async () => {
    const results = await service.getRecentPopular(5);
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'get_recent_popular_groups', { p_limit: 5, p_window_days: 7 }
    );
    expect(results[0].name).toBe('XYZ Team');
  });

  it('getTrending() should call get_trending_groups', async () => {
    const results = await service.getTrending(10);
    expect(mockClient.rpc).toHaveBeenCalledWith(
      'get_trending_groups', { p_limit: 10 }
    );
    expect(results[0].name).toBe('XYZ Team');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx ng test --include='src/app/core/group.service.spec.ts' --watch=false`
Expected: FAIL — `getRecentPopular is not a function` / `getTrending is not a function`.

- [ ] **Step 3: Implement the methods**

Add directly below `getTopByViews` in `src/app/core/group.service.ts`:

```typescript
  async getRecentPopular(limit: number, windowDays = 7): Promise<GroupRecentHeatEntry[]> {
    const { data, error } = await this.supabase.client.rpc(
      'get_recent_popular_groups', { p_limit: limit, p_window_days: windowDays }
    );
    if (error) throw error;
    return (data ?? []) as GroupRecentHeatEntry[];
  }

  async getTrending(limit: number): Promise<GroupTrendingEntry[]> {
    const { data, error } = await this.supabase.client.rpc(
      'get_trending_groups', { p_limit: limit }
    );
    if (error) throw error;
    return (data ?? []) as GroupTrendingEntry[];
  }
```

Add `GroupRecentHeatEntry, GroupTrendingEntry` to the existing import from `'../models'` at the top of the file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx ng test --include='src/app/core/group.service.spec.ts' --watch=false`
Expected: PASS, all `GroupService` tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/group.service.ts src/app/core/group.service.spec.ts
git commit -m "feat(group): add getRecentPopular() and getTrending() RPC wrappers"
```

---

### Task 5: Homepage resolver — switch to recent-heat, add leaderboard resolver

**Files:**
- Modify: `src/app/core/page-data.resolvers.ts`

- [ ] **Step 1: Update `HomePageData` and `homePageResolver`**

Change the `HomePageData` interface (around line 29) — `topMembers`/`topGroups` change type from the old `view_count` shape to the new recent-heat shape:

```typescript
export interface HomePageData {
  recentMembers: Member[];
  memberCount: number;
  groupCount: number;
  companyCount: number;
  topMembers: MemberRecentHeatEntry[];
  topGroups: GroupRecentHeatEntry[];
  upcomingBirthdays: { member: Member; daysUntil: number }[];
}
```

Update the import line that currently imports `MemberLeaderboardEntry, GroupLeaderboardEntry` to also import `MemberRecentHeatEntry, GroupRecentHeatEntry`.

In `homePageResolver` (around line 223), replace the two `getTopByViews` calls:

```typescript
    memberService.getRecentPopular(5).catch(() => [] as MemberRecentHeatEntry[]),
    groupService.getRecentPopular(5).catch(() => [] as GroupRecentHeatEntry[]),
```

(Same position in the `Promise.all` array — only the method name and fallback type change. The rest of the destructuring, filtering with `isPublicMemberRecord`/`isPublicGroupRecord`, and the return object stay exactly as they are.)

- [ ] **Step 2: Add `LeaderboardPageData` interface and `leaderboardPageResolver`**

Add near the bottom of the file, following the same `inject()` + `Promise.all` + `.catch()` pattern as `homePageResolver`:

```typescript
export interface LeaderboardPageData {
  recentMembers: MemberRecentHeatEntry[];
  trendingMembers: MemberTrendingEntry[];
  recentGroups: GroupRecentHeatEntry[];
  trendingGroups: GroupTrendingEntry[];
}

export const leaderboardPageResolver: ResolveFn<LeaderboardPageData> = async () => {
  const memberService = inject(MemberService);
  const groupService = inject(GroupService);

  const [recentMembers, trendingMembers, recentGroups, trendingGroups] = await Promise.all([
    memberService.getRecentPopular(10).catch(() => [] as MemberRecentHeatEntry[]),
    memberService.getTrending(10).catch(() => [] as MemberTrendingEntry[]),
    groupService.getRecentPopular(10).catch(() => [] as GroupRecentHeatEntry[]),
    groupService.getTrending(10).catch(() => [] as GroupTrendingEntry[]),
  ]);

  return {
    recentMembers: recentMembers.filter(isPublicMemberRecord),
    trendingMembers: trendingMembers.filter(isPublicMemberRecord),
    recentGroups: recentGroups.filter(isPublicGroupRecord),
    trendingGroups: trendingGroups.filter(isPublicGroupRecord),
  };
};
```

Add `MemberTrendingEntry, GroupTrendingEntry` to the model imports at the top of the file if not already added in Step 1.

- [ ] **Step 3: Update `home.component.spec.ts` mocks**

In `src/app/pages/home/home.component.spec.ts`, in both `emptyMemberService()` and `emptyGroupService()`, rename the `getTopByViews` spy key to `getRecentPopular`:

```typescript
  const emptyMemberService = () => ({
    getRecent: jasmine.createSpy().and.returnValue(Promise.resolve([])),
    getCount: jasmine.createSpy().and.returnValue(Promise.resolve(0)),
    getRecentPopular: jasmine.createSpy().and.returnValue(Promise.resolve([])),
    getUpcomingBirthdays: jasmine.createSpy().and.returnValue(Promise.resolve([])),
    getSoloMembers: jasmine.createSpy().and.returnValue(Promise.resolve([])),
    search: jasmine.createSpy().and.returnValue(Promise.resolve([])),
    searchByAlias: jasmine.createSpy().and.returnValue(Promise.resolve([])),
  });

  const emptyGroupService = () => ({
    getAll: jasmine.createSpy().and.returnValue(Promise.resolve([])),
    getRecentPopular: jasmine.createSpy().and.returnValue(Promise.resolve([])),
    search: jasmine.createSpy().and.returnValue(Promise.resolve([])),
  });
```

- [ ] **Step 4: Run home component tests to confirm nothing broke**

Run: `npx ng test --include='src/app/pages/home/home.component.spec.ts' --watch=false`
Expected: PASS (no test asserted on `getTopByViews` being called, so renaming the mock key is sufficient — `homePageResolver` itself isn't exercised by this spec file since `pageData` is injected directly via `ActivatedRoute` mock).

- [ ] **Step 5: Commit**

```bash
git add src/app/core/page-data.resolvers.ts src/app/pages/home/home.component.spec.ts
git commit -m "feat(home): switch homepage leaderboard to recent-heat, add leaderboard resolver"
```

---

### Task 6: Homepage UI — rename section, add "查看更多" link

**Files:**
- Modify: `src/app/pages/home/home.component.ts`
- Modify: `src/app/pages/home/home.component.html:423-472`

- [ ] **Step 1: Update the component's type imports and properties**

In `home.component.ts`, change the import of `MemberLeaderboardEntry, GroupLeaderboardEntry` to `MemberRecentHeatEntry, GroupRecentHeatEntry`, and update the property declarations (currently around line 71):

```typescript
  topMembers: MemberRecentHeatEntry[] = [];
  topGroups: GroupRecentHeatEntry[] = [];
```

The `ngOnInit` assignment (`this.topMembers = data.topMembers;` etc., around line 189) needs no change — it's just reading from `HomePageData`, whose type already changed in Task 5.

- [ ] **Step 2: Update the template**

Replace the section in `home.component.html` (lines 423-472):

```html
      <!-- 近期熱度 -->
      @if ((activeTab === 'members' || activeTab === 'groups') && (topMembers.length > 0 || topGroups.length > 0)) {
        <section aria-label="近期熱度" class="popular-section" style="margin-bottom: 2rem;">
          <div style="display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 0.75rem;">
            <span style="font-size: 0.75rem; color: var(--text-faint-45);">近 7 天</span>
            <a routerLink="/leaderboard" style="font-size: 0.8rem; color: var(--text-secondary); text-decoration: none;">查看更多 →</a>
          </div>
          <div class="popular-grid">
            <!-- 近期熱度：成員 -->
            @if (topMembers.length > 0) {
              <div>
                <h3 style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); letter-spacing: 0.12em; text-transform: uppercase; margin: 0 0 0.75rem;">近期熱度・成員</h3>
                <ol style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem;">
                  @for (entry of topMembers; track entry.id; let i = $index) {
                    <li>
                      <a [routerLink]="'/member/' + entry.id" class="popular-rank-link"
                         style="display: flex; align-items: center; gap: 0.5rem; text-decoration: none; color: var(--text-primary); font-size: 0.875rem;">
                        <span style="color: var(--text-faint-45); width: 1.2rem; text-align: right; flex-shrink: 0; font-size: 0.75rem;">{{ i + 1 }}.</span>
                        @if (entry.photo_url) {
                          <img loading="lazy"
                               [src]="entry.photo_url | supabaseImg:128" [alt]="entry.name" width="64" height="64"
                               class="popular-rank-img" style="border-radius: 50%; object-fit: cover; flex-shrink: 0;" />
                        }
                        <span class="popular-rank-name">{{ entry.name }}</span>
                      </a>
                    </li>
                  }
                </ol>
              </div>
            }
            <!-- 近期熱度：團體 -->
            @if (topGroups.length > 0) {
              <div>
                <h3 style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); letter-spacing: 0.12em; text-transform: uppercase; margin: 0 0 0.75rem;">近期熱度・團體</h3>
                <ol style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem;">
                  @for (entry of topGroups; track entry.id; let i = $index) {
                    <li>
                      <a [routerLink]="'/group/' + entry.id" class="popular-rank-link"
                         style="display: flex; align-items: center; gap: 0.5rem; text-decoration: none; color: var(--text-primary); font-size: 0.875rem;">
                        <span style="color: var(--text-faint-45); width: 1.2rem; text-align: right; flex-shrink: 0; font-size: 0.75rem;">{{ i + 1 }}.</span>
                        @if (entry.photo_url) {
                          <img loading="lazy"
                               [src]="entry.photo_url | supabaseImg:128" [alt]="entry.name" width="64" height="64"
                               class="popular-rank-img" style="border-radius: 50%; object-fit: cover; flex-shrink: 0;" />
                        }
                        <span class="popular-rank-name">{{ entry.name }}</span>
                      </a>
                    </li>
                  }
                </ol>
              </div>
            }
          </div>
        </section>
      }
```

(Only change from the original: section `aria-label`/heading text, the new header row with "近 7 天" + "查看更多" link, and the `h3` headings now say "近期熱度・成員" / "近期熱度・團體". Row markup, classes, and bindings are otherwise identical — `RouterLink` is already imported in this component per its `imports` array.)

- [ ] **Step 3: Run the home component test suite**

Run: `npx ng test --include='src/app/pages/home/home.component.spec.ts' --watch=false`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/home/home.component.ts src/app/pages/home/home.component.html
git commit -m "feat(home): rename leaderboard section to 近期熱度, link to /leaderboard"
```

---

### Task 7: `/leaderboard` route

**Files:**
- Modify: `src/app/app.routes.ts`

- [ ] **Step 1: Add the lazy resolver and route**

In `app.routes.ts`, add a new lazy resolver constant alongside the existing ones (after `companyPageResolver`):

```typescript
const leaderboardPageResolver = lazyResolver(() =>
  import('./core/page-data.resolvers').then(m => m.leaderboardPageResolver)
);
```

Add a new route entry to the `routes` array — place it near the other top-level public routes (e.g. right after the `member/:id` and `group/:id` entries, before `login`):

```typescript
  {
    path: 'leaderboard',
    resolve: { pageData: leaderboardPageResolver },
    loadComponent: () => import('./pages/leaderboard/leaderboard.component').then(m => m.LeaderboardComponent)
  },
```

- [ ] **Step 2: Commit**

```bash
git add src/app/app.routes.ts
git commit -m "feat(routes): add /leaderboard route"
```

(This task will fail to compile until Task 8 creates `LeaderboardComponent` — that's expected; Task 8 follows immediately and is part of the same logical change. If executing tasks with review checkpoints between each, treat Tasks 7 and 8 as landing together before the next test run.)

---

### Task 8: `LeaderboardComponent`

**Files:**
- Create: `src/app/pages/leaderboard/leaderboard.component.ts`
- Create: `src/app/pages/leaderboard/leaderboard.component.html`
- Create: `src/app/pages/leaderboard/leaderboard.component.css`
- Test: `src/app/pages/leaderboard/leaderboard.component.spec.ts`

- [ ] **Step 1: Write the failing component test**

```typescript
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { provideRouter } from '@angular/router';
import { LeaderboardComponent } from './leaderboard.component';
import { SeoService } from '../../core/seo.service';
import { LeaderboardPageData } from '../../core/page-data.resolvers';

function makePageData(overrides: Partial<LeaderboardPageData> = {}): LeaderboardPageData {
  return {
    recentMembers: [],
    trendingMembers: [],
    recentGroups: [],
    trendingGroups: [],
    ...overrides,
  };
}

async function setup(pageData: LeaderboardPageData = makePageData()) {
  await TestBed.configureTestingModule({
    imports: [LeaderboardComponent],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { data: { pageData } } },
      },
      { provide: SeoService, useValue: { setPage: jasmine.createSpy() } },
    ],
  }).compileComponents();
}

describe('LeaderboardComponent', () => {
  it('should be created', async () => {
    await setup();
    const fixture = TestBed.createComponent(LeaderboardComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('defaults to the members tab', async () => {
    await setup();
    const fixture = TestBed.createComponent(LeaderboardComponent);
    expect(fixture.componentInstance.activeTab).toBe('members');
  });

  it('switches to the groups tab', async () => {
    await setup();
    const fixture = TestBed.createComponent(LeaderboardComponent);
    fixture.componentInstance.setTab('groups');
    expect(fixture.componentInstance.activeTab).toBe('groups');
  });

  it('renders recent-heat member rows by rank order', async () => {
    await setup(makePageData({
      recentMembers: [
        { id: 'm1', name: 'Alice', name_roman: null, photo_url: null, color: null, recent_visitors: 42 },
        { id: 'm2', name: 'Bob', name_roman: null, photo_url: null, color: null, recent_visitors: 30 },
      ],
    }));
    const fixture = TestBed.createComponent(LeaderboardComponent);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Alice');
    expect(text).toContain('Bob');
  });

  it('renders a trend delta chip for trending member rows', async () => {
    await setup(makePageData({
      trendingMembers: [
        { id: 'm1', name: 'Alice', name_roman: null, photo_url: null, color: null, recent_view_count: 120, trend_delta: 87 },
      ],
    }));
    const fixture = TestBed.createComponent(LeaderboardComponent);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('+87');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx ng test --include='src/app/pages/leaderboard/leaderboard.component.spec.ts' --watch=false`
Expected: FAIL — module/file not found.

- [ ] **Step 3: Create the component class**

```typescript
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SupabaseImgPipe } from '../../core/supabase-img.pipe';
import { SeoService } from '../../core/seo.service';
import { LeaderboardPageData } from '../../core/page-data.resolvers';
import { MemberRecentHeatEntry, MemberTrendingEntry, GroupRecentHeatEntry, GroupTrendingEntry } from '../../models';

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [CommonModule, RouterLink, SupabaseImgPipe],
  templateUrl: './leaderboard.component.html',
  styleUrl: './leaderboard.component.css',
})
export class LeaderboardComponent implements OnInit {
  activeTab: 'members' | 'groups' = 'members';

  recentMembers: MemberRecentHeatEntry[] = [];
  trendingMembers: MemberTrendingEntry[] = [];
  recentGroups: GroupRecentHeatEntry[] = [];
  trendingGroups: GroupTrendingEntry[] = [];

  constructor(
    private route: ActivatedRoute,
    private seo: SeoService,
  ) {}

  ngOnInit(): void {
    const data = this.route.snapshot.data['pageData'] as LeaderboardPageData | undefined;
    if (data) {
      this.recentMembers = data.recentMembers;
      this.trendingMembers = data.trendingMembers;
      this.recentGroups = data.recentGroups;
      this.trendingGroups = data.trendingGroups;
    }
    this.seo.setPage(
      '排行榜 | Idol Maps',
      '查看近期熱度與上升最快的台灣地下偶像成員與團體排行。',
      '/leaderboard',
    );
  }

  setTab(tab: 'members' | 'groups'): void {
    this.activeTab = tab;
  }
}
```

(`SupabaseImgPipe`'s import path mirrors how `home.component.ts` imports it — confirm the exact path matches `home.component.ts`'s import statement when implementing; it's referenced there as `SupabaseImgPipe` in the `imports` array.)

- [ ] **Step 4: Create the template**

```html
<main style="max-width: 960px; margin: 0 auto; padding: 1.5rem 1rem 3rem;">
  <h1 style="font-size: 1.4rem; font-weight: 600; margin: 0 0 1rem;">排行榜</h1>

  <div role="tablist" style="display: flex; gap: 0.5rem; margin-bottom: 1.5rem; border-bottom: 1px solid var(--border-faint, #e5e5e5);">
    <button type="button" role="tab" [attr.aria-selected]="activeTab === 'members'"
            (click)="setTab('members')"
            [style.font-weight]="activeTab === 'members' ? 600 : 400"
            [style.color]="activeTab === 'members' ? 'var(--text-primary)' : 'var(--text-faint-45)'"
            style="padding: 0.5rem 0.25rem; background: none; border: none; cursor: pointer; font-size: 0.95rem;">
      成員
    </button>
    <button type="button" role="tab" [attr.aria-selected]="activeTab === 'groups'"
            (click)="setTab('groups')"
            [style.font-weight]="activeTab === 'groups' ? 600 : 400"
            [style.color]="activeTab === 'groups' ? 'var(--text-primary)' : 'var(--text-faint-45)'"
            style="padding: 0.5rem 0.25rem; background: none; border: none; cursor: pointer; font-size: 0.95rem;">
      團體
    </button>
  </div>

  <div style="display: grid; grid-template-columns: 1fr; gap: 2rem;" class="leaderboard-columns">
    <!-- 近期熱度 -->
    <section aria-label="近期熱度">
      <h2 style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); letter-spacing: 0.12em; text-transform: uppercase; margin: 0 0 0.25rem;">近期熱度 Top 10</h2>
      <p style="font-size: 0.75rem; color: var(--text-faint-45); margin: 0 0 0.75rem;">近 7 天</p>
      <ol style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem;">
        @if (activeTab === 'members') {
          @for (entry of recentMembers; track entry.id; let i = $index) {
            <li>
              <a [routerLink]="'/member/' + entry.id" class="popular-rank-link"
                 style="display: flex; align-items: center; gap: 0.6rem; text-decoration: none; color: var(--text-primary); font-size: 0.9rem;">
                <span [style.font-weight]="i < 3 ? 700 : 400"
                      [style.color]="i < 3 ? 'var(--accent-pink, #e879a0)' : 'var(--text-faint-45)'"
                      style="width: 1.4rem; text-align: right; flex-shrink: 0; font-size: 0.8rem;">{{ i + 1 }}.</span>
                @if (entry.photo_url) {
                  <img loading="lazy" [src]="entry.photo_url | supabaseImg:128" [alt]="entry.name" width="48" height="48"
                       style="border-radius: 50%; object-fit: cover; flex-shrink: 0;" />
                }
                <span>{{ entry.name }}</span>
              </a>
            </li>
          }
        } @else {
          @for (entry of recentGroups; track entry.id; let i = $index) {
            <li>
              <a [routerLink]="'/group/' + entry.id" class="popular-rank-link"
                 style="display: flex; align-items: center; gap: 0.6rem; text-decoration: none; color: var(--text-primary); font-size: 0.9rem;">
                <span [style.font-weight]="i < 3 ? 700 : 400"
                      [style.color]="i < 3 ? 'var(--accent-pink, #e879a0)' : 'var(--text-faint-45)'"
                      style="width: 1.4rem; text-align: right; flex-shrink: 0; font-size: 0.8rem;">{{ i + 1 }}.</span>
                @if (entry.photo_url) {
                  <img loading="lazy" [src]="entry.photo_url | supabaseImg:128" [alt]="entry.name" width="48" height="48"
                       style="border-radius: 50%; object-fit: cover; flex-shrink: 0;" />
                }
                <span>{{ entry.name }}</span>
              </a>
            </li>
          }
        }
      </ol>
    </section>

    <!-- 上升最快 -->
    <section aria-label="上升最快">
      <h2 style="font-size: 0.85rem; font-weight: 600; color: var(--text-secondary); letter-spacing: 0.12em; text-transform: uppercase; margin: 0 0 0.25rem;">上升最快 Top 10</h2>
      <p style="font-size: 0.75rem; color: var(--text-faint-45); margin: 0 0 0.75rem;">最近 7 個完整日 vs 前 7 日・資料持續累積中，兩週後會更穩定</p>
      <ol style="list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem;">
        @if (activeTab === 'members') {
          @for (entry of trendingMembers; track entry.id; let i = $index) {
            <li>
              <a [routerLink]="'/member/' + entry.id" class="popular-rank-link"
                 style="display: flex; align-items: center; gap: 0.6rem; text-decoration: none; color: var(--text-primary); font-size: 0.9rem;">
                <span [style.font-weight]="i < 3 ? 700 : 400"
                      [style.color]="i < 3 ? 'var(--accent-pink, #e879a0)' : 'var(--text-faint-45)'"
                      style="width: 1.4rem; text-align: right; flex-shrink: 0; font-size: 0.8rem;">{{ i + 1 }}.</span>
                @if (entry.photo_url) {
                  <img loading="lazy" [src]="entry.photo_url | supabaseImg:128" [alt]="entry.name" width="48" height="48"
                       style="border-radius: 50%; object-fit: cover; flex-shrink: 0;" />
                }
                <span style="flex: 1;">{{ entry.name }}</span>
                <span style="font-size: 0.75rem; color: var(--text-faint-45); background: var(--surface-muted, #f5f5f5); padding: 0.1rem 0.45rem; border-radius: 999px;">+{{ entry.trend_delta }}</span>
              </a>
            </li>
          }
        } @else {
          @for (entry of trendingGroups; track entry.id; let i = $index) {
            <li>
              <a [routerLink]="'/group/' + entry.id" class="popular-rank-link"
                 style="display: flex; align-items: center; gap: 0.6rem; text-decoration: none; color: var(--text-primary); font-size: 0.9rem;">
                <span [style.font-weight]="i < 3 ? 700 : 400"
                      [style.color]="i < 3 ? 'var(--accent-pink, #e879a0)' : 'var(--text-faint-45)'"
                      style="width: 1.4rem; text-align: right; flex-shrink: 0; font-size: 0.8rem;">{{ i + 1 }}.</span>
                @if (entry.photo_url) {
                  <img loading="lazy" [src]="entry.photo_url | supabaseImg:128" [alt]="entry.name" width="48" height="48"
                       style="border-radius: 50%; object-fit: cover; flex-shrink: 0;" />
                }
                <span style="flex: 1;">{{ entry.name }}</span>
                <span style="font-size: 0.75rem; color: var(--text-faint-45); background: var(--surface-muted, #f5f5f5); padding: 0.1rem 0.45rem; border-radius: 999px;">+{{ entry.trend_delta }}</span>
              </a>
            </li>
          }
        }
      </ol>
    </section>
  </div>
</main>
```

- [ ] **Step 5: Create the CSS file for the desktop two-column / mobile stacked layout**

```css
@media (min-width: 768px) {
  .leaderboard-columns {
    grid-template-columns: 1fr 1fr;
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx ng test --include='src/app/pages/leaderboard/leaderboard.component.spec.ts' --watch=false`
Expected: PASS.

- [ ] **Step 7: Run the full test suite to confirm no regressions**

Run: `npx ng test --watch=false`
Expected: PASS (all existing + new specs green).

- [ ] **Step 8: Commit**

```bash
git add src/app/pages/leaderboard/
git commit -m "feat(leaderboard): add /leaderboard page with recent-heat and trending tabs"
```

---

### Task 9: Manual verification

No automated test substitutes for actually looking at the page. Do this after Tasks 1-8 are merged and deployed (or run locally against a Supabase project where migration 077 has been applied):

- [ ] Run `npm start` (or this project's equivalent dev-server script), open the homepage. Confirm the leaderboard section now says "近期熱度" with "近 7 天" next to it, and a "查看更多 →" link.
- [ ] Click "查看更多", confirm `/leaderboard` loads, defaults to the 成員 tab, shows both "近期熱度 Top 10" and "上升最快 Top 10" columns side by side on desktop.
- [ ] Resize to a mobile width (or use device toolbar), confirm the two columns stack vertically.
- [ ] Click 團體 tab, confirm both columns switch to group data.
- [ ] If `page_view_daily` has fewer than ~14 days of data at this point, confirm the trending column doesn't error — it should just show scores equal to the recent-week total (per the spec's documented edge case), not a crash or empty state.
- [ ] Confirm clicking a row in either column navigates to the correct `/member/:id` or `/group/:id` page.

---

## Self-review notes

- **Spec coverage:** data layer (Task 1), RPC layer (Task 1), `MemberService`/`GroupService` (Tasks 3-4), homepage resolver + leaderboard resolver (Task 5), homepage UI rename + link (Task 6), `/leaderboard` route (Task 7), `/leaderboard` component with two-column/stacked layout, chip styling, top-3 accent, no podium (Task 8), manual QA covering the "< 14 days of data" edge case (Task 9). RLS/grant/clamp specifics from the spec are all in Task 1's migration body. The deferred 7/30-day toggle and `page_view_daily` cleanup cron are intentionally not tasks, matching the spec's explicit out-of-scope list.
- **Type consistency:** `getRecentPopular(limit, windowDays = 7)` and `getTrending(limit)` signatures are identical across `MemberService` (Task 3) and `GroupService` (Task 4), and match how they're called in `page-data.resolvers.ts` (Task 5) and `LeaderboardComponent` (Task 8). Field names (`recent_visitors`, `recent_view_count`, `trend_delta`) are consistent from the SQL `returns table` definitions (Task 1) through the TS interfaces (Task 2) through component template bindings (Task 8).
- **No placeholders:** all SQL, TypeScript, and HTML in this plan is complete, copy-pasteable code — nothing marked TBD or "similar to above".
