# 場地頁 `/venue/:id` 設計文件

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **修訂 v2(2026-08-11):** 併入第一輪 codex 審查。P0 × 2、P1 × 8、P2 × 4 複驗屬實並修正。
>
> **修訂 v3(2026-08-11):** 併入第二輪 codex 回歸審查。累計 P0 × 2、P1 × 12、P2 × 8 全數複驗屬實並修正;三項採用比原建議更簡的解法,見 §11。preview 已用瀏覽器實測掃描 146 個文字節點,設計區塊零對比失敗。

**Goal:** 為 49 個場地各開一個可被索引的獨立網址,承接「台北 Live House 偶像演出」這類地區 + 場地類查詢,並把權重透過內部連結導回成員與團體頁。

**Architecture:** 沿用既有 `member/:id` 模式——route + resolver + standalone component + build-time prerender。場地本身來自 Supabase `venues`;近期場次來自既有 `GoogleCalendarService`,改為在 resolver 內取得,讓場次進入 prerender HTML,再由 nightly deploy(03:00 Asia/Taipei)每日更新。

**Tech Stack:** Angular 19 standalone components、`@angular/ssr` prerender、`SeoService`、`VenueMapComponent`(既有,需加 compact 模式)、Supabase JS v2、Jasmine/Karma、Cloudflare Pages。

**設計預覽:** `venue-page-preview.html`(repo 根目錄,可切深淺色)。

---

## 1. 背景

### 競品實測(2026-08-11)

`idolinfohub.com`,`<title>` 為「地下偶像資訊站 - Idol Info Hub」。分成活動列表 / 表演者 / 主辦單位 / 場地四區,活動有獨立網址 `/events/[slug]`。實測 `/events` 只列 6 筆,列表層沒有時間、場地、出演者。

**結論:對手有 URL 沒深度。**

### 本站現況(實測)

| 項目 | 狀態 |
|---|---|
| 場地資料 | Supabase `venues`,49 筆。**全部 49 筆 `phone` 為空、47 筆 `notes` 為空、0 筆 notes ≥ 80 字、0 筆缺座標、0 筆 `is_active = false`** |
| 公開場地頁 | **無**。場地只存在於首頁 JS 分頁,網址永遠是 `/` |
| 場次來源 A | `group_events` 821 筆(timetree)。標題多為「LIVE預定」、`location` 幾乎全空 → **無法對應場地,本頁不使用** |
| 場次來源 B | `GoogleCalendarService`,以 `matchesVenue()` 字串比對。**未來 90 天實測 93 場**,資料完整可用 |
| Prerender | `generate-routes.mjs` + nightly cron 已存在 |

---

## 2. 這一頁的任務

到場地頁的人只有兩個問題:**下一場什麼時候**、**我怎麼去**。其餘次要。

搜尋引擎的第三個任務:這頁要能獨立回答「某地區有哪些地下偶像場地」,所以同區域內部連結是必要區塊。

---

## 3. 阻擋事項(實作前必須先解掉)

### 3.1 Calendar API 在 Node 端會 403

`fetchUpcomingEvents()` 直接 `fetch(url)`,不帶任何 header。該 API key 設有 HTTP referrer 限制。以 production 設定實測:

```
無 Referer            → 403  "Requests from referer <empty> are blocked."
Referer: idolmaps.com → 200  93 events / 90 days
```

**採用解法:Node 端補 Referer header。** 不新增 server-only key——現行 key 已隨 browser bundle 公開,第二把 key 不會增加任何安全性,只增加設定面。

```ts
// google-calendar.service.ts
const init: RequestInit | undefined = this.isBrowser
  ? undefined                                  // 瀏覽器不允許手動設 Referer,原生會自動帶
  : { headers: { Referer: `${SITE_URL}/` } };  // prerender / Node 端
fetch(url, init)
```

失敗時**不可**靜默回傳 `[]`(見 §3.2)。build 不中斷,但要 `console.warn` 並讓狀態進到頁面。

### 3.2 失敗不能偽裝成「沒有資料」

**兩條獨立的失敗路徑,都不能被折疊成「空」或「不存在」:**

```ts
interface VenuePageData {
  id: string;
  venue: Venue | null;
  nearbyVenues: Venue[];
  events: VenueCalendarEvent[];
  error: boolean;                                    // Supabase 取得失敗(沿用 CompanyPageData 既有欄位慣例)
  calendarStatus: 'ok' | 'unconfigured' | 'error';   // 行事曆取得狀態
}
```

