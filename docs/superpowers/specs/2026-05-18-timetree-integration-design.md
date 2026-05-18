# TimeTree 整合設計文件

**日期**：2026-05-18
**狀態**：已確認，待實作

> **注意**：TimeTree 官方 Connect App/API 已於 2023-12-22 終止。
> 本整合使用 TimeTree web frontend 所呼叫的非官方公開 endpoint，無需 API key。
> 該 endpoint 為非文件化介面，可能隨 TimeTree 改版無預警失效；已設計 fallback 至 Google Calendar。

---

## 概述

部分台灣地下偶像團體有官方 TimeTree 公開行事曆，資料最為準確。
本功能將 TimeTree 公開行事曆 URL 作為團體資料欄位，並在顯示近期活動時優先使用 TimeTree 資料，無 TimeTree 才 fallback 至 Google Calendar。

---

## 使用者情境

- 管理員或社群貢獻者填寫團體的 TimeTree 公開行事曆連結
- 訪客在團體頁或成員頁看到的近期活動，有 TimeTree 的團體直接顯示 TimeTree 資料
- 訪客在 SNS 連結區可點擊 TimeTree 連結前往官方行事曆頁面

---

## 第一段：資料模型

### Supabase `groups` 資料表

```sql
ALTER TABLE groups ADD COLUMN timetree_url text;
```

存整串 URL，例如：`https://timetreeapp.com/public_calendars/pure_maker/`

### `Group` interface（`src/app/models/index.ts`）

```ts
timetree_url: string | null;
```

### Alias 解析（code 層）

```ts
// "https://timetreeapp.com/public_calendars/pure_maker/" → "pure_maker"
const alias = new URL(group.timetree_url).pathname.split('/').filter(Boolean).pop();
```

### Proposal 系統

`timetree_url` 納入可提案欄位，遵循現有 group 欄位的 proposal 模式。

### Admin 後台

group 編輯介面新增 `timetree_url` 輸入欄。

---

## 第二段：Cloudflare Pages Function（Web Endpoint 代理）

### 新增檔案

`functions/api/timetree-events.ts`

Cloudflare Pages Functions 依檔案路徑自動路由，`functions/api/timetree-events.ts` 對應 `/api/timetree-events`，不需要額外 redirect 設定。使用現有 `onRequest: PagesFunction` 模式（與 `functions/sitemap.xml.ts` 相同）。

### 請求格式

```
GET /api/timetree-events?alias=pure_maker&days=90
```

### TimeTree Web Endpoint 呼叫

TimeTree web frontend 使用的非官方 endpoint（無需 API key）：

```
GET https://timetreeapp.com/api/v2/public_calendars/{alias}/public_events
    ?from={todayStartTW}
    &to={todayStartTW + days * 86400000}
    &utc_offset=480
    &limit=100
X-TimeTreeA: web/2.1.0/en
```

- `from` / `to`：Unix 毫秒時間戳
- `from` 使用台灣時區（UTC+8）**當天 00:00**，避免漏掉今天的全天活動：
  ```ts
  const utcOffsetMs = 8 * 60 * 60 * 1000;
  const todayStartTW = Math.floor((Date.now() + utcOffsetMs) / 86400000) * 86400000 - utcOffsetMs;
  ```
- `utc_offset`：480 = UTC+8（台灣）
- 不需要 `Authorization` header

### 環境變數

不需要。此 endpoint 為公開無鑑權存取。

### Response 結構（TimeTree 回傳）

```json
{
  "paging": { "next": true, "next_cursor": "xxx" },
  "public_events": [
    {
      "id": "...",
      "title": "SSr Vol.68 DAY3",
      "note": "時間：開場9:30  開演10:00...",
      "location_name": "MOONDOG",
      "all_day": true,
      "start_at": 1780185600000,
      "end_at": 1780185600000,
      "url": "https://timetr.ee/p/pure_maker/..."
    }
  ]
}
```

**`all_day` 注意事項**：很多活動雖有實際開演時間，但 `all_day: true`，時間資訊寫在 `note` 裡。
第一版只顯示日期，不解析 note 中的時間；note 解析留待後續版本。

### 分頁處理

TimeTree 每頁最多 100 筆，`paging.next === true` 時有 `next_cursor`。Function 需跟隨 cursor 直到 `paging.next === false`，安全上限 5 頁（500 筆），超過即停止並回傳已收集的結果。

