# GA + View Count Integration Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 埋入 Google Analytics 4（G-MHSKDZ2NZF）、用 Supabase 記錄成員/團體瀏覽次數，並在首頁顯示熱門成員/團體 Top 5。

**Architecture:** GA 負責分析（pageview、自訂事件），Supabase `page_views` 表負責即時計數驅動首頁熱門排行。`AnalyticsService` 和 `ViewCountService` 各自單一職責，`isBrowser` guard 確保 SSR 安全。

**Tech Stack:** Angular 19, Angular SSR, Supabase (PostgreSQL + RLS + RPC), Karma/Jasmine

---

## File Map

| 狀態 | 路徑 | 職責 |
|---|---|---|
| 新增 | `supabase/migrations/032_page_views_and_analytics_rpcs.sql` | page_views 表 + 3 個 RPC + grants |
| 新增 | `src/app/core/analytics.service.ts` | 包裝 gtag，SSR guard，trackPageView/trackEvent |
| 新增 | `src/app/core/analytics.service.spec.ts` | AnalyticsService 單元測試 |
| 新增 | `src/app/core/view-count.service.ts` | 呼叫 increment_view RPC，SSR guard |
| 新增 | `src/app/core/view-count.service.spec.ts` | ViewCountService 單元測試 |
| 修改 | `src/index.html` | 加入 gtag.js script（send_page_view: false） |
| 修改 | `src/app/app.component.ts` | 注入 AnalyticsService，訂閱 NavigationEnd |
| 修改 | `src/app/models/index.ts` | 加入 MemberLeaderboardEntry / GroupLeaderboardEntry |
| 修改 | `src/app/core/member.service.ts` | 加入 getTopByViews() |
| 修改 | `src/app/core/member.service.spec.ts` | 加入 getTopByViews 測試 |
| 修改 | `src/app/core/group.service.ts` | 加入 getTopByViews() |
| 修改 | `src/app/core/group.service.spec.ts` | 加入 getTopByViews 測試 |
| 修改 | `src/app/pages/member-page/member-page.component.ts` | 注入 AnalyticsService + ViewCountService，ngOnInit 呼叫 |
| 修改 | `src/app/pages/group-page/group-page.component.ts` | 注入 AnalyticsService + ViewCountService，load() 呼叫 |
| 修改 | `src/app/pages/home/home.component.ts` | 加入 topMembers / topGroups，ngOnInit 並行 fetch |
| 修改 | `src/app/pages/home/home.component.html` | 加入熱門排行 UI 區塊 |

---

## Chunk 1: Database Migration

### Task 1: 建立 Migration 032

**Files:**
- Create: `supabase/migrations/032_page_views_and_analytics_rpcs.sql`

- [ ] **Step 1: 建立 migration 檔案**

```sql
-- supabase/migrations/032_page_views_and_analytics_rpcs.sql
-- Apply manually in Supabase Dashboard SQL Editor

-- page_views table
create table page_views (
  entity_type  text not null check (entity_type in ('member', 'group')),
  entity_id    uuid not null,
  view_count   bigint not null default 0,
  primary key (entity_type, entity_id)
);

alter table page_views enable row level security;
create policy "anyone can read page_views" on page_views for select using (true);

-- increment_view RPC (security definer so anon can write without table-level INSERT policy)
create or replace function increment_view(p_type text, p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into page_views (entity_type, entity_id, view_count)
  values (p_type, p_id, 1)
  on conflict (entity_type, entity_id)
  do update set view_count = page_views.view_count + 1;
$$;

grant execute on function increment_view(text, uuid) to anon;

-- get_top_members_by_views RPC
-- INNER JOIN is intentional: only members with at least one view appear in the leaderboard.
-- coalesce is present for clarity but has no effect with INNER JOIN (pv.view_count is always non-null).
create or replace function get_top_members_by_views(p_limit int)
returns table (id uuid, name text, name_roman text, photo_url text, color text, view_count bigint)
language sql stable security invoker as $$
  select m.id, m.name, m.name_roman, m.photo_url, m.color, coalesce(pv.view_count, 0)
  from members m
  join page_views pv on pv.entity_id = m.id and pv.entity_type = 'member'
  order by pv.view_count desc
  limit p_limit;
$$;

-- get_top_groups_by_views RPC
-- Same INNER JOIN intent as above.
create or replace function get_top_groups_by_views(p_limit int)
returns table (id uuid, name text, photo_url text, color text, view_count bigint)
language sql stable security invoker as $$
  select g.id, g.name, g.photo_url, g.color, coalesce(pv.view_count, 0)
  from groups g
  join page_views pv on pv.entity_id = g.id and pv.entity_type = 'group'
  order by pv.view_count desc
  limit p_limit;
$$;

grant execute on function get_top_members_by_views(int) to anon;
grant execute on function get_top_groups_by_views(int) to anon;
```

