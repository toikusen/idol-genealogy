# 貢獻者功能設計文件

**日期：** 2026-03-17
**狀態：** 已核准
**範圍：** Phase 2 — 貢獻者可視化功能

---

## 概述

在現有提案系統（Phase 1）基礎上，新增三個面向使用者的功能：

1. **頁面底部貢獻標示** — 在成員、組合、公司頁面底部顯示最近一筆核准修改及提案者
2. **編輯記錄 Panel** — 右側滑入 Panel，列出該筆記錄所有核准提案的完整 diff
3. **排行榜頁面** `/contributors` — 依核准筆數排名的登入用戶貢獻榜

---

## 功能 1：頁面底部貢獻標示

### 顯示位置
成員頁（`/member/:id`）、組合頁（`/group/:id`）、公司頁（`/company/:id`）的 footer 區塊上方，低調呈現。

### 顯示邏輯
- 查詢：`proposals WHERE table_name = X AND record_id = Y AND status = 'approved' ORDER BY reviewed_at DESC LIMIT 1`
- 若無核准提案，此區塊不顯示

### 顯示格式
```
最後由 {submitter_name} 補充 · {相對時間}
「{第一個欄位}」{舊值} → {新值}  [+N 個欄位]  查看全部 →
```

- **單一欄位修改**：只顯示 diff chip，不顯示 +N badge
- **多欄位修改**：顯示第一個欄位的 diff chip ＋「+N 個欄位」badge
- **INSERT 提案**：顯示「新增記錄」而非 diff
- **「查看全部 →」**：點擊後開啟編輯記錄 Panel

### 欄位 diff 格式
- UPDATE：`「{field_label}」{original_value} → {proposed_value}`
- 值為空時顯示「—」
- 使用 `FIELD_LABELS` 對應中文欄位名稱

---

## 功能 2：編輯記錄 Panel

### 觸發方式
點擊貢獻標示區的「查看全部 →」

### 樣式
與現有 `ProposalPanelComponent` 一致：右側固定寬度 Panel（max-w-md），背景 overlay

### 內容
- Header：「編輯記錄」標題 ＋ 記錄名稱（成員姓名/組合名稱/公司名稱）
- 列出所有 `status = 'approved'` 提案，按 `reviewed_at DESC`

### 每筆記錄顯示
```
{submitter_name}   {N 天前}   [修改] or [新增]
  ┌ 「欄位名」 舊值 → 新值
  └ 「欄位名」 — → 新值
```

- 操作 badge：修改（藍）/ 新增（綠）
- INSERT 類型：顯示「新增記錄」及所有 proposed_data 欄位
- 時間格式：相對時間（X 分鐘前、X 小時前、X 天前）

---

## 功能 3：排行榜頁面 `/contributors`

### 資料範圍
- 只顯示 **有登入** 的貢獻者（`submitter_id IS NOT NULL`）
- 統計：`COUNT(*) WHERE submitter_id = X AND status = 'approved'`
- 分類細項：依 `table_name` 分組計算各資料類型的貢獻數

### 版面結構

**上方：獎台區（前三名）**
- 第 1 名：最高，皇冠圖示，avatar 最大（64px）
- 第 2 名：居左，avatar 中（50px）
- 第 3 名：居右，avatar 最小（44px）
- 每格顯示：avatar（名字縮寫）、顯示名稱、核准筆數

**下方：清單區（第四名起）**
- 欄位：排名、avatar、姓名、分類細項、進度條、核准筆數
- 分類細項格式：`成員 N・組合 N・公司 N・歷程 N`（數量為 0 者省略）
- 進度條：相對於第一名的比例

### 入口
- 各頁面 footer 加入「貢獻者排行榜」連結
- 首頁 footer 加入連結

---

## 資料層

### ProposalService 新增方法

```typescript
// 取得某筆記錄所有已核准提案（新至舊）
async getApprovedByRecord(
  tableName: string,
  recordId: string
): Promise<Proposal[]>

// 排行榜：登入用戶依核准數排序，含各類別細項
async getLeaderboard(): Promise<ContributorEntry[]>

interface ContributorEntry {
  submitter_id: string;
  submitter_name: string;
  total: number;
  by_table: Record<string, number>; // { members: N, groups: N, ... }
}
```

---

## 元件位置

```
src/app/
  core/
    proposal.service.ts           # 新增 getApprovedByRecord、getLeaderboard
  shared/
    record-edit-history/
      record-edit-history.component.ts   # 可重用的編輯記錄 Panel
  pages/
    contributors/
      contributors.component.ts          # 排行榜頁面
      contributors.component.html
  pages/
    member-page/
    group-page/
    company-page/                         # 各頁加入貢獻標示 + 開關狀態
```

---

## 路由

```typescript
{ path: 'contributors', loadComponent: () => import('./pages/contributors/contributors.component') }
```

---

## 不在範圍內

- Email 通知
- 個人提案歷史頁（點名字無法跳至個人頁面）
- 匿名貢獻者出現在排行榜
- 管理員可封禁特定貢獻者
- 排行榜分期統計（本月/本週）
