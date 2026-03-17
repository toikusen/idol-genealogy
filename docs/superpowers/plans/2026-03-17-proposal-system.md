# 提案系統（Wiki-Style Open Editing）Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public proposal submission system where anyone can suggest edits to members/groups/companies/history, with admin review + approve/reject workflow.

**Architecture:** Anonymous and logged-in users submit proposals via a side panel; proposals are stored in a `proposals` Supabase table; admin/superadmin review proposals in a new admin page, can edit before approving, and approved proposals are written directly to the target table.

**Tech Stack:** Angular 19 standalone components, Supabase PostgREST + RLS, Tailwind CSS

> **Scope note:** The spec mentions "＋ 提案新增成員/組合/公司" buttons on public list pages (`/members`, `/groups`, `/companies`). These public list pages **do not exist** in the current app (only admin pages at `/admin/members` etc.). Those INSERT entry points are **deferred to Phase 2** when public list pages are created. Phase 1 covers: UPDATE proposals from detail pages + INSERT history proposals from group-page.

---

## File Structure

**New files to create:**
- `supabase/migrations/025_create_proposals.sql` — proposals table + RLS
- `src/app/models/index.ts` — add `Proposal` interface (modify existing)
- `src/app/core/proposal-fields.config.ts` — field whitelist config
- `src/app/core/proposal.service.ts` — CRUD for proposals
- `src/app/core/proposal.service.spec.ts` — unit tests
- `src/app/shared/proposal-panel/proposal-panel.component.ts` — side panel component (standalone, inline template)
- `src/app/pages/admin/admin-proposals/admin-proposals.component.ts` — list view
- `src/app/pages/admin/admin-proposals/admin-proposals.component.html` — list template
- `src/app/pages/admin/admin-proposal-review/admin-proposal-review.component.ts` — single review view
- `src/app/pages/admin/admin-proposal-review/admin-proposal-review.component.html` — review template

**Files to modify:**
- `src/app/pages/member-page/member-page.component.ts` + `.html` — add proposal panel entry
- `src/app/pages/group-page/group-page.component.ts` + `.html` — add proposal panel entry + history entries
- `src/app/pages/company-page/company-page.component.ts` + `.html` — add proposal panel entry
- `src/app/pages/admin/admin-shell/admin-shell.component.ts` + `.html` — add nav link + pending count badge
- `src/app/app.routes.ts` — add /admin/proposals and /admin/proposals/:id routes

---

## Chunk 1: Foundation — DB, Model, Config, Service

### Task 1: DB Migration — proposals table

**Files:**
- Create: `supabase/migrations/025_create_proposals.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- supabase/migrations/025_create_proposals.sql
-- Apply manually in Supabase Dashboard SQL Editor

-- ============================================================
-- 1. proposals table
-- ============================================================
CREATE TABLE proposals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name      TEXT NOT NULL CHECK (table_name IN ('members', 'groups', 'history', 'companies')),
  record_id       UUID,
  -- NULL = INSERT proposal; non-null = UPDATE proposal
  operation       TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE')),
  proposed_data   JSONB NOT NULL,
  original_data   JSONB,
  -- snapshot of original record at time of submission (null for INSERT)
  reviewed_data   JSONB,
  -- admin may edit before approving; this overrides proposed_data on approve
  submitter_id    UUID REFERENCES auth.users(id),
  submitter_name  TEXT NOT NULL,
  -- required even for anonymous (they self-enter a nickname)
  submitter_email TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_note   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     UUID REFERENCES auth.users(id)
);

-- Index for admin list queries
CREATE INDEX ON proposals (status, created_at ASC);
CREATE INDEX ON proposals (submitter_id) WHERE submitter_id IS NOT NULL;

-- ============================================================
-- 2. RLS policies
-- ============================================================
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can submit proposals
CREATE POLICY "anyone can submit proposals" ON proposals
  FOR INSERT WITH CHECK (true);

-- Logged-in users can see their own proposals
CREATE POLICY "users can view own proposals" ON proposals
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND submitter_id = auth.uid()
  );

-- Admin/superadmin can see all proposals
CREATE POLICY "admins can view all proposals" ON proposals
  FOR SELECT USING (is_admin());

-- Admin/superadmin can update proposals (review workflow)
CREATE POLICY "admins can update proposals" ON proposals
  FOR UPDATE USING (is_admin()) WITH CHECK (is_admin());

-- Superadmin can delete proposals
CREATE POLICY "superadmin can delete proposals" ON proposals
  FOR DELETE USING (is_superadmin());
```

- [ ] **Step 2: Apply in Supabase Dashboard**

Open Supabase Dashboard → SQL Editor → paste contents of `025_create_proposals.sql` → Run.

Verify: the `proposals` table appears in Table Editor with the expected columns.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/025_create_proposals.sql
git commit -m "feat(db): add proposals table with RLS for open editing workflow"
```

---

### Task 2: Proposal Model + Field Whitelist Config

**Files:**
- Modify: `src/app/models/index.ts`
- Create: `src/app/core/proposal-fields.config.ts`

- [ ] **Step 1: Add `Proposal` interface to models**

In `src/app/models/index.ts`, append at the end:

```typescript
export interface Proposal {
  id: string;
  table_name: 'members' | 'groups' | 'history' | 'companies';
  record_id: string | null;
  operation: 'INSERT' | 'UPDATE';
  proposed_data: Record<string, any>;
  original_data: Record<string, any> | null;
  reviewed_data: Record<string, any> | null;
  submitter_id: string | null;
  submitter_name: string;
  submitter_email: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewer_note: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}