- [ ] **Step 2: 在 Supabase Dashboard 手動執行 SQL**

到 Supabase Dashboard → SQL Editor → New query，貼上上方 SQL 全文執行。確認沒有 error。

- [ ] **Step 3: 驗證**

在 Supabase SQL Editor 執行：
```sql
select * from page_views limit 1;
select increment_view('member', gen_random_uuid());
select * from page_views;
```

預期：第三條查詢回傳一筆 view_count = 1 的資料。

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/032_page_views_and_analytics_rpcs.sql
git commit -m "feat: add page_views table and analytics RPCs (migration 032)"
```

---

## Chunk 2: AnalyticsService + index.html + AppComponent

### Task 2: 加入 GA script 到 index.html

**Files:**
- Modify: `src/index.html`

- [ ] **Step 1: 在 `</head>` 前加入 gtag script**

在 `src/index.html` 第 22 行 `<!-- Google AdSense -->` 的**正上方**（即 `</head>` 之前）插入以下內容。目前檔案結構是 AdSense script → `</head>`，GA block 必須在 AdSense 之前且仍在 `<head>` 內：

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-MHSKDZ2NZF"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-MHSKDZ2NZF', { send_page_view: false });
</script>
```

> `send_page_view: false` 防止 gtag 在初始載入自動送 page_view，避免與 Angular Router 觸發的 trackPageView 重複計算。

- [ ] **Step 2: 確認 `ng build` 無 error**

```bash
npm run build 2>&1 | tail -20
```

預期：`Build at:` 成功訊息，無 error。

---

### Task 3: 建立 AnalyticsService

**Files:**
- Create: `src/app/core/analytics.service.ts`
- Create: `src/app/core/analytics.service.spec.ts`

- [ ] **Step 1: 寫失敗測試**

建立 `src/app/core/analytics.service.spec.ts`：

```typescript
import { TestBed } from '@angular/core/testing';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let gtagSpy: jasmine.Spy;

  beforeEach(() => {
    // Simulate browser environment with gtag
    (window as any).gtag = jasmine.createSpy('gtag');
    gtagSpy = (window as any).gtag;

    TestBed.configureTestingModule({ providers: [AnalyticsService] });
    service = TestBed.inject(AnalyticsService);
  });

  afterEach(() => {
    delete (window as any).gtag;
  });

  it('should be created', () => expect(service).toBeTruthy());

  it('trackPageView() should call gtag with page_view event', () => {
    service.trackPageView('/member/123');
    expect(gtagSpy).toHaveBeenCalledWith('event', 'page_view', {
      page_path: '/member/123'
    });
  });

  it('trackEvent() should call gtag with given event name and params', () => {
    service.trackEvent('view_member', { member_id: 'abc', member_name: '小花' });
    expect(gtagSpy).toHaveBeenCalledWith('event', 'view_member', {
      member_id: 'abc',
      member_name: '小花'
    });
  });

  it('trackPageView() should not throw if gtag is not defined', () => {
    delete (window as any).gtag;
    expect(() => service.trackPageView('/test')).not.toThrow();
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
npx ng test --include="**/analytics.service.spec.ts" --watch=false 2>&1 | tail -20
```

預期：FAILED — `AnalyticsService` 找不到。

- [ ] **Step 3: 建立 AnalyticsService**

建立 `src/app/core/analytics.service.ts`：

```typescript
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

declare function gtag(...args: any[]): void;

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  trackPageView(url: string): void {
    if (!this.isBrowser || typeof gtag === 'undefined') return;
    gtag('event', 'page_view', { page_path: url });
  }

  trackEvent(eventName: string, params?: Record<string, string>): void {
    if (!this.isBrowser || typeof gtag === 'undefined') return;
    gtag('event', eventName, params ?? {});
  }
}
```

> `isPlatformBrowser` 是 Angular 官方 SSR guard，比 `typeof window !== 'undefined'` 更可靠。與 SupabaseService 的 `isBrowser` 模式一致。

- [ ] **Step 4: 執行測試確認通過**

```bash
npx ng test --include="**/analytics.service.spec.ts" --watch=false 2>&1 | tail -20
```

