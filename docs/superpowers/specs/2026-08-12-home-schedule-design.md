# 首頁活動頁籤：快速行程 + 相關團體標記

日期：2026-08-12（v2，經 codex 審查後修正）

## 目標的收斂

競品 idolinfohub.com 的活動詳情頁有 30 團完整陣容、時間表、票種價格、
售票連結（實測 `/events/ssr-hanabi-20260815`）。那是他們自己的結構化 events
資料表。

**本站的來源是 OTAKU EVENT 的 Google Calendar，只有 `summary` / `description` /
`location` 三個自由文字欄位。靠解析達不到那個資訊密度。**

因此本規格的目標明確限定為「**快速行程**」：讓使用者一眼看到今天和接下來有什麼、
在哪裡、有哪些站內收錄的團體。追平競品的活動資料密度需要自建 events schema
與資料錄入流程，是另一個專案，不在此範圍。

## 現況（讀 code 與實測確認）

**資料源**：Google Calendar（OTAKU EVENT），無結構化團體欄位。

**既有但未被利用**

- `fetchUpcomingEvents(90)` 已抓未來 90 天且快取在 module scope
  （`sharedRawCache`），venues 頁籤已在用。
- 首頁 `loadTodayEvents()` 另外呼叫 `getEventsForDate(target)`，
  獨立打一次「只抓今天」的 API。**「即將到來」不缺資料源。**
  改用 90 天快取後 `getEventsForDate()` 沒有其他呼叫端，**一併刪除**。
- `matchesGroup()` 方向是「給團體 → 找場次」，沒有反向。

**既有缺陷（本次一併修）**

1. `loadTodayEvents()` 的 catch 把 `todayEvents` 設為 `[]`，UI 顯示
   「今日暫無活動行程」—— 把 API 失敗講成沒有活動。
2. 今日活動段落的日期計算全用 `new Date()` 本地 getter，未用
   `taipei-date.utils.ts`。Prerender 跑在 UTC，日期差 8 小時。
3. `allGroups` **不會**在活動頁籤載入：`loadTabData()` 只在
   `tab === 'groups' || 'companies'` 時呼叫 `ensureBrowseCatalog()`
   （`home.component.ts:240-242`）。

**已知限制（本規格不處理，僅記錄）**

- `/` 是 build-time prerender，query param 不產生獨立產物。實測
  `https://idolmaps.com/?tab=events` 送出的 HTML 只含 `id="panel-members"`，
  **活動內容完全沒有 SSR**，全靠 hydration。要修需要獨立的 `/events` 路由。
- 同一處的既有 a11y bug：tab 按鈕的 `aria-controls="panel-events"` 指向一個
  未被渲染的元素（各分頁皆然，因為 panel 是 `@if` 互斥）。

## 資料正確性原則

先於功能的約束：

1. **`matchesGroup` 是為團體頁設計的高召回比對**。漏抓不痛，誤抓只汙染那一團
   自己的頁面。反向套用在首頁等於同時施加全部團體的寬鬆規則，誤判會累加，
   且位於站內最顯眼處。首頁用嚴格子集。
2. **chip 列不是演出陣容**。日曆 description 常未列完整陣容，站內也不可能收錄
   所有團體。標籤用「相關團體」，不得使用「演出陣容」「出演」等宣稱完整性的字眼。
   命中 0 個時整列不渲染。
3. **0 筆 ≠ 沒有活動**。載入失敗與確實無活動是兩種不同 UI。
4. **團體載入失敗不得影響活動顯示**。活動是主體，chip 是加值。

## 範圍與版面

- **今日**：永遠顯示，即使 0 場（顯示「今日暫無活動行程」）。
- **即將到來**：未來 14 天內，最多 12 場。**只渲染有活動的日期**，
  不逐日列「無」。（原 v1 的「逐日 8 個桶」會在活動集中週末時冒出數行「無」，
  反而顯得更空。）
- **完整月曆**：現有 iframe 留在下方，不動。

## 設計

### 一、資料層：`google-calendar.service.ts`