- `venue === null && !error` → 場地真的不存在 → 「找不到場地」+ noindex
- `error === true` → Supabase 暫時失敗 → 顯示重試訊息,**不可**輸出「找不到場地」,**也不可**輸出 noindex(暫時故障不該讓已索引的頁掉出索引)
- `calendarStatus` 三態見 §5

### 3.3 Cloudflare 路由整合

兩處遺漏,不補會出現 trailing-slash 往返 redirect 與新場地 404:

- `public/_redirects` 加 `/venue/:id  /venue/:id/  200`
- `functions/_middleware.ts:15` 的 `isDynamicEntityRoute` regex 改為 `/^\/(?:member|group|company|venue)\/[^/]+\/?$/`

**停業場地處理:全部場地(含 `is_active = false`)都進 prerender,但只有 active 進 sitemap。** 停業頁自身輸出 `noindex` meta。理由:數量固定且極少(目前 0 筆),prerender 成本可忽略,使用者仍能開啟舊連結,也不必為它寫 middleware 特例。§8.4 的 prerender 清單條件與此一致。

### 3.4 時區

`timeMin` 目前用 server local midnight。Cloudflare build 在 UTC,台北 UTC+8,查詢窗與日期分組都會錯位,SSR 與瀏覽器也會 hydration 不一致。

**全頁固定 `Asia/Taipei`:**

- 查詢窗:以台北當日 00:00 為 `timeMin`,+90 天為 `timeMax`
- API 加 `timeZone=Asia/Taipei` 參數
- 顯示與分組一律 `Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', … })`,不使用 `toLocaleDateString()` 的預設時區

### 3.5 Calendar 取量與重複請求

- `maxResults: 100`,但 90 天已有 **93 場**。改為 `250` 並跟進 `nextPageToken`(上限 5 頁,超過就 warn)
- `rawCache` 目前是 instance 欄位。prerender 每條 route 建立新 injector → 每條路由各打一次 API。**把 cache 移到 module scope**(檔案層級 `const rawCache = new Map()`)。瀏覽器端行為不變(service 本來就是 root singleton)

**但 module scope 不等於「整個 build 一次」。** 實測 `@angular/build@19.2.26`:`prerender.js:118` 用 `WorkerPool({ maxThreads: Math.min(routes, maxWorkers) })`,而 `environment-options.js:70` 的 `maxWorkers = min(4, max(availableParallelism() - 1, 1))`。每個 worker thread 有自己的 module registry,所以結果是**每個 worker 一次**,上限 4 次(可用 `NG_BUILD_MAX_WORKERS=1` 壓成 1 次,但會拖慢整個 prerender,不划算)。驗收條件因此寫成「呼叫次數 ≤ worker 數」,不是「= 1」。

---

## 4. 視覺設計

### 4.1 色彩 — 不引進新顏色,且對比達 WCAG AA

全部沿用 `src/styles.css` 既有 token。深色模式的 `--event-date-color`、`--section-event-muted` 都已存在,**本設計不需新增或修改任何全域 token**。

| 角色 | Token | 淺色對比 | 用途 |
|---|---|---:|---|
| 主要文字 | `--text-primary` | 14.9:1 | 場次標題、活動名、pill 文字 |
| 次要文字 | `--text-secondary` | 5.53:1 | 地址、按鈕文字、時間 |
| 標籤文字 | `--text-label` | 4.65:1 | 眉標、星期、月份前綴、副標、註記 |
| 連結 | `--text-link` | 4.69:1 | 主辦活動頁 |
| 日期 | `--event-date-color` | 4.75:1 | 下一場大字、rail 日期數字 |
| 場地主色 | `--idol-purple` | 3.74:1 | **僅用於圖示、邊框、底色,不承載文字** |

**三條硬規則:**

1. `--text-faint`(2.09:1)、`--text-faint-65`(2.73:1)不得用於本頁任何內容文字
2. **不得用 `opacity` 壓暗文字。** v1 的月份前綴用 `--event-date-color` + `opacity: 0.6`,實算 **2.37:1**。要更安靜就換 token(月份前綴改 `--text-label`),不要降透明度
3. **有底色的文字要以合成後的底色重算對比。** v1 的最近場次 pill 用 `--event-date-color` 疊在 `--section-event-muted` 上,實算 **3.85:1**;改用 `--text-primary`(12.23:1)。`--text-secondary` 在該底色上是 4.48:1,差 0.02 不採用

