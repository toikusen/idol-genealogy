# 熱門/趨勢排行榜重新設計

## 背景

首頁「熱門成員」「熱門團體」目前用 `get_top_members_by_views` / 等價的 group RPC，依 `page_views.view_count`（全期累積總瀏覽數）排序。問題：累積數差距拉開後，排名長期不會變動，無法反映「最近大家在看誰」。

## 目標

1. 把首頁的「熱門」改成「近期熱度」（預設過去 7 天），讓排名隨時間自然更新。
2. 新增「上升最快」趨勢榜，反映瀏覽量正在快速成長的成員/團體。
3. 新增 `/leaderboard` 頁面，可看成員/團體各自的近期熱度 Top 10 與趨勢 Top 10。

不在範圍內：清除 `page_view_daily` 舊資料的排程（之後再做）、舊 `get_top_members_by_views` 累積榜的移除（保留供未來可能用途，僅不再被首頁呼叫）。

## 資料層

### 新表 `page_view_daily`

```sql
create table page_view_daily (
  entity_type text not null check (entity_type in ('member','group')),
  entity_id   uuid not null,
  view_date   date not null,
  view_count  int  not null default 0,
  primary key (entity_type, entity_id, view_date)
);
create index idx_page_view_daily_lookup on page_view_daily (entity_type, view_date);
```

### 修改 `increment_view` RPC

在既有寫入 `page_views` 的邏輯之後，加上：

```sql
insert into page_view_daily (entity_type, entity_id, view_date, view_count)
values (p_type, p_id, current_date, 1)
on conflict (entity_type, entity_id, view_date)
do update set view_count = page_view_daily.view_count + 1;
```

`view_session_log`（已存在，記錄 session_token / entity_type / entity_id / viewed_at，每個 session 對每個 entity 只保留最後一次瀏覽時間）不需改動，直接用於「近期熱度」查詢。

## RPC / 查詢層

### `get_recent_popular_members(p_limit int, p_window_days int default 7)`

```sql
select m.id, m.name, m.name_roman, m.photo_url, m.color,
       count(distinct vsl.session_token) as recent_views
from members m
join view_session_log vsl
  on vsl.entity_type = 'member'
  and vsl.entity_id = m.id
  and vsl.viewed_at >= now() - (p_window_days || ' days')::interval
group by m.id, m.name, m.name_roman, m.photo_url, m.color
order by recent_views desc
limit p_limit;
```

`get_recent_popular_groups` 為對應的 group 版本（entity_type = 'group'，join groups 表）。

### `get_trending_members(p_limit int)`

過去 7 天 vs 前 7 天的瀏覽量差值排序：

```sql
with recent as (
  select entity_id, sum(view_count) as v
  from page_view_daily
  where entity_type = 'member' and view_date >= current_date - 7
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
       coalesce(r.v, 0) as recent_views,
       coalesce(r.v, 0) - coalesce(p.v, 0) as trend_score
from members m
join recent r on r.entity_id = m.id
left join previous p on p.entity_id = m.id
order by trend_score desc
limit p_limit;
```

用差值（不用比例）避免「前 7 天 = 0」造成除零或新資料爆衝失真。`get_trending_groups` 為對應 group 版本。

### 既有 RPC

`get_top_members_by_views` / 對應 group RPC 維持不變，不再被首頁呼叫，保留供未來用途。

## 前端

### 首頁 (`home.component.ts/html`)

- `homePageResolver`（`page-data.resolvers.ts`）改呼叫 `get_recent_popular_members(5)` / `get_recent_popular_groups(5)`，取代現有 `getTopByViews(5)`。
- 「熱門排行」widget 旁加一個「查看更多」連結，導向 `/leaderboard`。

### 新路由 `/leaderboard`

- 新元件 `leaderboard.component.ts/html`，掛在 `app.routes.ts`。
- 頂部 tab 切換成員/團體（沿用首頁 `activeTab` 模式與樣式）。
- 每個 tab 內兩個區塊：
  - 「近期熱度 Top 10」→ 呼叫 `get_recent_popular_members(10)` / groups 版。
  - 「上升最快 Top 10」→ 呼叫 `get_trending_members(10)` / groups 版。
- 趨勢榜區塊上方顯示提示文字：「趨勢榜會在收集兩週資料後更準確」。

## 邊界情況

- 趨勢榜上線初期（< 14 天資料）：`previous` CTE 可能查不到資料，`coalesce(p.v, 0)` 確保不報錯，此時 `trend_score` 等同單純的近期瀏覽量，排序仍有意義但較弱。
- `page_view_daily` 會持續累積，無自動清除機制；舊資料清理排程列為後續事項，不在本次範圍。
- 確認除了 `home.component` 外，沒有其他地方呼叫 `get_top_members_by_views` / 對應 group RPC（先前調查確認唯一呼叫點是 home resolver）。

## 測試

- `member.service.spec.ts` / `group.service.spec.ts`：新增對 `getRecentPopular()` / `getTrending()` 方法的單元測試（mock RPC 回傳值，驗證呼叫參數與資料轉換）。
- `leaderboard.component.spec.ts`：驗證 tab 切換、四個區塊（成員近期/趨勢、團體近期/趨勢）資料正確渲染、loading/empty state。
- SQL 層（migration + RPC）無自動化測試，需手動在 Supabase SQL editor 驗證查詢邏輯（含趨勢榜在無前期資料時不報錯）。
