# 角色權限與 Audit Log 設計文件

**日期：** 2026-03-11
**狀態：** 草稿

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

### Revert（一鍵還原）

Admin 可在 audit log 頁對任意一筆記錄執行 Revert：
- **UPDATE** → 將 `old_data` 寫回該筆資料
- **INSERT** → 刪除該筆資料（撤銷新增）
- **DELETE** → 將 `old_data` 重新插入（恢復被刪資料）

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

-- 變更稽核
audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  text NOT NULL,
  record_id   uuid NOT NULL,
  operation   text NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  user_id     uuid,
  user_email  text,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz DEFAULT now()
)
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
    auth.uid(),
    auth.email(),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

掛在四張資料表上（members、groups、teams、history），`AFTER INSERT OR UPDATE OR DELETE`。

#### RLS 調整

| 表 | SELECT | INSERT | UPDATE | DELETE |
|----|--------|--------|--------|--------|
| members | 所有人 | 任何登入者 | 任何登入者 | **admin only** |
| groups | 所有人 | 任何登入者 | 任何登入者 | **admin only** |
| teams | 所有人 | 任何登入者 | 任何登入者 | **admin only** |
| history | 所有人 | 任何登入者 | 任何登入者 | **admin only** |
| user_roles | **admin only** | **admin only** | **admin only** | **admin only** |
| audit_log | **admin only** | 禁止（trigger only） | 禁止 | 禁止 |

Admin 判斷條件（用於 RLS policy）：
```sql
EXISTS (SELECT 1 FROM user_roles WHERE email = auth.email() AND role = 'admin')
```

---

## 頁面結構（新增）

```
/admin
├── /admin/members      ← 現有（刪除按鈕 admin only）
├── /admin/groups       ← 現有（刪除按鈕 admin only）
├── /admin/history      ← 現有（刪除按鈕 admin only）
├── /admin/audit-log    ← 新增（adminGuard 保護）
└── /admin/roles        ← 新增（adminGuard 保護）
```

---

## 頁面設計

### `/admin/audit-log`（admin only）

- 表格欄位：時間（`created_at`）、操作者 email、資料表、操作類型（新增/編輯/刪除）、Revert 按鈕
- 篩選列：依資料表（全部 / members / groups / teams / history）、依操作類型（全部 / INSERT / UPDATE / DELETE）
- 點擊任意一列 → 展開 diff 面板，僅顯示 `old_data` 與 `new_data` 中有差異的欄位
- Revert 按鈕：點擊後顯示確認 dialog（說明將執行的操作），確認後執行還原，執行成功顯示 toast 通知

### `/admin/roles`（admin only）

- 表格欄位：email、角色（Admin / Editor badge）、加入時間、移除按鈕
- 新增表單：輸入 email + 選擇角色（Admin / Editor）
- 移除限制：admin 不能移除自己的角色

---

## Angular 服務層（新增）

```
Services
├── AdminRoleService   查詢 user_roles 表；提供 isAdmin$（Observable<boolean>）與 isAdmin()（Promise<boolean>）
├── AuditLogService    查詢 audit_log；執行 revert 操作（UPDATE / DELETE / INSERT）
```

### `AdminRoleService`

- `isAdmin$: Observable<boolean>` — BehaviorSubject，登入後自動查詢 `user_roles`
- `isAdmin(): Promise<boolean>` — 一次性查詢，供 guard 使用
- `getAll(): Promise<UserRole[]>` — 取得所有角色記錄
- `add(email, role): Promise<void>` — 新增角色
- `remove(id): Promise<void>` — 移除角色

### `AuditLogService`

- `getAll(filter?): Promise<AuditLog[]>` — 查詢 audit_log，支援 table_name / operation 篩選
- `revert(log: AuditLog): Promise<void>` — 根據 operation 類型執行還原

### `AdminGuard`

```ts
export const adminGuard: CanActivateFn  // 檢查 isAdmin()，否則 redirect 到 /admin
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

### Admin Sidebar（`admin-shell.component.html`）

- 根據 `isAdmin$` 顯示/隱藏「Audit Log」和「角色管理」選單項目

### 三個現有 CRUD 頁面（members / groups / history）

- 刪除按鈕根據 `isAdmin$` 顯示/隱藏（editor 看不到）
- 無其他邏輯改動

---

## 範圍外（不在本次設計內）

- Email 通知（有人編輯資料時通知 admin）
- 細粒度欄位層級的寫入限制（editor 目前可編輯所有欄位）
- Audit log 分頁（初版顯示最近 200 筆）
- `is_approved` 欄位在 history 表的啟用（預留欄位，維持現狀）

---

## 成功標準

1. Admin 可在 `/admin/roles` 新增 / 移除 admin 或 editor 角色
2. 只有 admin 能看到刪除按鈕，editor 登入後看不到刪除功能
3. 任何新增或編輯操作在 audit log 中均有記錄，包含完整欄位 diff
4. Admin 在 audit log 頁對任意記錄執行 Revert，資料正確還原，並產生新的 audit log
5. 非 admin 直接訪問 `/admin/audit-log` 或 `/admin/roles` 時，自動被導向 `/admin`
