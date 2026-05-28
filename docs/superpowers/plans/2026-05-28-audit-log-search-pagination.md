# Audit Log Search, Date Filter & Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在後台 `admin-audit-log` 頁面加入成員/團體自動完成搜尋、日期範圍篩選、與 cursor-based 分頁，讓管理員能查詢任意舊的變更紀錄。

**Architecture:** 新增 Supabase RPC `get_audit_logs_paginated`（含 inline 權限檢查、keyset cursor），`AuditLogService.getAll()` 改呼叫 RPC 並回傳 `{ data, hasMore }`，component 加入 cursor stack 分頁、in-memory autocomplete、本地時區日期轉換。

**Tech Stack:** Angular 18 (standalone components, control flow syntax `@if/@for`), Supabase JS client v2, Karma/Jasmine

---

## File Map

| 檔案 | 動作 | 說明 |
|---|---|---|
| `supabase/migrations/064_get_audit_logs_paginated.sql` | 新增 | RPC 函數 + `audit_log_created_at_id_idx` |
| `src/app/core/audit-log.service.ts` | 修改 | 新增 `AuditLogCursor`, `AuditLogFilter` 介面；`getAll()` 改 RPC |
| `src/app/core/audit-log.service.spec.ts` | 修改 | 改寫 `getAll()` 的兩個測試；新增 RPC params 測試 |
| `src/app/pages/admin/admin-audit-log/admin-audit-log.component.ts` | 修改 | 新增 state、pagination、autocomplete；export date utils |
| `src/app/pages/admin/admin-audit-log/admin-audit-log.component.spec.ts` | 新增 | 測試 date utils、pagination、autocomplete |
| `src/app/pages/admin/admin-audit-log/admin-audit-log.component.html` | 修改 | 新篩選列、autocomplete dropdown、分頁按鈕 |

---

## Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/064_get_audit_logs_paginated.sql`

- [ ] **Step 1: 建立 migration 檔案**

```sql
-- Migration 064: Paginated audit log RPC with composite keyset cursor,
-- date range, and member/group JSONB search.
-- Admin/editor-only; SECURITY DEFINER bypasses audit_log RLS.
-- Inline role check via user_roles + auth.email() enforces access control.
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
  LIMIT least(greatest(p_limit, 1), 101);
END;
$$;

REVOKE ALL ON FUNCTION get_audit_logs_paginated(
  text, text, uuid, uuid, timestamptz, timestamptz, timestamptz, uuid, int
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION get_audit_logs_paginated(
  text, text, uuid, uuid, timestamptz, timestamptz, timestamptz, uuid, int
) TO authenticated;

CREATE INDEX IF NOT EXISTS audit_log_created_at_id_idx
  ON audit_log (created_at DESC, id DESC);
```

- [ ] **Step 2: Apply migration**

```bash
pnpm supabase db push
```

Expected: migration applies without error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/064_get_audit_logs_paginated.sql
git commit -m "✨ feat(db): add get_audit_logs_paginated RPC and created_at_id index"
```

---

## Task 2: Update `AuditLogService.getAll()` (TDD)

**Files:**
- Modify: `src/app/core/audit-log.service.ts`
- Modify: `src/app/core/audit-log.service.spec.ts`

- [ ] **Step 1: 在 spec 中改寫 `getAll()` 的既有測試，加入新測試**

以下完整取代 spec 檔案中的兩個 `getAll()` 測試（第 49–77 行），並補一個參數傳遞測試：

```typescript
// 取代 "getAll() returns audit log entries ordered by created_at desc"
it('getAll() returns { data, hasMore: false } when results <= limit', async () => {
  const logs = [makeLog()];
  dbSpy.rpc.and.resolveTo({ data: logs, error: null });

  const result = await service.getAll();

  expect(dbSpy.rpc).toHaveBeenCalledWith('get_audit_logs_paginated', jasmine.any(Object));
  expect(result).toEqual({ data: logs, hasMore: false });
});

// 取代 "getAll() applies both table_name and operation filters when both provided"
it('getAll() returns { data: first 50, hasMore: true } when RPC returns 51 rows', async () => {
  const fiftyOneLogs = Array.from({ length: 51 }, (_, i) =>
    makeLog({ id: `log-${i}`, created_at: `2026-01-0${(i % 9) + 1}T00:00:00Z` })
  );
  dbSpy.rpc.and.resolveTo({ data: fiftyOneLogs, error: null });

  const result = await service.getAll();

  expect(result.data.length).toBe(50);
  expect(result.hasMore).toBe(true);
  expect(result.data[0].id).toBe('log-0');
});