`--idol-purple` 3.74:1 未達小字 4.5:1,但作為圖形/邊界達到 3:1 門檻,因此:紫色留給圖釘、hover 邊框、chip 底色與按鈕邊框;按鈕與 chip 的**文字**改用 `--text-primary` / `--text-secondary`。

### 4.2 字體

沿用 `--font-sans`(JF Openhuninn)。個性來自**數字**而非字級:日期時間一律 `font-variant-numeric: tabular-nums`。

**最小字級 0.66rem**(約 10.5px);內容文字建議 ≥ 0.7rem。v1 的 0.62rem 已上調。

- rail 日期 `1.5rem` / 月份前綴 `0.78rem`
- 下一場大字 `2.1rem` weight 400
- H1 `clamp(1.75rem, 4vw, 2.4rem)` weight 400
- 眉標 `0.66rem` / `letter-spacing: 0.28em` / uppercase

### 4.3 版面

```
┌───────────────────────────────────────────────────────┐
│ 首頁 / 場地 / 杰克音樂 Jack's Studio                     │  breadcrumb
│ 北部 · LIVE HOUSE ───────────────────────               │  眉標 + 漸層 hairline
│                                                        │
│ 杰克音樂 Jack's Studio            ┌──────────────────┐  │  H1
│ [營業中] [Live House] [台北·萬華]  │ 下一場            │  │  chips
│ 📍 10862 臺北市萬華區昆明街 76 號   │ 08/15 週六        │  │  ← 簽名元素
│ [開啟地圖] [複製地址]              │ 19:00–21:00      │  │
│                                  │ 偶像小夜曲 vol.42  │  │
│                                  │ 主辦活動頁 ↗       │  │
│                                  └──────────────────┘  │
├───────────────────────────────────────────────────────┤
│ [ 地圖 — VenueMapComponent compact 模式 ]               │
├───────────────────────────────────────────────────────┤
│ 近期演出   未來 90 天 · 6 場                             │
│ 場次整理自公開行事曆,實際出演者與開演時間以主辦方公告為準。    │
│ ─────────────────────────────────────────────         │
│  08 15   19:00  偶像小夜曲 vol.42                 ↗     │  ← 簽名元素
│  [週六]                                                │     時刻表 rail
│ ─────────────────────────────────────────────         │
│  08 16   14:00  午後定期公演 #18                   ↗     │
│   週日   18:30  夏日對バン祭 DAY2                  ↗     │
│ ─────────────────────────────────────────────         │
├───────────────────────────────────────────────────────┤
│ 同區域場地                                              │
│ [📍狀態音樂    ] [📍PEPEROLL   ] [📍魔法劇場  ]           │  內部連結
├───────────────────────────────────────────────────────┤
│ 場地資料由社群貢獻者維護…  最後更新 2026-08-11             │
└───────────────────────────────────────────────────────┘
```

容器 `max-width: 880px`,與既有實體頁一致。

### 4.4 簽名元素

**A. 下一場卡(hero 右側)** — 這頁的 thesis 不是場地名,是下一場。獨立卡片、左緣 3px 磚紅漸層條、大字日期 + 星期 + 時間 + 活動名 + 主辦連結。沒有場次時整張卡不出現,hero 收成單欄。

**B. 時刻表 rail** — 左欄 68px:月份小字 + 日期大字 + 星期。右欄:同一天所有場次依時間排列。用 rail 是因為**順序帶有真實資訊**(時間先後),不是裝飾;因此不用 01/02/03 序號。同一天多場只出現一個日期區塊。最近一場的星期給 pill 填色。

### 4.5 明確不做

hero 大數字統計、漸層背景與光暈、序號標記、場地照片(`venues` 無此欄位)。

---

## 5. 狀態設計

`calendarStatus` 三態決定「近期演出」區塊:

