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

-- RLS: 這張表只由 increment_view RPC（security definer）寫入，前台不會直接 insert/update。
alter table page_view_daily enable row level security;
create policy page_view_daily_no_direct_access on page_view_daily
  for all using (false) with check (false);
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

### 新增索引：`view_session_log`

近期熱度查詢會依 `entity_type` + `viewed_at` 範圍過濾、對 `entity_id` group by 後 count distinct session。資料量變大後若無索引，首頁 resolver 會全表掃描變慢。新增：

```sql
create index idx_view_session_log_recent
  on view_session_log (entity_type, viewed_at, entity_id);
```

(`entity_type` 在前因為查詢一定先過濾 type；`viewed_at` 第二支援範圍過濾；`entity_id` 放最後讓 group by 直接吃到索引序，避免額外排序。)

## RPC / 查詢層

兩個指標量尺不同，欄位命名與顯示文字要區分清楚：「近期熱度」算的是**去重訪客數**（distinct session），對外稱「近 7 天訪客」；「趨勢」算的是**原始瀏覽次數差值**（raw view_count delta），對外稱「較前 7 天 +N」。不要在 UI 上都顯示成「瀏覽數」。

### `get_recent_popular_members(p_limit int, p_window_days int default 7)`

```sql
select m.id, m.name, m.name_roman, m.photo_url, m.color,
       count(distinct vsl.session_token) as recent_visitors
from members m
join view_session_log vsl
  on vsl.entity_type = 'member'
  and vsl.entity_id = m.id
  and vsl.viewed_at >= now() - (p_window_days || ' days')::interval
group by m.id, m.name, m.name_roman, m.photo_url, m.color
order by recent_visitors desc
limit p_limit;
```

`get_recent_popular_groups` 為對應的 group 版本（entity_type = 'group'，join groups 表）。

### `get_trending_members(p_limit int)`

比較「最近 7 個完整日」與「再往前 7 個完整日」的瀏覽次數差值。明確排除今天（today 是進行中、未完結的一天，混進去會讓當天還在累積的數字失真），所以用 `current_date - 7 .. current_date - 1` 共 7 天，不是 `current_date - 7 .. current_date`（後者其實是 8 天）：

```sql
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
limit p_limit;
```

用差值（不用比例）避免「前 7 天 = 0」造成除零或新資料爆衝失真。`get_trending_groups` 為對應 group 版本。

### 既有 RPC

`get_top_members_by_views` / 對應 group RPC 維持不變，不再被首頁呼叫，保留供未來用途。

### 權限規格

這四個新 RPC（`get_recent_popular_members/groups`、`get_trending_members/groups`）都是前台公開呼叫的唯讀查詢，統一規格：

```sql
create or replace function get_recent_popular_members(p_limit int, p_window_days int default 7)
returns table (...)
language sql
security definer
set search_path = public
as $$ ... $$;

revoke all on function get_recent_popular_members(int, int) from public;
grant execute on function get_recent_popular_members(int, int) to anon, authenticated;
```

- `security definer`：因為要讀 `view_session_log` / `page_view_daily`，這兩張表本身啟用 RLS 且不開放前台直接 SELECT（同 `page_view_daily_no_direct_access` 政策，`view_session_log` 沿用既有政策），RPC 內部用 definer 權限繞過 RLS 讀取，但只回傳聚合後的排行資料，不洩漏個別 session_token。
- `set search_path = public`：避免 search_path injection。
- `grant execute ... to anon, authenticated`：明確開放給匿名與登入使用者呼叫（首頁與 `/leaderboard` 未登入也要看得到）；其餘權限預設 revoke。
- 其餘四個 RPC、以及 `increment_view` 的權限維持現狀寫法（即沿用既有專案慣例的 security definer + grant 模式，不重新發明）。

## 前端

視覺方向：維持現有首頁細線、輕量、資料庫感的氣質，不做競技/遊戲化排行榜（不做 podium、不做獎牌色塊）。

### 首頁 (`home.component.ts/html`)

- `homePageResolver`（`page-data.resolvers.ts`）改呼叫 `get_recent_popular_members(5)` / `get_recent_popular_groups(5)`，取代現有 `getTopByViews(5)`。
- 區塊標題從「熱門成員 / 熱門團體」改成「近期熱度」，旁邊加小字「近 7 天」。
- widget 旁加一個「查看更多」連結，導向 `/leaderboard`。

### 新路由 `/leaderboard`

- 新元件 `leaderboard.component.ts/html`，掛在 `app.routes.ts`。
- 頂部 tab 切換成員/團體（沿用首頁 `activeTab` 模式與樣式）。
- 桌機版面：兩欄並排，左「近期熱度 Top 10」、右「上升最快 Top 10」。手機版上下堆疊（近期熱度在上）。
- 每列維持現有樣式：小 avatar + 排名 + 名稱。
  - 近期熱度區塊：排名 + 名稱即可，不額外顯示數字（訪客數對一般使用者意義不大）。
  - 趨勢榜區塊：名稱右側加一個淡色 chip 顯示 `+N`（`trend_delta`），視覺上要淡、不要喧賓奪主。
  - Top 3：排名數字加重字重，可加一條細的粉色 accent（沿用網站既有 accent 色），不做 podium、不做獎牌圖示。
- 趨勢榜標題右側（或標題下方）放一行淡色說明文字：「資料持續累積中，兩週後會更穩定」——語氣是說明而非警告，不用驚嘆號或黃色警示樣式。

### 後續可選功能（不在本次範圍）

- 7 天 / 30 天時間窗 segmented control：讓使用者切換近期熱度與趨勢榜的統計區間。本次先固定 7 天上線，驗證概念後再評估是否需要。
- `page_view_daily` 舊資料清除排程（如保留 90 天）。

## 邊界情況

- 趨勢榜上線初期（< 14 天資料）：`previous` CTE 可能查不到資料，`coalesce(p.v, 0)` 確保不報錯，此時 `trend_delta` 等同單純的近期瀏覽次數，排序仍有意義但較弱。
- `page_view_daily` 會持續累積，無自動清除機制；舊資料清理排程列為後續事項，不在本次範圍（見上方「後續可選功能」）。
- 確認除了 `home.component` 外，沒有其他地方呼叫 `get_top_members_by_views` / 對應 group RPC（先前調查確認唯一呼叫點是 home resolver）。
- `recent_visitors`（distinct session 數）與 `trend_delta`（raw view_count 差值）量尺不同，前端顯示文字、API 回應欄位命名都要區分，不可混用「瀏覽數」一詞。

## 測試

- `member.service.spec.ts` / `group.service.spec.ts`：新增對 `getRecentPopular()` / `getTrending()` 方法的單元測試（mock RPC 回傳值，驗證呼叫參數與資料轉換）。
- `leaderboard.component.spec.ts`：驗證 tab 切換、四個區塊（成員近期/趨勢、團體近期/趨勢）資料正確渲染、loading/empty state。
- SQL 層（migration + RPC）無自動化測試，需手動在 Supabase SQL editor 驗證：
  - 趨勢榜在無前期資料時不報錯。
  - `anon` 角色可成功呼叫四個新 RPC（`grant execute ... to anon` 生效），但不能直接 `select * from page_view_daily` / `view_session_log`（RLS 擋下）。
  - `explain analyze` 確認近期熱度查詢有吃到 `idx_view_session_log_recent` 索引，而非全表掃描。
