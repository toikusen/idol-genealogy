# 角色權限與 Audit Log 設計文件

**日期：** 2026-03-11
**狀態：** 已審核通過（v2）

---

## 專案概述

為偶像族譜網頁新增角色管理與變更稽核功能。目前所有登入的 Google 帳號都有完整寫入權限，本功能將區分 Admin 與 Editor 兩種角色，並為所有資料變更建立可追蹤、可還原的 audit log。

---

## 核心功能

### 角色設計

- **Editor**（預設）：任何登入的 Google 帳號均可新增與編輯所有資料表（members、groups、teams、history），但不能刪除
- **Admin**：新增 + 編輯 + 刪除 + 查看 audit log + 管理角色清單
- 角色由 `user_roles` 資料表管理，Admin 在後台指派；`role` 欄位值為 `'admin'` 或 `'editor'`（editor 為標示用途，不影響 RLS 邏輯）

### Audit Log（自動記錄）

- 四張資料表（members、groups、teams、history）的所有 INSERT / UPDATE / DELETE 操作，透過 PostgreSQL trigger 自動寫入 `audit_log`
- 記錄：操作時間、操作者 `user_id` + `user_email`、資料表名稱、record id、操作類型、`old_data`（JSONB）、`new_data`（JSONB）
- INSERT 時 `old_data = null`；DELETE 時 `new_data = null`
- 所有寫入必須透過前端 anon/user key（PostgREST），確保 JWT claims 存在，`auth.uid()` 與 `auth.email()` 可正確被 trigger 讀取

### Revert（一鍵還原）

Admin 可在 audit log 頁對任意一筆記錄執行 Revert：
- **UPDATE** → 將 `old_data` 寫回該筆資料（呼叫 `.update(old_data).eq('id', record_id)`）
- **INSERT** → 刪除該筆資料（撤銷新增，呼叫 `.delete().eq('id', record_id)`）
- **DELETE** → 將 `old_data` 重新插入（呼叫 `.insert(old_data)`）

**FK 衝突處理：** Revert 若因 FK 約束失敗（`ON DELETE RESTRICT` 或父資料列已不存在），Supabase 會回傳錯誤，`AuditLogService.revert()` 應 catch 並 rethrow，UI 顯示明確錯誤訊息（例如：「無法還原：關聯資料已被刪除」）。

Revert 操作本身也會觸發 trigger，產生新的 audit log 記錄。

---

## 技術架構

### 資料庫

#### 新增資料表

```sql
-- 角色管理
user_roles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text UNIQUE NOT NULL,
  role       text NOT NULL CHECK (role IN ('admin', 'editor')),
  created_at timestamptz DEFAULT now()
)

-- 查詢優化 index
CREATE INDEX ON user_roles (email);

-- 變更稽核
audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  text NOT NULL,
  record_id   uuid NOT NULL,
  operation   text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  user_id     uuid,        -- NULL 若無 JWT context（理論上不應發生於前端寫入）
  user_email  text,        -- NULL 同上
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz DEFAULT now()
)

-- 查詢優化 index（支援篩選 + 排序）
CREATE INDEX ON audit_log (table_name, operation, created_at DESC);
```

#### Trigger Function

