# 變更紀錄：搜尋、日期篩選與分頁設計

**Date:** 2026-05-28  
**Scope:** `admin-audit-log` 頁面強化  
**Status:** Approved

---

## 背景

目前 `admin-audit-log` 每次只載入最新 200 筆（`getAll()` 硬限制），沒有計數顯示，也無法查詢更早的歷史紀錄。本設計新增三項能力：

1. **成員／團體自動完成搜尋**：候選清單前端 in-memory 過濾（成員/團體資料已在 component 載入），選定後以 ID 發送後端查詢，搜尋全部歷史紀錄不受分頁限制
2. **日期範圍篩選**（開始日期 ～ 結束日期）
3. **Cursor-based 分頁**（每頁 50 筆，可往前翻到任意舊紀錄）

---

## UI 佈局

篩選列拆成兩排，位於頁首與表格之間：

```
Row 1: [🔍 成員/團體 autocomplete ────────] [資料表 ▾] [操作 ▾]
Row 2: [開始日期] ～ [結束日期] [清除]              顯示 50 筆

[表格主體]

                                        [← 較新]  [較舊 →]
```

- Autocomplete 輸入框選中後顯示 tag（`成員 ✕` 或 `團體 ✕`），點 ✕ 清除
- 日期欄位使用 `input[type=date]`，「清除」按鈕一次清除兩個欄位
- 計數顯示 `顯示 N 筆`（若 `hasMore` 則顯示 `顯示 50 筆（還有更多）`）
- 「← 較新」在最初頁時 disabled；「較舊 →」在無更多資料時 disabled

---

## Autocomplete 行為

1. 使用者輸入時，前端即時過濾已載入的 `members` 和 `groups`（in-memory，不需額外 API）
2. 下拉候選分兩區塊：**成員**（附所屬團體副標）、**團體**
3. 選取後：
   - 設定 `selectedMemberId` 或 `selectedGroupId`
   - 清空 `currentCursor` 和 `cursorStack`（重置到第一頁）
   - 觸發後端 `load()`
4. 點 ✕ 清除：清空 selection，觸發 `load()`
5. 成員和團體只能擇一（選了成員後再選團體，前者自動清除）

---

## 查詢層：RPC 取代 chained client filters

### 為什麼用 RPC

Composite keyset cursor（`(created_at, id)` 排序）與成員/團體 JSONB OR 條件若以 Supabase JS client 的 `.or()` 多次 append 實作，生成的 URL params 行為是 AND 語意，技術上可行，但 JSONB 欄位在 `.or()` filter string 內的語法缺乏官方明確文件，實作時易出錯。改用 RPC 可在 SQL 裡完整且無歧義地表達所有條件。

現有 `revert_audit_log` 和 `get_history_audit_logs_by_field` 已採用相同模式，新增 RPC 是一致的做法。

### Cursor 型別

```typescript
interface AuditLogCursor {
  created_at: string;
  id: string;
}
```

### 日期範圍轉換（Component 層負責）

`input[type=date]` 回傳純日期字串（如 `"2025-05-28"`）。**Component** 在呼叫 service 前轉換為 UTC timestamp，以正確反映使用者本地時區：

```typescript
function toUtcRangeStart(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toISOString();   // 本地 00:00 → UTC
}

function toUtcRangeEnd(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString();   // 本地隔日 00:00 → UTC，RPC 用 < 判斷
}
```

### RPC 函數定義（migration `064_get_audit_logs_paginated.sql`）

```sql
-- Admin/editor-only RPC for paginated audit log with composite cursor,
-- date range, and member/group search via record_id + JSONB fields.
-- Returns user_email for display in the admin panel.
-- SECURITY DEFINER bypasses audit_log RLS; inline role check enforces access control.
CREATE OR REPLACE FUNCTION get_audit_logs_paginated(
  p_table_name        text        DEFAULT NULL,
  p_operation         text        DEFAULT NULL,
  p_member_id         uuid        DEFAULT NULL,
  p_group_id          uuid        DEFAULT NULL,
  p_date_from         timestamptz DEFAULT NULL,
  p_date_to           timestamptz DEFAULT NULL,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id         uuid        DEFAULT NULL,
  p_limit             int         DEFAULT 51
)
RETURNS SETOF audit_log
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Inline permission check: caller must be admin, superadmin, or editor
  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE email = auth.email()
      AND role IN ('admin', 'superadmin', 'editor')
  ) THEN
    RAISE EXCEPTION '無查詢變更記錄的權限';
  END IF;

  RETURN QUERY
  SELECT *
  FROM audit_log
  WHERE
    (p_table_name IS NULL OR table_name = p_table_name)
    AND (p_operation IS NULL OR operation = p_operation)
    AND (p_date_from IS NULL OR created_at >= p_date_from)
    AND (p_date_to   IS NULL OR created_at <  p_date_to)
    AND (
      p_cursor_created_at IS NULL
      OR created_at < p_cursor_created_at
      OR (created_at = p_cursor_created_at AND id < p_cursor_id)
    )
    AND (
      p_member_id IS NULL
      OR record_id = p_member_id
      OR (old_data->>'member_id')::uuid = p_member_id
      OR (new_data->>'member_id')::uuid = p_member_id
    )
    AND (
      p_group_id IS NULL
      OR record_id = p_group_id
      OR (old_data->>'group_id')::uuid = p_group_id
      OR (new_data->>'group_id')::uuid = p_group_id
    )
  ORDER BY created_at DESC, id DESC
  LIMIT p_limit;
END;
$$;

-- Only authenticated users may call this function; inline check further
-- restricts to admin/superadmin/editor roles.
GRANT EXECUTE ON FUNCTION get_audit_logs_paginated(
  text, text, uuid, uuid, timestamptz, timestamptz, timestamptz, uuid, int
) TO authenticated;

-- Pagination index (created_at, id) for ORDER BY and keyset cursor
CREATE INDEX IF NOT EXISTS audit_log_created_at_id_idx
  ON audit_log (created_at DESC, id DESC);
```