```ts
/** chip 用的最小團體型別 —— 不把整個 Group 帶進事件物件。 */
export interface RelatedGroupRef {
  id: string;
  name: string;
  color: string;
}

export interface ScheduleEvent extends VenueCalendarEvent {
  /** summary 命中者排在 lineup 命中者之前，同組內依 name 排序。 */
  relatedGroups: RelatedGroupRef[];
  /** 多日全天活動的結束日（含），單日為 null。 */
  allDayEndDayKey: string | null;
  /** 多日全天活動且已在今日之前開始 —— 卡片標示「持續中」。 */
  isOngoingAllDay: boolean;
}

export interface ScheduleDay {
  dayKey: string;              // YYYY-MM-DD (Taipei)
  /** 全天活動在前，其餘依 start 升冪。未來日期不再細分 carryover。 */
  events: ScheduleEvent[];
}

export interface ScheduleResult {
  today: { dayKey: string; carryover: ScheduleEvent[]; allDay: ScheduleEvent[]; timed: ScheduleEvent[] };
  upcoming: ScheduleDay[];     // 只含有活動的日期
  status: CalendarStatus;
}

getSchedule(
  groups: Group[],
  opts?: { upcomingDays?: number; maxUpcoming?: number; now?: Date },
): Promise<ScheduleResult>
// upcomingDays = 14 —— 指 today+1 .. today+14，共 14 個未來日期，不含今日
// maxUpcoming  = 12 —— 上限套用在「事件總數」，非日期數；今日不計入
// now          —— 測試注入用，預設 new Date()
```

- 資料來自既有 `fetchUpcomingEvents(90)` 快取，client-side 過濾。
  **淨效果是少一次 API 呼叫**。
- **執行順序鎖定**：先做時間窗篩選 → 分類 → 排序 → `slice(0, maxUpcoming)`，
  **最後**才對存活下來的事件做團體反向掃描。順序顛倒會對整整 90 天的事件跑比對，
  而非規格宣稱的「今日 + 最多 12 場」。
- 團體比對在 service 內完成：`VenueCalendarEvent` 不帶 `description`，
  只有 raw `GoogleCalendarEventResource` 有，必須在 `toVenueEvent()` 之前配對。
- 回傳 `status`（沿用既有 `CalendarStatus`）。

#### 分桶規則（v1 的矛盾在此修正）

令 `todayKey = taipeiDayKey(now.toISOString())`
（`taipeiDayKey` 的參數型別是 `string`，不是 `Date`）。

**時間窗**：upcoming 為 `today + 1` 到 `today + 14`，**共 14 個未來日期，不含今日**。
今日永遠獨立處理，不受 14 天上限與 12 場上限影響。

分類必須依下列順序執行，**先判 `isAllDay`**，第一個命中的分支即決定歸屬：

**分支 A — 全天活動（`isAllDay === true`）**

全程只用 `YYYY-MM-DD` 字串與 UTC-safe 的 `addDays(dayKey, n)` 計算，
**絕不建立 `Date` 物件、絕不呼叫 `taipeiTime()`**。
裸日期字串傳進 `new Date()` 會被當成 UTC 午夜，加 8 小時後印成 `08:00`。

- `startKey = event.start.date`
- `endExclusive = event.end?.date ?? addDays(startKey, 1)`（Google 的 `end.date` 是**排他**的）
- `lastKey = addDays(endExclusive, -1)`
- `allDayEndDayKey = lastKey === startKey ? null : lastKey`

| 條件 | 歸屬 |
|---|---|
| `lastKey < todayKey` | 丟棄（已結束） |
| `startKey <= todayKey <= lastKey` | **今日 allDay 區**；`startKey < todayKey` 時卡片標示「持續中」與 `08/15–08/17` |
| `todayKey < startKey <= windowEndKey` | 該開始日的 upcoming 桶（多日者只放開始日） |
| 其他 | 丟棄（超出時間窗） |

昨天開始、今天仍持續的多日全天活動**顯示在今日 allDay 區**（標「持續中」），
不歸入 carryover 區 —— carryover 區會顯示起訖時間，全天活動沒有時間。

**分支 B — 定時活動（`isAllDay === false`）**

`startKey = taipeiDayKey(event.start)`

| 條件 | 歸屬 |
|---|---|
| `startKey < todayKey` 且 `end > now` | 今日 carryover 區 |
| `startKey < todayKey` 且 `end <= now` | 丟棄 |
| `startKey === todayKey` | **今日 timed 區，即使 `end <= now` 也保留** |
| `todayKey < startKey <= windowEndKey` | 該開始日的 upcoming 桶 |
| 其他 | 丟棄 |

**今天已結束的場次一律保留**。使用者下午開頁面時，上午的場次仍應出現在
「今日活動」中，與現行 `getEventsForDate()` 回傳整天的語意一致；
移除它們會讓今日徽章數量隨時間變動，是相對現況的退步。

**未來跨夜活動只放開始日一桶**，以既有的「翌日」標記表示結束日，不重複出現在兩天。

