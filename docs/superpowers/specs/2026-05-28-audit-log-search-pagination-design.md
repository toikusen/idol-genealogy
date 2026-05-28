# 變更紀錄：搜尋、日期篩選與分頁設計

**Date:** 2026-05-28  
**Scope:** `admin-audit-log` 頁面強化  
**Status:** Approved

---

## 背景

目前 `admin-audit-log` 每次只載入最新 200 筆（`getAll()` 硬限制），沒有計數顯示，也無法查詢更早的歷史紀錄。本設計新增三項能力：

1. **成員／團體自動完成搜尋**（後端查詢，全域搜尋所有歷史）
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

### 介面

```typescript
interface AuditLogFilter {
  table_name?: string;
  operation?: string;
  member_id?: string;
  group_id?: string;
  date_from?: string;   // ISO date string，inclusive
  date_to?: string;     // ISO date string，inclusive（加到當日 23:59:59）
  cursor?: string;      // 上一頁最後一筆的 created_at（往舊方向）
  limit?: number;       // 預設 50
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
  if (filter?.date_to)    query = query.lte('created_at', filter.date_to + 'T23:59:59.999Z');
  if (filter?.cursor)     query = query.lt('created_at', filter.cursor);

  if (filter?.member_id) {
    query = query.or(
      `record_id.eq.${filter.member_id},` +
      `old_data->>member_id.eq.${filter.member_id},` +
      `new_data->>member_id.eq.${filter.member_id}`
    );
  }
  if (filter?.group_id) {
    query = query.or(
      `record_id.eq.${filter.group_id},` +
      `old_data->>group_id.eq.${filter.group_id},` +
      `new_data->>group_id.eq.${filter.group_id}`
    );
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit + 1);  // 多撈一筆判斷 hasMore

  if (error) throw error;
  const rows = data ?? [];
  const hasMore = rows.length > limit;
  return { data: hasMore ? rows.slice(0, limit) : rows, hasMore };
}
```

> **注意：** `getAll()` 回傳型別從 `Promise<AuditLog[]>` 改為 `Promise<{ data: AuditLog[]; hasMore: boolean }>`，需同步更新所有呼叫端。

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

// 日期篩選
dateFrom = '';
dateTo = '';

// 分頁
hasMore = false;
currentCursor: string | null = null;
cursorStack: string[] = [];   // 每次「較舊」前把當前第一筆 created_at 推入

interface AutocompleteItem {
  type: 'member' | 'group';
  id: string;
  name: string;
  sub?: string;    // 成員的所屬團體名稱
  photo_url?: string | null;
}
```

### 分頁流程

```
初始載入：
  cursorStack = [], currentCursor = null → load()

「較舊」按鈕：
  cursorStack.push(currentCursor)              // 推入本頁使用的 cursor，供「較新」還原
  currentCursor = logs[logs.length-1].created_at
  load()

「較新」按鈕：
  currentCursor = cursorStack.pop() ?? null    // 還原到上一頁的查詢 cursor
  load()
  // 若 cursorStack 為空，較新按鈕 disabled

任何篩選條件改變：
  cursorStack = [], currentCursor = null → load()
```

> **說明：** cursor stack 儲存的是「抵達當前頁時使用的 cursor 值」（含 null 代表第一頁）。往較新翻就是把 cursor 還原到上一次的值，重新查詢，不需要後端支援逆向翻頁。

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
| `src/app/core/audit-log.service.ts` | 擴充 `getAll()` 簽章與查詢邏輯 |
| `src/app/pages/admin/admin-audit-log/admin-audit-log.component.ts` | 新增狀態、分頁邏輯、autocomplete |
| `src/app/pages/admin/admin-audit-log/admin-audit-log.component.html` | 新增篩選列、autocomplete dropdown、分頁按鈕 |
