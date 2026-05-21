# PWA + 我的最愛 設計文件

Date: 2026-05-21
Status: Revised (incorporated Codex review 2026-05-21)

## 概覽

為 idol-genealogy 網站加入 PWA 支援（可安裝 + 推播通知），並新增「我的最愛」功能，讓登入使用者可追蹤最愛的團體和成員，在有新活動、新歌、或成員異動時收到推播通知。

## 技術選擇

- **PWA**：`@angular/pwa`（manifest + service worker），手動補 iOS meta tags
- **最愛資料**：Supabase DB（跨裝置同步）
- **推播**：Web Push API + VAPID + Supabase Edge Function
- **活動同步**：Scheduled Edge Function（cron 輪詢 Google Calendar / TimeTree）→ upsert `group_events`
- **快取策略**：App shell prefetch，Supabase API 不快取（資料永遠最新）

## 整體架構

```
PWA Layer
  manifest.webmanifest   → 可安裝 App 設定
  ngsw-worker.js         → @angular/pwa 產生的 Service Worker
  iOS meta tags          → index.html 補 apple-mobile-web-app-* meta

Favorites Layer
  user_favorites table   → Supabase DB
  FavoritesService       → Angular Signal 狀態管理（singleton）
  /my-favorites route    → 取代左下角 pill 的 /my-contributions 連結

Event Sync Layer（新增）
  Scheduled Edge Function（cron）
    → 定期抓 Google Calendar / TimeTree
    → 依 group 比對活動，upsert 到 group_events
    → 新增事件（notified_at IS NULL）→ 觸發 push 並寫 notified_at
  Feed 從 group_events 讀取（不再直接呼叫外部 API）

Push Notifications Layer
  VAPID key pair         → 公私鑰（私鑰存 Supabase secrets）
  push_subscriptions     → Supabase DB 儲存訂閱端點
  SW push handler        → service worker 接收並顯示通知
  觸發機制：
    活動推播  → Scheduled Edge Function（cron polling）
    新歌推播  → Database Webhook → Edge Function（group_songs / member_songs INSERT）
    成員異動  → Database Webhook → Edge Function（history INSERT OR UPDATE，status 欄位改變）

Navigation
  未登入左下角           → 「登入」pill（Google OAuth）
  登入後左下角           → 「我的最愛」pill（原為「我的貢獻」）
  /my-contributions      → 保留路由，contributors 頁面加連結
```

## 資料庫 Schema

### `group_events`（新增 — 外部活動快取表）

| 欄位             | 型別        | 說明                                        |
|------------------|-------------|---------------------------------------------|
| id               | uuid        | DEFAULT gen_random_uuid() PK                |
| group_id         | uuid        | references groups                           |
| source           | text        | CHECK IN ('google_calendar', 'timetree')    |
| source_event_id  | text        | 外部平台的原始 event ID                      |
| title            | text        | 活動標題                                    |
| starts_at        | timestamptz |                                             |
| ends_at          | timestamptz |                                             |
| location         | text        |                                             |
| url              | text        |                                             |
| content_hash     | text        | SHA-256(title + starts_at + location)，判斷內容是否變更 |
| first_seen_at    | timestamptz | DEFAULT now()                               |
| last_seen_at     | timestamptz | 每次 cron 同步時更新                         |
| notified_at      | timestamptz | NULL = 尚未推播；有值 = 已推播過             |

- UNIQUE: `(source, source_event_id, group_id)` — 防重複
- RLS: 公開可讀（feed 用途）；Edge Function service role 可寫

### `user_favorites`

| 欄位         | 型別        | 說明                        |
|--------------|-------------|-----------------------------|
| user_id      | uuid        | references auth.users       |
| entity_type  | text        | CHECK IN ('group', 'member')|
| entity_id    | uuid        | 對應 groups / members 的 id |
| created_at   | timestamptz | DEFAULT now()               |

- PRIMARY KEY: `(user_id, entity_type, entity_id)` — 防重複
- RLS: `auth.uid() = user_id`

### `push_subscriptions`

| 欄位       | 型別        | 說明                          |
|------------|-------------|-------------------------------|
| id         | uuid        | DEFAULT gen_random_uuid() PK  |
| user_id    | uuid        | references auth.users         |
| endpoint   | text        | 瀏覽器推播端點                 |
| p256dh     | text        | 加密公鑰                      |
| auth_key   | text        | 驗證金鑰                      |
| created_at | timestamptz | DEFAULT now()                 |

