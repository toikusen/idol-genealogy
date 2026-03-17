# 貢獻者功能 (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add contributor attribution widgets to member/group/company pages, an edit history side panel, and a `/contributors` leaderboard page.

**Architecture:** New Supabase RPCs (SECURITY DEFINER) expose approved proposal data publicly without opening RLS. Two shared utilities handle relative-time formatting and proposal diff computation. A reusable `RecordEditHistoryComponent` renders the slide-in panel; each detail page hosts the attribution widget inline. The leaderboard page is a lazy-loaded standalone component.

**Tech Stack:** Angular 19 standalone components, Supabase PostgREST RPC, Tailwind CSS + inline styles, Karma/Jasmine tests.

**Spec:** `docs/superpowers/specs/2026-03-17-contributor-features-design.md`

---

## Chunk 1: Data Layer

### Task 1: DB Migration — index + RPCs

**Files:**
- Create: `supabase/migrations/026_contributor_features.sql`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/026_contributor_features.sql

-- Performance index for footer query (table_name, record_id, status, reviewed_at)
CREATE INDEX IF NOT EXISTS proposals_approved_record_idx
  ON proposals (table_name, record_id, status, reviewed_at DESC)
  WHERE status = 'approved';

-- RPC: get all approved proposals for a specific record (newest first)
-- Uses SECURITY DEFINER so anonymous users can call it without RLS bypass.
-- Explicitly excludes submitter_email for privacy.
CREATE OR REPLACE FUNCTION get_approved_by_record(
  p_table_name text,
  p_record_id  uuid
)
RETURNS TABLE (
  id           uuid,
  table_name   text,
  record_id    uuid,
  operation    text,
  proposed_data  jsonb,
  original_data  jsonb,
  reviewed_data  jsonb,
  status       text,
  reviewed_at  timestamptz,
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
    AND record_id  = p_record_id
    AND status     = 'approved'
  ORDER BY reviewed_at DESC;
$$;

-- RPC: leaderboard — logged-in contributors ranked by approved proposal count
-- Resolves submitter_name from the most recent approved proposal per user.
-- Uses SECURITY DEFINER so anonymous users can call it.
CREATE OR REPLACE FUNCTION get_leaderboard()
RETURNS TABLE (
  submitter_id   uuid,
  submitter_name text,
  total          bigint,
  by_table       jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    submitter_id,
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
    WHERE status = 'approved'
      AND submitter_id IS NOT NULL
    GROUP BY submitter_id, table_name
  ) sub
  GROUP BY submitter_id
  ORDER BY total DESC, submitter_id ASC;
$$;
```

- [ ] **Step 2: Apply migration to local Supabase**

```bash
npx supabase db push
```
Expected: Migration applies without error. If using remote-only, apply via Supabase dashboard SQL editor.

- [ ] **Step 3: Verify RPCs in Supabase dashboard**

Run in SQL editor:
```sql
SELECT * FROM get_leaderboard();
SELECT * FROM get_approved_by_record('members', '00000000-0000-0000-0000-000000000000');
```
Expected: Both return without error (empty results are fine if no data exists yet).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/026_contributor_features.sql
git commit -m "feat(db): add index and RPCs for contributor features"
```

---

### Task 2: ProposalService — add `getApprovedByRecord` and `getLeaderboard`

**Files:**
- Modify: `src/app/core/proposal.service.ts`
- Modify: `src/app/core/proposal.service.spec.ts`

- [ ] **Step 1: Write failing tests first**

Open `src/app/core/proposal.service.spec.ts` and add after the existing tests:

```typescript
describe('getApprovedByRecord', () => {
  it('should call rpc with correct params and return proposals', async () => {
    mockDb.rpc = jasmine.createSpy('rpc').and.returnValue(
      Promise.resolve({ data: [{ id: 'p1', table_name: 'members' }], error: null })
    );
    const result = await service.getApprovedByRecord('members', 'uuid-abc');
    expect(mockDb.rpc).toHaveBeenCalledWith('get_approved_by_record', {
      p_table_name: 'members',
      p_record_id: 'uuid-abc',
    });
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('p1');
  });

  it('should throw if rpc returns error', async () => {
    mockDb.rpc = jasmine.createSpy('rpc').and.returnValue(
      Promise.resolve({ data: null, error: { message: 'rpc error' } })
    );
    await expectAsync(service.getApprovedByRecord('members', 'x')).toBeRejected();
  });
});

describe('getLeaderboard', () => {
  it('should call get_leaderboard rpc and return entries', async () => {
    mockDb.rpc = jasmine.createSpy('rpc').and.returnValue(
      Promise.resolve({
        data: [{ submitter_id: 'u1', submitter_name: 'Alice', total: 5, by_table: { members: 5 } }],
        error: null,
      })
    );
    const result = await service.getLeaderboard();
    expect(mockDb.rpc).toHaveBeenCalledWith('get_leaderboard');
    expect(result.length).toBe(1);
    expect(result[0].total).toBe(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
ng test --include='**/proposal.service.spec.ts' --watch=false
```
Expected: FAIL — `getApprovedByRecord` and `getLeaderboard` are not defined.

- [ ] **Step 3: Add `ContributorEntry` interface and new methods to `proposal.service.ts`**

At the top of `src/app/core/proposal.service.ts`, after imports, add the interface:

```typescript
export interface ContributorEntry {
  submitter_id: string;
  submitter_name: string;
  total: number;
  by_table: Record<string, number>;
}
```

Inside the `ProposalService` class, add these two methods (after `reject()`):

```typescript
async getApprovedByRecord(tableName: string, recordId: string): Promise<Proposal[]> {
  const { data, error } = await this.db.rpc('get_approved_by_record', {
    p_table_name: tableName,
    p_record_id: recordId,
  });
  if (error) throw error;
  return (data ?? []) as Proposal[];
}

async getLeaderboard(): Promise<ContributorEntry[]> {
  const { data, error } = await this.db.rpc('get_leaderboard');
  if (error) throw error;
  return (data ?? []) as ContributorEntry[];
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
ng test --include='**/proposal.service.spec.ts' --watch=false
```
Expected: All tests PASS (including pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add src/app/core/proposal.service.ts src/app/core/proposal.service.spec.ts
git commit -m "feat(service): add getApprovedByRecord and getLeaderboard to ProposalService"
```

---

### Task 3: Shared utilities — time formatting and proposal diff

**Files:**
- Create: `src/app/core/time.utils.ts`
- Create: `src/app/core/time.utils.spec.ts`
- Create: `src/app/core/proposal-diff.utils.ts`
- Create: `src/app/core/proposal-diff.utils.spec.ts`

- [ ] **Step 1: Write failing tests for `time.utils.ts`**

Create `src/app/core/time.utils.spec.ts`:

```typescript
import { formatRelativeTime } from './time.utils';

describe('formatRelativeTime', () => {
  it('returns "剛才" for timestamps less than 1 minute ago', () => {
    const recent = new Date(Date.now() - 30_000).toISOString();
    expect(formatRelativeTime(recent)).toBe('剛才');
  });

  it('returns "N 分鐘前" for timestamps within the past hour', () => {
    const ago = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(ago)).toBe('5 分鐘前');
  });

  it('returns "N 小時前" for timestamps within the past day', () => {
    const ago = new Date(Date.now() - 3 * 3600_000).toISOString();
    expect(formatRelativeTime(ago)).toBe('3 小時前');
  });

  it('returns "N 天前" for older timestamps', () => {
    const ago = new Date(Date.now() - 2 * 86400_000).toISOString();
    expect(formatRelativeTime(ago)).toBe('2 天前');
  });

  it('returns "—" for null input', () => {
    expect(formatRelativeTime(null)).toBe('—');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
ng test --include='**/time.utils.spec.ts' --watch=false
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/app/core/time.utils.ts`**

```typescript
export function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) return '—';
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return '剛才';
  if (mins < 60) return `${mins} 分鐘前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} 小時前`;
  const days = Math.floor(hrs / 24);
  return `${days} 天前`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
ng test --include='**/time.utils.spec.ts' --watch=false
```
Expected: All 5 tests PASS.

- [ ] **Step 5: Write failing tests for `proposal-diff.utils.ts`**

Create `src/app/core/proposal-diff.utils.spec.ts`:

```typescript
import { getDiffFields, getEffectiveProposed } from './proposal-diff.utils';
import { Proposal } from '../models';

const baseProposal: Proposal = {
  id: '1', table_name: 'members', record_id: 'm1', operation: 'UPDATE',
  proposed_data: { name: 'New Name' }, original_data: { name: 'Old Name' },
  reviewed_data: null, status: 'approved', submitter_id: null,
  submitter_name: 'Alice', submitter_email: null,
  reviewer_note: null, created_at: '', reviewed_at: null, reviewed_by: null,
};

describe('getEffectiveProposed', () => {
  it('returns reviewed_data when present', () => {
    const p = { ...baseProposal, reviewed_data: { name: 'Reviewed' } };
    expect(getEffectiveProposed(p)).toEqual({ name: 'Reviewed' });
  });

  it('falls back to proposed_data when reviewed_data is null', () => {
    expect(getEffectiveProposed(baseProposal)).toEqual({ name: 'New Name' });
  });
});

describe('getDiffFields - UPDATE', () => {
  it('returns diff fields in PROPOSAL_ALLOWED_FIELDS order', () => {
    const fields = getDiffFields(baseProposal);
    expect(fields.length).toBe(1);
    expect(fields[0].key).toBe('name');
    expect(fields[0].oldValue).toBe('Old Name');
    expect(fields[0].newValue).toBe('New Name');
    expect(fields[0].label).toBe('姓名');
  });

  it('shows "—" for empty original value', () => {
    const p = { ...baseProposal, original_data: { name: '' }, proposed_data: { name: 'Alice' } };
    const fields = getDiffFields(p);
    expect(fields[0].oldValue).toBe('—');
  });

  it('uses reviewed_data over proposed_data', () => {
    const p = { ...baseProposal, reviewed_data: { name: 'Admin Edit' } };
    const fields = getDiffFields(p);
    expect(fields[0].newValue).toBe('Admin Edit');
  });
});

describe('getDiffFields - INSERT', () => {
  it('returns proposed fields with oldValue "—"', () => {
    const p: Proposal = {
      ...baseProposal, operation: 'INSERT',
      original_data: null, proposed_data: { name: 'Brand New' },
    };
    const fields = getDiffFields(p);
    expect(fields[0].oldValue).toBe('—');
    expect(fields[0].newValue).toBe('Brand New');
  });

  it('omits empty fields from INSERT diff', () => {
    const p: Proposal = {
      ...baseProposal, operation: 'INSERT',
      original_data: null, proposed_data: { name: 'Alice', nickname: '' },
    };
    const fields = getDiffFields(p);
    expect(fields.every(f => f.key !== 'nickname')).toBeTrue();
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

```bash
ng test --include='**/proposal-diff.utils.spec.ts' --watch=false
```
Expected: FAIL — module not found.

- [ ] **Step 7: Create `src/app/core/proposal-diff.utils.ts`**

```typescript
import { FIELD_LABELS, PROPOSAL_ALLOWED_FIELDS } from './proposal-fields.config';
import { Proposal } from '../models';

export interface DiffField {
  key: string;
  label: string;
  oldValue: string;
  newValue: string;
}

export function getEffectiveProposed(p: Proposal): Record<string, any> {
  return (p.reviewed_data ?? p.proposed_data ?? {});
}

export function getDiffFields(p: Proposal): DiffField[] {
  const proposed = getEffectiveProposed(p);
  const allowedKeys: string[] = PROPOSAL_ALLOWED_FIELDS[p.table_name] ?? Object.keys(proposed);

  if (p.operation === 'INSERT') {
    return allowedKeys
      .filter(k => proposed[k] != null && proposed[k] !== '')
      .map(k => ({
        key: k,
        label: FIELD_LABELS[p.table_name]?.[k] ?? k,
        oldValue: '—',
        newValue: String(proposed[k]),
      }));
  }

  // UPDATE
  const original = (p.original_data ?? {}) as Record<string, any>;
  return allowedKeys
    .filter(k => k in proposed)
    .map(k => ({
      key: k,
      label: FIELD_LABELS[p.table_name]?.[k] ?? k,
      oldValue: (original[k] != null && original[k] !== '') ? String(original[k]) : '—',
      newValue: (proposed[k] != null && proposed[k] !== '') ? String(proposed[k]) : '—',
    }));
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
ng test --include='**/proposal-diff.utils.spec.ts' --watch=false
```
Expected: All 6 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/core/time.utils.ts src/app/core/time.utils.spec.ts \
        src/app/core/proposal-diff.utils.ts src/app/core/proposal-diff.utils.spec.ts
git commit -m "feat(utils): add time formatting and proposal diff utilities"
```

---

## Chunk 2: RecordEditHistoryComponent

### Task 4: Create `RecordEditHistoryComponent`

**Files:**
- Create: `src/app/shared/record-edit-history/record-edit-history.component.ts`
- Create: `src/app/shared/record-edit-history/record-edit-history.component.html`
- Create: `src/app/shared/record-edit-history/record-edit-history.component.spec.ts`

- [ ] **Step 1: Write failing test**

Create `src/app/shared/record-edit-history/record-edit-history.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RecordEditHistoryComponent } from './record-edit-history.component';
import { ProposalService } from '../../core/proposal.service';
import { Proposal } from '../../models';

const mockProposal: Proposal = {
  id: 'p1', table_name: 'members', record_id: 'm1', operation: 'UPDATE',
  proposed_data: { name: 'New' }, original_data: { name: 'Old' },
  reviewed_data: null, status: 'approved',
  submitter_id: 'u1', submitter_name: 'Alice', submitter_email: null,
  reviewer_note: null, created_at: '2026-03-01T00:00:00Z',
  reviewed_at: '2026-03-02T00:00:00Z', reviewed_by: null,
};

describe('RecordEditHistoryComponent', () => {
  let fixture: ComponentFixture<RecordEditHistoryComponent>;
  let component: RecordEditHistoryComponent;
  let proposalServiceSpy: jasmine.SpyObj<ProposalService>;

  beforeEach(async () => {
    proposalServiceSpy = jasmine.createSpyObj('ProposalService', ['getApprovedByRecord']);
    proposalServiceSpy.getApprovedByRecord.and.returnValue(Promise.resolve([mockProposal]));

    await TestBed.configureTestingModule({
      imports: [RecordEditHistoryComponent],
      providers: [{ provide: ProposalService, useValue: proposalServiceSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(RecordEditHistoryComponent);
    component = fixture.componentInstance;
    component.tableName = 'members';
    component.recordId = 'm1';
    component.recordLabel = 'Alice';
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load proposals on init', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(proposalServiceSpy.getApprovedByRecord).toHaveBeenCalledWith('members', 'm1');
    expect(component.proposals.length).toBe(1);
    expect(component.loading).toBeFalse();
    expect(component.error).toBeFalse();
  });

  it('should set error=true when service throws', async () => {
    proposalServiceSpy.getApprovedByRecord.and.returnValue(Promise.reject('fail'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.error).toBeTrue();
    expect(component.loading).toBeFalse();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
ng test --include='**/record-edit-history.component.spec.ts' --watch=false
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create `record-edit-history.component.ts`**

```typescript
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { Proposal } from '../../models';
import { ProposalService } from '../../core/proposal.service';
import { getDiffFields, DiffField } from '../../core/proposal-diff.utils';
import { formatRelativeTime } from '../../core/time.utils';

@Component({
  selector: 'app-record-edit-history',
  standalone: true,
  imports: [], // No NgModules needed — template uses Angular 19 @if/@for control flow
  templateUrl: './record-edit-history.component.html',
})
export class RecordEditHistoryComponent implements OnInit {
  @Input({ required: true }) tableName!: string;
  @Input({ required: true }) recordId!: string;
  @Input({ required: true }) recordLabel!: string;
  @Output() closed = new EventEmitter<void>();

  proposals: Proposal[] = [];
  loading = true;
  error = false;

  constructor(private proposalService: ProposalService) {}

  async ngOnInit() {
    try {
      this.proposals = await this.proposalService.getApprovedByRecord(
        this.tableName, this.recordId
      );
    } catch {
      this.error = true;
    } finally {
      this.loading = false;
    }
  }

  getDiffFields(p: Proposal): DiffField[] {
    return getDiffFields(p);
  }

  formatRelativeTime(date: string | null): string {
    return formatRelativeTime(date);
  }
}
```

- [ ] **Step 4: Create `record-edit-history.component.html`**

```html
<!-- Overlay -->
<div
  style="position:fixed;inset:0;background:rgba(30,10,30,0.25);z-index:40;backdrop-filter:blur(2px);"
  (click)="closed.emit()"
></div>

<!-- Panel -->
<aside style="
  position:fixed;right:0;top:0;bottom:0;
  width:100%;max-width:26rem;
  background:#fdf6fb;
  border-left:1px solid rgba(232,121,160,0.15);
  box-shadow:-8px 0 32px rgba(30,10,30,0.08);
  z-index:50;display:flex;flex-direction:column;
  font-family:'Shippori Mincho',serif;
">
  <!-- Header -->
  <div style="
    padding:20px 20px 14px;
    border-bottom:1px solid rgba(232,121,160,0.12);
    display:flex;justify-content:space-between;align-items:flex-start;
    flex-shrink:0;
  ">
    <div>
      <div style="font-size:0.62rem;letter-spacing:0.25em;text-transform:uppercase;color:rgba(122,90,122,0.45);">
        編輯記錄
      </div>
      <div style="font-size:0.95rem;color:#2d1b2e;margin-top:3px;font-weight:500;">
        {{ recordLabel }}
      </div>
    </div>
    <button
      (click)="closed.emit()"
      style="
        background:none;border:none;cursor:pointer;
        color:rgba(122,90,122,0.4);font-size:1rem;padding:2px 6px;
        line-height:1;
      "
    >✕</button>
  </div>

  <!-- Body -->
  <div style="flex:1;overflow-y:auto;padding:16px 20px;">

    @if (loading) {
      <div style="text-align:center;padding:40px 0;color:rgba(122,90,122,0.4);font-size:0.8rem;">
        載入中…
      </div>
    } @else if (error) {
      <div style="text-align:center;padding:40px 0;color:rgba(192,80,128,0.6);font-size:0.8rem;">
        無法載入記錄，請稍後再試
      </div>
    } @else if (proposals.length === 0) {
      <div style="text-align:center;padding:40px 0;color:rgba(122,90,122,0.4);font-size:0.8rem;">
        尚無核准記錄
      </div>
    } @else {
      @for (p of proposals; track p.id) {
        <div style="
          border-bottom:1px solid rgba(232,121,160,0.1);
          padding:14px 0;
        ">
          <!-- Meta row -->
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
            <span style="font-size:0.8rem;color:#2d1b2e;font-weight:500;">
              {{ p.submitter_name }}
            </span>
            <span style="font-size:0.72rem;color:rgba(122,90,122,0.45);">
              {{ formatRelativeTime(p.reviewed_at) }}
            </span>
            @if (p.operation === 'INSERT') {
              <span style="
                display:inline-flex;align-items:center;
                font-size:0.6rem;letter-spacing:0.08em;
                padding:2px 7px;border-radius:999px;
                background:rgba(52,211,153,0.12);color:rgba(16,130,80,0.8);
                border:1px solid rgba(52,211,153,0.25);
              ">新增</span>
            } @else {
              <span style="
                display:inline-flex;align-items:center;
                font-size:0.6rem;letter-spacing:0.08em;
                padding:2px 7px;border-radius:999px;
                background:rgba(124,108,242,0.1);color:rgba(100,80,220,0.8);
                border:1px solid rgba(124,108,242,0.2);
              ">修改</span>
            }
          </div>

          <!-- Diff rows -->
          @if (p.operation === 'INSERT') {
            <div style="font-size:0.72rem;color:rgba(122,90,122,0.5);font-style:italic;margin-bottom:4px;">
              新增記錄
            </div>
          }
          @for (field of getDiffFields(p); track field.key) {
            <div style="
              font-size:0.7rem;
              font-family:'Cormorant Garamond',Georgia,serif;
              color:rgba(122,90,122,0.6);
              margin-bottom:4px;
              display:flex;align-items:baseline;gap:5px;flex-wrap:wrap;
            ">
              <span style="color:rgba(122,90,122,0.5);">「{{ field.label }}」</span>
              <span>{{ field.oldValue }}</span>
              <span style="color:rgba(232,121,160,0.5);">→</span>
              <span style="color:#2d1b2e;">{{ field.newValue }}</span>
            </div>
          }
        </div>
      }
    }
  </div>
</aside>
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
ng test --include='**/record-edit-history.component.spec.ts' --watch=false
```
Expected: All 3 tests PASS.

- [ ] **Step 6: Build check**

```bash
ng build --configuration=production 2>&1 | tail -20
```
Expected: Build succeeds with no errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/shared/record-edit-history/
git commit -m "feat(component): add RecordEditHistoryComponent (edit history side panel)"
```

---

## Chunk 3: Attribution Widget — Member, Group, Company Pages

### Task 5: Attribution widget on member page

**Files:**
- Modify: `src/app/pages/member-page/member-page.component.ts`
- Modify: `src/app/pages/member-page/member-page.component.html`

- [ ] **Step 1: Add state and helpers to `member-page.component.ts`**

Add these imports at the top:
```typescript
import { Proposal } from '../../models';
import { ProposalService } from '../../core/proposal.service';
import { getDiffFields, DiffField } from '../../core/proposal-diff.utils';
import { formatRelativeTime } from '../../core/time.utils';
import { RecordEditHistoryComponent } from '../../shared/record-edit-history/record-edit-history.component';
```

Add `RecordEditHistoryComponent` to the component `imports` array.

Add to the class:
```typescript
lastProposal: Proposal | null = null;
showEditHistory = false;

get lastProposalDiffFields(): DiffField[] {
  return this.lastProposal ? getDiffFields(this.lastProposal) : [];
}

formatRelativeTime(date: string | null): string {
  return formatRelativeTime(date);
}
```

Inject `ProposalService` in the constructor:
```typescript
constructor(
  private route: ActivatedRoute,
  private memberService: MemberService,
  private historyService: HistoryService,
  private seo: SeoService,
  private proposalService: ProposalService,
) {}
```

In `ngOnInit()`, after loading member data successfully, add:
```typescript
// Load last approved proposal (non-blocking — don't let failure affect page load)
if (member) {
  this.proposalService.getApprovedByRecord('members', id)
    .then(proposals => { this.lastProposal = proposals[0] ?? null; })
    .catch(() => {}); // silently ignore — attribution is non-critical
}
```

- [ ] **Step 2: Add attribution widget to `member-page.component.html`**

Find the footer section in the template (look for `<footer` or the closing section near the bottom). Add the attribution widget **just above** the footer element:

```html
<!-- Attribution widget -->
@if (lastProposal) {
  <div style="
    display:flex;gap:10px;align-items:flex-start;
    background:rgba(255,255,255,0.6);
    border:1px solid rgba(232,121,160,0.12);
    border-radius:6px;padding:10px 14px;
    font-family:'Shippori Mincho',serif;
    font-size:0.73rem;color:rgba(122,90,122,0.6);
    margin:32px 0 24px;
  ">
    <div style="width:5px;height:5px;border-radius:50%;background:rgba(232,121,160,0.45);flex-shrink:0;margin-top:6px;"></div>
    <div>
      <div>
        最後由
        <span style="color:#c05080;font-weight:500;">{{ lastProposal.submitter_name }}</span>
        {{ lastProposal.operation === 'INSERT' ? '新增記錄' : '補充' }}
        <span style="color:rgba(122,90,122,0.4);">· {{ formatRelativeTime(lastProposal.reviewed_at) }}</span>
      </div>
      @if (lastProposal.operation === 'UPDATE' && lastProposalDiffFields.length > 0) {
        <div style="margin-top:5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="
            display:inline-block;
            font-family:'Cormorant Garamond',Georgia,serif;
            font-size:0.7rem;font-style:italic;
            color:rgba(122,90,122,0.55);
            background:rgba(232,121,160,0.05);
            border:1px solid rgba(232,121,160,0.12);
            border-radius:3px;padding:1px 7px;white-space:nowrap;
          ">
            「{{ lastProposalDiffFields[0].label }}」{{ lastProposalDiffFields[0].oldValue }} → {{ lastProposalDiffFields[0].newValue }}
          </span>
          @if (lastProposalDiffFields.length > 1) {
            <span style="
              display:inline-block;font-size:0.65rem;color:rgba(122,90,122,0.5);
              background:rgba(122,90,122,0.07);border:1px solid rgba(122,90,122,0.15);
              border-radius:999px;padding:1px 7px;white-space:nowrap;
            ">+{{ lastProposalDiffFields.length - 1 }} 個欄位</span>
          }
          <span
            (click)="showEditHistory = true"
            style="
              display:inline-flex;align-items:center;gap:3px;
              font-size:0.65rem;color:rgba(124,108,242,0.65);
              border-bottom:1px solid rgba(124,108,242,0.25);
              letter-spacing:0.06em;cursor:pointer;white-space:nowrap;
            "
          >查看全部 →</span>
        </div>
      } @else {
        <div style="margin-top:4px;">
          <span
            (click)="showEditHistory = true"
            style="
              display:inline-flex;align-items:center;gap:3px;
              font-size:0.65rem;color:rgba(124,108,242,0.65);
              border-bottom:1px solid rgba(124,108,242,0.25);
              letter-spacing:0.06em;cursor:pointer;white-space:nowrap;
            "
          >查看全部 →</span>
        </div>
      }
    </div>
  </div>
}

<!-- Edit History Panel -->
@if (showEditHistory && member) {
  <app-record-edit-history
    [tableName]="'members'"
    [recordId]="member.id"
    [recordLabel]="member.name"
    (closed)="showEditHistory = false"
  />
}
```

- [ ] **Step 3: Build check**

```bash
ng build --configuration=production 2>&1 | tail -20
```
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 4: Manual verification**

Run `ng serve`, open a member page. Verify:
- Attribution widget appears only if there are approved proposals for this member
- Clicking "查看全部 →" opens the history panel
- Panel can be closed via ✕ or overlay click

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/member-page/member-page.component.ts \
        src/app/pages/member-page/member-page.component.html
git commit -m "feat(member-page): add contributor attribution widget and edit history panel"
```

---

### Task 6: Attribution widget on group page

**Files:**
- Modify: `src/app/pages/group-page/group-page.component.ts`
- Modify: `src/app/pages/group-page/group-page.component.html`

- [ ] **Step 1: Add state and helpers to `group-page.component.ts`**

Add imports (same as Task 5 — Proposal, ProposalService, getDiffFields, DiffField, formatRelativeTime, RecordEditHistoryComponent).

Add `RecordEditHistoryComponent` to the component `imports` array.

Add to the class:
```typescript
lastProposal: Proposal | null = null;
showEditHistory = false;

get lastProposalDiffFields(): DiffField[] {
  return this.lastProposal ? getDiffFields(this.lastProposal) : [];
}

formatRelativeTime(date: string | null): string {
  return formatRelativeTime(date);
}
```

Inject `ProposalService` in the constructor.

In `load()` method (called from ngOnInit), after `this.group = group;` assignment succeeds, add:
```typescript
if (group) {
  this.proposalService.getApprovedByRecord('groups', id)
    .then(proposals => { this.lastProposal = proposals[0] ?? null; })
    .catch(() => {});
}
```

Note: `id` here is the `load(id: string)` function argument (the group's UUID), not `this.route.snapshot.paramMap.get('id')`. The group page uses a reactive route subscription that calls `load(id)` — `id` is already in scope within that method.

- [ ] **Step 2: Add attribution widget to `group-page.component.html`**

Add the following HTML just above the footer element:

```html
<!-- Attribution widget -->
@if (lastProposal) {
  <div style="
    display:flex;gap:10px;align-items:flex-start;
    background:rgba(255,255,255,0.6);
    border:1px solid rgba(232,121,160,0.12);
    border-radius:6px;padding:10px 14px;
    font-family:'Shippori Mincho',serif;
    font-size:0.73rem;color:rgba(122,90,122,0.6);
    margin:32px 0 24px;
  ">
    <div style="width:5px;height:5px;border-radius:50%;background:rgba(232,121,160,0.45);flex-shrink:0;margin-top:6px;"></div>
    <div>
      <div>
        最後由
        <span style="color:#c05080;font-weight:500;">{{ lastProposal.submitter_name }}</span>
        {{ lastProposal.operation === 'INSERT' ? '新增記錄' : '補充' }}
        <span style="color:rgba(122,90,122,0.4);">· {{ formatRelativeTime(lastProposal.reviewed_at) }}</span>
      </div>
      @if (lastProposal.operation === 'UPDATE' && lastProposalDiffFields.length > 0) {
        <div style="margin-top:5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="
            display:inline-block;
            font-family:'Cormorant Garamond',Georgia,serif;
            font-size:0.7rem;font-style:italic;
            color:rgba(122,90,122,0.55);
            background:rgba(232,121,160,0.05);
            border:1px solid rgba(232,121,160,0.12);
            border-radius:3px;padding:1px 7px;white-space:nowrap;
          ">
            「{{ lastProposalDiffFields[0].label }}」{{ lastProposalDiffFields[0].oldValue }} → {{ lastProposalDiffFields[0].newValue }}
          </span>
          @if (lastProposalDiffFields.length > 1) {
            <span style="
              display:inline-block;font-size:0.65rem;color:rgba(122,90,122,0.5);
              background:rgba(122,90,122,0.07);border:1px solid rgba(122,90,122,0.15);
              border-radius:999px;padding:1px 7px;white-space:nowrap;
            ">+{{ lastProposalDiffFields.length - 1 }} 個欄位</span>
          }
          <span
            (click)="showEditHistory = true"
            style="
              display:inline-flex;align-items:center;gap:3px;
              font-size:0.65rem;color:rgba(124,108,242,0.65);
              border-bottom:1px solid rgba(124,108,242,0.25);
              letter-spacing:0.06em;cursor:pointer;white-space:nowrap;
            "
          >查看全部 →</span>
        </div>
      } @else {
        <div style="margin-top:4px;">
          <span
            (click)="showEditHistory = true"
            style="
              display:inline-flex;align-items:center;gap:3px;
              font-size:0.65rem;color:rgba(124,108,242,0.65);
              border-bottom:1px solid rgba(124,108,242,0.25);
              letter-spacing:0.06em;cursor:pointer;white-space:nowrap;
            "
          >查看全部 →</span>
        </div>
      }
    </div>
  </div>
}

<!-- Edit History Panel -->
@if (showEditHistory && group) {
  <app-record-edit-history
    [tableName]="'groups'"
    [recordId]="group.id"
    [recordLabel]="group.name"
    (closed)="showEditHistory = false"
  />
}
```

- [ ] **Step 3: Build check**

```bash
ng build --configuration=production 2>&1 | tail -20
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/group-page/group-page.component.ts \
        src/app/pages/group-page/group-page.component.html
git commit -m "feat(group-page): add contributor attribution widget and edit history panel"
```

---

### Task 7: Attribution widget on company page

**Files:**
- Modify: `src/app/pages/company-page/company-page.component.ts`
- Modify: `src/app/pages/company-page/company-page.component.html`

- [ ] **Step 1: Add state and helpers to `company-page.component.ts`**

Add imports and class members (same pattern as Tasks 5–6).

Inject `ProposalService` in the constructor.

In `ngOnInit()`, after `this.company = company;` assignment succeeds, add:
```typescript
if (company) {
  this.proposalService.getApprovedByRecord('companies', id)
    .then(proposals => { this.lastProposal = proposals[0] ?? null; })
    .catch(() => {});
}
```

- [ ] **Step 2: Add attribution widget to `company-page.component.html`**

Add the following HTML just above the footer element:

```html
<!-- Attribution widget -->
@if (lastProposal) {
  <div style="
    display:flex;gap:10px;align-items:flex-start;
    background:rgba(255,255,255,0.6);
    border:1px solid rgba(232,121,160,0.12);
    border-radius:6px;padding:10px 14px;
    font-family:'Shippori Mincho',serif;
    font-size:0.73rem;color:rgba(122,90,122,0.6);
    margin:32px 0 24px;
  ">
    <div style="width:5px;height:5px;border-radius:50%;background:rgba(232,121,160,0.45);flex-shrink:0;margin-top:6px;"></div>
    <div>
      <div>
        最後由
        <span style="color:#c05080;font-weight:500;">{{ lastProposal.submitter_name }}</span>
        {{ lastProposal.operation === 'INSERT' ? '新增記錄' : '補充' }}
        <span style="color:rgba(122,90,122,0.4);">· {{ formatRelativeTime(lastProposal.reviewed_at) }}</span>
      </div>
      @if (lastProposal.operation === 'UPDATE' && lastProposalDiffFields.length > 0) {
        <div style="margin-top:5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="
            display:inline-block;
            font-family:'Cormorant Garamond',Georgia,serif;
            font-size:0.7rem;font-style:italic;
            color:rgba(122,90,122,0.55);
            background:rgba(232,121,160,0.05);
            border:1px solid rgba(232,121,160,0.12);
            border-radius:3px;padding:1px 7px;white-space:nowrap;
          ">
            「{{ lastProposalDiffFields[0].label }}」{{ lastProposalDiffFields[0].oldValue }} → {{ lastProposalDiffFields[0].newValue }}
          </span>
          @if (lastProposalDiffFields.length > 1) {
            <span style="
              display:inline-block;font-size:0.65rem;color:rgba(122,90,122,0.5);
              background:rgba(122,90,122,0.07);border:1px solid rgba(122,90,122,0.15);
              border-radius:999px;padding:1px 7px;white-space:nowrap;
            ">+{{ lastProposalDiffFields.length - 1 }} 個欄位</span>
          }
          <span
            (click)="showEditHistory = true"
            style="
              display:inline-flex;align-items:center;gap:3px;
              font-size:0.65rem;color:rgba(124,108,242,0.65);
              border-bottom:1px solid rgba(124,108,242,0.25);
              letter-spacing:0.06em;cursor:pointer;white-space:nowrap;
            "
          >查看全部 →</span>
        </div>
      } @else {
        <div style="margin-top:4px;">
          <span
            (click)="showEditHistory = true"
            style="
              display:inline-flex;align-items:center;gap:3px;
              font-size:0.65rem;color:rgba(124,108,242,0.65);
              border-bottom:1px solid rgba(124,108,242,0.25);
              letter-spacing:0.06em;cursor:pointer;white-space:nowrap;
            "
          >查看全部 →</span>
        </div>
      }
    </div>
  </div>
}

<!-- Edit History Panel -->
@if (showEditHistory && company) {
  <app-record-edit-history
    [tableName]="'companies'"
    [recordId]="company.id"
    [recordLabel]="company.name"
    (closed)="showEditHistory = false"
  />
}
```

- [ ] **Step 3: Build check**

```bash
ng build --configuration=production 2>&1 | tail -20
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/company-page/company-page.component.ts \
        src/app/pages/company-page/company-page.component.html
git commit -m "feat(company-page): add contributor attribution widget and edit history panel"
```

---

## Chunk 4: Leaderboard + Route + Footer Links

### Task 8: ContributorsComponent — leaderboard page

**Files:**
- Create: `src/app/pages/contributors/contributors.component.ts`
- Create: `src/app/pages/contributors/contributors.component.html`
- Create: `src/app/pages/contributors/contributors.component.spec.ts`

- [ ] **Step 1: Write failing test**

Create `src/app/pages/contributors/contributors.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ContributorsComponent } from './contributors.component';
import { ProposalService, ContributorEntry } from '../../core/proposal.service';

const mockEntries: ContributorEntry[] = [
  { submitter_id: 'u1', submitter_name: 'Alice', total: 34, by_table: { members: 22, groups: 8, companies: 4 } },
  { submitter_id: 'u2', submitter_name: 'Bob', total: 18, by_table: { members: 14, groups: 4 } },
  { submitter_id: 'u3', submitter_name: 'Carol', total: 12, by_table: { members: 10, companies: 2 } },
  { submitter_id: 'u4', submitter_name: 'Dave', total: 5, by_table: { members: 5 } },
];

describe('ContributorsComponent', () => {
  let fixture: ComponentFixture<ContributorsComponent>;
  let component: ContributorsComponent;
  let proposalServiceSpy: jasmine.SpyObj<ProposalService>;

  beforeEach(async () => {
    proposalServiceSpy = jasmine.createSpyObj('ProposalService', ['getLeaderboard']);
    proposalServiceSpy.getLeaderboard.and.returnValue(Promise.resolve(mockEntries));

    await TestBed.configureTestingModule({
      imports: [ContributorsComponent],
      providers: [{ provide: ProposalService, useValue: proposalServiceSpy }],
    }).compileComponents();

    fixture = TestBed.createComponent(ContributorsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load leaderboard on init', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(proposalServiceSpy.getLeaderboard).toHaveBeenCalled();
    expect(component.leaderboard.length).toBe(4);
    expect(component.loading).toBeFalse();
  });

  it('top3 returns first 3 entries', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.top3.length).toBe(3);
    expect(component.top3[0].submitter_name).toBe('Alice');
  });

  it('rest returns entries from index 3 onward', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(component.rest.length).toBe(1);
    expect(component.rest[0].submitter_name).toBe('Dave');
  });

  it('getByTableLabel omits zero-count tables', () => {
    const label = component.getByTableLabel({ members: 5, groups: 0 });
    expect(label).not.toContain('組合');
    expect(label).toContain('成員 5');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
ng test --include='**/contributors.component.spec.ts' --watch=false
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create `contributors.component.ts`**

```typescript
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProposalService, ContributorEntry } from '../../core/proposal.service';

const TABLE_LABELS: Record<string, string> = {
  members: '成員',
  groups: '組合',
  companies: '公司',
  history: '歷程',
};

@Component({
  selector: 'app-contributors',
  standalone: true,
  imports: [RouterLink], // No CommonModule needed — template uses Angular 19 @if/@for control flow
  templateUrl: './contributors.component.html',
})
export class ContributorsComponent implements OnInit {
  leaderboard: ContributorEntry[] = [];
  loading = true;
  error = false;

  constructor(private proposalService: ProposalService) {}

  async ngOnInit() {
    try {
      this.leaderboard = await this.proposalService.getLeaderboard();
    } catch {
      this.error = true;
    } finally {
      this.loading = false;
    }
  }

  get top3(): ContributorEntry[] {
    return this.leaderboard.slice(0, 3);
  }

  get rest(): ContributorEntry[] {
    return this.leaderboard.slice(3);
  }

  get maxTotal(): number {
    return this.leaderboard[0]?.total ?? 1;
  }

  getInitial(name: string): string {
    return name.charAt(0);
  }

  getByTableLabel(byTable: Record<string, number>): string {
    return Object.entries(byTable)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${TABLE_LABELS[k] ?? k} ${n}`)
      .join('・');
  }
}
```

- [ ] **Step 4: Create `contributors.component.html`**

```html
<div style="max-width:680px;margin:0 auto;padding:40px 20px 80px;font-family:'Shippori Mincho',serif;">

  <!-- Page header -->
  <div style="text-align:center;margin-bottom:36px;">
    <div style="font-size:0.62rem;letter-spacing:0.3em;text-transform:uppercase;color:rgba(122,90,122,0.45);margin-bottom:6px;">
      CONTRIBUTORS · 貢獻者排行
    </div>
    <div style="height:1px;background:rgba(232,121,160,0.15);margin:0 auto;max-width:120px;"></div>
  </div>

  @if (loading) {
    <div style="text-align:center;padding:60px 0;color:rgba(122,90,122,0.4);font-size:0.85rem;">
      載入中…
    </div>
  } @else if (error) {
    <div style="text-align:center;padding:60px 0;color:rgba(192,80,128,0.6);font-size:0.85rem;">
      無法載入排行榜，請稍後再試
    </div>
  } @else if (leaderboard.length === 0) {
    <div style="text-align:center;padding:60px 0;color:rgba(122,90,122,0.4);font-size:0.85rem;">
      尚無貢獻記錄
    </div>
  } @else {

    <!-- Podium (top 3) -->
    @if (top3.length > 0) {
      <div style="display:flex;align-items:flex-end;justify-content:center;gap:12px;margin-bottom:32px;">

        <!-- 2nd place (left) -->
        @if (top3.length > 1) {
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:110px;">
            <div style="
              width:50px;height:50px;border-radius:50%;
              background:linear-gradient(135deg,#9ca3af,#6b7280);
              display:flex;align-items:center;justify-content:center;
              font-family:'Cormorant Garamond',Georgia,serif;font-size:1.3rem;font-weight:300;color:white;
            ">{{ getInitial(top3[1].submitter_name) }}</div>
            <div style="font-size:0.75rem;color:#2d1b2e;text-align:center;font-weight:500;">{{ top3[1].submitter_name }}</div>
            <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:0.72rem;color:rgba(122,90,122,0.55);">{{ top3[1].total }} 筆</div>
            <div style="
              width:100%;height:44px;border-radius:4px 4px 0 0;
              background:linear-gradient(135deg,#c0c4cf,#9098a9);
              display:flex;align-items:center;justify-content:center;
              font-family:'Cormorant Garamond',Georgia,serif;font-size:1.2rem;font-weight:300;color:white;
            ">2</div>
          </div>
        }

        <!-- 1st place (center, tallest) -->
        <div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:120px;">
          <div style="font-size:14px;line-height:1;">👑</div>
          <div style="
            width:64px;height:64px;border-radius:50%;
            background:linear-gradient(135deg,#f9a8d4,#e879a0);
            display:flex;align-items:center;justify-content:center;
            font-family:'Cormorant Garamond',Georgia,serif;font-size:1.6rem;font-weight:300;color:white;
          ">{{ getInitial(top3[0].submitter_name) }}</div>
          <div style="font-size:0.8rem;color:#2d1b2e;text-align:center;font-weight:500;">{{ top3[0].submitter_name }}</div>
          <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:0.75rem;color:rgba(122,90,122,0.55);">{{ top3[0].total }} 筆</div>
          <div style="
            width:100%;height:64px;border-radius:4px 4px 0 0;
            background:linear-gradient(135deg,#fde68a,#f59e0b);
            display:flex;align-items:center;justify-content:center;
            font-family:'Cormorant Garamond',Georgia,serif;font-size:1.2rem;font-weight:300;color:white;
          ">1</div>
        </div>

        <!-- 3rd place (right) -->
        @if (top3.length > 2) {
          <div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:110px;">
            <div style="
              width:44px;height:44px;border-radius:50%;
              background:linear-gradient(135deg,#d6a07a,#b8835a);
              display:flex;align-items:center;justify-content:center;
              font-family:'Cormorant Garamond',Georgia,serif;font-size:1.2rem;font-weight:300;color:white;
            ">{{ getInitial(top3[2].submitter_name) }}</div>
            <div style="font-size:0.72rem;color:#2d1b2e;text-align:center;font-weight:500;">{{ top3[2].submitter_name }}</div>
            <div style="font-family:'Cormorant Garamond',Georgia,serif;font-size:0.7rem;color:rgba(122,90,122,0.55);">{{ top3[2].total }} 筆</div>
            <div style="
              width:100%;height:30px;border-radius:4px 4px 0 0;
              background:linear-gradient(135deg,#c8956a,#a07040);
              display:flex;align-items:center;justify-content:center;
              font-family:'Cormorant Garamond',Georgia,serif;font-size:1.1rem;font-weight:300;color:white;
            ">3</div>
          </div>
        }

      </div>
    }

    <!-- List (4th onward) -->
    @if (rest.length > 0) {
      <div style="display:flex;flex-direction:column;gap:6px;">
        @for (entry of rest; track entry.submitter_id; let i = $index) {
          <div style="
            display:flex;align-items:center;gap:14px;
            padding:10px 14px;border-radius:6px;
            background:rgba(255,255,255,0.7);
            border:1px solid rgba(232,121,160,0.1);
          ">
            <!-- Rank -->
            <div style="
              font-family:'Cormorant Garamond',Georgia,serif;font-size:1rem;
              color:rgba(122,90,122,0.35);width:22px;text-align:center;
            ">{{ i + 4 }}</div>
            <!-- Avatar -->
            <div style="
              width:28px;height:28px;border-radius:50%;flex-shrink:0;
              background:rgba(232,121,160,0.15);
              display:flex;align-items:center;justify-content:center;
              font-family:'Shippori Mincho',serif;font-size:0.72rem;color:#c05080;
            ">{{ getInitial(entry.submitter_name) }}</div>
            <!-- Name + breakdown -->
            <div style="flex:1;min-width:0;">
              <div style="font-size:0.82rem;color:#2d1b2e;">{{ entry.submitter_name }}</div>
              <div style="font-size:0.68rem;color:rgba(122,90,122,0.45);font-family:'Cormorant Garamond',Georgia,serif;font-style:italic;margin-top:2px;">
                {{ getByTableLabel(entry.by_table) }}
              </div>
            </div>
            <!-- Progress bar -->
            <div style="width:56px;">
              <div style="height:3px;border-radius:2px;background:rgba(232,121,160,0.1);">
                <div
                  style="height:100%;border-radius:2px;background:linear-gradient(to right,#e879a0,#f9a8d4);"
                  [style.width.%]="entry.total / maxTotal * 100"
                ></div>
              </div>
            </div>
            <!-- Count -->
            <div style="
              font-family:'Cormorant Garamond',Georgia,serif;font-size:0.78rem;
              color:rgba(122,90,122,0.5);letter-spacing:0.04em;white-space:nowrap;
            ">{{ entry.total }} 筆</div>
          </div>
        }
      </div>
    }

  }

  <!-- Back link -->
  <div style="text-align:center;margin-top:48px;">
    <a routerLink="/" style="
      font-size:0.72rem;color:rgba(122,90,122,0.5);
      text-decoration:none;letter-spacing:0.08em;
    ">← 返回首頁</a>
  </div>
</div>
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
ng test --include='**/contributors.component.spec.ts' --watch=false
```
Expected: All 5 tests PASS.

- [ ] **Step 6: Build check**

```bash
ng build --configuration=production 2>&1 | tail -20
```
Expected: Build succeeds with no TypeScript or template errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/pages/contributors/
git commit -m "feat(page): add contributors leaderboard page"
```

---

### Task 9: Route + footer links

**Files:**
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/pages/home/home.component.html`
- Modify: `src/app/pages/member-page/member-page.component.html`
- Modify: `src/app/pages/group-page/group-page.component.html`
- Modify: `src/app/pages/company-page/company-page.component.html`

- [ ] **Step 1: Add route to `app.routes.ts`**

In `src/app/app.routes.ts`, add before the wildcard `{ path: '**', redirectTo: '' }` catch-all:

```typescript
{
  path: 'contributors',
  loadComponent: () =>
    import('./pages/contributors/contributors.component').then(m => m.ContributorsComponent),
},
```

- [ ] **Step 2: Add footer link to `home.component.html`**

In the footer links area (around lines 730–745, where `/about`, `/contact`, `/privacy` links are), add a separator and the contributors link:

```html
<span style="color: rgba(184,160,184,0.3); font-size: 0.7rem;">·</span>
<a routerLink="/contributors" style="
  font-size: 0.75rem; color: rgba(122,90,122,0.55);
  text-decoration: none; letter-spacing: 0.04em;
">貢獻者排行榜</a>
```

- [ ] **Step 3: Add footer link to member-page, group-page, company-page templates**

Each of those pages has its own footer section. Add the same footer link pattern to each. Look for the footer element in each template and append the link. The exact HTML to add in each (consistent with the minimal footer style of those pages):

```html
<div style="text-align:center;margin-top:16px;">
  <a routerLink="/contributors" style="
    font-size:0.72rem;color:rgba(122,90,122,0.45);
    text-decoration:none;letter-spacing:0.06em;
  ">貢獻者排行榜 →</a>
</div>
```

Place this inside/near the existing footer element in each page.

- [ ] **Step 4: Build check**

```bash
ng build --configuration=production 2>&1 | tail -20
```
Expected: Build succeeds.

- [ ] **Step 5: Manual smoke test**

Run `ng serve` and verify:
- `http://localhost:4200/contributors` loads the leaderboard page
- Footer link on home page navigates to `/contributors`
- Footer links on member/group/company pages navigate correctly

- [ ] **Step 6: Commit**

```bash
git add src/app/app.routes.ts \
        src/app/pages/home/home.component.html \
        src/app/pages/member-page/member-page.component.html \
        src/app/pages/group-page/group-page.component.html \
        src/app/pages/company-page/company-page.component.html
git commit -m "feat: add /contributors route and footer links across all pages"
```