```

- [ ] **Step 2: Create proposal-fields.config.ts**

```typescript
// src/app/core/proposal-fields.config.ts

export const PROPOSAL_ALLOWED_FIELDS: Record<string, string[]> = {
  members: [
    'name', 'name_roman', 'nickname', 'birthdate',
    'color', 'color_name', 'instagram', 'facebook', 'x',
  ],
  groups: [
    'name', 'name_jp', 'color', 'founded_at', 'disbanded_at',
    'instagram', 'facebook', 'x', 'youtube', 'company_id',
  ],
  history: [
    'member_id', 'group_id', 'team_id', 'name_at_time',
    'status', 'joined_at', 'left_at',
  ],
  companies: [
    'name', 'description', 'website', 'instagram', 'facebook',
  ],
};

/** Field label map for display in forms and review UI */
export const FIELD_LABELS: Record<string, Record<string, string>> = {
  members: {
    name: '姓名', name_roman: '英文/拼音名', nickname: '暱稱',
    birthdate: '生日', color: '代表色(HEX)', color_name: '代表色名稱',
    instagram: 'Instagram', facebook: 'Facebook', x: 'X (Twitter)',
  },
  groups: {
    name: '組合名稱', name_jp: '日文名稱', color: '代表色(HEX)',
    founded_at: '成立日期', disbanded_at: '解散日期',
    instagram: 'Instagram', facebook: 'Facebook', x: 'X', youtube: 'YouTube',
    company_id: '所屬公司ID',
  },
  history: {
    member_id: '成員ID', group_id: '組合ID', team_id: '小隊ID',
    name_at_time: '當時藝名', status: '狀態',
    joined_at: '加入日期', left_at: '離開日期',
  },
  companies: {
    name: '公司名稱', description: '簡介', website: '官網',
    instagram: 'Instagram', facebook: 'Facebook',
  },
};
```

- [ ] **Step 3: Commit**

```bash
git add src/app/models/index.ts src/app/core/proposal-fields.config.ts
git commit -m "feat(model): add Proposal interface and PROPOSAL_ALLOWED_FIELDS config"
```

---

### Task 3: ProposalService

**Files:**
- Create: `src/app/core/proposal.service.ts`
- Create: `src/app/core/proposal.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/core/proposal.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { ProposalService } from './proposal.service';
import { SupabaseService } from './supabase.service';

