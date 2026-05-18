# TimeTree 整合設計文件

**日期**：2026-05-18
**狀態**：已確認，待實作

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

### Token 解析（code 層）

```ts
// "https://timetreeapp.com/public_calendars/pure_maker/" → "pure_maker"
const token = new URL(group.timetree_url).pathname.split('/').filter(Boolean).pop();
```

### Proposal 系統

`timetree_url` 納入可提案欄位，遵循現有 group 欄位的 proposal 模式。

### Admin 後台

group 編輯介面新增 `timetree_url` 輸入欄。

---

## 第二段：Netlify Function（API 代理）

### 新增檔案

`netlify/functions/timetree-events.ts`

### 請求格式

```
GET /api/timetree-events?token=pure_maker&days=90
```

### TimeTree API 呼叫

```
GET https://timetreeapp.com/api/v1/public/calendars/{token}/upcoming_events
    ?timezone=Asia/Taipei
    &days={days}
Authorization: Bearer {TIMETREE_APPLICATION_TOKEN}
```

### 環境變數

`TIMETREE_APPLICATION_TOKEN`：加入 Netlify 環境變數，不進 repo。

### 回傳格式

統一轉換成 `VenueCalendarEvent` 結構，前端不需感知資料來源差異。

### Server-side Cache

In-memory cache，key 為 `{token}:{days}`，TTL 30 分鐘。

### 錯誤處理

| 狀況 | 回傳 | 前端行為 |
|------|------|----------|
| TimeTree 404（token 不存在）| 200 + 空陣列 | 正常顯示無活動 |
| TimeTree 429（rate limit）| 503 | fallback 到 Google Calendar |
| 其他錯誤 | 503 | fallback 到 Google Calendar |

---

## 第三段：前端事件來源優先邏輯

### 新增 `TimeTreeService`

`src/app/core/timetree.service.ts`

```ts
getUpcomingEvents(token: string, daysAhead = 90): Promise<VenueCalendarEvent[]>
```

- 呼叫 `/api/timetree-events?token={token}&days={daysAhead}`
- 前端 cache key：`timetree:{token}:{daysAhead}`
- Netlify Function 回傳 503 時 throw，由 caller 決定 fallback

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
3. Netlify Function `timetree-events.ts`
4. `TimeTreeService`
5. `GroupEventsComponent` 優先邏輯 + 來源 badge
6. 團體頁 SNS 連結區新增 TimeTree
7. Proposal 表單 + Admin 後台新增欄位
8. URL 驗證邏輯

---

## 前置條件

- 申請 TimeTree Developer Account，取得 Application Token
- 確認 TimeTree Public Calendar API 端點與參數（建議對照官方文件：https://developers.timetreeapp.com/docs/api/public-calendar）
- 將 `TIMETREE_APPLICATION_TOKEN` 加入 Netlify 環境變數