| calendarStatus | events | 呈現 |
|---|---|---|
| `ok` | ≥ 1 | 完整版面:下一場卡 + rail |
| `ok` | `[]` | 下一場卡不出現;虛線框空狀態:「目前沒有登錄的場次。地下偶像的行程多半在演出前 2–4 週才公布,可以先看看同區域的其他場地。」+ 導向同區域按鈕 |
| `unconfigured` | — | **整個區塊不渲染**(不顯示 0 場,那會誤導) |
| `error` | — | 區塊渲染但顯示:「場次資訊暫時取得失敗,請重新整理頁面再試。」**不可**顯示成空狀態。文案不得指向「官方社群」——`Venue` model 沒有任何社群欄位,那是不存在的去處 |

其他狀態:

| 狀態 | 條件 | 呈現 |
|---|---|---|
| 已停業 | `is_active === false` | chip 顯示「已停業」;不顯示近期演出;`setRobotsNoIndex(true)` |
| 找不到場地 | `venue === null && !error` | 沿用 `company-page` 處理:「找不到場地 \| Idol Maps」+ noindex + 清 JSON-LD |
| 場地載入失敗 | `error === true` | 「場地資料暫時無法載入,請重新整理頁面再試。」**保持可索引**(不設 noindex),不得顯示成「找不到場地」 |

**49 個場地中多數平常是「無場次」,空狀態品質比主狀態更重要。**

條件式欄位(依實測資料,前兩項目前永遠不出現):

| 欄位 | 現況 | 規則 |
|---|---|---|
| `phone` | 49/49 為空 | 有值才出現撥號按鈕 |
| `notes` | 47/49 為空 | 有值才出現備註區塊 |
| `latitude`/`longitude` | 0 筆缺 | 缺座標時不渲染地圖,改顯示純文字地址 + 外部地圖連結 |
| `google_maps_url` | 部分有 | 有值用它,無值用 `https://www.google.com/maps/search/?api=1&query={encodeURIComponent(address)}` |

---

## 6. 響應式與無障礙

- 斷點 720px:hero `1fr 264px` → 單欄;rail 左欄 68px → 52px;日期 1.5rem → 1.25rem
- **所有互動目標 `min-height: 44px`**:`.btn`、場次列、主辦連結、同區域卡片。已在 preview 以 DOM 量測驗證(15 個目標全部 ≥ 44px)
- `prefers-reduced-motion: reduce` 關閉所有 transition
- `:focus-visible` 2px `--idol-purple` outline + 3px offset
- **地圖不可設 `aria-hidden`**——它是可鍵盤操作的互動元件。作法:`VenueMapComponent` 加 `@Input() compact = false`,只切換容器 class(高度 400/260px → 220/200px),其餘互動與 marker 全部保留;容器加 `role="application"` 與 `aria-label="{場地名} 位置地圖"`。地址在地圖上方已有純文字版本,不依賴地圖才能取得資訊
- **marker 必須有可存取名稱。** 容器的 `aria-label` 不夠:`venue-map.component.ts:148` 用 `divIcon` 建 marker,Leaflet 預設 `keyboard: true` 會產生可聚焦的 `role="button"` 元素,而目前建立時沒有 `title` 也沒有 `alt`,讀屏只會念出空按鈕。作法:`L.marker(latlng, { icon, title: venue.name, alt: `${venue.name} 地圖標記` })`,並在 `divIcon` 的 html 外層補 `aria-label`。**需加鍵盤走訪 + accessible name 測試**(Tab 到 marker 後斷言 `getAttribute('alt')` / accessible name 非空)
- breadcrumb 用 `<nav aria-label="麵包屑">`,近期演出 `<section>` + `<h2>`,同區域 `<nav aria-label="同區域場地">`
- 「複製地址」按下後按鈕文字暫時改為「已複製」(2 秒),並以 `aria-live="polite"` 播報

---

## 7. 文案

| 位置 | 文字 |
|---|---|
| 眉標 | `{北部/中部/南部} · {type}` |
| 營業狀態 chip | `營業中` / `已停業` |
| 下一場標題 | `下一場` |
| 時間行 | `19:00–21:00`(有 `end`)/ `19:00 開演`(無 `end`)/ `全日` |
| 主辦連結 | `主辦活動頁 ↗` |
| 動作按鈕 | `開啟地圖` / `複製地址` → `已複製` / 電話號碼本身(條件式) |
| 區塊標題 | `近期演出`,副標 `未來 90 天 · N 場` |
| 免責 | `場次整理自公開行事曆,實際出演者與開演時間以主辦方公告為準。` |
| 空狀態 | `目前沒有登錄的場次。地下偶像的行程多半在演出前 2–4 週才公布,可以先看看同區域的其他場地。` |
| 場次取得失敗 | `場次資訊暫時取得失敗,請重新整理頁面再試。` |
| 場地取得失敗 | `場地資料暫時無法載入,請重新整理頁面再試。` |
| 同區域 | `同區域場地` |
| 頁尾 | `場地資料由社群貢獻者維護,資訊有誤可透過「提議修改」回報。` + `最後更新 {updated_at}` |

