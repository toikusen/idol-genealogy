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

## `AuditLogService.getAll()` 擴充

### Cursor 型別

```typescript
interface AuditLogCursor {
  created_at: string;
  id: string;
}
```

使用 `{ created_at, id }` composite cursor，避免同毫秒多筆紀錄時 `lt(created_at)` 跳過資料。

### 日期範圍轉換（Component 層負責）

`input[type=date]` 回傳純日期字串（如 `"2025-05-28"`）。**Component** 在呼叫 `getAll()` 前將其轉換為 UTC timestamp，以正確反映本地時區（台灣 UTC+8）：

```typescript
function toUtcRangeStart(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toISOString();   // 本地 00:00 → UTC
}

function toUtcRangeEnd(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString();   // 本地隔日 00:00 → UTC，搭配 lt 使用
}
```

Service 的 `date_from` 對應 `gte`，`date_to` 對應 `lt`（非 `lte`）。

### Filter 介面

```typescript
interface AuditLogFilter {
  table_name?: string;
  operation?: string;
  member_id?: string;
  group_id?: string;
  date_from?: string;          // UTC ISO string，gte
  date_to?: string;            // UTC ISO string，lt（已含隔日偏移，由 component 算好傳入）
  cursor?: AuditLogCursor;     // 上一頁最後一筆的 { created_at, id }
  limit?: number;              // 預設 50
}
```

### 查詢邏輯

```typescript
async getAll(filter?: AuditLogFilter): Promise<{ data: AuditLog[]; hasMore: boolean }> {
  const limit = filter?.limit ?? 50;
  let query = this.db.from('audit_log').select('*');

  if (filter?.table_name) query = query.eq('table_name', filter.table_name);
  if (filter?.operation)  query = query.eq('operation', filter.operation);
  if (filter?.date_from)  query = query.gte('created_at', filter.date_from);
  if (filter?.date_to)    query = query.lt('created_at', filter.date_to);

  if (filter?.cursor) {
    const { created_at, id } = filter.cursor;
    // keyset pagination：同 timestamp 時用 id 打破平手
    query = query.or(
      `created_at.lt.${created_at},` +
      `and(created_at.eq.${created_at},id.lt.${id})`
    );
  }

  if (filter?.member_id) {
    // 預期行為：同時查詢「成員本身的變更」（record_id 命中）
    // 以及「與該成員相關的 history/songs 變更」（JSONB 欄位命中）
    query = query.or(
      `record_id.eq.${filter.member_id},` +
      `old_data->>member_id.eq.${filter.member_id},` +
      `new_data->>member_id.eq.${filter.member_id}`
    );
  }
  if (filter?.group_id) {
    // 預期行為：同時查詢「團體本身的變更」與「與該團體相關的 history/songs 變更」
    query = query.or(
      `record_id.eq.${filter.group_id},` +
      `old_data->>group_id.eq.${filter.group_id},` +
      `new_data->>group_id.eq.${filter.group_id}`
    );
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })   // composite sort，確保 keyset stable
    .limit(limit + 1);

  if (error) throw error;
  const rows = data ?? [];
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
  cursorStack.push(currentCursor)              // 推入本頁使用的 cursor，供「較新」還原
  currentCursor = { created_at: logs[last].created_at, id: logs[last].id }
  load()

「較新」按鈕：
  currentCursor = cursorStack.pop() ?? null    // 還原到上一頁的查詢 cursor
  load()
  // 若 cursorStack 為空，較新按鈕 disabled

任何篩選條件改變：
  cursorStack = [], currentCursor = null → load()
```

> **說明：** cursor stack 儲存的是「抵達當前頁時使用的 cursor 值」（含 null 代表第一頁）。往較新翻就是把 cursor 還原到上一次的值重新查詢，不需後端支援逆向翻頁。

---

## 資料庫 Index（需補 migration）

目前 `audit_log` 沒有 `created_at` index。分頁排序是 `created_at desc, id desc`，建議補：

```sql
create index if not exists audit_log_created_at_id_idx
  on audit_log (created_at desc, id desc);
```

此 migration 需加入 `supabase/migrations/` 目錄作為本次變更的一部分。

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
| `supabase/migrations/<timestamp>_audit_log_created_at_id_idx.sql` | 新增（DB index） |
| `src/app/core/audit-log.service.ts` | 擴充 `getAll()` 簽章與查詢邏輯 |
| `src/app/core/audit-log.service.spec.ts` | 更新測試：配合新回傳型別 `{ data, hasMore }` |
| `src/app/pages/admin/admin-audit-log/admin-audit-log.component.ts` | 新增狀態、分頁邏輯、autocomplete、日期轉換 |
| `src/app/pages/admin/admin-audit-log/admin-audit-log.component.html` | 新增篩選列、autocomplete dropdown、分頁按鈕 |