- UNIQUE: `(user_id, endpoint)` — 同一瀏覽器不重複訂閱
- RLS: `auth.uid() = user_id`

> **通知設定範圍（MVP）**：全域推播開/關，不做各 entity 的細粒度開關。如日後有需求，再新增 `favorite_notification_settings` 表。

## PWA 設定

### 安裝

```bash
ng add @angular/pwa
```

### iOS 補充（index.html）

```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="偶像家系圖">
<link rel="apple-touch-icon" href="icons/icon-180x180.png">
```

### SSR 相容（app.config.ts）

Service Worker 只在 browser 端啟用，用 `isPlatformBrowser` 判斷，避免 SSR 環境報錯。

### 快取策略（ngsw-config.json）

- App shell（HTML/JS/CSS）→ `prefetch`
- Supabase API → 不快取
- 靜態資源（icons、字型）→ `lazy`

## 「我的最愛」頁面（/my-favorites）

### 路由

需登入（authGuard），未登入導向 `/login`，登入後 redirect 回來。

### 元件結構

```
my-favorites/
  my-favorites.component.ts         ← 頁面主體，tab 狀態管理
  favorites-avatar-row.component.ts ← 頭像橫列（團體粉色 / 成員綠色）
  favorites-feed.component.ts       ← 動態 feed，依 tab filter
  favorites-add-sheet.component.ts  ← Bottom sheet（新增最愛）
  push-settings.component.ts        ← 通知設定 tab 內容

shared/
  favorite-toggle.component.ts      ← 可重用愛心按鈕
```

### Tab 行為

| Tab      | 頭像列         | 主要內容                              |
|----------|----------------|---------------------------------------|
| 全部     | 所有追蹤       | 全部動態                              |
| 團體     | 只顯示團體     | 只顯示團體相關動態                    |
| 成員     | 只顯示成員     | 只顯示成員相關動態                    |
| 通知設定 | 隱藏           | 全域推播開關 + 訂閱狀態 + iOS 提示    |

### 頭像橫列

- 粉色圓 = 團體；綠色圓 = 成員
- 最末尾有「＋」虛線圓，點擊開啟 Bottom sheet

### Bottom Sheet（新增最愛）

- 從底部滑出，背景加 overlay
- Tab：團體 / 成員
- 搜尋 input（client-side filter，不需額外 API call）
- 每列：頭像圓 + 名稱 + 所屬公司 + 愛心切換（實心 = 已追蹤）
- 往下滑或點 overlay 關閉

### Feed 動態

資料來源：`group_events`（活動）、`group_songs` / `member_songs`（新歌）、`history`（成員異動）

每則動態顯示：emoji icon + 團體/成員名稱 + 事件描述 + 時間 + 顏色標籤

| 事件類型 | 顏色標籤 | 資料來源                                        |
|----------|----------|-------------------------------------------------|
| 活動     | 粉色     | `group_events`（cron 同步後寫入）               |
| 新歌     | 藍色     | `group_songs` / `member_songs` INSERT           |
| 成員異動 | 紫色     | `history` INSERT OR UPDATE，status 欄位為 graduated / withdrawn / hiatus / active |

> **不監聽** `members.updated_at`，避免資料更新噪音觸發不必要推播。

### FavoritesService

- 登入後一次載入所有最愛，存 Angular Signal
- 所有元件共用同一份 Signal，狀態即時同步
- 寫入使用 optimistic update（先改 UI，背景寫 DB，失敗 rollback）

## 愛心按鈕（成員 / 團體頁）

### 使用

```html
<app-favorite-toggle
  entityType="group"
  [entityId]="group.id" />
```

### 行為

- `@if (isLoggedIn)` 才渲染，未登入完全不顯示
- 初始狀態從 `FavoritesService` Signal 讀取（零 API call）
- 點擊動畫：scale 1 → 1.3 → 1，顏色漸變
- 空心 ♡（淡灰）= 未追蹤；實心 ♥（粉色）= 已追蹤
- Optimistic update

### 加入位置

- `group-page.component`：hero 區右上角
- `member-page.component`：hero 區右上角
- members-list 等列表頁**不加**，避免介面雜亂