// 新增：參數傳遞測試
it('getAll() passes all filter params to RPC', async () => {
  dbSpy.rpc.and.resolveTo({ data: [], error: null });
  const cursor = { created_at: '2025-05-01T00:00:00Z', id: 'cursor-id' };

  await service.getAll({
    table_name: 'members',
    operation: 'UPDATE',
    member_id: 'mem-1',
    group_id: 'grp-1',
    date_from: '2025-01-01T00:00:00.000Z',
    date_to: '2025-12-31T00:00:00.000Z',
    cursor,
    limit: 50,
  });

  expect(dbSpy.rpc).toHaveBeenCalledWith('get_audit_logs_paginated', {
    p_table_name:          'members',
    p_operation:           'UPDATE',
    p_member_id:           'mem-1',
    p_group_id:            'grp-1',
    p_date_from:           '2025-01-01T00:00:00.000Z',
    p_date_to:             '2025-12-31T00:00:00.000Z',
    p_cursor_created_at:   '2025-05-01T00:00:00Z',
    p_cursor_id:           'cursor-id',
    p_limit:               51,
  });
});

// 新增：null filter 傳遞
it('getAll() passes nulls when filter is empty', async () => {
  dbSpy.rpc.and.resolveTo({ data: [], error: null });

  await service.getAll();

  expect(dbSpy.rpc).toHaveBeenCalledWith('get_audit_logs_paginated', {
    p_table_name:          null,
    p_operation:           null,
    p_member_id:           null,
    p_group_id:            null,
    p_date_from:           null,
    p_date_to:             null,
    p_cursor_created_at:   null,
    p_cursor_id:           null,
    p_limit:               51,
  });
});

// 新增：error 處理
it('getAll() throws when RPC returns an error', async () => {
  dbSpy.rpc.and.resolveTo({ data: null, error: { message: 'permission denied' } });

  await expectAsync(service.getAll()).toBeRejectedWith(
    jasmine.objectContaining({ message: 'permission denied' })
  );
});
```

- [ ] **Step 2: 執行測試，確認 5 個新測試 FAIL（getAll 相關）**

```bash
ng test --watch=false --include="**/audit-log.service.spec.ts"
```

Expected: `getAll()` 相關測試報 FAIL（`from` spy 被呼叫但現在期望 `rpc`）。`canRevertLog`, `revert`, `getRecord`, `updateRecord` 保持 PASS。

- [ ] **Step 3: 更新 `audit-log.service.ts`**

在檔案頂部（`type EditableAuditTable` 之前）加入兩個介面：

```typescript
export interface AuditLogCursor {
  created_at: string;
  id: string;
}

export interface AuditLogFilter {
  table_name?: string;
  operation?: string;
  member_id?: string;
  group_id?: string;
  date_from?: string;
  date_to?: string;
  cursor?: AuditLogCursor;
  limit?: number;
}
```

將 `getAll()` 方法完整取代：

```typescript
async getAll(filter?: AuditLogFilter): Promise<{ data: AuditLog[]; hasMore: boolean }> {
  const limit = filter?.limit ?? 50;
  const { data, error } = await this.db.rpc('get_audit_logs_paginated', {
    p_table_name:          filter?.table_name          ?? null,
    p_operation:           filter?.operation           ?? null,
    p_member_id:           filter?.member_id           ?? null,
    p_group_id:            filter?.group_id            ?? null,
    p_date_from:           filter?.date_from           ?? null,
    p_date_to:             filter?.date_to             ?? null,
    p_cursor_created_at:   filter?.cursor?.created_at  ?? null,
    p_cursor_id:           filter?.cursor?.id          ?? null,
    p_limit:               limit + 1,
  });
  if (error) throw error;
  const rows = (data ?? []) as AuditLog[];
  const hasMore = rows.length > limit;
  return { data: hasMore ? rows.slice(0, limit) : rows, hasMore };
}
```

- [ ] **Step 4: 執行測試，確認全部 PASS**

```bash
ng test --watch=false --include="**/audit-log.service.spec.ts"
```

Expected: 全部 PASS（含原有 `canRevertLog`, `revert`, `getRecord`, `updateRecord`）。

- [ ] **Step 5: Commit**

```bash
git add src/app/core/audit-log.service.ts src/app/core/audit-log.service.spec.ts
git commit -m "✨ feat(audit-log): replace getAll() with paginated RPC call"
```

---

## Task 3: Component — Date Utils + Pagination State (TDD)

**Files:**
- Modify: `src/app/pages/admin/admin-audit-log/admin-audit-log.component.ts`
- Create: `src/app/pages/admin/admin-audit-log/admin-audit-log.component.spec.ts`

- [ ] **Step 1: 建立 spec 檔案，寫 date util 測試**

```typescript
// src/app/pages/admin/admin-audit-log/admin-audit-log.component.spec.ts
import { toUtcRangeStart, toUtcRangeEnd } from './admin-audit-log.component';

