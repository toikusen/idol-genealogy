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

| 比對來源 | 規則 |
|---|---|
| `summary`（事件標題） | 比對 `group.name`（normalize 後完整出現），以及 `group.name_jp`（若存在） |
| `location`（事件地點） | 只有在 group.name ≥ 4 CJK 字元，或 ≥ 6 英數字元時才比對，避免短名稱誤中 |
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
- 各自管理 loading / error 狀態

### 顯示邏輯

| 情境 | 顯示 |
|---|---|
| 單一團體，有活動 | 直接列出活動（無團體名稱 header） |
| 多個團體，各有活動 | 每個團體一個小區塊，有團體名稱作 header |
| 無活動（任何情境） | 整個元件隱藏，不顯示空狀態 |
| 載入中 | 輕量文字提示（如「讀取活動中…」） |
| 載入失敗 | 靜默失敗，不顯示區塊 |

### 活動項目格式

每筆活動顯示：
- 日期：`M/D` 格式
- 標題：截斷 ellipsis，點擊開新分頁（Google Calendar 連結）

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

資料來源：`histories` 中 `status === 'active'` 的所有 group，透過 resolver 或頁面已有的 `histories` 資料取得對應 `Group[]`。

```html
<!-- 原創曲 -->
<app-group-events [groups]="activeGroups" />
<!-- 編輯紀錄 -->
```

其中 `activeGroups` 為 component 計算屬性，從 `histories` 過濾出 status='active' 且有對應 group 物件的紀錄。

---

## 不在本次範圍內

- 每個團體設定自己的 Google Calendar ID（後續擴充）
- 成員本人的個人行事曆活動
- 活動篩選 / 排序功能
- 場地欄位（venue marker 上已有）