describe('ProposalService', () => {
  let service: ProposalService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      from: jasmine.createSpy('from').and.returnValue({
        insert: jasmine.createSpy('insert').and.returnValue(Promise.resolve({ error: null })),
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null }))
          }),
          order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null }))
        }),
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue(Promise.resolve({ error: null }))
        }),
      })
    };
    TestBed.configureTestingModule({
      providers: [
        ProposalService,
        { provide: SupabaseService, useValue: { client: mockDb } }
      ]
    });
    service = TestBed.inject(ProposalService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('submit() should call from(proposals).insert()', async () => {
    await service.submit({
      table_name: 'members',
      record_id: 'uuid-123',
      operation: 'UPDATE',
      proposed_data: { name: 'Test' },
      original_data: { name: 'Old' },
      submitter_name: 'Tester',
    });
    expect(mockDb.from).toHaveBeenCalledWith('proposals');
  });

  it('getPendingCount() should return 0 for empty result', async () => {
    mockDb.from.and.returnValue({
      select: jasmine.createSpy('select').and.returnValue({
        eq: jasmine.createSpy('eq').and.returnValue(Promise.resolve({ data: [], error: null }))
      })
    });
    const count = await service.getPendingCount();
    expect(count).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests (expect FAIL — service not yet created)**

```bash
ng test --include=src/app/core/proposal.service.spec.ts --watch=false
```

Expected: FAIL with "ProposalService is not found" or similar.

- [ ] **Step 3: Implement ProposalService**

Create `src/app/core/proposal.service.ts`:

```typescript
import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Proposal } from '../models';

@Injectable({ providedIn: 'root' })
export class ProposalService {
  private get db() { return this.supabase.client; }

  constructor(private supabase: SupabaseService) {}

  /** Submit a proposal (works for anonymous and logged-in users) */
  async submit(proposal: Omit<Proposal, 'id' | 'status' | 'created_at' | 'reviewed_at' | 'reviewed_by' | 'reviewer_note' | 'reviewed_data'>): Promise<void> {
    const { error } = await this.db.from('proposals').insert(proposal);
    if (error) throw error;
  }

  /** Get all proposals, optionally filtered by status. Admin only. */
  async getAll(status?: 'pending' | 'approved' | 'rejected'): Promise<Proposal[]> {
    let query = this.db.from('proposals').select('*');
    if (status) {
      query = (query as any).eq('status', status);
    }
    const { data, error } = await (query as any).order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  /** Count of pending proposals. Admin only. */
  async getPendingCount(): Promise<number> {
    const { data, error } = await this.db
      .from('proposals')
      .select('id')
      .eq('status', 'pending');
    if (error) throw error;
    return (data ?? []).length;
  }

  /** Approve a proposal: apply data to target table, update status. Admin only. */
  async approve(proposal: Proposal, reviewedData?: Record<string, any>, note?: string): Promise<void> {
    const dataToApply = reviewedData ?? proposal.proposed_data;
    let applyError: any;

    if (proposal.operation === 'INSERT') {
      const { error } = await this.db.from(proposal.table_name).insert(dataToApply);
      applyError = error;
    } else {
      const { error } = await this.db
        .from(proposal.table_name)
        .update(dataToApply)
        .eq('id', proposal.record_id!);
      applyError = error;
    }
    if (applyError) throw applyError;

    const session = await this.supabase.getSessionOnce();
    const { error } = await this.db
      .from('proposals')
      .update({
        status: 'approved',
        reviewed_data: reviewedData ?? null,
        reviewer_note: note ?? null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: session?.user?.id ?? null,
      })
      .eq('id', proposal.id);
    if (error) throw error;
  }

  /** Reject a proposal. Admin only. */
  async reject(id: string, note?: string): Promise<void> {
    const session = await this.supabase.getSessionOnce();
    const { error } = await this.db
      .from('proposals')
      .update({
        status: 'rejected',
        reviewer_note: note ?? null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: session?.user?.id ?? null,
      })
      .eq('id', id);
    if (error) throw error;
  }
}
```

- [ ] **Step 4: Run tests again (expect PASS)**

```bash
ng test --include=src/app/core/proposal.service.spec.ts --watch=false
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/proposal.service.ts src/app/core/proposal.service.spec.ts
git commit -m "feat(service): add ProposalService with submit, getAll, approve, reject"
```

---

## Chunk 2: ProposalPanel Component

### Task 4: ProposalPanelComponent — shared side panel

**Files:**
- Create: `src/app/shared/proposal-panel/proposal-panel.component.ts`

This is a standalone component with inline template. It:
- Receives `tableName`, `recordId`, `operation`, `originalData` as inputs
- Displays a form with only the allowed fields for the given `tableName`
- Detects logged-in user via `SupabaseService.authState$`
- Emits `(closed)` when panel should close
- Calls `ProposalService.submit()` on form submission

- [ ] **Step 1: Create the component**

```typescript
// src/app/shared/proposal-panel/proposal-panel.component.ts
import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { ProposalService } from '../../core/proposal.service';
import { PROPOSAL_ALLOWED_FIELDS, FIELD_LABELS } from '../../core/proposal-fields.config';
import { Proposal } from '../../models';

@Component({
  selector: 'app-proposal-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- Overlay -->
    <div class="fixed inset-0 bg-black/40 z-40" (click)="close()"></div>

    <!-- Panel -->
    <div class="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col overflow-hidden">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-pink-50">
        <div>
          <h2 class="text-base font-semibold text-gray-800">
            {{ operation === 'INSERT' ? '提案新增' : '提案修改' }}
          </h2>
          <p class="text-xs text-gray-400 mt-0.5">{{ tableLabel }}</p>
        </div>
        <button (click)="close()" class="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
      </div>

      <!-- Success state -->
      @if (submitted) {
        <div class="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <div class="text-4xl">🎉</div>
          <p class="text-gray-700 font-medium">感謝您的提案！</p>
          <p class="text-sm text-gray-400">管理員審核後，內容將會更新上線。</p>
          <button (click)="close()" class="mt-2 px-5 py-2 bg-pink-500 text-white rounded-full text-sm hover:bg-pink-600">
            關閉
          </button>
        </div>
      } @else {
        <!-- Form -->
        <div class="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          @if (error) {
            <p class="text-sm text-red-500 bg-red-50 rounded px-3 py-2">{{ error }}</p>
          }

          <!-- Field inputs -->
          @for (field of allowedFields; track field) {
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">
                {{ fieldLabel(field) }}
              </label>
              <input
                type="text"
                [(ngModel)]="formData[field]"
                [name]="field"
                class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300"
                [placeholder]="original(field)"
              />
              @if (operation === 'UPDATE' && original(field)) {
                <p class="text-xs text-gray-300 mt-0.5">原始值：{{ original(field) }}</p>
              }
            </div>
          }

          <!-- Divider -->
          <div class="border-t border-gray-100 pt-4">
            <p class="text-xs font-medium text-gray-500 mb-3">提案者資訊</p>

            @if (loggedInName) {
              <p class="text-sm text-gray-600">以 <span class="font-medium text-pink-600">{{ loggedInName }}</span> 身份提案</p>
            } @else {
              <div class="space-y-3">
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">暱稱 <span class="text-red-400">*</span></label>
                  <input
                    type="text"
                    [(ngModel)]="submitterName"
                    name="submitterName"
                    class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                    placeholder="請輸入顯示名稱"
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-gray-600 mb-1">Email（選填）</label>
                  <input
                    type="email"
                    [(ngModel)]="submitterEmail"
                    name="submitterEmail"
                    class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
                    placeholder="供通知使用（不公開）"
                  />
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-gray-100 bg-gray-50">
          <button
            (click)="submitProposal()"
            [disabled]="submitting"
            class="w-full py-2.5 bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white rounded-full text-sm font-medium transition-colors"
          >
            {{ submitting ? '送出中...' : '送出提案' }}
          </button>
          <p class="text-xs text-gray-400 text-center mt-2">提案僅供參考，最終由管理員審核</p>
        </div>
      }
    </div>
  `,
})
export class ProposalPanelComponent implements OnInit {
  @Input() tableName: 'members' | 'groups' | 'history' | 'companies' = 'members';
  @Input() recordId: string | null = null;
  @Input() operation: 'INSERT' | 'UPDATE' = 'UPDATE';
  @Input() originalData: Record<string, any> = {};
  @Output() closed = new EventEmitter<void>();

  formData: Record<string, any> = {};
  submitterName = '';
  submitterEmail = '';
  loggedInName: string | null = null;
  loggedInId: string | null = null;
  submitting = false;
  submitted = false;
  error = '';

  get allowedFields(): string[] {
    return PROPOSAL_ALLOWED_FIELDS[this.tableName] ?? [];
  }

  get tableLabel(): string {
    return { members: '成員', groups: '組合', history: '活動歷程', companies: '公司' }[this.tableName] ?? '';
  }

  fieldLabel(field: string): string {
    return FIELD_LABELS[this.tableName]?.[field] ?? field;
  }

  original(field: string): string {
    const val = this.originalData?.[field];
    return val != null ? String(val) : '';
  }

  constructor(
    private supabase: SupabaseService,
    private proposalService: ProposalService,
  ) {}

  async ngOnInit() {
    // Pre-fill form with allowed fields from originalData
    for (const field of this.allowedFields) {
      this.formData[field] = this.originalData?.[field] ?? '';
    }

    const session = await this.supabase.getSessionOnce();
    if (session?.user) {
      this.loggedInName = session.user.user_metadata?.['full_name']
        ?? session.user.email
        ?? null;
      this.loggedInId = session.user.id;
    }
  }

  close() {
    this.closed.emit();
  }

  async submitProposal() {
    this.error = '';

    if (!this.loggedInName && !this.submitterName.trim()) {
      this.error = '請輸入暱稱';
      return;
    }

    // Build proposed_data: only include fields that differ from original (for UPDATE)
    // For INSERT, include all non-empty fields
    const proposed: Record<string, any> = {};
    for (const field of this.allowedFields) {
      const val = this.formData[field];
      if (val !== '' && val != null) {
        proposed[field] = val;
      }
    }

    if (Object.keys(proposed).length === 0) {
      this.error = '請至少填寫一個欄位';
      return;
    }

    this.submitting = true;
    try {
      await this.proposalService.submit({
        table_name: this.tableName,
        record_id: this.recordId,
        operation: this.operation,
        proposed_data: proposed,
        original_data: this.operation === 'UPDATE' ? this.originalData : null,
        submitter_id: this.loggedInId,
        submitter_name: this.loggedInName ?? this.submitterName.trim(),
        submitter_email: this.submitterEmail.trim() || null,
      });
      this.submitted = true;
    } catch (e: any) {
      this.error = e.message ?? '送出失敗，請稍後再試';
    } finally {
      this.submitting = false;
    }
  }
}
```

- [ ] **Step 2: Verify build**

```bash
ng build --configuration=production 2>&1 | tail -20
```

Expected: BUILD SUCCESS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/app/shared/proposal-panel/proposal-panel.component.ts
git commit -m "feat(ui): add ProposalPanelComponent — side panel for submitting proposals"
```

---

## Chunk 3: Public Entry Points

### Task 5: Member page — proposal entry

**Files:**
- Modify: `src/app/pages/member-page/member-page.component.ts`
- Modify: `src/app/pages/member-page/member-page.component.html`

The member page needs:
1. A "✏️ 提案修改" button in the page header (top-right area)
2. Clicking opens `ProposalPanelComponent` with `tableName='members'`, `operation='UPDATE'`, `originalData=member` (filtered to allowed fields), `recordId=member.id`

- [ ] **Step 1: Modify member-page.component.ts**

Add import and `showProposalPanel` boolean:

```typescript
// Add to imports array:
import { ProposalPanelComponent } from '../../shared/proposal-panel/proposal-panel.component';

// In @Component imports array, add:
// ProposalPanelComponent

// Add to class:
showProposalPanel = false;
```

Full diff — in the `@Component` decorator:
```typescript
imports: [CommonModule, RouterLink, MemberTimelineComponent, AdBannerComponent, MemberCareerGraphComponent, ProposalPanelComponent],
```

In the class body, add after `historyView`:
```typescript
showProposalPanel = false;
```

- [ ] **Step 2: Modify member-page.component.html**

In the member page header section, locate the area near the member name/title and add a proposal button. Add it just before the closing `</div>` of the top header area.

Find the element that wraps the member name at the top of the page. Add the button and the panel:

```html
<!-- Proposal button (add near the top of the member header section) -->
@if (member) {
  <button
    (click)="showProposalPanel = true"
    class="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-pink-600 border border-pink-200 rounded-full hover:bg-pink-50 transition-colors"
  >
    ✏️ 提案修改
  </button>
}

<!-- Proposal panel (add near the bottom of the template, before closing host element) -->
@if (showProposalPanel && member) {
  <app-proposal-panel
    tableName="members"
    operation="UPDATE"
    [recordId]="member.id"
    [originalData]="member"
    (closed)="showProposalPanel = false"
  />
}
```

Position the button: look for `<h1>` or equivalent name display in the HTML, add the button in the same flex row (wrap in a `flex items-start justify-between` if needed).

- [ ] **Step 3: Verify build**

```bash
ng build --configuration=production 2>&1 | tail -20
```

Expected: BUILD SUCCESS.

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/member-page/
git commit -m "feat(member-page): add proposal panel entry point for member edits"
```

---

### Task 6: Group page — proposal entry + history proposals

**Files:**
- Modify: `src/app/pages/group-page/group-page.component.ts`
- Modify: `src/app/pages/group-page/group-page.component.html`

The group page needs:
1. "✏️ 提案修改" button for the group record itself
2. Per-history-entry pencil button → opens panel with `tableName='history'`, `operation='UPDATE'`, `originalData=historyEntry`
3. "＋ 新增歷程" button → opens panel with `tableName='history'`, `operation='INSERT'`, `originalData={}` (pre-filled with `group_id`)

- [ ] **Step 1: Modify group-page.component.ts**

```typescript
// Add to imports:
import { ProposalPanelComponent } from '../../shared/proposal-panel/proposal-panel.component';

// In @Component imports: add ProposalPanelComponent

// Add to class body:
showGroupProposalPanel = false;
proposalHistoryEntry: History | null = null;  // non-null = editing that entry; sentinel for insert
showNewHistoryPanel = false;
```

- [ ] **Step 2: Modify group-page.component.html**

Add group proposal button near the group name/header:

```html
@if (group) {
  <button
    (click)="showGroupProposalPanel = true"
    class="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-pink-600 border border-pink-200 rounded-full hover:bg-pink-50 transition-colors"
  >
    ✏️ 提案修改
  </button>
}
```

In the history/members list section (Gantt or wherever history entries are listed), for each history entry add a pencil icon button. Find the existing `@for (row of ganttRows; ...)` or member list and add:

```html
<button
  (click)="proposalHistoryEntry = row.history"
  class="text-gray-300 hover:text-pink-400 text-xs"
  title="提案修改此歷程"
>✏️</button>
```

Add "＋ 新增歷程" button near the history section header:

```html
<button
  (click)="showNewHistoryPanel = true"
  class="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-pink-600 border border-pink-200 rounded-full hover:bg-pink-50 transition-colors"
>
  ＋ 提案新增歷程
</button>
```

Add panels at the bottom of the template:

```html
<!-- Group edit proposal panel -->
@if (showGroupProposalPanel && group) {
  <app-proposal-panel
    tableName="groups"
    operation="UPDATE"
    [recordId]="group.id"
    [originalData]="group"
    (closed)="showGroupProposalPanel = false"
  />
}

<!-- History entry edit proposal panel -->
@if (proposalHistoryEntry) {
  <app-proposal-panel
    tableName="history"
    operation="UPDATE"
    [recordId]="proposalHistoryEntry.id"
    [originalData]="proposalHistoryEntry"
    (closed)="proposalHistoryEntry = null"
  />
}

<!-- New history entry proposal panel -->
@if (showNewHistoryPanel && group) {
  <app-proposal-panel
    tableName="history"
    operation="INSERT"
    [recordId]="null"
    [originalData]="{ group_id: group.id }"
    (closed)="showNewHistoryPanel = false"
  />
}
```

- [ ] **Step 3: Verify build**

```bash
ng build --configuration=production 2>&1 | tail -20
```

Expected: BUILD SUCCESS.

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/group-page/
git commit -m "feat(group-page): add proposal panel for group edits and history proposals"
```

---

### Task 7: Company page — proposal entry

**Files:**
- Modify: `src/app/pages/company-page/company-page.component.ts`
- Modify: `src/app/pages/company-page/company-page.component.html`

- [ ] **Step 1: Modify company-page.component.ts**

```typescript
// Add import:
import { ProposalPanelComponent } from '../../shared/proposal-panel/proposal-panel.component';

// In @Component imports: add ProposalPanelComponent

// Add to class:
showProposalPanel = false;
```

- [ ] **Step 2: Modify company-page.component.html**

Add button near company name header:

```html
@if (company) {
  <button
    (click)="showProposalPanel = true"
    class="inline-flex items-center gap-1 px-3 py-1.5 text-xs border border-white/30 text-white rounded-full hover:bg-white/10 transition-colors"
  >
    ✏️ 提案修改
  </button>
}
```

Add panel at the bottom of the template:

```html
@if (showProposalPanel && company) {
  <app-proposal-panel
    tableName="companies"
    operation="UPDATE"
    [recordId]="company.id"
    [originalData]="company"
    (closed)="showProposalPanel = false"
  />
}
```

- [ ] **Step 3: Verify build**

```bash
ng build --configuration=production 2>&1 | tail -20
```

Expected: BUILD SUCCESS.

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/company-page/
git commit -m "feat(company-page): add proposal panel entry point for company edits"
```

---

## Chunk 4: Admin Review UI + Routing

### Task 8: Admin Proposals List Page

**Files:**
- Create: `src/app/pages/admin/admin-proposals/admin-proposals.component.ts`
- Create: `src/app/pages/admin/admin-proposals/admin-proposals.component.html`

The list page shows proposals grouped by status (tab: pending / approved / rejected). Each row links to the review detail page `/admin/proposals/:id`.

- [ ] **Step 1: Create admin-proposals.component.ts**

```typescript
// src/app/pages/admin/admin-proposals/admin-proposals.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ProposalService } from '../../../core/proposal.service';
import { Proposal } from '../../../models';

@Component({
  selector: 'app-admin-proposals',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './admin-proposals.component.html',
})
export class AdminProposalsComponent implements OnInit {
  proposals: Proposal[] = [];
  loading = true;
  error = '';
  activeStatus: 'pending' | 'approved' | 'rejected' = 'pending';
  readonly statusTabs: { key: 'pending' | 'approved' | 'rejected'; label: string }[] = [
    { key: 'pending', label: '待審核' },
    { key: 'approved', label: '已核准' },
    { key: 'rejected', label: '已拒絕' },
  ];

  constructor(private proposalService: ProposalService) {}

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading = true;
    this.error = '';
    try {
      this.proposals = await this.proposalService.getAll(this.activeStatus);
    } catch (e: any) {
      this.error = e.message ?? '載入失敗';
    } finally {
      this.loading = false;
    }
  }

  async setStatus(s: 'pending' | 'approved' | 'rejected') {
    this.activeStatus = s;
    await this.load();
  }

  tableLabel(t: string): string {
    return { members: '成員', groups: '組合', history: '歷程', companies: '公司' }[t] ?? t;
  }

  operationLabel(op: string): string {
    return op === 'INSERT' ? '新增' : '修改';
  }

  operationClass(op: string): string {
    return op === 'INSERT'
      ? 'bg-green-100 text-green-700'
      : 'bg-blue-100 text-blue-700';
  }

  relativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m} 分鐘前`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} 小時前`;
    return `${Math.floor(h / 24)} 天前`;
  }
}
```

- [ ] **Step 2: Create admin-proposals.component.html**

```html
<!-- src/app/pages/admin/admin-proposals/admin-proposals.component.html -->
<div class="p-6">
  <h1 class="text-xl font-semibold text-gray-800 mb-6">提案審核</h1>

  <!-- Status tabs -->
  <div class="flex gap-2 mb-6 border-b border-gray-200">
    @for (tab of statusTabs; track tab.key) {
      <button
        (click)="setStatus(tab.key)"
        [class.border-pink-500]="activeStatus === tab.key"
        [class.text-pink-600]="activeStatus === tab.key"
        [class.border-transparent]="activeStatus !== tab.key"
        [class.text-gray-500]="activeStatus !== tab.key"
        class="px-4 py-2 text-sm border-b-2 font-medium transition-colors hover:text-pink-500"
      >
        {{ tab.label }}
      </button>
    }
  </div>

  @if (loading) {
    <p class="text-sm text-gray-400">載入中...</p>
  } @else if (error) {
    <p class="text-sm text-red-500">{{ error }}</p>
  } @else if (proposals.length === 0) {
    <p class="text-sm text-gray-400 text-center py-12">無提案記錄</p>
  } @else {
    <div class="space-y-2">
      @for (p of proposals; track p.id) {
        <a
          [routerLink]="['/admin/proposals', p.id]"
          class="flex items-center gap-4 px-4 py-3 bg-white rounded-lg border border-gray-100 hover:border-pink-200 hover:shadow-sm transition-all"
        >
          <span [class]="'text-xs px-2 py-0.5 rounded font-medium ' + operationClass(p.operation)">
            {{ operationLabel(p.operation) }}
          </span>
          <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{{ tableLabel(p.table_name) }}</span>
          <span class="text-sm text-gray-700 flex-1 min-w-0 truncate">
            {{ p.submitter_name }}
          </span>
          <span class="text-xs text-gray-400 flex-shrink-0">{{ relativeTime(p.created_at) }}</span>
          <span class="text-gray-300 flex-shrink-0">›</span>
        </a>
      }
    </div>
  }
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/admin/admin-proposals/
git commit -m "feat(admin): add AdminProposalsComponent with pending/approved/rejected tabs"
```

---

### Task 9: Admin Proposal Review Page

**Files:**
- Create: `src/app/pages/admin/admin-proposal-review/admin-proposal-review.component.ts`
- Create: `src/app/pages/admin/admin-proposal-review/admin-proposal-review.component.html`

The review page loads a single proposal by ID, shows a two-column diff (original | proposed), allows inline editing of proposed values, and has Approve / Reject buttons.

- [ ] **Step 1: Create admin-proposal-review.component.ts**

```typescript
// src/app/pages/admin/admin-proposal-review/admin-proposal-review.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProposalService } from '../../../core/proposal.service';
import { PROPOSAL_ALLOWED_FIELDS, FIELD_LABELS } from '../../../core/proposal-fields.config';
import { Proposal } from '../../../models';