**全天活動絕不呼叫 `taipeiTime()`** —— `start` 是 `YYYY-MM-DD` 沒有時間部分，
`new Date('2026-08-15')` 會被當成 UTC 午夜，加 8 小時後印出 `08:00`。
全天活動只走日期路徑。

### 二、嚴格版團體比對

#### 2a. description 每場只解析一次

現行 `groupNameNearPerformerKeyword()` 內部呼叫 `descriptionPhrases()`，
每個團體都重跑一次 HTML 拆解與正規化。

**新流程自行解析，完全不碰既有函式**：每場事件先算一次
`lineupPhrases(description)`，得到已正規化、已裁切的陣容字串陣列，
再對所有團體重複使用。`matchesGroup()` 與 `groupNameNearPerformerKeyword()`
一行都不改，團體頁／成員頁／場地頁的既有結果保證不變。

#### 2b. 陣容區塊要有結束邊界

現行 `groupNameNearPerformerKeyword()` 命中「演出陣容」後，
`for (let j = i + 1; j < phrases.length; j++)` 掃到 description 結尾，
只跳過含主辦關鍵字的行（`google-calendar.service.ts:250`）。
票價、注意事項、歷史沿革裡出現的團名會被誤判為當場演出。

新增停止關鍵字：

```ts
private readonly LINEUP_BLOCK_END_KEYWORDS = [
  '票價', '售票', '購票', '前售', '預售', '當日票', '入場費',
  'チケット', '前売', '当日', 'ticket', 'price',
  '注意', '須知', '規則', '禁止', '主辦', '主催', 'presents',
];
```

**必須在兩個層級都截斷**：

1. **phrase 之間**：從命中演出關鍵字的那一行起往下取，遇到含停止關鍵字的行即中止區塊。
2. **phrase 之內**：`descriptionPhrases()` 的分隔符是 `[\n\r。；;、]+`
   （`google-calendar.service.ts:471`），**`/` 與 `／` 不是分隔符**。因此
   `演出陣容：Group A／票價：支持 Group B` 是單一 phrase，只做層級 1 擋不住 Group B。
   每個 phrase 取「演出關鍵字之後、第一個停止關鍵字之前」的子字串。

`lineupPhrases()` 回傳的每個字串都已完成 NFKC 正規化、轉小寫、
去除演出關鍵字（沿用 `stripPerformerKeywords()` 的規則）。

#### 2c. strict 比對本體

回傳**命中來源**而非 boolean —— UI 的 chip 排序需要區分 summary 與 lineup，
boolean 保不住這個資訊。

```ts
/** 命中來源；null 表示不命中。summary 優先於 lineup。 */
export type StrictGroupMatch = 'summary' | 'lineup' | null;

private matchGroupStrict(
  summaryNfkc: string,
  lineupPhrases: string[],
  group: Group,
): StrictGroupMatch {
  const names = [group.name, group.name_jp].filter((n): n is string => !!n);
  if (names.length === 0) return null;
  if (this.groupNameInPhrase(names, summaryNfkc)) return 'summary';
  if (lineupPhrases.some(p => this.groupNameInPhrase(names, p))) return 'lineup';
  return null;
}
```

同一團同時命中兩種來源時去重，保留 `summary`（上面的順序已保證）。

複用既有的 `groupNameInPhrase`，不新增名稱比對邏輯。

**刻意捨棄的路徑**（相對於 `matchesGroup`）：`location` 命中（場地名與團名巧合率高）、
CJK bigram 相似度（為場地模糊比對設計）。

### 三、團體資料載入（v1 的錯誤假設在此修正）

`loadTabData()` 的 `tab === 'events'` 分支加上 `ensureBrowseCatalog()`。
承認代價：**首次直接進 `?tab=events` 會多一次 Supabase 查詢**
（`groupService.getAll()` + `companyService.getAll()`，既有方法已 promise 去重）。

流程必須是**非阻塞**的：

1. 活動先渲染（不帶 chip）
2. 團體到齊後，重跑比對並補上 chip
3. 團體載入失敗 → 活動照常顯示，chip 列不出現，不顯示錯誤

不可 `await` 團體再渲染活動。

兩個階段是**同一個方法內的連續 `await`**，所以階段一不可能晚於階段二寫回 ——
順序由結構保證，不靠時序。epoch guard（每次載入取遞增的 epoch，每個 `await`
之後比對 `epoch !== this.scheduleEpoch` 就放棄寫回）連同 `destroyed` 旗標，
守的是元件已銷毀與重試兩條路徑。

### 四、UI：`home.component.html` / `.ts` / `.css`

#### 4a. 消除巢狀 `<a>`

