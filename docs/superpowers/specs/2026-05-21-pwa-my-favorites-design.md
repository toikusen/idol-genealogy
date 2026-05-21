# PWA + 我的最愛 設計文件

Date: 2026-05-21
Status: Approved

## 概覽

為 idol-genealogy 網站加入 PWA 支援（可安裝 + 推播通知），並新增「我的最愛」功能，讓登入使用者可追蹤最愛的團體和成員，在有新活動、新歌、或成員異動時收到推播通知。

## 技術選擇

- **PWA**：`@angular/pwa`（manifest + service worker），手動補 iOS meta tags
- **最愛資料**：Supabase DB（跨裝置同步）
- **推播**：Web Push API + VAPID + Supabase Edge Function
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

Push Notifications Layer
  VAPID key pair         → 公私鑰（私鑰存環境變數）
  push_subscriptions     → Supabase DB 儲存訂閱端點
  SW push handler        → service worker 接收並顯示通知
  Supabase Edge Function → 監聽 DB insert，對訂閱用戶發送 Web Push

Navigation
  未登入左下角           → 「登入」pill（Google OAuth）
  登入後左下角           → 「我的最愛」pill（原為「我的貢獻」）
  /my-contributions      → 保留路由，contributors 頁面加連結
```

## 資料庫 Schema

### `user_favorites`

| 欄位         | 型別        | 說明                        |
|--------------|-------------|-----------------------------|
| user_id      | uuid        | references auth.users       |
| entity_type  | text        | CHECK IN ('group', 'member')|
| entity_id    | uuid        | 對應 groups / members 的 id |
| created_at   | timestamptz | DEFAULT now()               |

- PRIMARY KEY: `(user_id, entity_type, entity_id)` — 防重複
- RLS: `auth.uid() = user_id`，只能讀寫自己的資料

### `push_subscriptions`

| 欄位       | 型別        | 說明                  |
|------------|-------------|----------------------|
| id         | uuid        | DEFAULT gen_random_uuid() PK |
| user_id    | uuid        | references auth.users |
| endpoint   | text        | 瀏覽器推播端點         |
| p256dh     | text        | 加密公鑰              |
| auth_key   | text        | 驗證金鑰              |
| created_at | timestamptz | DEFAULT now()         |

- UNIQUE: `(user_id, endpoint)` — 同一瀏覽器不重複訂閱
- RLS: `auth.uid() = user_id`

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

| Tab     | 頭像列         | Feed 內容          |
|---------|----------------|--------------------|
| 全部    | 所有追蹤       | 全部動態            |
| 團體    | 只顯示團體     | 只顯示團體相關動態  |
| 成員    | 只顯示成員     | 只顯示成員相關動態  |
| 通知設定 | 隱藏          | Push 開關（全域 + 各 entity）|

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

每則動態顯示：emoji icon + 團體/成員名稱 + 事件描述 + 時間 + 顏色標籤

| 事件類型 | 顏色標籤 | 觸發來源               |
|----------|----------|------------------------|
| 活動     | 粉色     | groups_events INSERT   |
| 新歌     | 藍色     | songs INSERT           |
| 成員     | 綠色     | members UPDATE         |
| 異動     | 紫色     | members 狀態欄位變更   |

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

### 觸發時機

- 最愛**團體**有新活動（活動掛在團體下，成員本身無獨立 events）
- 最愛**團體**有新歌
- 最愛**成員**有成員異動（加入 / 畢業 / 離隊）或成員資料更新

### 通知格式

```
標題：{team_name} 新增活動
內文：{event_name}
點擊：/group/:id 或 /member/:id
```

### Edge Function 流程

```
DB INSERT / UPDATE (songs / members)
  → Edge Function 觸發
  → 查 user_favorites，找追蹤此 entity 的 user_id
  → 查 push_subscriptions，取得端點
  → 用 web-push + VAPID 私鑰逐一送出
  → 失效端點從 DB 刪除
```

> **注意**：專案目前活動資料來自 Google Calendar / TimeTree 外部 API，無 Supabase DB INSERT 可直接監聽。活動推播的觸發機制需要在實作階段確認：選項為（a）改為定期 Edge Function cron job 輪詢外部 API 差異，或（b）活動新增時同步寫一份記錄到 Supabase。

### 推播訂閱流程（前端）

1. 使用者登入後，`/my-favorites` 通知設定 tab 顯示「開啟推播通知」
2. 點擊呼叫 `Notification.requestPermission()`
3. 取得 Permission 後用 VAPID 公鑰呼叫 `pushManager.subscribe()`
4. 訂閱物件（endpoint + keys）存入 `push_subscriptions`

### iOS 限制

Web Push 需要 iOS 16.4+ 且 PWA 已加到主畫面。通知設定頁面顯示提示說明。

## 導覽調整

### 未登入（左下角）

顯示「登入」pill，樣式與登入後 pill 一致（glass morphism），點擊導向 `/login`。

### 登入後（左下角）

將 `routerLink` 從 `/my-contributions` 改為 `/my-favorites`，顯示文字改為使用者名稱（連結到我的最愛）。

### `/my-contributions` 路由

保留路由，不刪除頁面。`contributors` 頁面加入「查看我的貢獻紀錄 →」連結。

## 開發順序建議

1. PWA manifest + iOS meta tags（可立即上線，獨立功能）
2. Supabase table migration + RLS
3. FavoritesService + favorite-toggle 元件
4. /my-favorites 頁面（tab + 頭像列 + feed）
5. Bottom sheet（新增最愛）
6. 導覽調整（未登入登入 pill + 已登入改連結）
7. VAPID key 生成 + push_subscriptions 訂閱流程
8. Supabase Edge Function（推播發送）
9. SW push handler（顯示通知）
