# 團體 / 成員近期活動設計文件

**日期**：2026-05-16
**狀態**：已確認，待實作

---

## 概述

將首頁場地地圖現有的「近期活動」功能延伸至團體頁面與成員頁面。

- **團體頁**：顯示該團體的近期活動
- **成員頁**：顯示該成員目前現役的所有團體之近期活動

活動資料來源與場地相同，使用同一個 Google Calendar。媒合方式改為依團體名稱比對，並採用比場地更嚴格的規則以避免誤放。

---

## 核心約束

**絕不能把不屬於該團體或成員的活動顯示在其頁面上。**

寧可漏掉真實活動，也不能誤顯示無關活動。

---

## 活動媒合邏輯

在 `GoogleCalendarService` 新增：

```ts
getUpcomingGroupEvents(group: Group, daysAhead = 90): Promise<VenueCalendarEvent[]>
```

搭配 `matchesGroup(event, group)` private method，規則如下：

**Normalize 規則（group matching 專用）**：先 `value.normalize('NFKC')`（半形化全形字元），再 lowercase 並移除符號空白。長度門檻在 normalize 之後計算。

候選名稱：`group.name` 與 `group.name_jp`（若存在），兩者皆 normalize 後使用。

**字元範圍定義**：
- 「CJK/Kana 字元」涵蓋：漢字（U+4E00–U+9FFF、U+3400–U+4DBF）、平假名（U+3041–U+3096）、片假名（U+30A1–U+30FC）
- 「英數字元」為 NFKC normalize 後的 `[a-z0-9]`

**各比對來源的長度門檻**：

| 比對來源 | 長度門檻 | 規則 |
|---|---|---|
| `summary`（事件標題） | CJK/Kana ≥ 3，或英數 ≥ 4 | 候選名稱未達門檻則跳過；CJK/Kana 候選用 normalized includes；純英數候選用 token 邊界 regex：`(^|[^a-z0-9])name([^a-z0-9]|$)` |
| `location`（事件地點） | CJK/Kana ≥ 4，或英數 ≥ 6 | 門檻較 summary 更嚴；英數同樣用 token 邊界 regex |
| `description`（事件說明） | — | **完全跳過**，風險過高 |
| CJK bigram 模糊比對 | — | **不使用**，保留給場地邏輯 |

比對為「有一項符合即算」，依候選名稱類型使用不同比對方式：

- **CJK/Kana 候選**：對事件文字套用「NFKC + lowercase + 移除符號空白」後做 substring includes
- **純英數候選**：對事件文字套用「NFKC + lowercase，但保留非英數分隔符（空白、標點保留）」後，用 `(^|[^a-z0-9])name([^a-z0-9]|$)` 做 token 邊界比對；不可對已移除分隔符的字串跑，否則 `AKB48 Team TP` 會變成 `akb48teamtp` 而邊界資訊消失

---

## 共用元件

新增：`src/app/shared/group-events/`

```
group-events.component.ts
group-events.component.spec.ts
```

### Input

```ts
@Input() groups: Group[]
```

### 行為

- 對每個 group 各自呼叫 `getUpcomingGroupEvents(group)`
- 共用 `GoogleCalendarService` 的 raw cache（不重複打 API）
- group derived cache 使用獨立 key prefix：`group:${group.id}:${daysAhead}`，與 venue cache（`venue:${venue.id}:${daysAhead}`）隔離
- 各自管理 loading / error 狀態
- `groups` input 變更時（Angular routing 重用元件情境），重置所有 loading / error / events 狀態後重新載入；忽略已過期 promise 的結果（以 per-request flag 或 generation counter 判斷）

### 顯示模式

元件有兩種模式，由傳入的 `groups.length` 決定：

**單一團體模式**（`groups.length === 1`，用於團體頁）：
- 直接列出活動，無 header
- 該團體載入失敗：整個元件靜默隱藏

**合併列表模式**（`groups.length > 1`，用於成員頁）：
- 所有團體的活動合併成單一列表
- 依 `event.id` 去重（同一活動命中多個團體只顯示一次）
- 依 `start` 升冪排列
- 每筆活動下方顯示命中的團體名稱 tag（可能多個）
- 某一團體載入失敗：只跳過該團體，其他正常顯示

**共同規則**：

| 情境 | 顯示 |
|---|---|
| 有活動 | 依上述模式顯示 |
| 無活動（全部） | 整個元件隱藏，不顯示空狀態 |
| 載入中 | 輕量文字提示（如「讀取活動中…」） |
| 全部失敗或全部無活動 | 整個元件隱藏 |

### 活動項目格式

每筆活動顯示：
- 日期：`M/D` 格式
- 標題：截斷 ellipsis，點擊開新分頁（Google Calendar 連結）
- 合併列表模式下：標題下方一行顯示命中的團體名稱 tag（小字）

---

## 整合位置

### 團體頁 (`group-page`)

位置：tab 列表（成員一覽 / 成員流動 / 原創曲）**之前**，團體基本資訊之後，「其他人也看了」之上。

```html
<!-- 團體基本資訊 -->
<app-group-events [groups]="[group]" />
<!-- tab 列表 -->
<!-- 其他人也看了 -->
```

### 成員頁 (`member-page`)

位置：原創曲區塊**之後**，編輯紀錄**之前**。

資料來源：`histories` 中 status 為 `active`（活動中）、`concurrent`（兼任）、`support`（支援）的所有 group，不含 `hiatus`（活休，暫停出活動）、`transferred`、`graduated`、`withdrawn`。

透過頁面已有的 `histories` 資料取得對應 `Group[]`（history 物件已 join group）。

```html
<!-- 原創曲 -->
<app-group-events [groups]="activeGroups" />
<!-- 編輯紀錄 -->
```

其中 `activeGroups` 為 component 計算屬性：

```ts
get activeGroups(): Group[] {
  const statuses = new Set(['active', 'concurrent', 'support']);
  const seen = new Set<string>();
  return this.histories
    .filter(h => statuses.has(h.status ?? '') && h.group)
    .map(h => h.group!)
    .filter(g => !seen.has(g.id) && seen.add(g.id));
}
```

---

## 不在本次範圍內

- 每個團體設定自己的 Google Calendar ID（後續擴充）
- 成員本人的個人行事曆活動
- 活動篩選 / 排序功能
- 場地欄位（venue marker 上已有）

---

## 實作注意事項

### Cache key migration

`GoogleCalendarService.cache` 現有 venue key 格式為 `${venue.id}:${daysAhead}`，實作時一併改為 `venue:${venue.id}:${daysAhead}`，避免未來 UUID 碰撞風險。group key 使用 `group:${group.id}:${daysAhead}`。

### 型別沿用

`VenueCalendarEvent` 型別暫時沿用，不在本次改名；未來統一改為 `CalendarEvent` 時再處理。