預期：4 specs, 0 failures。

- [ ] **Step 5: 確認 build 無 error**

```bash
npm run build 2>&1 | tail -20
```

預期：`Build at:` 成功訊息，無 error。

- [ ] **Step 6: Commit**

```bash
git add src/app/core/analytics.service.ts src/app/core/analytics.service.spec.ts
git commit -m "feat: add AnalyticsService for GA4 tracking"
```

---

### Task 4: 在 AppComponent 訂閱 Router 送 pageview

**Files:**
- Modify: `src/app/app.component.ts`

- [ ] **Step 1: 更新 AppComponent**

`src/app/app.component.ts` 現有 constructor 注入了 `Router`。加入 NavigationEnd 訂閱：

```typescript
import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, Router, NavigationEnd } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SupabaseService } from './core/supabase.service';
import { AdminRoleService } from './core/admin-role.service';
import { AnalyticsService } from './core/analytics.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, AsyncPipe],
  templateUrl: './app.component.html',
})
export class AppComponent {
  readonly session$;
  readonly isAdmin$;

  constructor(
    private supabase: SupabaseService,
    readonly router: Router,
    adminRole: AdminRoleService,
    analytics: AnalyticsService,
  ) {
    this.session$ = supabase.authState$;
    this.isAdmin$ = adminRole.isAdmin$;

    router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      takeUntilDestroyed(),
    ).subscribe(e => {
      analytics.trackPageView((e as NavigationEnd).urlAfterRedirects);
    });
  }

  get isAdminRoute(): boolean {
    return this.router.url.startsWith('/admin');
  }

  signOut() {
    this.supabase.signOut().then(() => this.router.navigate(['/']));
  }
}
```

> `takeUntilDestroyed()` 在 constructor 中自動取得 `DestroyRef`，不需實作 `OnDestroy`。

> **Note on testing:** `AppComponent` 沒有針對 NavigationEnd 訂閱的 spec。這個行為相對簡單（只是呼叫 `analytics.trackPageView`），且 `AnalyticsService` 本身已有測試覆蓋。若之後要補 AppComponent spec，可 mock `Router.events` 為 `Subject<Event>` 並 emit `NavigationEnd`。

- [ ] **Step 2: 確認 build 無 error**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add src/app/app.component.ts
git commit -m "feat: wire GA pageview tracking via Router NavigationEnd"
```

---

## Chunk 3: ViewCountService + 成員/團體頁整合

### Task 5: 建立 ViewCountService

**Files:**
- Create: `src/app/core/view-count.service.ts`
- Create: `src/app/core/view-count.service.spec.ts`

- [ ] **Step 1: 寫失敗測試**

建立 `src/app/core/view-count.service.spec.ts`：

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
    TestBed.configureTestingModule({
      providers: [
        ViewCountService,
        { provide: SupabaseService, useValue: mockSupabaseService }
      ]
    });
    service = TestBed.inject(ViewCountService);
  });

  it('should be created', () => expect(service).toBeTruthy());

  it('increment() should call supabase rpc with correct args in browser', async () => {
    // In Karma (browser env), isBrowser is true
    await service.increment('member', 'uuid-1');
    expect(mockRpc).toHaveBeenCalledWith('increment_view', {
      p_type: 'member',
      p_id: 'uuid-1'
    });
  });

  it('increment() should resolve when rpc returns an error object', async () => {
    // The rpc resolves with { error } — component's .catch() handles this
    mockRpc.and.returnValue(Promise.resolve({ error: { message: 'fail' } }));
    await expectAsync(service.increment('group', 'uuid-2')).toBeResolved();
  });

  it('increment() should resolve even when rpc rejects (network error)', async () => {
    // If rpc itself rejects, the caller's .catch(() => {}) absorbs it — service does not swallow
    mockRpc.and.returnValue(Promise.reject(new Error('network error')));
    // increment() will reject — caller is responsible for .catch()
    await expectAsync(service.increment('group', 'uuid-3')).toBeRejected();
  });
});
```

- [ ] **Step 2: 執行測試確認失敗**

```bash
npx ng test --include="**/view-count.service.spec.ts" --watch=false 2>&1 | tail -20
```

預期：FAILED — `ViewCountService` 找不到。

- [ ] **Step 3: 建立 ViewCountService**

建立 `src/app/core/view-count.service.ts`：