@Component({
  selector: 'app-admin-proposal-review',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-proposal-review.component.html',
})
export class AdminProposalReviewComponent implements OnInit {
  proposal: Proposal | null = null;
  loading = true;
  error = '';
  saving = false;
  rejectNote = '';
  showRejectForm = false;

  /** Editable copy of proposed_data for inline editing before approval */
  editedData: Record<string, any> = {};

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private proposalService: ProposalService,
  ) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    try {
      const all = await this.proposalService.getAll();
      this.proposal = all.find(p => p.id === id) ?? null;
      if (this.proposal) {
        this.editedData = { ...this.proposal.proposed_data };
      }
    } catch (e: any) {
      this.error = e.message ?? '載入失敗';
    } finally {
      this.loading = false;
    }
  }

  get fields(): string[] {
    if (!this.proposal) return [];
    return PROPOSAL_ALLOWED_FIELDS[this.proposal.table_name] ?? [];
  }

  fieldLabel(field: string): string {
    if (!this.proposal) return field;
    return FIELD_LABELS[this.proposal.table_name]?.[field] ?? field;
  }

  original(field: string): any {
    return this.proposal?.original_data?.[field] ?? '';
  }

  proposed(field: string): any {
    return this.proposal?.proposed_data?.[field] ?? '';
  }

  isChanged(field: string): boolean {
    return JSON.stringify(this.original(field)) !== JSON.stringify(this.proposed(field));
  }

  tableLabel(t: string): string {
    return { members: '成員', groups: '組合', history: '歷程', companies: '公司' }[t] ?? t;
  }

  async approve() {
    if (!this.proposal) return;
    this.saving = true;
    this.error = '';
    try {
      // Check if editedData differs from proposed_data
      const hasEdits = JSON.stringify(this.editedData) !== JSON.stringify(this.proposal.proposed_data);
      await this.proposalService.approve(
        this.proposal,
        hasEdits ? this.editedData : undefined,
      );
      this.router.navigate(['/admin/proposals']);
    } catch (e: any) {
      this.error = e.message ?? '操作失敗';
    } finally {
      this.saving = false;
    }
  }

  async reject() {
    if (!this.proposal) return;
    this.saving = true;
    this.error = '';
    try {
      await this.proposalService.reject(this.proposal.id, this.rejectNote || undefined);
      this.router.navigate(['/admin/proposals']);
    } catch (e: any) {
      this.error = e.message ?? '操作失敗';
    } finally {
      this.saving = false;
    }
  }
}
```

- [ ] **Step 2: Create admin-proposal-review.component.html**

```html
<!-- src/app/pages/admin/admin-proposal-review/admin-proposal-review.component.html -->
<div class="p-6 max-w-4xl mx-auto">
  <div class="flex items-center gap-3 mb-6">
    <a routerLink="/admin/proposals" class="text-sm text-gray-400 hover:text-pink-500">← 返回列表</a>
  </div>

  @if (loading) {
    <p class="text-sm text-gray-400">載入中...</p>
  } @else if (error) {
    <p class="text-sm text-red-500 bg-red-50 rounded px-4 py-2">{{ error }}</p>
  } @else if (!proposal) {
    <p class="text-sm text-gray-400">找不到此提案</p>
  } @else {
    <!-- Header info -->
    <div class="bg-white rounded-xl border border-gray-100 p-4 mb-6 flex flex-wrap gap-4 items-center">
      <div>
        <p class="text-xs text-gray-400">類型</p>
        <p class="text-sm font-medium text-gray-700">{{ tableLabel(proposal.table_name) }} · {{ proposal.operation === 'INSERT' ? '新增' : '修改' }}</p>
      </div>
      <div>
        <p class="text-xs text-gray-400">提案者</p>
        <p class="text-sm font-medium text-gray-700">{{ proposal.submitter_name }}</p>
      </div>
      <div>
        <p class="text-xs text-gray-400">提案時間</p>
        <p class="text-sm text-gray-500">{{ proposal.created_at | date:'yyyy-MM-dd HH:mm' }}</p>
      </div>
      <div>
        <p class="text-xs text-gray-400">狀態</p>
        <span class="text-xs px-2 py-0.5 rounded font-medium"
          [class.bg-yellow-100]="proposal.status === 'pending'"
          [class.text-yellow-700]="proposal.status === 'pending'"
          [class.bg-green-100]="proposal.status === 'approved'"
          [class.text-green-700]="proposal.status === 'approved'"
          [class.bg-red-100]="proposal.status === 'rejected'"
          [class.text-red-700]="proposal.status === 'rejected'"
        >
          {{ {'pending':'待審核','approved':'已核准','rejected':'已拒絕'}[proposal.status] }}
        </span>
      </div>
    </div>

    <!-- Diff table -->
    <div class="bg-white rounded-xl border border-gray-100 overflow-hidden mb-6">
      <div class="grid grid-cols-3 bg-gray-50 text-xs font-medium text-gray-500 px-4 py-2 border-b border-gray-100">
        <span>欄位</span>
        <span>原始值</span>
        <span>提案內容（可編輯）</span>
      </div>

      @for (field of fields; track field) {
        <div
          class="grid grid-cols-3 px-4 py-3 border-b border-gray-50 last:border-0 text-sm"
          [class.bg-yellow-50]="isChanged(field)"
        >
          <span class="text-gray-500 text-xs font-medium pt-1">{{ fieldLabel(field) }}</span>
          <span class="text-gray-600 text-xs pt-1 break-words">{{ original(field) || '—' }}</span>
          @if (proposal.status === 'pending') {
            <input
              type="text"
              [(ngModel)]="editedData[field]"
              [name]="field"
              class="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-pink-300"
              [class.border-yellow-300]="isChanged(field)"
              [class.bg-yellow-50]="isChanged(field)"
            />
          } @else {
            <span class="text-gray-700 text-xs pt-1 break-words">{{ proposed(field) || '—' }}</span>
          }
        </div>
      }
    </div>

    <!-- Reviewer note (if rejected) -->
    @if (proposal.reviewer_note) {
      <div class="bg-red-50 rounded-xl border border-red-100 p-4 mb-6 text-sm text-red-700">
        <p class="font-medium mb-1">拒絕理由</p>
        <p>{{ proposal.reviewer_note }}</p>
      </div>
    }

    <!-- Actions (only for pending) -->
    @if (proposal.status === 'pending') {
      <div class="flex gap-3 flex-wrap">
        <button
          (click)="approve()"
          [disabled]="saving"
          class="px-6 py-2 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-full text-sm font-medium transition-colors"
        >
          ✅ 核准
        </button>

        @if (!showRejectForm) {
          <button
            (click)="showRejectForm = true"
            class="px-6 py-2 border border-red-300 text-red-500 hover:bg-red-50 rounded-full text-sm font-medium transition-colors"
          >
            ❌ 拒絕
          </button>
        } @else {
          <div class="w-full flex gap-2 items-start">
            <textarea
              [(ngModel)]="rejectNote"
              name="rejectNote"
              rows="2"
              class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-300"
              placeholder="拒絕理由（選填）"
            ></textarea>
            <button
              (click)="reject()"
              [disabled]="saving"
              class="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-full text-sm transition-colors"
            >
              確認拒絕
            </button>
            <button
              (click)="showRejectForm = false"
              class="px-4 py-2 text-gray-400 hover:text-gray-600 text-sm"
            >
              取消
            </button>
          </div>
        }
      </div>

      @if (error) {
        <p class="text-sm text-red-500 mt-3">{{ error }}</p>
      }
    }
  }
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/admin/admin-proposal-review/
git commit -m "feat(admin): add AdminProposalReviewComponent with diff view and approve/reject"
```

---

### Task 10: Admin Shell Nav + Routes

**Files:**
- Modify: `src/app/pages/admin/admin-shell/admin-shell.component.ts`
- Modify: `src/app/pages/admin/admin-shell/admin-shell.component.html`
- Modify: `src/app/app.routes.ts`

The admin nav needs a "提案審核" link (admin-only, same section as 變更記錄). The link should show a red badge with the pending count. The shell component needs to load the pending count on init.

- [ ] **Step 1: Modify admin-shell.component.ts**

Add the import at the top, add `pendingProposalCount` property, and update the constructor. The full modified class body is:

```typescript
import { Component, OnDestroy } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SupabaseService } from '../../../core/supabase.service';
import { AdminRoleService } from '../../../core/admin-role.service';
import { ProposalService } from '../../../core/proposal.service';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './admin-shell.component.html',
})
export class AdminShellComponent implements OnDestroy {
  isAdmin = false;
  pendingProposalCount = 0;
  private _sub: Subscription;

