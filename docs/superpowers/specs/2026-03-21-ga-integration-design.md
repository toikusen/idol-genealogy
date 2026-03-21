# Google Analytics + View Count 整合設計

**日期**：2026-03-21
**追蹤 ID**：G-MHSKDZ2NZF
**專案**：台灣地下偶像族譜（Angular 19 + SSR + Supabase）

---

## 目標

1. 埋入 Google Analytics 4，追蹤頁面瀏覽與成員/團體被查看的事件
2. 用 Supabase 儲存成員/團體的瀏覽次數，作為即時熱門排行的資料來源
3. 在首頁顯示「熱門成員 Top 5」和「熱門團體 Top 5」

---

## 架構總覽

| 層 | 職責 |
|---|---|
| `src/index.html` | 加入 gtag.js script |
| `AnalyticsService` | 包裝 GA，處理 SSR guard，提供 trackPageView / trackEvent |
| `app.component.ts` | 監聽 Router NavigationEnd，呼叫 trackPageView |
| `member-page` / `group-page` | ngOnInit 成功後送 GA event + 呼叫 ViewCountService |
| `ViewCountService` | 呼叫 Supabase RPC 累加 view_count（non-blocking） |
| Migration 032 | 建立 page_views 表 + increment_view RPC |
| `MemberService` / `GroupService` | 新增 getTopByViews(limit) 方法 |
| `home.component` | 顯示熱門成員與熱門團體排行 |

---

## Section 1：Google Analytics 整合

### index.html

在 `<head>` 底部加入：

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

> `send_page_view: false`：防止初始頁面載入時 gtag 自動送出一次 `page_view`，避免與 Angular Router 觸發的 `trackPageView` 重複計算。

### AnalyticsService

位置：`src/app/core/analytics.service.ts`

- `providedIn: 'root'`，singleton
- `isBrowser` guard 防止 SSR 環境呼叫 `gtag`（與 SupabaseService 相同模式）
- `trackPageView(url: string)`：送 `page_view` event
- `trackEvent(eventName: string, params?: Record<string, string>)`：送自訂 event

### app.component.ts

在 `constructor` 注入 `Router`，使用 Angular 17+ 的 `takeUntilDestroyed()` 訂閱 `NavigationEnd` 事件，呼叫 `analytics.trackPageView(url)`。`takeUntilDestroyed()` 在 constructor 中呼叫時會自動從注入 context 取得 `DestroyRef`，不需要手動實作 `OnDestroy`。

```typescript
constructor(private router: Router, private analytics: AnalyticsService) {
  router.events.pipe(
    filter(e => e instanceof NavigationEnd),
    takeUntilDestroyed()
  ).subscribe(e => {
    analytics.trackPageView((e as NavigationEnd).urlAfterRedirects);
  });
}
```

### 成員/團體頁

在 `ngOnInit` 取得資料成功後（non-blocking）：

```typescript
// member-page
this.analytics.trackEvent('view_member', { member_id: id, member_name: displayName });

// group-page
this.analytics.trackEvent('view_group', { group_id: id, group_name: name });
```

---

## Section 2：Supabase View Count

### Migration 032

**page_views 表**（entity_type + entity_id 為複合主鍵）：

```sql
create table page_views (
  entity_type  text not null check (entity_type in ('member', 'group')),
  entity_id    uuid not null,
  view_count   bigint not null default 0,
  primary key (entity_type, entity_id)
);

-- 任何人都可讀（供首頁排行查詢）
alter table page_views enable row level security;
create policy "anyone can read page_views" on page_views for select using (true);
```

**increment_view RPC**（Security Definer，允許匿名呼叫）：

```sql
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

-- 必須明確授權 anon role 才能從瀏覽器端呼叫
grant execute on function increment_view(text, uuid) to anon;
```

### ViewCountService

位置：`src/app/core/view-count.service.ts`

- `increment(type: 'member' | 'group', id: string): Promise<void>`
  - **`isBrowser` guard 放在 `ViewCountService.increment` 內部**（不放在 component），確保 component 呼叫端保持簡潔，SSR 渲染時 `ngOnInit` 呼叫 `increment` 不會觸發 Supabase RPC
  - 呼叫 `supabase.rpc('increment_view', { p_type: type, p_id: id })`
  - 呼叫方 catch 吸掉錯誤，不影響頁面載入

---

## Section 3：首頁熱門排行

### 資料查詢

PostgREST 不支援 polymorphic JOIN（`page_views.entity_id` 沒有外鍵指向 members），改用兩個 Supabase RPC：

在 Migration 032 同時新增：

```sql
create or replace function get_top_members_by_views(p_limit int)
returns table (id uuid, name text, name_roman text, photo_url text, color text, view_count bigint)
language sql stable security invoker as $$
  select m.id, m.name, m.name_roman, m.photo_url, m.color, coalesce(pv.view_count, 0)
  from members m
  join page_views pv on pv.entity_id = m.id and pv.entity_type = 'member'
  order by pv.view_count desc
  limit p_limit;
$$;

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

兩個 RPC 的回傳欄位不等同於完整的 `Member` / `Group` interface，因此定義專屬的 leaderboard 型別，避免 TypeScript 編譯錯誤：

```typescript
// src/app/models/index.ts 或獨立檔案
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

在 `MemberService` 加入：
```typescript
getTopByViews(limit: number): Promise<MemberLeaderboardEntry[]>
// 呼叫 supabase.rpc('get_top_members_by_views', { p_limit: limit })
```

在 `GroupService` 加入：
```typescript
getTopByViews(limit: number): Promise<GroupLeaderboardEntry[]>
// 呼叫 supabase.rpc('get_top_groups_by_views', { p_limit: limit })
```

首頁 UI 只需要 `id`、`name`、`name_roman`、`photo_url`、`color` 欄位；`view_count` 僅用於排序，不在 UI 顯示。

### 首頁 UI

在 `home.component` 加入兩個並排卡片區塊：

```
┌──────────────────┐  ┌──────────────────┐
│  熱門成員 Top 5   │  │  熱門團體 Top 5   │
│  1. 小花          │  │  1. XYZ Team     │
│  2. 阿美          │  │  2. ABC Girls    │
│  3. ...          │  │  3. ...          │
└──────────────────┘  └──────────────────┘
```

- 點擊成員 → `/member/:id`
- 點擊團體 → `/group/:id`
- 資料在 server side 一起 fetch（SSR 友好，有利 SEO）
- 若 `page_views` 尚無資料（冷啟動），區塊隱藏或顯示「資料累積中」

---

## SSR 安全性

所有 browser-only 操作（gtag 呼叫、increment_view 呼叫）都加 `isBrowser` guard，確保 SSR 渲染不觸發 side effects。

---

## 不在範圍內

- 搜尋功能（熱門排行本次只顯示在首頁，搜尋頁為未來功能）
- GA 數據 API 回寫（熱門排行純用 Supabase，GA 只做分析後台用）
- 去重（同一使用者重複瀏覽會累計，MVP 階段不做 dedup）