```ts
let cursor: string | undefined;
let page = 0;
const MAX_PAGES = 5;
const allEvents: TimeTreeEvent[] = [];

do {
  const params = new URLSearchParams({ from: ..., to: ..., utc_offset: '480', limit: '100' });
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`...?${params}`, { headers: { 'X-TimeTreeA': 'web/2.1.0/en' } });
  const data = await res.json();
  allEvents.push(...data.public_events);
  cursor = data.paging.next ? data.paging.next_cursor : undefined;
  page++;
} while (cursor && page < MAX_PAGES);
```

### 回傳格式

`public_events[]` 轉換成 `VenueCalendarEvent` 結構：

| TimeTree 欄位 | VenueCalendarEvent 欄位 | 備註 |
|---|---|---|
| `id` | `id` | |
| `title` | `title` | |
| `start_at`（ms → ISO string）| `start` | |
| `end_at` | `end` | all_day 且 `end_at === start_at` → `null`；all_day 且 `end_at > start_at` → `end_at + 1ms` 轉 ISO（exclusive end，對齊 Google Calendar 慣例）；非 all_day → 直接轉 ISO |
| `all_day` | `isAllDay` | |
| `location_name` | `location` | 空字串轉 `null` |
| `url` | `url` | |

前端不需感知資料來源差異。

### Server-side Cache

In-memory cache，key 為 `{alias}:{days}`，TTL 30 分鐘，減少對 TimeTree 的請求頻率。

### 錯誤處理

| 狀況 | 回傳 | 前端行為 |
|------|------|----------|
| TimeTree 404（alias 不存在）| 200 + 空陣列 | 正常顯示無活動 |
| TimeTree 429（rate limit）| 503 | fallback 到 Google Calendar |
| TimeTree endpoint 改版失效 | 503 | fallback 到 Google Calendar |
| 其他錯誤 | 503 | fallback 到 Google Calendar |

---

## 第三段：前端事件來源優先邏輯

### 新增 `TimeTreeService`

`src/app/core/timetree.service.ts`

```ts
getUpcomingEvents(alias: string, daysAhead = 90): Promise<VenueCalendarEvent[]>
```

- 呼叫 `/api/timetree-events?alias={alias}&days={daysAhead}`
- 前端 cache key：`timetree:{alias}:{daysAhead}`
- Cloudflare Pages Function 回傳 503 時 throw，由 caller 決定 fallback

### `GroupEventsComponent` 修改

優先邏輯（每個 group 各自判斷）：

```
if group.timetree_url:
    從 TimeTreeService 取得活動
    成功 → 使用 TimeTree 結果，標記來源為 "TimeTree"
    失敗 → silent fallback 到 GoogleCalendarService，標記來源為 "Google Calendar"
else:
    使用 GoogleCalendarService（現有邏輯不變），標記來源為 "Google Calendar"
```

### 來源 Badge

活動區塊標題旁顯示小 badge 標示資料來源（`TimeTree` 或 `Google Calendar`）。
TimeTree 失敗並 fallback 時，顯示 `Google Calendar` badge，不揭露失敗細節。

### 成員頁面

成員頁透過 `GroupEventsComponent` 的 `groups` input 傳入，每個 group 各自走上述邏輯，無額外修改。

---

## 第四段：UI

### SNS 連結區

團體頁 SNS 連結區新增 TimeTree 連結：
- 圖示：TimeTree 官方 SVG logo
- 行為：有值才顯示，`target="_blank"` 開新分頁
- 與現有 instagram、x、youtube 連結一致

### URL 驗證

儲存前（proposal 表單與 admin 後台）驗證格式，必須是 `https://timetreeapp.com/public_calendars/` 開頭，否則顯示錯誤提示。

### Proposal / Admin 表單

| 欄位 | placeholder |
|------|-------------|
| `timetree_url` | `https://timetreeapp.com/public_calendars/...` |

---

## 實作順序建議

1. DB migration（新增 `timetree_url` 欄位）
2. `Group` interface 更新
3. Cloudflare Pages Function `functions/api/timetree-events.ts`
4. `TimeTreeService`
5. `GroupEventsComponent` 優先邏輯 + 來源 badge
6. 團體頁 SNS 連結區新增 TimeTree
7. Proposal 表單 + Admin 後台新增欄位
8. URL 驗證邏輯

---

## 前置條件

無需申請任何 API key 或開發者帳號。

## 風險與監控

- **Endpoint 失效風險**：`/api/v2/public_calendars/{alias}/public_events` 為非文件化介面，TimeTree 改版時可能無預警失效。失效時所有 TimeTree 團體自動 fallback 至 Google Calendar，功能不中斷。
- **監控建議**：Cloudflare Pages Function 錯誤率異常升高時，檢查 TimeTree endpoint 是否仍有效。