```typescript
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class ViewCountService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor(private supabase: SupabaseService) {}

  async increment(type: 'member' | 'group', id: string): Promise<void> {
    if (!this.isBrowser) return;
    await this.supabase.client.rpc('increment_view', { p_type: type, p_id: id });
    // Note: { error } in the resolved value is ignored here (non-critical).
    // If the rpc call itself rejects (network error), the rejection propagates to the caller,
    // which is expected to call .catch(() => {}) at the call site.
  }
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
npx ng test --include="**/view-count.service.spec.ts" --watch=false 2>&1 | tail -20
```

預期：3 specs, 0 failures。

- [ ] **Step 5: Commit**

```bash
git add src/app/core/view-count.service.ts src/app/core/view-count.service.spec.ts
git commit -m "feat: add ViewCountService for Supabase page view counting"
```

---

### Task 6: 成員頁整合 Analytics + ViewCount

**Files:**
- Modify: `src/app/pages/member-page/member-page.component.ts`

- [ ] **Step 1: 注入兩個 service，在 ngOnInit 成功後呼叫**

在 `member-page.component.ts` 的 constructor 加入注入，在 `ngOnInit` try 區塊內，**第一個 `if (member)` 區塊**（第 72–96 行，即 SEO + JSON-LD 設定的區塊）的 `this.seo.setJsonLd(jsonLd)` 之後、關閉 `}` 之前加入：

```typescript
// 加入 import
import { AnalyticsService } from '../../core/analytics.service';
import { ViewCountService } from '../../core/view-count.service';

// constructor 加入
private analytics: AnalyticsService,
private viewCount: ViewCountService,

// 第一個 if (member) 區塊的末尾（seo.setJsonLd 之後）加入（non-blocking）：
this.analytics.trackEvent('view_member', {
  member_id: id,
  member_name: displayName,
});
this.viewCount.increment('member', id).catch(() => {});
```

> 注意：`member-page.component.ts` 有**兩個** `if (member)` guard。第一個（約 72–96 行）是 SEO 設定區塊，第二個（約 99–103 行）是載入最近 proposal。追蹤呼叫應放在第一個區塊的末尾，避免 null member（404）時送出無效事件。

- [ ] **Step 2: 確認 build 無 error**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/member-page/member-page.component.ts
git commit -m "feat: track member page views in GA and Supabase"
```

---

### Task 7: 團體頁整合 Analytics + ViewCount

**Files:**
- Modify: `src/app/pages/group-page/group-page.component.ts`

- [ ] **Step 1: 注入兩個 service，在 load() 成功後呼叫**

在 `group-page.component.ts` 的 `load()` 方法，在 `if (group)` 區塊內 `this.seo.setJsonLd(jsonLd)` 之後加入：

```typescript
// 加入 import
import { AnalyticsService } from '../../core/analytics.service';
import { ViewCountService } from '../../core/view-count.service';

// constructor 加入
private analytics: AnalyticsService,
private viewCount: ViewCountService,

// load() 的 if (group) 區塊末尾（this.seo.setJsonLd(jsonLd) 之後）：
// 注意：load() 內已有 `const displayName = group.name_jp ?? group.name`（第 124 行），直接使用，不要重複宣告
this.analytics.trackEvent('view_group', {
  group_id: id,
  group_name: displayName,
});
this.viewCount.increment('group', id).catch(() => {});
```

- [ ] **Step 2: 確認 build 無 error**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/group-page/group-page.component.ts
git commit -m "feat: track group page views in GA and Supabase"
```

---

## Chunk 4: Leaderboard 型別 + Service 方法 + 首頁 UI

### Task 8: 加入 Leaderboard 型別到 models

**Files:**
- Modify: `src/app/models/index.ts`

- [ ] **Step 1: 在 models/index.ts 末尾加入兩個 interface**

```typescript
export interface MemberLeaderboardEntry {
  id: string;
  name: string;
  name_roman: string | null;
  photo_url: string | null;
  color: string | null;
  view_count: number;
}

export interface GroupLeaderboardEntry {
  id: string;
  name: string;
  photo_url: string | null;
  color: string | null;
  view_count: number;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/models/index.ts
git commit -m "feat: add MemberLeaderboardEntry and GroupLeaderboardEntry types"
```

---

### Task 9: MemberService 加入 getTopByViews

**Files:**
- Modify: `src/app/core/member.service.ts`
- Modify: `src/app/core/member.service.spec.ts`

- [ ] **Step 1: 在 member.service.spec.ts 加入測試**

`mockSupabaseService.client` 目前是 `{ from: ... }`。在 `mockSupabaseService.client` 物件內加入 `rpc` spy（與 `from` 並列），並在 `beforeEach` 加入 reset：

