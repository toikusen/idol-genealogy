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

### 顯示範圍說明
- 每個頁面只查詢對應主表的提案，不合併 `history` 表的提案：
  - `/member/:id` → `table_name = 'members' AND record_id = memberId`
  - `/group/:id` → `table_name = 'groups' AND record_id = groupId`
  - `/company/:id` → `table_name = 'companies' AND record_id = companyId`
- `history` 類型提案不在成員/組合頁面顯示（範圍外）

### 顯示邏輯
- 查詢：`get_approved_by_record(table_name, record_id)` RPC（見資料層）
- 取第一筆（最新核准）
- 若無核准提案，此區塊不顯示

### 顯示格式 — UPDATE 提案
```
最後由 {submitter_name} 補充 · {相對時間}
「{第一個欄位}」{舊值} → {新值}  [+N 個欄位]  查看全部 →
```
- **單一欄位修改**：只顯示 diff chip，不顯示 +N badge
- **多欄位修改**：顯示第一個欄位的 diff chip ＋「+N 個欄位」badge（N = 總欄位數 - 1）
- **「查看全部 →」**：點擊後開啟編輯記錄 Panel

### 顯示格式 — INSERT 提案
```
最後由 {submitter_name} 新增記錄 · {相對時間}
                                  查看全部 →
```
- 不顯示 diff chip，不顯示 +N badge
- 「查看全部 →」仍顯示

### 欄位 diff 格式
- UPDATE：`「{field_label}」{original_value} → {effective_proposed_value}`
- **effective_proposed_value**：使用 `reviewed_data ?? proposed_data`（管理員審核時可能修改過提案內容，應以實際套用的 `reviewed_data` 為準；若 `reviewed_data` 為 null 則退回 `proposed_data`）
- 值為空時顯示「—」
- 使用 `FIELD_LABELS` 對應中文欄位名稱

### 欄位排序
「第一個欄位」依 `PROPOSAL_ALLOWED_FIELDS[tableName]` 的陣列順序決定（非 JSON key 順序），確保每次渲染結果一致。

### 隱私
`submitter_email` 欄位不在任何功能中顯示。

---

## 功能 2：編輯記錄 Panel

### 觸發方式
點擊貢獻標示區的「查看全部 →」

### 樣式
與現有 `ProposalPanelComponent` 一致：右側固定寬度 Panel（max-w-md），背景 overlay

### Component 介面

```typescript
@Input() tableName: string;   // 'members' | 'groups' | 'companies'
@Input() recordId: string;
@Input() recordLabel: string; // 顯示在 header 的記錄名稱（成員姓名/組合名/公司名）
@Output() closed = new EventEmitter<void>();
```

元件自行呼叫 `ProposalService.getApprovedByRecord()` 取資料，不接受外部傳入 proposals 陣列。

### 載入與空狀態
- **載入中**：顯示 spinner（與現有 admin 頁面一致）
- **空結果**：顯示「尚無核准記錄」說明文字
- **讀取失敗**：顯示「無法載入記錄，請稍後再試」，不 crash

### 內容
- Header：「編輯記錄」標題 ＋ `recordLabel`
- 列出所有 `status = 'approved'` 提案，按 `reviewed_at DESC`

### 每筆記錄顯示
```
{submitter_name}   {N 天前}   [修改] or [新增]
  ┌ 「欄位名」 舊值 → 新值
  └ 「欄位名」 — → 新值
```

- 操作 badge：修改（藍）/ 新增（綠）
- diff 值同樣使用 `reviewed_data ?? proposed_data`（同功能 1）
- INSERT 類型：顯示「新增記錄」及所有 proposed_data 欄位，欄位顯示順序同樣依 `PROPOSAL_ALLOWED_FIELDS[tableName]` 陣列順序排列
- 時間格式：相對時間（X 分鐘前、X 小時前、X 天前）

---

## 功能 3：排行榜頁面 `/contributors`