**不要寫「開場」。** `VenueCalendarEvent.end` 是 Google Calendar 的活動**結束**時間,資料裡沒有 doors-open 欄位,寫「開場」是造假。

---

## 8. SEO 規格

### 8.1 Meta

```
title:       {name}｜{city}{type}演出行程 | Idol Maps
description: {name}（{city}{district}）的地址、地圖與近期演出行程。{calendarStatus==='ok' && 有場次 ? `下一場 ${MM/DD}。` : ''}
canonical:   https://idolmaps.com/venue/{id}
og:image:    預設 og-default.png（venues 無照片欄位）
```

### 8.2 地址解析

實測 49 筆的郵遞區號分布:**3 碼 × 44、5 碼 × 3、6 碼 × 1、無郵遞區號 × 1**(`台南市東區東門路一段13號1樓`),且「臺 / 台」兩種寫法並存。

```ts
// 郵遞區號 3/5/6 碼或無;縣市可能以臺或台開頭;行政區含區/鄉/鎮/縣轄市
const ADDRESS_RE = /^\s*(?<zip>\d{3}(?:\d{2,3})?)?\s*(?<city>(?:臺|台)?[^\s市縣]{1,3}[市縣])?\s*(?<district>[^\s]{1,4}[區鄉鎮市])?/u;
```

- `city` / `district` 皆可能為 `undefined`,title 與 description 需能在缺值時降級(只出 `{name}演出行程`)
- meta 文字統一把「臺」正規化為「台」;頁面正文維持資料原文
- **`city` 與 `district` 各自要有單元測試**,測資至少含上述四種郵遞區號型態與臺/台兩種寫法

### 8.3 JSON-LD

```jsonc
[
  {
    "@type": "MusicVenue",
    "name": "...",
    "url": "https://idolmaps.com/venue/{id}",
    "address": { "@type": "PostalAddress", "streetAddress": "...", "postalCode": "...", "addressCountry": "TW" },
    "geo": { "@type": "GeoCoordinates", "latitude": ..., "longitude": ... },
    "telephone": "...",            // 條件式
    "sameAs": ["google_maps_url"]  // 條件式
  },
  { "@type": "BreadcrumbList", ... }
]
```

**Event 結構化資料先不做。** 場次缺 `performer`、`offers`、`eventStatus`,不足以拿到 Event rich result;寧可不輸出也不要輸出殘缺標記。與 `knowledge-article.component.ts` 對 FAQPage 的處理原則一致。等場次能對應到出演團體後再補(見 §12)。

### 8.4 Prerender 與 sitemap

- `generate-routes.mjs` 撈 **全部** `venues` 產出 `/venue/{id}` 進 prerender 清單(含停業,與 §3.3 一致);**sitemap 只收 `is_active = true`**
- sitemap:`changefreq: daily`、`priority: 0.7`
- **`lastmod` 省略。** `venues.updated_at` 反映不了每日變動的場次;但反過來,蓋上 build 日期等於宣稱每天都有實質更動,而多數場地整週都沒有新場次——這正是 `generate-routes.mjs:112` 註解警告的「教 Google 不信任 lastmod」。兩者都不準,所以不標。等 §12 的場次資料進 DB、能算出「本頁最後一次內容變動」時再補
- 驗收數量一律以「啟用場地數」動態比對,**不寫死 49 / 690**

### 8.5 內部連結

| 從 | 到 | 作法 |
|---|---|---|
| 首頁場地卡片 | `/venue/:id` | 見 §9 Chunk 3 Step 4 |
| 場地頁 | 同區域其他場地 | 見下方排序規則 |
| 場地頁 breadcrumb | `/?tab=venues&region={region}` | 首頁已支援 `tab` 與 `region` query param(`home.component.ts:211,219`),直接指向該區域分頁 |