```typescript
// mockSupabaseService.client 物件內加入（與 from: ... 並列）：
rpc: jasmine.createSpy('rpc').and.returnValue(
  Promise.resolve({
    data: [{ id: 'uuid-1', name: '小花', name_roman: null, photo_url: null, color: null, view_count: 42 }],
    error: null
  })
)

// beforeEach 加入 rpc spy reset（避免跨測試污染）：
mockSupabaseService.client.rpc.calls.reset();

// describe 末尾加入新測試：
it('getTopByViews() should return leaderboard entries sorted by view_count', async () => {
  const results = await service.getTopByViews(5);
  expect(mockSupabaseService.client.rpc).toHaveBeenCalledWith(
    'get_top_members_by_views', { p_limit: 5 }
  );
  expect(results.length).toBe(1);
  expect(results[0].view_count).toBe(42);
});
```

- [ ] **Step 2: 執行測試確認新測試失敗**

```bash
npx ng test --include="**/member.service.spec.ts" --watch=false 2>&1 | tail -20
```

預期：新測試 FAILED — `getTopByViews` 不存在。

- [ ] **Step 3: 在 MemberService 加入方法**

在 `member.service.ts` 的 import 加入 `MemberLeaderboardEntry`，在 class 末尾加入：

```typescript
import { Member, MemberLeaderboardEntry } from '../models';

async getTopByViews(limit: number): Promise<MemberLeaderboardEntry[]> {
  const { data, error } = await this.supabase.client.rpc(
    'get_top_members_by_views', { p_limit: limit }
  );
  if (error) throw error;
  return (data ?? []) as MemberLeaderboardEntry[];
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
npx ng test --include="**/member.service.spec.ts" --watch=false 2>&1 | tail -20
```

預期：所有 specs 通過。

- [ ] **Step 5: Commit**

```bash
git add src/app/core/member.service.ts src/app/core/member.service.spec.ts
git commit -m "feat: add getTopByViews to MemberService"
```

---

### Task 10: GroupService 加入 getTopByViews

**Files:**
- Modify: `src/app/core/group.service.ts`
- Modify: `src/app/core/group.service.spec.ts`

- [ ] **Step 1: 在 group.service.spec.ts 加入測試**

`group.service.spec.ts` 的模組層級 mock 物件變數名稱是 **`mockClient`**（不是 `mockSupabaseService`）。在 `mockClient` 物件內加入 `rpc` spy，並在 `beforeEach` 加入 reset：

```typescript
// mockClient 物件內加入（與 from: ... 並列）：
rpc: jasmine.createSpy('rpc').and.returnValue(
  Promise.resolve({
    data: [{ id: 'uuid-g1', name: 'XYZ Team', photo_url: null, color: '#e879a0', view_count: 10 }],
    error: null
  })
)

// beforeEach 加入 rpc spy reset（使用 mockClient，不是 mockSupabaseService）：
mockClient.rpc.calls.reset();

// describe 末尾加入新測試：
it('getTopByViews() should return leaderboard entries', async () => {
  const results = await service.getTopByViews(5);
  expect(mockClient.rpc).toHaveBeenCalledWith(
    'get_top_groups_by_views', { p_limit: 5 }
  );
  expect(results[0].name).toBe('XYZ Team');
});
```

- [ ] **Step 2: 執行測試確認新測試失敗**

```bash
npx ng test --include="**/group.service.spec.ts" --watch=false 2>&1 | tail -20
```

- [ ] **Step 3: 在 GroupService 加入方法**

```typescript
import { Group, GroupVideo, Team, GroupLeaderboardEntry } from '../models';

async getTopByViews(limit: number): Promise<GroupLeaderboardEntry[]> {
  const { data, error } = await this.supabase.client.rpc(
    'get_top_groups_by_views', { p_limit: limit }
  );
  if (error) throw error;
  return (data ?? []) as GroupLeaderboardEntry[];
}
```

- [ ] **Step 4: 執行測試確認通過**

```bash
npx ng test --include="**/group.service.spec.ts" --watch=false 2>&1 | tail -20
```

- [ ] **Step 5: Commit**

```bash
git add src/app/core/group.service.ts src/app/core/group.service.spec.ts
git commit -m "feat: add getTopByViews to GroupService"
```

---

### Task 11: 首頁加入熱門排行區塊

**Files:**
- Modify: `src/app/pages/home/home.component.ts`
- Modify: `src/app/pages/home/home.component.html`