describe('audit log date utils', () => {
  it('toUtcRangeEnd is exactly 24 hours after toUtcRangeStart for the same date', () => {
    const start = new Date(toUtcRangeStart('2025-05-28')).getTime();
    const end   = new Date(toUtcRangeEnd('2025-05-28')).getTime();
    expect(end - start).toBe(24 * 60 * 60 * 1000);
  });

  it('toUtcRangeStart returns a valid ISO string', () => {
    const result = toUtcRangeStart('2025-05-28');
    expect(() => new Date(result).toISOString()).not.toThrow();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('toUtcRangeEnd is later than toUtcRangeStart', () => {
    const start = new Date(toUtcRangeStart('2025-05-28'));
    const end   = new Date(toUtcRangeEnd('2025-05-28'));
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });
});
```

- [ ] **Step 2: 執行，確認 FAIL（export 尚未存在）**

```bash
ng test --watch=false --include="**/admin-audit-log.component.spec.ts"
```

Expected: 編譯錯誤（`toUtcRangeStart` not found）。

- [ ] **Step 3: 在 component.ts 頂部 export date utils，加入新介面與 state**

在 `import` 區塊下方、`@Component` 前加入：

```typescript
export interface AutocompleteItem {
  type: 'member' | 'group';
  id: string;
  name: string;
  photo_url?: string | null;
}

export function toUtcRangeStart(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toISOString();
}

export function toUtcRangeEnd(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}
```

在 class body 中既有屬性區塊後加入新屬性：

```typescript
// Autocomplete
autocompleteQuery = '';
autocompleteResults: AutocompleteItem[] = [];
showAutocomplete = false;
selectedMemberId: string | null = null;
selectedGroupId: string | null = null;

// 日期篩選（本地日期字串）
dateFrom = '';
dateTo = '';

// 分頁
hasMore = false;
currentCursor: AuditLogCursor | null = null;
cursorStack: (AuditLogCursor | null)[] = [];
```

同時更新 import，從 service 引入新型別：

```typescript
import { AuditLogService, AuditLogFilter, AuditLogCursor } from '../../../core/audit-log.service';
```

- [ ] **Step 4: 執行 date utils 測試，確認 PASS**

```bash
ng test --watch=false --include="**/admin-audit-log.component.spec.ts"
```

Expected: 3 個 date util 測試全部 PASS。

- [ ] **Step 5: 在 spec 補 pagination 測試**

在 spec 檔案加入（date utils describe 之後）：

```typescript
import { TestBed } from '@angular/core/testing';
import { AdminAuditLogComponent, AutocompleteItem, toUtcRangeStart, toUtcRangeEnd } from './admin-audit-log.component';
import { AuditLogService } from '../../../core/audit-log.service';
import { AdminRoleService } from '../../../core/admin-role.service';
import { MemberService } from '../../../core/member.service';
import { GroupService } from '../../../core/group.service';
import { CompanyService } from '../../../core/company.service';
import { ActivatedRoute } from '@angular/router';
import { AuditLog } from '../../../models';

function makeLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 'log-1', table_name: 'members', record_id: 'rec-1',
    operation: 'UPDATE', user_id: null, user_email: 'a@b.com',
    old_data: {}, new_data: {}, created_at: '2026-05-01T12:00:00Z',
    ...overrides,
  };
}

