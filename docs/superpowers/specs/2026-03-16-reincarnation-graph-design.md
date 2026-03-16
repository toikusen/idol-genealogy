# 偶像系譜圖（Reincarnation Graph）設計文件

**日期：** 2026-03-16
**狀態：** 已核准

---

## 概述

在現有的成員詳細頁與團體詳細頁，新增視覺化的成員經歷分支圖，讓使用者能直觀地看到偶像在不同團體之間的流動記錄。資料來源為現有的 `history` 資料表。

---

## 功能範圍

### 1. 成員 Career 圖（MemberCareerGraphComponent）

- **位置：** 成員詳細頁（`/members/:id`）
- **呈現：** 橫向左→右流程圖，按 `joined_at` 排序
- **節點內容：** 團體名稱（header）、成員在該團體的名稱（`name_at_time` 或 `member.name`）、加入/離開日期
- **現役團體：** 深粉色背景 header + 外框加粗，明顯區分
- **互動：** 點擊節點跳至對應團體頁面（`/groups/:id`）
- **佈局：** 純 Angular + SVG，不使用 D3

### 2. 團體連結圖（GroupConnectionGraphComponent）

- **位置：** 團體詳細頁（`/groups/:id`）主要分頁
- **呈現：** 選定團體置於中央，左側顯示流入成員的前一個團體，右側顯示流出成員的下一個團體
- **節點內容：** 團體名稱、成員名稱、轉移方向與日期
- **互動：** 點擊節點跳至對應團體頁面
- **佈局：** 純 Angular + SVG，不使用 D3

### 3. 全局地圖（GlobalGroupMapComponent）

- **位置：** 團體詳細頁獨立分頁（tab：「全局地圖」）
- **呈現：** 所有團體均顯示；有成員流動的團體以實線連結，孤立團體以淡灰框顯示
- **互動：** 節點可拖曳；點擊跳至對應團體頁面
- **佈局：** D3 force simulation 計算節點位置，Angular 渲染 HTML 節點，SVG 渲染連線

---

## 視覺風格

- **白底粉框（A1 風格）**
- 節點：白色背景、粉色邊框（`#f472b6`）、頂部粉色 header 列（`#fce7f3` 背景，`#be185d` 文字）
- 現役/選定團體：深粉色實心 header（`#ec4899`，白色文字）+ 外圍光暈（`box-shadow: 0 0 0 3px #fce7f3`）
- 連線：粉色箭頭（`#f472b6`），SVG `<line>` + arrowhead marker
- 孤立團體（全局地圖）：灰色虛線框、淡灰文字

---

## 資料模型

```typescript
interface GraphNode {
  id: string;           // group id
  name: string;         // group name
  members: Array<{
    name: string;       // name_at_time ?? member.name
    joinedAt: string;   // formatted date
    leftAt: string | null;
  }>;
  x?: number;           // D3 計算（全局地圖用）
  y?: number;
}

interface GraphEdge {
  id: string;
  sourceId: string;     // group id
  targetId: string;     // group id
  memberName: string;   // 轉移的成員名稱
  transferredAt: string;
}
```

---

## 資料流

1. 各元件透過 `HistoryService` 取得資料：
   - `MemberCareerGraphComponent` → `getByMember(memberId)`
   - `GroupConnectionGraphComponent` → `getByGroup(groupId)`（含 member/group join）
   - `GlobalGroupMapComponent` → `getAll()`（含 member/group join）

2. 前端將 history 記錄轉換為 `GraphNode[]` + `GraphEdge[]`

3. 渲染：
   - ① ② 用 `*ngFor` + `@for` 渲染節點，用 SVG `<line>` 渲染連線
   - ③ D3 force simulation 計算 x/y → Angular 用 `[style.left]` `[style.top]` 定位節點，SVG 連線同步更新

---

## 元件位置

```
src/app/shared/
  member-career-graph/
    member-career-graph.component.ts
    member-career-graph.component.html
  group-connection-graph/
    group-connection-graph.component.ts
    group-connection-graph.component.html
  global-group-map/
    global-group-map.component.ts
    global-group-map.component.html
```

---

## 不在範圍內

- 縮放（zoom/pan）功能（全局地圖僅支援拖曳節點）
- 動畫過場效果
- 後端 API 變更（使用現有 HistoryService）
- 手機版響應式（桌面優先）