### 資料範圍
- 只顯示 **有登入** 的貢獻者（`submitter_id IS NOT NULL`）
- 統計：`COUNT(*) WHERE submitter_id = X AND status = 'approved'`
- 分類細項：依 `table_name` 分組計算各資料類型的貢獻數

### submitter_name 穩定性
`submitter_name` 為提案時快照。排行榜聚合時，若同一 `submitter_id` 歷史上存在不同 `submitter_name`，以**最新一筆核准提案的 `submitter_name`** 為準（RPC 內部處理，見資料層）。

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

### RLS 策略
現有 `proposals` RLS 僅允許 admin 或 submitter 本人讀取。功能 1、2、3 均需公開讀取已核准提案。策略：**全部查詢改為 Supabase RPC（SECURITY DEFINER）**，不新增 RLS public read policy，避免洩漏 pending/rejected 提案資料。

### 資料庫 Migration

```sql
-- Migration: add index for footer query performance
CREATE INDEX IF NOT EXISTS proposals_approved_record_idx
  ON proposals (table_name, record_id, status, reviewed_at DESC)
  WHERE status = 'approved';

-- RPC: get approved proposals for a specific record (newest first)
-- record_id is UUID in the proposals table
-- Explicitly excludes submitter_email for privacy (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION get_approved_by_record(
  p_table_name text,
  p_record_id uuid
)
RETURNS TABLE (
  id uuid,
  table_name text,
  record_id uuid,
  operation text,
  proposed_data jsonb,
  original_data jsonb,
  reviewed_data jsonb,
  status text,
  reviewed_at timestamptz,
  submitter_id uuid,
  submitter_name text
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    id, table_name, record_id, operation,
    proposed_data, original_data, reviewed_data,
    status, reviewed_at, submitter_id, submitter_name
  FROM proposals
  WHERE table_name = p_table_name
    AND record_id = p_record_id
    AND status = 'approved'
  ORDER BY reviewed_at DESC;
$$;

-- RPC: leaderboard with per-table breakdown
CREATE OR REPLACE FUNCTION get_leaderboard()
RETURNS TABLE (
  submitter_id uuid,
  submitter_name text,
  total bigint,
  by_table jsonb
) LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    sub.submitter_id,
    -- Use the submitter_name from the most recent approved proposal
    (
      SELECT p2.submitter_name
      FROM proposals p2
      WHERE p2.submitter_id = sub.submitter_id
        AND p2.status = 'approved'
      ORDER BY p2.reviewed_at DESC
      LIMIT 1
    ) AS submitter_name,
    SUM(sub.cnt) AS total,
    jsonb_object_agg(sub.table_name, sub.cnt) AS by_table
  FROM (
    SELECT submitter_id, table_name, COUNT(*) AS cnt
    FROM proposals
    WHERE status = 'approved' AND submitter_id IS NOT NULL
    GROUP BY submitter_id, table_name
  ) sub
  GROUP BY submitter_id
  ORDER BY total DESC, submitter_id ASC;
$$;
```

排行榜 `ORDER BY total DESC, submitter_id ASC` 確保同分時排序穩定。

### ProposalService 新增方法

```typescript
// 取得某筆記錄所有已核准提案（新至舊）
async getApprovedByRecord(
  tableName: string,
  recordId: string
): Promise<Proposal[]>
// 實作：supabase.rpc('get_approved_by_record', { p_table_name: tableName, p_record_id: recordId })

// 排行榜：登入用戶依核准數排序，含各類別細項
async getLeaderboard(): Promise<ContributorEntry[]>
// 實作：supabase.rpc('get_leaderboard')

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
      record-edit-history.component.html
  pages/
    contributors/
      contributors.component.ts          # 排行榜頁面
      contributors.component.html
    member-page/                          # 加入貢獻標示 + 開關狀態
    group-page/                           # 加入貢獻標示 + 開關狀態
    company-page/                         # 加入貢獻標示 + 開關狀態
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
- `history` 提案在成員/組合頁面顯示
- 最低貢獻門檻（1 筆以上即出現在排行榜）