## 推播通知

### 觸發時機與機制

| 事件         | 觸發機制                                          | 條件                                          |
|--------------|---------------------------------------------------|-----------------------------------------------|
| 最愛團體新活動 | Scheduled Edge Function（cron）                 | `group_events.notified_at IS NULL`，新增後寫入 `notified_at` |
| 最愛團體新歌   | Database Webhook → Edge Function                | `group_songs` INSERT                          |
| 最愛成員新歌   | Database Webhook → Edge Function                | `member_songs` INSERT                         |
| 最愛成員狀態異動 | Database Webhook → Edge Function              | `history` INSERT OR UPDATE；INSERT: `status IN ('graduated','withdrawn','hiatus','active')`；UPDATE: `old.status IS DISTINCT FROM new.status AND new.status IN ('graduated','withdrawn','hiatus','active')` |

### 活動同步 Edge Function（cron）

```
定期執行（建議間隔：每 30 分鐘）
  → 抓 Google Calendar / TimeTree API
  → 依 group_id 比對，計算 content_hash
  → upsert 到 group_events（UNIQUE on source + source_event_id + group_id）
  → 查出 notified_at IS NULL 的新增事件
  → 查 user_favorites 找追蹤此 group 的 user_id
  → 查 push_subscriptions 取得端點
  → 用 web-push + VAPID 私鑰逐一送出
  → 寫入 notified_at，防止重複推播
  → 失效端點從 push_subscriptions 刪除
```

> **首次同步 backfill 防護**：功能上線時執行一次性 migration，將所有現有 `group_events` 的 `notified_at` 設為 `now()`。之後 cron 只推播 `first_seen_at >= 上線時間 AND notified_at IS NULL` 的新活動，避免把既有活動全部重推一遍。

### 新歌 / 成員異動 Edge Function（Database Webhook）

```
Database Webhook 觸發（group_songs / member_songs INSERT；history INSERT OR UPDATE）
  → 查 user_favorites 找追蹤此 entity 的 user_id
  → 查 push_subscriptions 取得端點
  → 用 web-push + VAPID 私鑰逐一送出
  → 失效端點從 push_subscriptions 刪除
```

### 通知格式

```
活動：標題「{group_name} 新增活動」/ 內文「{event_title}」/ 點擊 /group/:id
新歌：標題「{group_name} 新增歌曲」/ 內文「{song_title}」/ 點擊 /group/:id
成員：標題「{member_name} 狀態更新」/ 內文「{status}」/ 點擊 /member/:id
```

### 推播訂閱流程（前端）

1. 使用者登入後，通知設定 tab 顯示「開啟推播通知」按鈕
2. 點擊呼叫 `Notification.requestPermission()`
3. 取得 Permission 後用 VAPID 公鑰呼叫 `pushManager.subscribe()`
4. 訂閱物件（endpoint + keys）存入 `push_subscriptions`

### iOS 限制

Web Push 需要 iOS 16.4+ 且 PWA 已加到主畫面。通知設定 tab 顯示說明提示。

## 導覽調整

### 未登入（左下角）

顯示「登入」pill，樣式與登入後 pill 一致（glass morphism），點擊導向 `/login`。

### 登入後（左下角）

將 `routerLink` 從 `/my-contributions` 改為 `/my-favorites`，顯示文字保持使用者名稱。

### `/my-contributions` 路由

保留路由，不刪除頁面。`contributors` 頁面加入「查看我的貢獻紀錄 →」連結。

## 開發順序建議

1. PWA manifest + iOS meta tags（可立即上線，獨立功能）
2. Supabase migration：`group_events`、`user_favorites`、`push_subscriptions` + RLS
3. `FavoritesService` + `favorite-toggle` 元件
4. `/my-favorites` 頁面（tab + 頭像列 + feed，feed 先 mock 資料）
5. Bottom sheet（新增最愛）
6. 導覽調整（未登入登入 pill + 已登入改連結）
7. 活動同步 Scheduled Edge Function（cron polling → upsert group_events）
8. Feed 接 group_events 真實資料
9. VAPID key 生成 + push_subscriptions 訂閱流程
10. 活動推播（cron 同步時一併送 push）
11. 新歌 / 成員異動 Database Webhook → Edge Function
12. SW push handler（顯示通知 + 點擊導頁）