**同區域排序規則:** 北部有 38 個場地,固定取前 6 會讓其餘 32 個永遠拿不到內部連結。改為**依 `name` 排序後,從自己的位置往後環狀取 6 個**。這樣每個場地連到不同的 6 個,全區形成環狀連通圖,爬蟲能從任一頁走遍同區所有場地。

### 8.6 索引與廣告

- `is_active = false` → `setRobotsNoIndex(true)`
- **場地頁不掛廣告。** 現行 `isAdEligible` 要求 notes ≥ 80 字,實測 **0/49** 場地達標,任何 `isVenueAdEligible` 今天都恆為 false。與其寫一個永遠回傳 false 的函式加測試,不如直接不放 `<app-ad-banner>`。等 notes 普及後再議

---

## 9. 實作範圍

### Chunk 1:Calendar 修復(阻擋項,先做)

- [ ] **Step 1** `google-calendar.service.ts`:Node 端補 `Referer` header(§3.1)。加測試斷言 browser 分支不帶 header、server 分支有帶
- [ ] **Step 2** `rawCache` 移到 module scope(§3.5),避免 prerender 打 49 次 API
- [ ] **Step 3** `maxResults` 250 + `nextPageToken` 分頁(上限 5 頁);測試涵蓋兩頁情境
- [ ] **Step 4** 時區:`timeMin`/`timeMax` 以台北當日計算,API 加 `timeZone=Asia/Taipei`,新增 `formatTaipei()` helper 供日期/星期/時間顯示(§3.4)。測試固定時鐘,斷言 UTC 環境下仍取得台北當日
- [ ] **Step 5** 失敗路徑:回傳狀態而非空陣列,`console.warn` 但不中斷 build

### Chunk 2:資料層

- [ ] **Step 1** `venue.service.ts`:`getVenueById(id)`、`getNearbyVenues(venue, limit = 6)`(環狀排序,§8.5)
- [ ] **Step 2** `venues.type` 髒資料:實測有值為 `"Live\n   House"`。讀取端 `replace(/\s+/g, ' ').trim()`,另開 migration 修 DB 現值
- [ ] **Step 3** `page-data.resolvers.ts`:`VenuePageData`(含 `calendarStatus`)+ `venuePageResolver`
- [ ] **Step 4** 地址解析 helper + 單元測試(§8.2,四種郵遞區號型態 + 臺/台)
- [ ] **Step 5** resolver 測試:calendar 三態 + `error: true` + `venue: null`,共五種

### Chunk 3:頁面、路由與 Cloudflare

- [ ] **Step 1** `venue-page.component.{ts,html,css}`,版面照 §4,樣式自 `venue-page-preview.html` 移植
- [ ] **Step 2** `VenueMapComponent` 加 `@Input() compact`(§6),不設 `aria-hidden`,補 `role` 與 `aria-label`
- [ ] **Step 3** `app.routes.ts` 加 `venue/:id` + resolver + lazy component
- [ ] **Step 4** 首頁場地卡片:目前整張是可點擊的 `<div (click)>`(`home.component.html:1155`),鍵盤不可及。改成**外層維持非互動容器,連結與展開鈕平行**:

  ```html
  <article class="venue-card">              <!-- 非互動,不綁 (click) -->
    <a [routerLink]="['/venue', venue.id]">{{ venue.name }}</a>
    <button type="button"
            [attr.aria-expanded]="expandedVenueIds.has(venue.id)"
            [attr.aria-controls]="'venue-detail-' + venue.id"
            (click)="toggleVenue(venue)">場次</button>
    <div [id]="'venue-detail-' + venue.id"> … </div>
  </article>
  ```

  **不可**把 `<a>` 包進 `<button>`(巢狀互動元素是無效 HTML,鍵盤與讀屏行為不確定),也不可保留整張 div 的 `(click)`——否則點連結會同時觸發展開。這是動到既有程式碼,但這張卡片正要成為新頁面的主要入口,不能把既有 a11y 缺陷帶進關鍵路徑
- [ ] **Step 5** `public/_redirects` 加 `/venue/:id  /venue/:id/  200`
- [ ] **Step 6** `functions/_middleware.ts:15` regex 加入 `venue`
- [ ] **Step 7** 元件測試:calendar 三態 + 停業 + 找不到 + **場地載入失敗**,共六種
- [ ] **Step 8** 地圖測試:marker accessible name 非空,且可用鍵盤聚焦

