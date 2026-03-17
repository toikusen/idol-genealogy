# 提案系統（Wiki-Style Open Editing）設計文件

**日期：** 2026-03-17
**狀態：** 已核准
**範圍：** Phase 1 — 提案核心系統

---

## 概述

改變現有後台維護模式，開放大眾對成員、組合、公司、活動歷程等資料提案修改或新增。提案需經 admin/superadmin 審核後才正式上線，editor 角色不具審核權限。

---

## 功能範圍（Phase 1）

### 不在範圍內
- 貢獻者排行榜頁面（Phase 2）
- 個人提案歷史頁面（Phase 2）
- Email 通知推播
- DELETE 操作提案（僅允許 INSERT / UPDATE）

---

## 資料模型

### `proposals` 資料表

```sql
CREATE TABLE proposals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name      TEXT NOT NULL,
  -- 'members' | 'groups' | 'history' | 'companies'
  record_id       UUID,
  -- NULL = 新增提案；有值 = 修改現有記錄
  operation       TEXT NOT NULL,
  -- 'INSERT' | 'UPDATE'
  proposed_data   JSONB NOT NULL,
  -- 提案內容（只包含白名單欄位）
  original_data   JSONB,
  -- 提案時的原始快照，INSERT 時為 null
  reviewed_data   JSONB,
  -- 管理員修改後的版本，修改後核准時使用
  submitter_id    UUID REFERENCES auth.users(id),
  -- 登入者的 UID，匿名時為 null
  submitter_name  TEXT NOT NULL,
  -- 必填：登入者的 display name 或匿名者自填暱稱
  submitter_email TEXT,
  -- 選填：供未來通知使用
  status          TEXT NOT NULL DEFAULT 'pending',
  -- 'pending' | 'approved' | 'rejected'
  reviewer_note   TEXT,
  -- 拒絕或備注說明
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     UUID REFERENCES auth.users(id)
);
```

### RLS 政策

| 操作 | 允許對象 |
|------|---------|
| INSERT | 任何人（包含匿名） |
| SELECT（自己的） | 已登入且 submitter_id = auth.uid() |
| SELECT（全部） | admin / superadmin（使用現有 is_admin() function） |
| UPDATE | admin / superadmin |
| DELETE | superadmin 限定 |

### 欄位白名單設定

```typescript
// src/app/core/proposal-fields.config.ts
export const PROPOSAL_ALLOWED_FIELDS: Record<string, string[]> = {
  members: [
    'name', 'name_roman', 'nickname', 'birthdate',
    'color', 'color_name', 'instagram', 'facebook', 'x',
  ],
  // 排除：notes
  groups: [
    'name', 'name_jp', 'color', 'founded_at', 'disbanded_at',
    'instagram', 'facebook', 'x', 'youtube', 'company_id',
  ],
  // 排除：group_videos（整張表不開放）
  history: [
    'member_id', 'group_id', 'team_id', 'name_at_time',
    'status', 'joined_at', 'left_at',
  ],
  companies: [
    'name', 'description', 'website', 'instagram', 'facebook',
  ],
};
```

新增可編輯欄位只需修改此設定檔，無需改動邏輯層。

---

## 公開提案介面

### 入口位置

| 頁面 | 入口 |
|------|------|
| 成員詳細頁 `/member/:id` | 頁面右上角「✏️ 提案修改」按鈕 |
| 組合詳細頁 `/group/:id` | 頁面右上角「✏️ 提案修改」按鈕 |
| 公司詳細頁 `/company/:id` | 頁面右上角「✏️ 提案修改」按鈕 |
| 活動歷程區塊 | 每筆旁邊鉛筆圖示（修改）＋「＋ 新增歷程」按鈕 |
| 成員列表 `/members` | 右上角「＋ 提案新增成員」按鈕 |
| 組合列表 `/groups` | 右上角「＋ 提案新增組合」按鈕 |
| 公司列表 `/companies` | 右上角「＋ 提案新增公司」按鈕 |

### 提案流程

1. 點擊入口按鈕 → 開啟**側邊 Panel**（不跳頁）
2. Panel 顯示白名單欄位的表單，修改提案預填現有資料，新增提案欄位為空
3. 提案者資訊區塊：
   - **已登入：** 自動帶入 Google 帳號名稱為 submitter_name
   - **未登入：** 必填暱稱欄位（submitter_name），選填 Email
4. 送出 → 顯示「感謝提案！管理員審核後會更新上線。」
5. 送出後 Panel 自動關閉，頁面資料不立即變更

### 防濫用

- 同一 IP 短時間內送出過多提案：Supabase RLS 層限速或 Edge Function rate limit
- 管理員可封鎖特定 submitter_id 或 email（於後台標記，前端拒絕送出）

---

## 管理員審核介面

### 位置
後台（`/admin`）新增「**提案審核**」頁籤。

### 審核權限

| 角色 | 可審核 |
|------|--------|
| superadmin | ✅ |
| admin | ✅ |
| editor | ❌（維持現有限制） |

使用現有 `is_admin()` Supabase function，不新增角色。

### 列表視圖

- 預設顯示 `status = 'pending'` 提案
- 可切換查看已核准 / 已拒絕
- 欄位：資料類型、操作（新增/修改）、提案者暱稱、提案時間
- 按 created_at 升序排列（最舊的優先處理）
- 頁籤顯示待審核數量紅點

### 單筆審核視圖

- **左欄：** 原始資料（INSERT 時顯示「新記錄」）
- **右欄：** 提案內容，差異欄位高亮顯示
- 管理員可直接編輯右欄（修改後核准）
- 操作按鈕：
  - ✅ **核准** → 寫入對應資料表，status 更新為 'approved'
  - ❌ **拒絕** → status 更新為 'rejected'，可附說明文字
- 核准時：若存在 reviewed_data 則寫入 reviewed_data，否則寫入 proposed_data

---

## 貢獻者追蹤（Phase 1 打地基）

- 貢獻數以查詢計算：`COUNT(*) WHERE submitter_id = ? AND status = 'approved'`
- 匿名者以 submitter_name 顯示，無法跨提案合併身份
- 已登入者的 submitter_id 可在 Phase 2 用於貢獻者頁面排行榜

---

## 元件位置

```
src/app/
  core/
    proposal-fields.config.ts       # 欄位白名單設定
    proposal.service.ts             # Supabase CRUD for proposals
  shared/
    proposal-panel/
      proposal-panel.component.ts   # 側邊提案 Panel（通用）
  pages/
    admin/
      admin-proposals/
        admin-proposals.component.ts    # 提案列表
        admin-proposals.component.html
        admin-proposal-review/
          admin-proposal-review.component.ts  # 單筆審核
          admin-proposal-review.component.html
supabase/
  migrations/
    021_create_proposals.sql        # proposals 資料表 + RLS
```

---

## 不在範圍內

- 貢獻者排行榜（Phase 2）
- 個人提案歷史頁（Phase 2）
- Email 通知（Phase 2 或不做）
- DELETE 操作提案
- 提案衝突解決（同時修改同筆記錄）
- 手機版響應式（桌面優先）