  constructor(
    private supabase: SupabaseService,
    private adminRole: AdminRoleService,
    private router: Router,
    private proposalService: ProposalService,
  ) {
    this._sub = this.adminRole.isAdmin$.subscribe(async v => {
      this.isAdmin = v;
      if (v) {
        this.pendingProposalCount = await this.proposalService.getPendingCount().catch(() => 0);
      }
    });
  }

  ngOnDestroy(): void {
    this._sub.unsubscribe();
  }

  async signOut() {
    await this.supabase.signOut();
    this.router.navigate(['/']);
  }
}
```

- [ ] **Step 2: Modify admin-shell.component.html**

Inside the `@if (isAdmin)` section, add after the 變更記錄 link:

```html
<a
  routerLink="/admin/proposals"
  routerLinkActive="bg-purple-100 text-purple-700 font-medium"
  class="flex items-center justify-between px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-purple-50 hover:text-purple-600 transition-colors"
>
  <span>提案審核</span>
  @if (pendingProposalCount > 0) {
    <span class="ml-2 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
      {{ pendingProposalCount > 99 ? '99+' : pendingProposalCount }}
    </span>
  }
</a>
```

- [ ] **Step 3: Modify app.routes.ts**

Add inside the `/admin` children array (after `audit-log` route):

```typescript
{
  path: 'proposals',
  canActivate: [adminGuard],
  loadComponent: () => import('./pages/admin/admin-proposals/admin-proposals.component').then(m => m.AdminProposalsComponent)
},
{
  path: 'proposals/:id',
  canActivate: [adminGuard],
  loadComponent: () => import('./pages/admin/admin-proposal-review/admin-proposal-review.component').then(m => m.AdminProposalReviewComponent)
},
```

- [ ] **Step 4: Verify build**

```bash
ng build --configuration=production 2>&1 | tail -20
```

Expected: BUILD SUCCESS.

- [ ] **Step 5: Run tests**

```bash
ng test --watch=false 2>&1 | tail -30
```

Expected: All existing tests pass, new proposal service tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/pages/admin/admin-shell/ src/app/app.routes.ts
git commit -m "feat(admin): add proposals route and pending count badge in nav"
```

---

## Final Verification

- [ ] **Manual smoke test checklist:**
  1. Navigate to `/member/:id` → "✏️ 提案修改" button is visible → click → side panel opens → fill form → submit → success message shown
  2. Navigate to `/group/:id` → proposal button visible → history entry pencil icons work → "＋ 提案新增歷程" works
  3. Navigate to `/company/:id` → proposal button works
  4. As anonymous user: submitter name field is required, error shows if empty
  5. Login as admin → navigate to `/admin/proposals` → pending proposals listed
  6. Click a proposal → review page loads with diff, can edit values, approve writes to target table, reject stores reason
  7. Admin nav shows red badge with pending count

- [ ] **Push to origin**

```bash
git push origin master
```