describe('AdminAuditLogComponent — pagination', () => {
  let component: AdminAuditLogComponent;
  let auditLogSpy: jasmine.SpyObj<AuditLogService>;

  beforeEach(async () => {
    auditLogSpy = jasmine.createSpyObj('AuditLogService', ['getAll', 'canRevertLog', 'revert', 'getRecord', 'updateRecord']);
    auditLogSpy.getAll.and.resolveTo({ data: [], hasMore: false });

    await TestBed.configureTestingModule({
      imports: [AdminAuditLogComponent],
      providers: [
        { provide: AuditLogService, useValue: auditLogSpy },
        { provide: AdminRoleService, useValue: jasmine.createSpyObj('AdminRoleService', { getCurrentRole: Promise.resolve(null), isAdmin$: { subscribe: (fn: any) => { fn(false); return { unsubscribe: () => {} }; } } }) },
        { provide: MemberService, useValue: jasmine.createSpyObj('MemberService', { getAll: Promise.resolve([]) }) },
        { provide: GroupService, useValue: jasmine.createSpyObj('GroupService', { getAll: Promise.resolve([]) }) },
        { provide: CompanyService, useValue: jasmine.createSpyObj('CompanyService', { getAll: Promise.resolve([]) }) },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AdminAuditLogComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    auditLogSpy.getAll.calls.reset();
  });

  it('goOlder() pushes currentCursor to stack and sets cursor to last log', async () => {
    component.logs = [
      makeLog({ id: 'first', created_at: '2026-05-01T12:00:00Z' }),
      makeLog({ id: 'last',  created_at: '2026-04-01T00:00:00Z' }),
    ];
    component.currentCursor = null;
    auditLogSpy.getAll.and.resolveTo({ data: [], hasMore: false });

    await component.goOlder();

    expect(component.cursorStack).toEqual([null]);
    expect(component.currentCursor).toEqual({
      created_at: '2026-04-01T00:00:00Z',
      id: 'last',
    });
    expect(auditLogSpy.getAll).toHaveBeenCalled();
  });

  it('goNewer() pops from cursorStack and restores cursor', async () => {
    const prevCursor = { created_at: '2026-03-01T00:00:00Z', id: 'prev' };
    component.cursorStack = [prevCursor];
    component.currentCursor = { created_at: '2026-02-01T00:00:00Z', id: 'current' };
    auditLogSpy.getAll.and.resolveTo({ data: [], hasMore: false });

    await component.goNewer();

    expect(component.currentCursor).toEqual(prevCursor);
    expect(component.cursorStack.length).toBe(0);
    expect(auditLogSpy.getAll).toHaveBeenCalled();
  });

  it('goNewer() restores null cursor when stack had null', async () => {
    component.cursorStack = [null];
    component.currentCursor = { created_at: '2026-02-01T00:00:00Z', id: 'x' };
    auditLogSpy.getAll.and.resolveTo({ data: [], hasMore: false });

    await component.goNewer();

    expect(component.currentCursor).toBeNull();
  });

  it('canGoNewer is false when cursorStack is empty', () => {
    component.cursorStack = [];
    expect(component.canGoNewer).toBeFalse();
  });

  it('canGoNewer is true when cursorStack has items', () => {
    component.cursorStack = [null];
    expect(component.canGoNewer).toBeTrue();
  });
});
```

- [ ] **Step 6: 執行，確認 pagination 測試 FAIL（方法尚未存在）**

```bash
ng test --watch=false --include="**/admin-audit-log.component.spec.ts"
```

Expected: `goOlder`, `goNewer`, `canGoNewer` not found errors。

- [ ] **Step 7: 在 component.ts 加入 pagination 方法並更新 `load()`**

加入以下方法（在 class body 中 `save()` 之前）：

```typescript
get canGoNewer(): boolean {
  return this.cursorStack.length > 0;
}

get displayCount(): string {
  const n = this.displayLogs.length;
  return this.hasMore ? `顯示 ${n} 筆（還有更多）` : `顯示 ${n} 筆`;
}

async goOlder(): Promise<void> {
  const last = this.logs[this.logs.length - 1];
  if (!last) return;
  this.cursorStack.push(this.currentCursor);
  this.currentCursor = { created_at: last.created_at, id: last.id };
  await this.load();
}

async goNewer(): Promise<void> {
  this.currentCursor = this.cursorStack.pop() ?? null;
  await this.load();
}

resetPagination(): void {
  this.cursorStack = [];
  this.currentCursor = null;
}
```

將 `load()` 方法完整取代：

```typescript
async load() {
  this.loading = true;
  this.error = '';
  try {
    const filter: AuditLogFilter = {};
    if (this.filterTable)       filter.table_name = this.filterTable;
    if (this.filterOperation)   filter.operation  = this.filterOperation;
    if (this.selectedMemberId)  filter.member_id  = this.selectedMemberId;
    if (this.selectedGroupId)   filter.group_id   = this.selectedGroupId;
    if (this.dateFrom)          filter.date_from  = toUtcRangeStart(this.dateFrom);
    if (this.dateTo)            filter.date_to    = toUtcRangeEnd(this.dateTo);
    if (this.currentCursor)     filter.cursor     = this.currentCursor;

    const { data, hasMore } = await this.auditLog.getAll(filter);
    this.logs = data;
    this.hasMore = hasMore;
  } catch (e: any) {
    this.error = e.message || '載入失敗';
  } finally {
    this.loading = false;
  }
}
```

- [ ] **Step 8: 執行所有 component spec，確認 PASS**

```bash
ng test --watch=false --include="**/admin-audit-log.component.spec.ts"
```

Expected: date utils (3) + pagination (5) 全部 PASS。

- [ ] **Step 9: Commit**

```bash
git add src/app/pages/admin/admin-audit-log/admin-audit-log.component.ts \
        src/app/pages/admin/admin-audit-log/admin-audit-log.component.spec.ts
git commit -m "✨ feat(audit-log): add pagination state, date utils, and load() refactor"
```

---

## Task 4: Component — Autocomplete Logic (TDD)

**Files:**
- Modify: `src/app/pages/admin/admin-audit-log/admin-audit-log.component.ts`
- Modify: `src/app/pages/admin/admin-audit-log/admin-audit-log.component.spec.ts`

- [ ] **Step 1: 在 spec 加入 autocomplete 測試**

在 spec 末尾加入：

```typescript
describe('AdminAuditLogComponent — autocomplete', () => {
  let component: AdminAuditLogComponent;
  let auditLogSpy: jasmine.SpyObj<AuditLogService>;

  const mockMembers = [
    { id: 'm1', name: '木村咲子', name_roman: null, name_hiragana: null, emoji: null, photo_url: null, color: null, color_name: null, birthdate: null, nickname: null, instagram: null, facebook: null, x: null, maid_url: null, notes: null, company_id: null, no_sns: false, updated_at: '', created_at: '' },
    { id: 'm2', name: '山田花子', name_roman: 'Hanako', name_hiragana: null, emoji: null, photo_url: null, color: null, color_name: null, birthdate: null, nickname: null, instagram: null, facebook: null, x: null, maid_url: null, notes: null, company_id: null, no_sns: false, updated_at: '', created_at: '' },
  ];
  const mockGroups = [
    { id: 'g1', name: 'AKB48', name_jp: null, photo_url: null, color: '#fff', company: null, company_id: null, founded_at: null, disbanded_at: null, notes: null, is_trainee: false, style: null, instagram: null, facebook: null, x: null, youtube: null, timetree_url: null, updated_at: '', created_at: '' },
  ];

  beforeEach(async () => {
    auditLogSpy = jasmine.createSpyObj('AuditLogService', ['getAll', 'canRevertLog', 'revert', 'getRecord', 'updateRecord']);
    auditLogSpy.getAll.and.resolveTo({ data: [], hasMore: false });

    const memberSpy = jasmine.createSpyObj('MemberService', { getAll: Promise.resolve(mockMembers) });
    const groupSpy  = jasmine.createSpyObj('GroupService',  { getAll: Promise.resolve(mockGroups), getTeamsByGroup: Promise.resolve([]) });

    await TestBed.configureTestingModule({
      imports: [AdminAuditLogComponent],
      providers: [
        { provide: AuditLogService, useValue: auditLogSpy },
        { provide: AdminRoleService, useValue: jasmine.createSpyObj('AdminRoleService', { getCurrentRole: Promise.resolve(null), isAdmin$: { subscribe: (fn: any) => { fn(false); return { unsubscribe: () => {} }; } } }) },
        { provide: MemberService,  useValue: memberSpy },
        { provide: GroupService,   useValue: groupSpy },
        { provide: CompanyService, useValue: jasmine.createSpyObj('CompanyService', { getAll: Promise.resolve([]) }) },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AdminAuditLogComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('computeAutocompleteResults filters members by name', () => {
    component.autocompleteQuery = '木村';
    const results = component.computeAutocompleteResults();
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('m1');
    expect(results[0].type).toBe('member');
  });

  it('computeAutocompleteResults filters members by name_roman', () => {
    component.autocompleteQuery = 'Hana';
    const results = component.computeAutocompleteResults();
    const memberResult = results.find(r => r.type === 'member');
    expect(memberResult?.id).toBe('m2');
  });

  it('computeAutocompleteResults includes groups', () => {
    component.autocompleteQuery = 'AKB';
    const results = component.computeAutocompleteResults();
    expect(results.length).toBe(1);
    expect(results[0].type).toBe('group');
  });

  it('computeAutocompleteResults returns empty for blank query', () => {
    component.autocompleteQuery = '';
    expect(component.computeAutocompleteResults()).toEqual([]);
  });

  it('selectAutocomplete sets selectedMemberId and resets pagination', async () => {
    const item: AutocompleteItem = { type: 'member', id: 'm1', name: '木村咲子' };
    await component.selectAutocomplete(item);
    expect(component.selectedMemberId).toBe('m1');
    expect(component.selectedGroupId).toBeNull();
    expect(component.cursorStack.length).toBe(0);
    expect(component.currentCursor).toBeNull();
  });

  it('selectAutocomplete sets selectedGroupId and clears selectedMemberId', async () => {
    component.selectedMemberId = 'm1';
    const item: AutocompleteItem = { type: 'group', id: 'g1', name: 'AKB48' };
    await component.selectAutocomplete(item);
    expect(component.selectedGroupId).toBe('g1');
    expect(component.selectedMemberId).toBeNull();
  });

  it('clearAutocomplete resets selection and reloads', async () => {
    component.selectedMemberId = 'm1';
    component.autocompleteQuery = '木村';
    await component.clearAutocomplete();
    expect(component.selectedMemberId).toBeNull();
    expect(component.selectedGroupId).toBeNull();
    expect(component.autocompleteQuery).toBe('');
    expect(auditLogSpy.getAll).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 執行，確認 FAIL**

```bash
ng test --watch=false --include="**/admin-audit-log.component.spec.ts"
```

Expected: `computeAutocompleteResults`, `selectAutocomplete`, `clearAutocomplete` not found。

- [ ] **Step 3: 在 component.ts 加入 autocomplete 方法**

加入下列方法（在 pagination 方法之後）：

```typescript
computeAutocompleteResults(): AutocompleteItem[] {
  const q = this.autocompleteQuery.trim().toLowerCase();
  if (!q) return [];
  const memberResults: AutocompleteItem[] = this.members
    .filter(m =>
      (m.name ?? '').toLowerCase().includes(q) ||
      (m.name_roman ?? '').toLowerCase().includes(q)
    )
    .slice(0, 5)
    .map(m => ({ type: 'member' as const, id: m.id, name: m.name ?? m.name_roman ?? m.id, photo_url: m.photo_url }));

  const groupResults: AutocompleteItem[] = this.groups
    .filter(g =>
      g.name.toLowerCase().includes(q) ||
      (g.name_jp ?? '').toLowerCase().includes(q)
    )
    .slice(0, 5)
    .map(g => ({ type: 'group' as const, id: g.id, name: g.name_jp ?? g.name, photo_url: g.photo_url }));

  return [...memberResults, ...groupResults];
}

onAutocompleteInput(): void {
  this.autocompleteResults = this.computeAutocompleteResults();
  this.showAutocomplete = this.autocompleteResults.length > 0;
}

onAutocompleteBlur(): void {
  setTimeout(() => { this.showAutocomplete = false; }, 150);
}

async selectAutocomplete(item: AutocompleteItem): Promise<void> {
  this.autocompleteQuery = item.name;
  this.showAutocomplete = false;
  this.selectedMemberId = item.type === 'member' ? item.id : null;
  this.selectedGroupId  = item.type === 'group'  ? item.id : null;
  this.resetPagination();
  await this.load();
}

async clearAutocomplete(): Promise<void> {
  this.autocompleteQuery = '';
  this.autocompleteResults = [];
  this.showAutocomplete = false;
  this.selectedMemberId = null;
  this.selectedGroupId  = null;
  this.resetPagination();
  await this.load();
}

async onFilterChange(): Promise<void> {
  this.resetPagination();
  await this.load();
}

async clearDateFilter(): Promise<void> {
  this.dateFrom = '';
  this.dateTo   = '';
  this.resetPagination();
  await this.load();
}
```

- [ ] **Step 4: 執行，確認全部 PASS**

```bash
ng test --watch=false --include="**/admin-audit-log.component.spec.ts"
```

Expected: date utils (3) + pagination (5) + autocomplete (7) = 15 tests PASS。

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/admin/admin-audit-log/admin-audit-log.component.ts \
        src/app/pages/admin/admin-audit-log/admin-audit-log.component.spec.ts
git commit -m "✨ feat(audit-log): add autocomplete filtering and filter change handlers"
```

---

## Task 5: Update HTML Template

**Files:**
- Modify: `src/app/pages/admin/admin-audit-log/admin-audit-log.component.html`

- [ ] **Step 1: 取代既有篩選列（第 4–23 行）**

取代以下區塊（從 `<!-- Filters -->` 到 `</div>` 閉合）：

```html
<!-- Filters -->
<div class="flex flex-wrap gap-4 mb-4">
  <select [(ngModel)]="filterTable" (change)="load()"
    ...
  </select>
  <select [(ngModel)]="filterOperation" (change)="load()"
    ...
  </select>
  <button (click)="load()" ...>重新載入</button>
</div>
```

改為：

```html
<!-- Filters -->
<div class="flex flex-col gap-2 mb-4">
  <!-- Row 1: autocomplete + table + operation -->
  <div class="flex flex-wrap gap-2 items-center">
    <!-- Autocomplete -->
    <div class="relative flex-1 min-w-[200px]">
      @if (selectedMemberId || selectedGroupId) {
        <div class="flex items-center gap-2 border border-gray-200 rounded-md px-3 py-1.5 bg-white text-sm">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-gray-400 flex-shrink-0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span class="text-gray-700 text-xs">{{ autocompleteQuery }}</span>
          <span class="ml-1 px-1.5 py-0.5 bg-pink-100 text-pink-600 rounded-full text-xs">
            {{ selectedMemberId ? '成員' : '團體' }}
          </span>
          <button (click)="clearAutocomplete()" class="ml-auto text-gray-400 hover:text-gray-600 transition-colors" aria-label="清除搜尋">✕</button>
        </div>
      } @else {
        <div class="relative">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            type="text"
            [(ngModel)]="autocompleteQuery"
            (input)="onAutocompleteInput()"
            (focus)="onAutocompleteInput()"
            (blur)="onAutocompleteBlur()"
            placeholder="搜尋成員或團體…"
            class="w-full border border-gray-200 rounded-md pl-8 pr-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-1 focus:ring-pink-300"
          />
        </div>
      }

      <!-- Dropdown -->
      @if (showAutocomplete && autocompleteResults.length > 0) {
        <div class="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-100 rounded-lg shadow-lg overflow-hidden">
          @let memberItems = autocompleteResults | filterType:'member';
          @let groupItems  = autocompleteResults | filterType:'group';

          @if (memberItems.length > 0) {
            <div class="px-3 py-1.5 text-xs text-gray-400 font-semibold bg-gray-50 uppercase tracking-wide">成員</div>
            @for (item of memberItems; track item.id) {
              <button
                type="button"
                (mousedown)="selectAutocomplete(item)"
                class="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-pink-50 transition-colors text-left"
              >
                <span>{{ item.name }}</span>
              </button>
            }
          }
          @if (groupItems.length > 0) {
            <div class="px-3 py-1.5 text-xs text-gray-400 font-semibold bg-gray-50 uppercase tracking-wide border-t border-gray-100">團體</div>
            @for (item of groupItems; track item.id) {
              <button
                type="button"
                (mousedown)="selectAutocomplete(item)"
                class="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-pink-50 transition-colors text-left"
              >
                <span>{{ item.name }}</span>
              </button>
            }
          }
        </div>
      }
    </div>

    <select [(ngModel)]="filterTable" (change)="onFilterChange()"
      class="border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-1 focus:ring-pink-300">
      <option value="">全部資料表</option>
      @for (t of tableOptions; track t) {
        <option [value]="t">{{ tableLabel(t) }}</option>
      }
    </select>

    <select [(ngModel)]="filterOperation" (change)="onFilterChange()"
      class="border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-1 focus:ring-pink-300">
      <option value="">全部操作</option>
      @for (op of operationOptions; track op) {
        <option [value]="op">{{ operationLabel(op) }}</option>
      }
    </select>

    <button (click)="onFilterChange()" class="px-3 py-1.5 text-sm text-gray-500 hover:text-pink-600 transition-colors">
      重新載入
    </button>
  </div>

  <!-- Row 2: date range + count -->
  <div class="flex flex-wrap gap-2 items-center">
    <input
      type="date"
      [(ngModel)]="dateFrom"
      (change)="onFilterChange()"
      class="border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-1 focus:ring-pink-300"
    />
    <span class="text-sm text-gray-400">～</span>
    <input
      type="date"
      [(ngModel)]="dateTo"
      (change)="onFilterChange()"
      class="border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-1 focus:ring-pink-300"
    />
    @if (dateFrom || dateTo) {
      <button (click)="clearDateFilter()" class="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">
        清除
      </button>
    }
    <span class="ml-auto text-xs text-gray-400">{{ displayCount }}</span>
  </div>
</div>
```

> **注意：** `| filterType` pipe 在這個 codebase 不存在。下一步用 `@let` + getter 取代，避免建立新 pipe。

- [ ] **Step 2: 將 autocomplete dropdown 中的 pipe 改為 getter 寫法**

將 dropdown 內的 `@let memberItems` / `@let groupItems` 改用 `autocompleteMembers` / `autocompleteGroups` getter：

HTML 中取代：
```html
@let memberItems = autocompleteResults | filterType:'member';
@let groupItems  = autocompleteResults | filterType:'group';

@if (memberItems.length > 0) {
  ...
  @for (item of memberItems; track item.id) {
```

改為：
```html
@if (autocompleteMembers.length > 0) {
  ...
  @for (item of autocompleteMembers; track item.id) {
```

同樣替換 `groupItems` → `autocompleteGroups`。

在 component.ts 加入兩個 getter：

```typescript
get autocompleteMembers(): AutocompleteItem[] {
  return this.autocompleteResults.filter(r => r.type === 'member');
}

get autocompleteGroups(): AutocompleteItem[] {
  return this.autocompleteResults.filter(r => r.type === 'group');
}
```

- [ ] **Step 3: 在表格底部加入分頁按鈕**

在 `</div>` 最後的 `@else` 區塊中（`displayLogs.length === 0` 的 else），找到 `</div>` 結尾（包裹 table 的那個），在其後加入：

```html
<!-- Pagination -->
@if (displayLogs.length > 0 || canGoNewer) {
  <div class="flex justify-end gap-2 mt-3">
    <button
      (click)="goNewer()"
      [disabled]="!canGoNewer || loading"
      class="px-3 py-1.5 text-sm border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      ← 較新
    </button>
    <button
      (click)="goOlder()"
      [disabled]="!hasMore || loading"
      class="px-3 py-1.5 text-sm border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      較舊 →
    </button>
  </div>
}
```

- [ ] **Step 4: 確認 TypeScript 編譯無誤**

```bash
ng build --configuration=development 2>&1 | grep -E "ERROR|error TS" | head -20
```

Expected: 無 TypeScript error。

- [ ] **Step 5: 執行完整測試套件**

```bash
ng test --watch=false --include="**/audit-log.service.spec.ts" --include="**/admin-audit-log.component.spec.ts"
```

Expected: 所有測試 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/app/pages/admin/admin-audit-log/admin-audit-log.component.html \
        src/app/pages/admin/admin-audit-log/admin-audit-log.component.ts
git commit -m "✨ feat(audit-log): add filter bar, autocomplete dropdown, and pagination UI"
```

---

## 自我審查

**Spec coverage：**

| Spec 要求 | 對應 Task |
|---|---|
| Autocomplete 候選前端 in-memory | Task 4 `computeAutocompleteResults()` |
| 選定後 ID 傳後端 | Task 4 `selectAutocomplete()` |
| 成員/團體只能擇一 | Task 4 `selectAutocomplete()` 清除另一個 |
| 日期 input[type=date] + 清除 | Task 5 HTML |
| toUtcRangeStart / toUtcRangeEnd | Task 3 exported functions |
| `date_to` 用 lt（非 lte） | Task 2 `getAll()` 傳 `date_to` + Task 3 `toUtcRangeEnd` |
| Composite cursor `{created_at, id}` | Task 2 RPC params |
| cursor stack 分頁 | Task 3 `goOlder()` / `goNewer()` |
| 篩選改變重置分頁 | Task 4 `onFilterChange()` / `clearAutocomplete()` 呼叫 `resetPagination()` |
| `hasMore` → `顯示 N 筆（還有更多）` | Task 3 `displayCount` getter |
| 「較新」disabled 在第一頁 | Task 5 HTML `[disabled]="!canGoNewer"` |
| RPC 權限檢查 | Task 1 SQL |
| REVOKE FROM PUBLIC | Task 1 SQL |
| `SET search_path = public` | Task 1 SQL |
| `audit_log_created_at_id_idx` | Task 1 SQL |

**無遺漏。**