現行 `.timeline-event-card`、`.carryover-chip`、`.allday-chip` 都是 `<a>`，
內嵌 `/group/:id` 連結會產生無效 HTML 並破壞鍵盤與螢幕閱讀器操作。

改為 **stretched-link** 模式，保住整卡點擊區同時維持有效 HTML：

```html
<article class="timeline-event-card">
  <a class="timeline-event-title-link" [href]="event.url">{{ event.title }}</a>
  <div class="timeline-event-location">…</div>
  <div class="related-groups">
    <a *ngFor="…" class="related-group-chip" [routerLink]="['/group', g.id]">{{ g.name }}</a>
  </div>
</article>
```

```css
.timeline-event-card { position: relative; }
.timeline-event-title-link::after { content: ''; position: absolute; inset: 0; }
/* z-index 掛在 chip 本身，不是容器 —— 容器會連標籤與空白一起蓋住
   stretched link，讓整卡出現點不到的區域。 */
.related-group-chip { position: relative; z-index: 1; }
```

既有的 `.timeline-event-card:hover` 等樣式改掛在 `article` 上，視覺不變。
無 `event.url` 時不加 `::after`（現行已有 `--no-link` 變體）。

**配色變數要掛在 `#panel-events`，不是 `.today-events-panel`**：
`--today-event-rgb` / `--carryover-rgb` / `--overnight-rgb` 原本定義在今日面板上，
但 upcoming 的卡片渲染在面板外，會讓所有 `rgba(var(--today-event-rgb), …)`
變成無效宣告而整片掉色。

活動外部連結保留 `target="_blank" rel="noopener noreferrer"`（現行已有）。
chip 是站內 `routerLink`，不開新分頁。

#### 4b. 相關團體 chip

- 標籤文字「相關團體」（不宣稱完整性），chip 連至 `/group/:id`
- 命中 0 個 → 整列不渲染
- **排序**：先依 `summary` 命中者、後依陣容區塊命中者；同組內依 `name` 排序。
  （純資料庫順序無法反映主要團體，需明確定義以免測試不穩定。）
- 超過 4 個 → 顯示前 4 個，其後接 `+N`。**`+N` 是不可點擊的純文字溢出提示**
  （`<span>`，非按鈕、不展開），避免卡片高度失控。
- **每一種事件卡都要有 chip**，包含今日的全天活動。原本的 `.allday-chip`
  是整塊 `<a>` 的緊湊樣式，塞不進 chip 列 —— 直接刪掉那套 markup 與 CSS，
  今日全天活動改走與 upcoming 相同的 `scheduleRow`（時間欄顯示「全天」），
  只留一種卡片。
- **a11y／觸控**：chip 需有可見 `:focus-visible` 外框（不可只靠顏色），
  行動版點擊目標高度至少 44px（用 `min-height` + padding，不放大字級）。
- **小字一律用 `--text-label`**（styles.css 註明 4.85:1，過 WCAG AA），
  日期標頭用 `--text-secondary`。不可自創 `--text-tertiary` 這種不存在的 token ——
  它會靜默退回 fallback 值，實測只有 2.6:1（淺色）／1.84:1（深色）。
- **團體色的使用限制**：`group.color` 是使用者可自訂的任意色，不保證對比度。
  只用於 chip 的**左側圓點或左邊框**，**不得作為文字背景或文字顏色**；
  chip 的文字與底色一律走既有 design token。

#### 4c. 日期標頭

用 `taipeiDateParts()`，格式即其回傳值：`08/13（週四）`。
（`taipeiDateParts` 的 month/day 皆 `padStart(2,'0')`。）
第一個「即將到來」區塊若為明日，額外標「明日」。

#### 4d. 錯誤狀態

| 狀態 | 顯示 |
|---|---|
| `'error'` | 「行程暫時無法載入」＋**「重試」按鈕** |
| `'unconfigured'` | 「行程暫時無法載入」，**不顯示重試** —— 沒有部署設定時重試必然失敗 |
| `'ok'` 且今日 0 場 | 今日區塊仍渲染，顯示「今日暫無活動行程」 |
| `'ok'` 且 `upcoming.length === 0` | 「未來 14 天暫無已知活動」 |

**載入完成必須用 `scheduleLoaded` 旗標判斷，不可用陣列長度** ——
成功但 0 場與尚未載入是兩種狀態。

重試行為：直接再呼叫一次 `getSchedule()` 即可 —— `fetchUpcomingEvents` 已在
reject 時自行從快取移除 promise（`google-calendar.service.ts:207-210`），
失敗不會被快取住。**不要呼叫 `clearCalendarRawCache()`**，那是標註為 test-only
的匯出，用在正式流程會連帶清掉 venues 頁籤的有效快取。