> **注意：** 成員/團體搜尋的預期行為：同時包含「成員/團體本身的變更」（`record_id` 命中）與「關聯 history/songs 的變更」（JSONB 欄位命中）。這是刻意設計，讓使用者能一次看到一個成員/團體的全部相關紀錄。
>
> `audit_log_history_member_id_idx` 與 `audit_log_history_group_id_idx`（`061` migration）只涵蓋 history 的 `new_data` 欄位查詢，`old_data` 與 songs 資料表不在這兩個 index 內。完整效能 index 依未來資料量另行評估。

### Service 層

```typescript
interface AuditLogFilter {
  table_name?: string;
  operation?: string;
  member_id?: string;
  group_id?: string;
  date_from?: string;         // UTC ISO string（component 算好傳入）
  date_to?: string;           // UTC ISO string，RPC 用 < 判斷
  cursor?: AuditLogCursor;
  limit?: number;             // 預設 50，service 傳 limit+1 給 RPC
}

async getAll(filter?: AuditLogFilter): Promise<{ data: AuditLog[]; hasMore: boolean }> {
  const limit = filter?.limit ?? 50;
  const { data, error } = await this.db.rpc('get_audit_logs_paginated', {
    p_table_name:       filter?.table_name       ?? null,
    p_operation:        filter?.operation        ?? null,
    p_member_id:        filter?.member_id        ?? null,
    p_group_id:         filter?.group_id         ?? null,
    p_date_from:        filter?.date_from        ?? null,
    p_date_to:          filter?.date_to          ?? null,
    p_cursor_created_at: filter?.cursor?.created_at ?? null,
    p_cursor_id:         filter?.cursor?.id         ?? null,
    p_limit:            limit + 1,
  });
  if (error) throw error;
  const rows = (data ?? []) as AuditLog[];
  const hasMore = rows.length > limit;
  return { data: hasMore ? rows.slice(0, limit) : rows, hasMore };
}
```

> **注意：** `getAll()` 回傳型別從 `Promise<AuditLog[]>` 改為 `Promise<{ data: AuditLog[]; hasMore: boolean }>`，需同步更新所有呼叫端（component 及 spec）。

---

## `AdminAuditLogComponent` 狀態變更

### 新增欄位

```typescript
// Autocomplete
autocompleteQuery = '';
autocompleteResults: AutocompleteItem[] = [];
showAutocomplete = false;
selectedMemberId: string | null = null;
selectedGroupId: string | null = null;

// 日期篩選（input value，本地日期字串）
dateFrom = '';
dateTo = '';

// 分頁
hasMore = false;
currentCursor: AuditLogCursor | null = null;
cursorStack: (AuditLogCursor | null)[] = [];

interface AutocompleteItem {
  type: 'member' | 'group';
  id: string;
  name: string;
  sub?: string;           // 成員的所屬團體名稱
  photo_url?: string | null;
}
```

### 分頁流程

```
初始載入：
  cursorStack = [], currentCursor = null → load()

「較舊」按鈕：
  cursorStack.push(currentCursor)
  currentCursor = { created_at: logs[last].created_at, id: logs[last].id }
  load()

「較新」按鈕：
  currentCursor = cursorStack.pop() ?? null
  load()
  // 若 cursorStack 為空，較新按鈕 disabled

任何篩選條件改變：
  cursorStack = [], currentCursor = null → load()
```

---

## 不在本次範圍內

- 總筆數（COUNT query）：不實作，只顯示當頁筆數
- 「跳到第 N 頁」：不實作
- 操作者（user_email）搜尋：不實作
- 自由文字全欄位搜尋：不實作

---

## 受影響的檔案

| 檔案 | 變更類型 |
|---|---|
| `supabase/migrations/064_get_audit_logs_paginated.sql` | 新增（RPC 函數 + DB index） |
| `src/app/core/audit-log.service.ts` | 改用 `rpc('get_audit_logs_paginated')`，新回傳型別 |
| `src/app/core/audit-log.service.spec.ts` | 更新測試：配合新回傳型別 `{ data, hasMore }` |
| `src/app/pages/admin/admin-audit-log/admin-audit-log.component.ts` | 新增狀態、分頁邏輯、autocomplete、日期轉換 |
| `src/app/pages/admin/admin-audit-log/admin-audit-log.component.html` | 新增篩選列、autocomplete dropdown、分頁按鈕 |