### Chunk 4:SEO 與驗收

- [ ] **Step 1** `seo.setPage()` + `setJsonLdGraph()`(§8.1、§8.3),缺值降級
- [ ] **Step 2** `generate-routes.mjs` 加場地路由與 sitemap 條目(§8.4)
- [ ] **Step 3** `pnpm build` 通過;prerender 路由數 = 既有數 + 啟用場地數(動態比對,不寫死)
- [ ] **Step 4** 抽驗 `dist/.../venue/{id}/index.html`:title、description、canonical、MusicVenue JSON-LD、**場次文字**都在原始 HTML(不是 JS 產生)
- [ ] **Step 5** 抽驗一個無場次場地:空狀態有 SSR,無殘留「0 場」
- [ ] **Step 6** sitemap 條目數 = 啟用場地數
- [ ] **Step 7** `pnpm test` 全綠

---

## 10. 不做的事(本次)

`/events` 與日期頁、場次 ↔ 出演團體對應、場地照片、過往場次 archive、Event 結構化資料、場地頁廣告。

---

## 11. 與審查建議不同之處

三項採用更簡的解法,理由記錄於此:

| 審查建議 | 本文件採用 | 理由 |
|---|---|---|
| 改用 server-only key 或 build-time fetch | Node 端補 `Referer` header | 現行 key 已隨 browser bundle 公開,第二把 key 不增加安全性,只增加設定與輪替成本 |
| 新增 `isVenueAdEligible` + TS/Node mirror 測試 | 場地頁直接不掛廣告 | 實測 0/49 場地 notes ≥ 80 字,該函式今天恆為 false。寫一個永遠 false 的函式加測試是純負債 |
| `VenueMapComponent` 新增 single/decorative mode | 只加 `compact` 高度 input,保留完整互動與可及性 | decorative mode 會誘導 `aria-hidden`,那正是要避免的問題。缺的只有高度,不是模式 |

其餘 P0/P1/P2 全部照審查修正。

---

## 12. 下一步(本頁上線後)

依序評估,每步都等 GSC 數據再決定:

1. **場次 ↔ 出演團體對應**。`GoogleCalendarService` 目前比對方向是「給定團體,這場活動符合嗎」,要做出演者清單得反轉成「給定活動,有哪些團體符合」。成本 O(活動 × 團體),只在 build 跑一次。做成後場次可連回團體頁,Event 結構化資料才值得補
2. **`/events/YYYY-MM-DD` 日期頁**。承接「這週末 地下偶像」
3. **成員 / 團體頁的「近期演出」SSR 區塊**
4. **過往場次 archive**。對手有活動沒有人物關係,我們反過來

---

## 驗收條件總表

| # | 條件 |
|---|---|
| 1 | 全部啟用中場地各有可直接開啟的網址,內容在原始 HTML 中 |
| 2 | Calendar 三態分明:失敗不得顯示成「沒有場次」 |
| 3 | prerender 期間 Calendar API 呼叫次數 ≤ prerender worker 數(`min(4, cores-1)`),且不因 referrer 限制失敗 |
| 4 | 所有日期、星期、時間在 UTC build 環境下仍為 Asia/Taipei 正確值 |
| 5 | 本頁不使用 `--text-faint` / `--text-faint-65`、不用 `opacity` 壓暗文字;所有內容文字(含疊在色塊上的)實算對比 ≥ 4.5:1 |
| 6 | 所有互動目標 ≥ 44px;地圖可鍵盤操作、未被 `aria-hidden`,每個 marker 有可存取名稱;頁面無巢狀互動元素 |
| 7 | 同區域連結為環狀分佈,任一區所有場地都被連到至少一次 |
| 8 | `/venue/:id` 無 trailing-slash redirect;未 prerender 的新場地不 404;停業場地可開啟但不在 sitemap |
| 8b | Supabase 或 Calendar 暫時失敗時,頁面顯示重試訊息且**不**輸出 noindex、**不**顯示成「找不到」或「沒有場次」 |
| 9 | 深淺色、390px 與桌機寬度皆無破版 |
| 10 | `pnpm build` 與 `pnpm test` 皆通過 |