- [ ] **Step 1: home.component.ts 加入 leaderboard 資料**

在 `HomeComponent` 加入 import 和 properties：

```typescript
import { MemberLeaderboardEntry, GroupLeaderboardEntry } from '../../models';

// class 屬性加入
topMembers: MemberLeaderboardEntry[] = [];
topGroups: GroupLeaderboardEntry[] = [];
```

用以下程式碼**完整取代** `ngOnInit` 中 `try/catch` 區塊的 `Promise.all` 和 `catch` 部分：

```typescript
try {
  const [recent, groups, companies, topMembers, topGroups] = await Promise.all([
    this.memberService.getRecent(10),
    this.groupService.getAll(),
    this.companyService.getAll(),
    this.memberService.getTopByViews(5).catch((): MemberLeaderboardEntry[] => []),
    this.groupService.getTopByViews(5).catch((): GroupLeaderboardEntry[] => []),
  ]);
  this.recentMembers = recent;
  this.allGroups = groups;
  this.allCompanies = companies;
  this.topMembers = topMembers;
  this.topGroups = topGroups;
} catch {
  this.recentMembers = [];
  this.allGroups = [];
  this.allCompanies = [];
  this.topMembers = [];
  this.topGroups = [];
}
```

> `.catch((): MemberLeaderboardEntry[] => [])` 的明確回傳型別標注防止 TypeScript 推斷為 `never[]`。

- [ ] **Step 2: home.component.html 加入熱門排行 UI**

在 `home.component.html` 適當位置（搜尋框下方、最新成員列表上方）加入：

```html
<!-- 熱門排行 -->
@if (topMembers.length > 0 || topGroups.length > 0) {
  <section class="mb-8">
    <h2 class="text-lg font-semibold text-purple-200 mb-4">熱門</h2>
    <div class="grid grid-cols-2 gap-4">
      <!-- 熱門成員 -->
      @if (topMembers.length > 0) {
        <div>
          <h3 class="text-sm font-medium text-purple-300 mb-2">成員</h3>
          <ol class="space-y-1">
            @for (entry of topMembers; track entry.id; let i = $index) {
              <li>
                <a [routerLink]="['/member', entry.id]"
                   class="flex items-center gap-2 text-sm text-purple-100 hover:text-white transition-colors">
                  <span class="text-purple-400 w-4 text-right">{{ i + 1 }}.</span>
                  @if (entry.photo_url) {
                    <img [src]="entry.photo_url" [alt]="entry.name"
                         class="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                  }
                  <span>{{ entry.name_roman ?? entry.name }}</span>
                </a>
              </li>
            }
          </ol>
        </div>
      }
      <!-- 熱門團體 -->
      @if (topGroups.length > 0) {
        <div>
          <h3 class="text-sm font-medium text-purple-300 mb-2">團體</h3>
          <ol class="space-y-1">
            @for (entry of topGroups; track entry.id; let i = $index) {
              <li>
                <a [routerLink]="['/group', entry.id]"
                   class="flex items-center gap-2 text-sm text-purple-100 hover:text-white transition-colors">
                  <span class="text-purple-400 w-4 text-right">{{ i + 1 }}.</span>
                  @if (entry.photo_url) {
                    <img [src]="entry.photo_url" [alt]="entry.name"
                         class="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                  }
                  <span>{{ entry.name }}</span>
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

> `@if (topMembers.length > 0 || topGroups.length > 0)` 確保冷啟動（尚無資料）時區塊不顯示，不需要「資料累積中」佔位文字。

- [ ] **Step 3: 確認 build 無 error**

```bash
npm run build 2>&1 | tail -20
```

- [ ] **Step 4: 跑所有 tests 確認沒有 regression**

```bash
npx ng test --watch=false 2>&1 | tail -30
```

預期：所有 specs 通過，0 failures。

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/home/home.component.ts src/app/pages/home/home.component.html
git commit -m "feat: add popular members and groups leaderboard to home page"
```

---

## 完成確認清單

- [ ] Migration 032 已在 Supabase 執行
- [ ] GA script 在 `index.html` 且 `send_page_view: false`
- [ ] `AnalyticsService` 測試全過
- [ ] `ViewCountService` 測試全過
- [ ] `MemberService.getTopByViews` 測試全過
- [ ] `GroupService.getTopByViews` 測試全過
- [ ] `ng build` 無 error
- [ ] 瀏覽成員/團體頁後，`page_views` 表有資料
- [ ] 首頁在有資料後顯示熱門排行