```sql
CREATE OR REPLACE FUNCTION log_changes()
RETURNS trigger AS $$
BEGIN
  INSERT INTO audit_log (table_name, record_id, operation, user_id, user_email, old_data, new_data)
  VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    auth.uid(),    -- 從 JWT GUC 讀取，前端 key 寫入時有值；service role 寫入時為 NULL
    auth.email(),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN NULL;  -- AFTER trigger：return value 被忽略，慣例回傳 NULL
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

掛在四張資料表上（members、groups、teams、history），`AFTER INSERT OR UPDATE OR DELETE FOR EACH ROW`。

> **注意：** `SECURITY DEFINER` 讓函數以 owner 身份執行，繞過 RLS，確保 trigger 可寫入 `audit_log`。`auth.uid()` / `auth.email()` 讀取 session-level GUC，在前端透過 anon key 發出的請求中有值；若透過 service role key 寫入則為 NULL（本專案不使用 service role key 進行資料寫入）。

#### RLS 調整

**重要：需先刪除既有 DELETE policies，再新增 admin-only 版本。**

既有四張表的 DELETE policy（`auth users can delete members/groups/teams/history`）允許所有登入者刪除，必須在 migration 中明確 DROP 後重建。

| 表 | SELECT | INSERT | UPDATE | DELETE |
|----|--------|--------|--------|--------|
| members | 所有人 | 任何登入者 | 任何登入者 | **admin only** |
| groups | 所有人 | 任何登入者 | 任何登入者 | **admin only** |
| teams | 所有人 | 任何登入者 | 任何登入者 | **admin only** |
| history | 所有人 | 任何登入者 | 任何登入者 | **admin only** |
| user_roles | **admin only** | **admin only** | **admin only** | **admin only** |
| audit_log | **admin only** | 無 policy（任何 role 皆無法直接 INSERT） | 無 policy | 無 policy |

> **audit_log 保護機制：** RLS 已啟用，但不設任何 INSERT/UPDATE/DELETE policy。Postgres RLS 預設 deny，因此所有直接寫入都被拒絕。Trigger 以 `SECURITY DEFINER` 執行，繞過 RLS，是唯一的合法寫入路徑。

Admin 判斷條件（用於 RLS policy）：
```sql
EXISTS (SELECT 1 FROM user_roles WHERE email = auth.email() AND role = 'admin')
```

---

## 路由（更新）

```ts
// app.routes.ts — 在現有 admin children 中新增：
{
  path: 'audit-log',
  canActivate: [adminGuard],
  loadComponent: () => import('./pages/admin/admin-audit-log/admin-audit-log.component')
    .then(m => m.AdminAuditLogComponent)
},
{
  path: 'roles',
  canActivate: [adminGuard],
  loadComponent: () => import('./pages/admin/admin-roles/admin-roles.component')
    .then(m => m.AdminRolesComponent)
}
```

---

## 頁面設計

### `/admin/audit-log`（admin only）

- 表格欄位：時間（`created_at`）、操作者 email、資料表、操作類型（新增/編輯/刪除）、Revert 按鈕
- 篩選列：依資料表（全部 / members / groups / teams / history）、依操作類型（全部 / INSERT / UPDATE / DELETE）
- 初版顯示最近 200 筆（`order('created_at', { ascending: false }).limit(200)`）
- 點擊任意一列 → 展開 diff 面板，僅顯示 `old_data` 與 `new_data` 中有差異的欄位
- Revert 按鈕：點擊後顯示確認 dialog，確認後執行還原；成功顯示 toast；失敗顯示錯誤訊息（含 FK 衝突說明）

### `/admin/roles`（admin only）

- 表格欄位：email、角色（Admin / Editor badge）、加入時間、移除按鈕
- 新增表單：輸入 email + 選擇角色（Admin / Editor）
- 移除限制：admin 不能移除自己的角色

---

## Angular 服務層（新增）

```
Services
├── AdminRoleService   查詢 user_roles 表；提供 isAdmin$（Observable<boolean>）與 isAdmin()（Promise<boolean>）
├── AuditLogService    查詢 audit_log；執行 revert 操作
```

### `AdminRoleService`

- `isAdmin$: Observable<boolean>` — `BehaviorSubject<boolean>`，**初始值為 `false`**；在 `SupabaseService.authState$` emit 非 null 後，自動查詢 `user_roles` 並更新；登出後重設為 `false`
- `isAdmin(): Promise<boolean>` — 直接查詢 `user_roles`，供 `adminGuard` 使用
- `getAll(): Promise<UserRole[]>` — 取得所有角色記錄
- `add(email: string, role: 'admin' | 'editor'): Promise<void>`
- `remove(id: string): Promise<void>`

### `AuditLogService`

- `getAll(filter?: { table_name?: string; operation?: string }): Promise<AuditLog[]>` — 最多 200 筆，`created_at DESC`
- `revert(log: AuditLog): Promise<void>` — 根據 `log.operation` 執行：
  - `INSERT` → `supabase.from(log.table_name).delete().eq('id', log.record_id)`
  - `UPDATE` → `supabase.from(log.table_name).update(log.old_data).eq('id', log.record_id)`
  - `DELETE` → `supabase.from(log.table_name).insert(log.old_data)`
  - 任何 Supabase 錯誤 → throw（UI 負責顯示錯誤訊息）

### `AdminGuard`

```ts
export const adminGuard: CanActivateFn
// 呼叫 AdminRoleService.isAdmin()
// false → redirect 到 /admin（不是 /login，editor 仍可進入 /admin）
```

---

## 資料模型（新增介面）

```ts
interface UserRole {
  id: string;
  email: string;
  role: 'admin' | 'editor';
  created_at: string;
}

interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  user_id: string | null;
  user_email: string | null;
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  created_at: string;
}
```

---

## 現有頁面調整

### Admin Sidebar（`admin-shell.component.ts/.html`）

- 注入 `AdminRoleService`，訂閱 `isAdmin$`
- 根據 `isAdmin$` 顯示/隱藏「Audit Log」和「角色管理」選單項目
- `isAdmin$` 初始值為 `false`，查詢完成前選單項目隱藏（安全預設）

### 三個現有 CRUD 頁面（admin-members / admin-groups / admin-history）

- 各自注入 `AdminRoleService`
- 刪除按鈕根據 `isAdmin$` 顯示/隱藏（editor 看不到）
- 無其他邏輯改動

---

## 範圍外（不在本次設計內）

- Email 通知（有人編輯資料時通知 admin）
- 細粒度欄位層級的寫入限制（editor 目前可編輯所有欄位）
- Audit log 分頁（初版限制 200 筆）
- `is_approved` 欄位在 history 表的啟用（預留欄位，維持現狀）
- 以 `user_id uuid` 取代 `email` 作為 user_roles 主識別欄位（email 變更風險可接受，此為 wiki 協作工具而非高安全場景）

---

## 成功標準

1. Admin 可在 `/admin/roles` 新增 / 移除 admin 或 editor 角色，自己不能移除自己
2. 只有 admin 能看到刪除按鈕，editor 登入後看不到刪除功能
3. 任何新增或編輯操作在 audit log 中均有記錄，包含完整欄位 diff（old_data / new_data）
4. Admin 在 audit log 頁對 UPDATE 記錄執行 Revert，資料正確還原；INSERT / DELETE 的 Revert 亦正確執行
5. Revert 遇到 FK 衝突時，UI 顯示明確錯誤訊息，不靜默失敗
6. 非 admin 直接訪問 `/admin/audit-log` 或 `/admin/roles` 時，自動被導向 `/admin`
7. Revert 操作本身在 audit log 中留有記錄
