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

| 比對來源 | 規則 |
|---|---|
| `summary`（事件標題） | 比對所有候選名稱（`group.name` 及 `group.name_jp`），normalize 後完整出現 |
| `location`（事件地點） | 比對所有候選名稱，但每個候選名稱須通過長度門檻：normalize 後 ≥ 4 CJK 字元，或 ≥ 6 英數字元，才納入比對 |
| `description`（事件說明） | **完全跳過**，風險過高 |
| CJK bigram 模糊比對 | **不使用**，保留給場地邏輯 |

比對為「有一項符合即算」，每項都要求 normalize 後整個名稱完整出現，不允許碎片比對。

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

### 顯示邏輯

| 情境 | 顯示 |
|---|---|
| 單一團體，有活動 | 直接列出活動（無團體名稱 header） |
| 多個團體，各有活動 | 每個團體一個小區塊，有團體名稱作 header |
| 無活動（任何情境） | 整個元件隱藏，不顯示空狀態 |
| 載入中 | 輕量文字提示（如「讀取活動中…」） |
| 某一團體載入失敗 | 只隱藏該團體的區塊，其他有活動的團體照常顯示 |
| 全部失敗或全部無活動 | 整個元件隱藏 |

### 活動項目格式

每筆活動顯示：
- 日期：`M/D` 格式
- 標題：截斷 ellipsis，點擊開新分頁（Google Calendar 連結）

成員頁多個團體皆命中同一活動（相同 `event.id`）時，去重後只顯示一次；活動列表依 `start` 升冪排列。

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

資料來源：`histories` 中 status 為 `active`、`hiatus`、`concurrent` 的所有 group（代表「目前仍關聯」），不含 `support`（臨時性，活動歸屬感較弱）、`transferred`、`graduated`、`withdrawn`。

透過頁面已有的 `histories` 資料取得對應 `Group[]`（history 物件已 join group）。

```html
<!-- 原創曲 -->
<app-group-events [groups]="activeGroups" />
<!-- 編輯紀錄 -->
```

其中 `activeGroups` 為 component 計算屬性：

```ts
get activeGroups(): Group[] {
  const statuses = new Set(['active', 'hiatus', 'concurrent']);
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