重試需要一個 in-flight guard 防止連點重複發送。

### 五、時區修正

首頁今日活動段落改用 `taipei-date.utils.ts`：

| 現行 | 改為 |
|---|---|
| `new Date().getFullYear()/getMonth()/getDate()` 組日期字串 | `taipeiDateParts(iso)` |
| `isCarryoverEvent` 的本地 getter 年月日比較 | `taipeiDayKey(event.start) < todayKey` |
| `isOvernightEvent` 的本地 getter 比較 | `taipeiDayKey(start) !== taipeiDayKey(end)` |
| `formatTodayEventTime` 的 `toLocaleTimeString` | `taipeiTime(iso)`（**全天活動不走此路徑**） |

## 測試

寫在實作旁邊（`google-calendar.service.spec.ts`、`home.component.spec.ts`）：

**分桶與時區**
- UTC 環境（模擬 prerender）下分桶正確，跨越 Taipei 午夜的事件落在正確的桶
- 昨天開始、今天尚未結束的定時事件出現在今日 carryover 區
- 已結束的昨夜定時事件被丟棄
- **今天上午已結束的場次仍保留在今日 timed 區**（下午開頁面不得消失）
- 昨天開始、今天仍持續的多日全天活動進今日 allDay 區並標「持續中」，
  **不進 carryover 區**
- `upcoming` 為 `today+1` .. `today+14`，第 15 天的事件被排除
- `maxUpcoming` 上限套用在事件總數；超過時被截斷的日期不出現空桶
- 未來跨夜活動只出現在開始日，不重複出現在結束日
- 未來全天活動不呼叫 `taipeiTime()`，不顯示 `08:00`
- 多日全天活動的 `end.date` 排他性：`08-15 → 08-18` 顯示為 `08/15–08/17`
- 午夜整點結束（`end` 恰為隔日 00:00）的歸屬
- 跨月、跨年邊界

**團體比對**
- summary 直接命中回傳 `'summary'`
- `演出陣容：` 區塊內命中回傳 `'lineup'`
- 同時命中兩者時去重，只留一筆且視為 `'summary'`（影響 chip 排序）
- **負向**：團名只出現在票價段落（獨立行）→ 不得命中
- **負向**：團名只出現在注意事項段落 → 不得命中
- **負向**：團名只出現在 `location` → 不得命中（strict 捨棄此路徑）
- **負向（phrase 內截斷）**：`演出陣容：Group A／票價：支持 Group B`
  → Group A 命中、**Group B 不得命中**。`/` 不是 `descriptionPhrases` 的分隔符，
  這條專門守 phrase 內部截斷。
- `matchesGroup`（團體頁用）的既有測試全數維持通過

**首頁行為**
- 直接進 `?tab=events` 時會觸發團體載入，chip 正常出現
- 團體載入失敗時活動仍完整顯示，且不顯示錯誤訊息
- `status === 'error'` 顯示載入失敗訊息與重試按鈕，而非「暫無活動」
- `status === 'unconfigured'` 顯示載入失敗但**不顯示重試按鈕**
- 今日 0 場時今日區塊仍渲染（用 `scheduleLoaded` 判斷，非陣列長度）
- 團體命中 0 個時不渲染 chip 列
- 渲染後的事件卡不存在巢狀 `<a>`（`querySelectorAll('a a')` 斷言為 0）
- 元件銷毀後才回來的行程結果不得寫回

## 已知取捨

反向掃描為 O(events × groups)。14 天內最多 12 場 × 全站團體數，
description 已改為每場解析一次，剩餘成本是每團的名稱正規化。
以 `ponytail:` 註解標示上限與升級路徑（預先算好團名的 NFKC 結果，
或建立團名 → 團體的索引表）。不預先優化；實作時在首頁實測一次再決定，
因近期已修過 iOS 首頁卡頓問題。

## 明確不做

- 不新增資料表、不改 schema、不新增依賴
- 不做競品等級的陣容／時間表／票種資料（來源不具備此資訊）
- 不動 `matchesGroup`，不動團體頁／成員頁／場地頁的既有行為
- 不動月曆 iframe
- 不做 `/events` 獨立路由與活動內容的 SSR（已記錄為限制）
- 不修 tab 按鈕的 `aria-controls` a11y bug（既有問題，涉及全部五個分頁）
- 不做團體 chip 的人工回報／校正流程
- 不做事件的收藏、提醒、篩選
