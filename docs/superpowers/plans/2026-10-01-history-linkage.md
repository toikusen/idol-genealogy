# History Linkage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get members and groups linked to history records: an "add history" card where a page has none (B), and an optional first history entry attached to a new-member proposal that approval creates together with the member (A).

**Architecture:** B is template-only plus one new `@Output` on `MemberTimelineComponent`. A stores the attached entry in `proposed_data._history`; `ProposalService.approve()` strips it before inserting the member, then inserts the history row with the new member id. The admin review page already renders only `PROPOSAL_ALLOWED_FIELDS`, so `_history` rides through `editedData` untouched; it only needs its own display block.

**Tech Stack:** Angular (standalone components, signals not used here), Karma + Jasmine, Supabase JS client.

**Spec:** `docs/superpowers/specs/2026-10-01-history-linkage-design.md`

## Global Constraints

- Work in a worktree under `/Users/seitumbp2025/idol-genealogy.worktrees/` on branch `feat/history-linkage`; never commit on the main checkout.
- Commits: Gitmoji + Conventional Commits, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- UI copy is Traditional Chinese (台灣用語); code, comments, identifiers English.
- `_history` never reaches the `members` table.
- Attached history required fields: Taiwan group → `group_id`, `status`, `joined_at`; overseas/solo → `external_group_name`, `status`, `joined_at`.
- If the history insert fails after the member insert, keep the member, still mark the proposal approved, and throw `成員已建立，但附帶經歷建立失敗：<原因>，請到成員頁手動補上`.
- Run single spec: `npx ng test --watch=false --include='<path>'`. Full suite: `npx ng test --watch=false`. Build: `npx ng build`.

## Review Focus

1. Attached section with only whitespace in a text field (e.g. `external_group_name = '  '`) → treated as empty, not as "started filling". Pinned in Task 4.
2. Admin removes the attached history in review → approval inserts only the member, no `history` call. Pinned in Task 3 (no-`_history` case covers the payload the review page produces after removal).
3. Toggling 台灣團體 ↔ 海外/solo after filling one side → only the visible side's fields are submitted. Pinned in Task 4.
4. Approving a non-members INSERT whose payload happens to contain `_history` → untouched behavior is not required; `_history` handling is scoped to `table_name === 'members'`. Pinned in Task 3.
5. Member timeline with histories present → no add card (it must not nag on populated pages). Pinned in Task 1.

---

### Task 0: Worktree

- [ ] **Step 1: Create the worktree**

```bash
cd /Users/seitumbp2025/idol-genealogy
git worktree add ../idol-genealogy.worktrees/history-linkage -b feat/history-linkage
cd ../idol-genealogy.worktrees/history-linkage
pnpm install --frozen-lockfile
```

All later paths are relative to this worktree.

---

### Task 1: Member timeline add-history card (B)

**Files:**
- Modify: `src/app/shared/member-timeline/member-timeline.component.ts` (empty state near line 165, class near line 175)
- Modify: `src/app/pages/member-page/member-page.component.html:479`
- Create: `src/app/shared/member-timeline/member-timeline.component.spec.ts`

**Interfaces:**
- Produces: `@Output() addHistory = new EventEmitter<void>()` on `MemberTimelineComponent`.

- [ ] **Step 1: Write the failing test**

```ts
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MemberTimelineComponent } from './member-timeline.component';

describe('MemberTimelineComponent add-history card', () => {
  function render(histories: any[]) {
    TestBed.configureTestingModule({
      imports: [MemberTimelineComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(MemberTimelineComponent);
    fixture.componentInstance.histories = histories;
    fixture.componentInstance.ngOnChanges();
    fixture.detectChanges();
    return fixture;
  }

  it('offers an add button when the member has no history', () => {
    const fixture = render([]);
    const emitted = jasmine.createSpy('addHistory');
    fixture.componentInstance.addHistory.subscribe(emitted);
    const btn: HTMLButtonElement | null = fixture.nativeElement.querySelector('[data-testid="add-history"]');
    expect(btn).not.toBeNull();
    btn!.click();
    expect(emitted).toHaveBeenCalled();
  });

  it('shows no add card once the member has history', () => {
    const fixture = render([{
      id: 'h1', member_id: 'm1', group_id: 'g1', status: 'active',
      joined_at: '2024-01-01', left_at: null, group: { id: 'g1', name: 'G', color: '#ff88aa' },
    }]);
    expect(fixture.nativeElement.querySelector('[data-testid="add-history"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** (`addHistory` undefined / button not found)

Run: `npx ng test --watch=false --include='src/app/shared/member-timeline/**'`

- [ ] **Step 3: Implement**

Replace the empty state block:

```html
      @if (segments.length === 0) {
        <div class="py-12 text-center">
          <p class="text-4xl text-gray-200 mb-3" style="font-family:'JF Openhuninn',sans-serif;">空</p>
          <p class="text-sm text-gray-400">還沒有這位成員的團體經歷</p>
          <p class="text-xs text-gray-300 mt-1">知道的話幫忙補上</p>
          <button type="button" data-testid="add-history" (click)="addHistory.emit()"
            class="mt-4 inline-flex items-center gap-1 px-4 py-1.5 text-xs text-pink-600 border border-pink-200 rounded-full hover:bg-pink-50 transition-colors">
            ＋ 新增經歷
          </button>
        </div>
      }
```

Add next to `reportHistory`:

```ts
  @Output() addHistory = new EventEmitter<void>();
```

In `member-page.component.html:479`:

```html
          <app-member-timeline [histories]="histories" (reportHistory)="historyToDelete = $event" (addHistory)="showOverseasPanel = true"></app-member-timeline>
```

- [ ] **Step 4: Run test, expect PASS** (same command)

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/member-timeline src/app/pages/member-page/member-page.component.html
git commit -m "✨ feat(member): prompt to add history on members with none

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Group page add-history card (B)

**Files:**
- Modify: `src/app/pages/group-page/group-page.component.html` (the `@if (ganttRows.length > 0) {` block starting ~line 647)

Template-only branch on an existing condition; verified by build + manual check, no unit test (per spec).

- [ ] **Step 1: Add the `@else` branch**

Find the closing `}` of `@if (ganttRows.length > 0) { <section ...> ... </section> }` and append:

```html
      } @else {
        <div class="py-12 text-center" style="margin-bottom: 48px;">
          <p class="text-4xl mb-3" style="font-family:'JF Openhuninn',sans-serif; color: var(--text-faint-55);">空</p>
          <p class="text-sm" style="color: var(--text-faint-55);">還沒有這個團體的成員經歷</p>
          <p class="text-xs mt-1" style="color: var(--text-faint-55);">知道的話幫忙補上</p>
          <button type="button" (click)="showNewHistoryPanel = true"
            class="mt-4 inline-flex items-center gap-1 px-4 py-1.5 text-xs text-pink-600 border border-pink-200 rounded-full hover:bg-pink-50 transition-colors">
            ＋ 新增經歷
          </button>
        </div>
      }
```

(Replace the original lone closing `}` — the result is `} @else { ... }`.)

- [ ] **Step 2: Build**

Run: `npx ng build 2>&1 | grep -iE "error|complete"` — Expected: `Application bundle generation complete.`

- [ ] **Step 3: Manual check**

`npx ng serve`, open a group with no history rows; card shows, button opens the 新增歷程 panel. Open a group with members; card absent.

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/group-page/group-page.component.html
git commit -m "✨ feat(group): prompt to add history on groups with no members

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `approve()` creates the attached history (A)

**Files:**
- Modify: `src/app/core/proposal.service.ts` (`approve()`, lines ~95–142)
- Test: `src/app/core/proposal.service.spec.ts` (inside `describe('approve', ...)`)

**Interfaces:**
- Consumes: `proposed_data._history?: Record<string, any>` (no `member_id`).
- Produces: on a members INSERT, `members` insert payload excludes `_history`; `history` insert payload is `{ ..._history, member_id: <new id> }`.

- [ ] **Step 1: Write the failing tests**

Add a helper inside `describe('approve', ...)` and four tests:

```ts
    function spyTables(historyError: any = null) {
      const inserts: Record<string, any[]> = {};
      mockDb.from = jasmine.createSpy('from').and.callFake((table: string) => {
        if (table === 'proposals') {
          return { update: proposalUpdateSpy };
        }
        return {
          insert: jasmine.createSpy('insert').and.callFake((payload: any) => {
            (inserts[table] ??= []).push(payload);
            if (table === 'history') return Promise.resolve({ error: historyError });
            return {
              select: () => ({ single: () => Promise.resolve({ data: { id: 'new-member-id' }, error: null }) }),
            };
          }),
        };
      });
      return inserts;
    }

    it('inserts the attached history with the new member id', async () => {
      const inserts = spyTables();
      await service.approve({
        id: 'p1', table_name: 'members', record_id: null, operation: 'INSERT',
        proposed_data: { name: '和希', _history: { group_id: 'g1', status: 'active', joined_at: '2024-01-01' } },
      } as any);
      expect(inserts['members']).toEqual([{ name: '和希' }]);
      expect(inserts['history']).toEqual([
        { group_id: 'g1', status: 'active', joined_at: '2024-01-01', member_id: 'new-member-id' },
      ]);
    });

    it('creates only the member when nothing is attached', async () => {
      const inserts = spyTables();
      await service.approve({
        id: 'p1', table_name: 'members', record_id: null, operation: 'INSERT',
        proposed_data: { name: '和希' },
      } as any);
      expect(inserts['members']).toEqual([{ name: '和希' }]);
      expect(inserts['history']).toBeUndefined();
    });

    it('keeps the member and still approves when the history insert fails', async () => {
      const inserts = spyTables({ message: 'invalid status' });
      await expectAsync(service.approve({
        id: 'p1', table_name: 'members', record_id: null, operation: 'INSERT',
        proposed_data: { name: '和希', _history: { group_id: 'g1', status: 'x', joined_at: '2024-01-01' } },
      } as any)).toBeRejectedWithError('成員已建立，但附帶經歷建立失敗：invalid status，請到成員頁手動補上');
      expect(inserts['members']).toEqual([{ name: '和希' }]);
      expect(proposalUpdateSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({ status: 'approved', record_id: 'new-member-id' })
      );
    });
```

    it('leaves _history alone on a non-members INSERT', async () => {
      const inserts = spyTables();
      await service.approve({
        id: 'p1', table_name: 'companies', record_id: null, operation: 'INSERT',
        proposed_data: { name: '新公司', _history: { group_id: 'g1' } },
      } as any);
      expect(inserts['companies']).toEqual([{ name: '新公司', _history: { group_id: 'g1' } }]);
      expect(inserts['history']).toBeUndefined();
    });

- [ ] **Step 2: Run, expect FAIL** (`members` insert receives `_history`, no history insert)

Run: `npx ng test --watch=false --include='src/app/core/proposal.service.spec.ts'`

- [ ] **Step 3: Implement**

In `approve()`, replace the INSERT branch and add the post-approval throw:

```ts
    let historyError: any = null;

    if (proposal.operation === 'INSERT') {
      // A new-member proposal may carry its first history entry; it is not a members column.
      const isMember = proposal.table_name === 'members';
      const { _history, ...memberRow } = dataToApply;
      const row = isMember ? memberRow : dataToApply;
      const attached = isMember ? _history : undefined;
      const { data, error } = await this.db
        .from(proposal.table_name)
        .insert(row)
        .select('id')
        .single();
      applyError = error;
      insertedId = (data as { id?: string } | null)?.id ?? null;
      if (!error && attached && insertedId) {
        const { error: hErr } = await this.db.from('history').insert({ ...attached, member_id: insertedId });
        historyError = hErr;
      }
    } else if ...
```

After the `proposals` update (`if (error) throw error;`), add:

```ts
    if (historyError) {
      throw new Error(`成員已建立，但附帶經歷建立失敗：${historyError.message ?? historyError}，請到成員頁手動補上`);
    }
```

- [ ] **Step 4: Run, expect PASS**, including the pre-existing approve tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/proposal.service.ts src/app/core/proposal.service.spec.ts
git commit -m "✨ feat(proposals): create a new member's attached history on approval

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Attached-history section in the new-member form (A)

**Files:**
- Modify: `src/app/shared/proposal-panel/proposal-panel.component.ts`
- Modify: `src/app/pages/home/home.component.html:1420-1427` (members INSERT panel)
- Test: `src/app/shared/proposal-panel/proposal-panel.component.spec.ts`

**Interfaces:**
- Produces: `attachHistory: { group_id: string; external_group_name: string; external_country: string; status: string }`, `showAttachHistory: boolean`, `attachedHistoryPayload(): { history: Record<string, any> | null; missing: string[] }`. Field errors keyed `attach.<field>`.
- Reuses existing state: `isExternalRecord`, `groupSearch` / `filteredGroups`, `joinedYear/Month/Day`, `leftYear/Month/Day`, `historyStatusOptions`, `buildYMD` (unused by members otherwise).

- [ ] **Step 1: Write the failing tests** (append to the spec; `panel()` helper already exists)

```ts
describe('ProposalPanelComponent attached history', () => {
  function memberInsert() {
    const p = panel();
    p.tableName = 'members';
    p.operation = 'INSERT';
    return p;
  }

  it('attaches nothing when the section is empty or only whitespace', () => {
    const p = memberInsert();
    p.attachHistory.external_group_name = '   ';
    expect(p.attachedHistoryPayload()).toEqual({ history: null, missing: [] });
  });

  it('reports missing required fields once the section is started', () => {
    const p = memberInsert();
    p.attachHistory.group_id = 'g1';
    expect(p.attachedHistoryPayload().missing).toEqual(['status', 'joined_at']);
  });

  it('builds a Taiwan-group entry and ignores the overseas fields', () => {
    const p = memberInsert();
    Object.assign(p.attachHistory, { group_id: 'g1', status: 'active', external_group_name: 'AKB48' });
    p.joinedYear = 2024; p.joinedMonth = 3; p.joinedDay = 5;
    expect(p.attachedHistoryPayload()).toEqual({
      history: { group_id: 'g1', status: 'active', joined_at: '2024-03-05' },
      missing: [],
    });
  });

  it('requires external_group_name instead of group_id for overseas/solo', () => {
    const p = memberInsert();
    p.isExternalRecord = true;
    Object.assign(p.attachHistory, { group_id: 'g1', status: 'active' });
    p.joinedYear = 2024; p.joinedMonth = 3; p.joinedDay = 5;
    expect(p.attachedHistoryPayload()).toEqual({
      history: { status: 'active', joined_at: '2024-03-05' },
      missing: ['external_group_name'],
    });
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`attachHistory` undefined)

Run: `npx ng test --watch=false --include='src/app/shared/proposal-panel/**'`

- [ ] **Step 3: Implement the class members**

Next to the joined/left selectors:

```ts
  // Optional first history entry on a new-member proposal (stored as proposed_data._history)
  showAttachHistory = false;
  attachHistory = { group_id: '', external_group_name: '', external_country: '', status: '' };

  /** The attached history for a new member, or null when the section is untouched. */
  attachedHistoryPayload(): { history: Record<string, any> | null; missing: string[] } {
    const groupFields = this.isExternalRecord
      ? { external_group_name: this.attachHistory.external_group_name, external_country: this.attachHistory.external_country }
      : { group_id: this.attachHistory.group_id };
    const candidate: Record<string, string> = {
      ...groupFields,
      status: this.attachHistory.status,
      joined_at: this.buildYMD(this.joinedYear, this.joinedMonth, this.joinedDay),
      left_at: this.buildYMD(this.leftYear, this.leftMonth, this.leftDay),
    };
    const history = Object.fromEntries(
      Object.entries(candidate).map(([k, v]) => [k, String(v ?? '').trim()]).filter(([, v]) => v)
    );
    if (Object.keys(history).length === 0) return { history: null, missing: [] };
    const required = this.isExternalRecord
      ? ['external_group_name', 'status', 'joined_at']
      : ['group_id', 'status', 'joined_at'];
    return { history, missing: required.filter(f => !history[f]) };
  }
```

In `submitProposal()`, immediately before `// Check submitter name after field validation`:

```ts
    if (this.tableName === 'members' && this.operation === 'INSERT') {
      const { history, missing } = this.attachedHistoryPayload();
      if (missing.length > 0) {
        for (const f of missing) this.fieldErrors['attach.' + f] = '此欄位為必填';
        this.showAttachHistory = true;
        this.scrollToField('attachHistory');
        return;
      }
      if (history) proposed['_history'] = history;
    }
```

- [ ] **Step 4: Run tests, expect PASS**

- [ ] **Step 5: Add the template section**

In the INSERT/UPDATE form, immediately before `<!-- Submitter note -->` (the one inside the non-DELETE branch, ~line 642):

```html
          @if (tableName === 'members' && operation === 'INSERT') {
            <div data-field="attachHistory" class="border-t border-gray-100 pt-4">
              <button type="button" (click)="showAttachHistory = !showAttachHistory"
                class="w-full flex items-center justify-between text-xs font-medium text-gray-600">
                <span>目前所屬團體（選填）</span>
                <span>{{ showAttachHistory ? '−' : '＋' }}</span>
              </button>
              <p class="text-xs text-gray-400 mt-1">知道她在哪個團體的話一起填，審核通過後會同時建立經歷</p>
              @if (showAttachHistory) {
                <div class="space-y-3 mt-3">
                  <div class="flex rounded-lg overflow-hidden border border-gray-600 text-xs">
                    <button type="button" (click)="isExternalRecord = false" class="flex-1 py-1.5 transition-colors"
                      [class.bg-pink-500]="!isExternalRecord" [class.text-white]="!isExternalRecord"
                      [class.bg-transparent]="isExternalRecord" [class.text-gray-400]="isExternalRecord">台灣團體</button>
                    <button type="button" (click)="isExternalRecord = true" class="flex-1 py-1.5 transition-colors"
                      [class.bg-pink-500]="isExternalRecord" [class.text-white]="isExternalRecord"
                      [class.bg-transparent]="!isExternalRecord" [class.text-gray-400]="!isExternalRecord">海外團體/solo</button>
                  </div>
                  @if (isExternalRecord) {
                    <div>
                      <label class="block text-xs font-medium text-gray-600 mb-1">海外團體/solo名稱 *</label>
                      <input type="text" [(ngModel)]="attachHistory.external_group_name" name="attachExternalGroupName"
                        placeholder="例：花丸、AKB48；solo 活動請填藝名"
                        class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300"/>
                      @if (fieldErrors['attach.external_group_name']) {
                        <p class="text-xs text-red-500 mt-1">{{ fieldErrors['attach.external_group_name'] }}</p>
                      }
                    </div>
                    <div>
                      <label class="block text-xs font-medium text-gray-600 mb-1">國家／地區（非必填）</label>
                      <input type="text" [(ngModel)]="attachHistory.external_country" name="attachExternalCountry"
                        placeholder="例：日本、香港（solo 個人活動請留空）"
                        class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300"/>
                    </div>
                  } @else {
                    <div>
                      <label class="block text-xs font-medium text-gray-600 mb-1">團體 *</label>
                      <input type="text" [(ngModel)]="groupSearch" name="attachGroupSearch" placeholder="輸入團體名搜尋…"
                        class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300 mb-1"/>
                      <select [(ngModel)]="attachHistory.group_id" name="attachGroupId"
                        class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300">
                        <option [value]="''">— 請選擇團體 —</option>
                        @for (g of filteredGroups; track g.id) {
                          <option [value]="g.id">{{ g.name }}</option>
                        }
                      </select>
                      @if (fieldErrors['attach.group_id']) {
                        <p class="text-xs text-red-500 mt-1">{{ fieldErrors['attach.group_id'] }}</p>
                      }
                    </div>
                  }
                  <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">狀態 *</label>
                    <select [(ngModel)]="attachHistory.status" name="attachStatus"
                      class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300">
                      <option [value]="''">— 請選擇狀態 —</option>
                      @for (s of historyStatusOptions; track s.value) {
                        <option [value]="s.value">{{ s.label }}</option>
                      }
                    </select>
                    @if (fieldErrors['attach.status']) {
                      <p class="text-xs text-red-500 mt-1">{{ fieldErrors['attach.status'] }}</p>
                    }
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">加入日期 *</label>
                    <div class="flex items-center gap-2">
                      <select [(ngModel)]="joinedYear" name="attachJoinedYear" class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800">
                        <option [value]="0">— 年 —</option>
                        @for (y of years; track y) { <option [value]="y">{{ y }}</option> }
                      </select>
                      <select [(ngModel)]="joinedMonth" name="attachJoinedMonth" [disabled]="!joinedYear" class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 disabled:opacity-50">
                        <option [value]="0">— 月 —</option>
                        @for (m of months; track m) { <option [value]="m">{{ m }} 月</option> }
                      </select>
                      <select [(ngModel)]="joinedDay" name="attachJoinedDay" [disabled]="!joinedMonth" class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 disabled:opacity-50">
                        <option [value]="0">— 日 —</option>
                        @for (d of daysForMonth(joinedMonth); track d) { <option [value]="d">{{ d }} 日</option> }
                      </select>
                    </div>
                    @if (fieldErrors['attach.joined_at']) {
                      <p class="text-xs text-red-500 mt-1">{{ fieldErrors['attach.joined_at'] }}</p>
                    }
                  </div>
                  <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">離開日期（選填）</label>
                    <div class="flex items-center gap-2">
                      <select [(ngModel)]="leftYear" name="attachLeftYear" class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800">
                        <option [value]="0">— 年 —</option>
                        @for (y of years; track y) { <option [value]="y">{{ y }}</option> }
                      </select>
                      <select [(ngModel)]="leftMonth" name="attachLeftMonth" [disabled]="!leftYear" class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 disabled:opacity-50">
                        <option [value]="0">— 月 —</option>
                        @for (m of months; track m) { <option [value]="m">{{ m }} 月</option> }
                      </select>
                      <select [(ngModel)]="leftDay" name="attachLeftDay" [disabled]="!leftMonth" class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 disabled:opacity-50">
                        <option [value]="0">— 日 —</option>
                        @for (d of daysForMonth(leftMonth); track d) { <option [value]="d">{{ d }} 日</option> }
                      </select>
                    </div>
                  </div>
                </div>
              }
            </div>
          }
```

- [ ] **Step 6: Pass groups from home**

`src/app/pages/home/home.component.html`, members INSERT panel (~line 1420): add `[groups]="allGroups"` after `[requiredFields]="['name']"`.

- [ ] **Step 7: Build + manual check**

`npx ng build` succeeds. `npx ng serve` → home → 新增成員: leave section closed and submit (works as before); open it, pick only a group, submit → status/date errors under the section; fill all → submits, and the proposal row's `proposed_data` has `_history`.

- [ ] **Step 8: Commit**

```bash
git add src/app/shared/proposal-panel src/app/pages/home/home.component.html
git commit -m "✨ feat(proposals): let a new-member proposal carry its first history entry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Show the attached history on the admin review page (A)

**Files:**
- Modify: `src/app/pages/admin/admin-proposal-review/admin-proposal-review.component.ts`
- Modify: `src/app/pages/admin/admin-proposal-review/admin-proposal-review.component.html` (after the fields table that closes ~line 247, before `<!-- Reviewer note -->`)

`_history` is already preserved: `editedData` copies all of `proposed_data`, the fields loop only renders `PROPOSAL_ALLOWED_FIELDS`, and `approve()` sends `editedData` when it differs. This task only adds visibility, editing, and removal.

**Interfaces:**
- Produces: `get attachedHistoryEntries(): { key: string; label: string }[]`, `removeAttachedHistory(): void`.

- [ ] **Step 1: Load group names for member INSERTs too**

In `ngOnInit`, change the condition `if (this.proposal.table_name === 'history') {` to:

```ts
        if (this.proposal.table_name === 'history' || this.proposal.proposed_data?.['_history']) {
```

- [ ] **Step 2: Add class members**

```ts
  /** Rows of a new-member proposal's attached first history entry, in display order. */
  get attachedHistoryEntries(): { key: string; label: string }[] {
    const h = this.editedData['_history'];
    if (!h) return [];
    return PROPOSAL_ALLOWED_FIELDS['history']
      .filter(k => h[k] != null && h[k] !== '')
      .map(k => ({ key: k, label: FIELD_LABELS['history']?.[k] ?? k }));
  }

  removeAttachedHistory(): void {
    const { _history, ...rest } = this.editedData;
    this.editedData = rest;
  }
```

- [ ] **Step 3: Add the template block**

```html
    @if (attachedHistoryEntries.length > 0) {
      <div class="bg-white rounded-xl border border-pink-100 mb-6 overflow-hidden">
        <div class="flex items-center justify-between px-4 py-2 bg-pink-50 border-b border-pink-100">
          <span class="text-xs font-medium text-pink-700">附帶經歷（通過後一併建立）</span>
          @if (proposal.status === 'pending') {
            <button type="button" (click)="removeAttachedHistory()" class="text-xs text-gray-500 hover:text-red-500">移除附帶經歷</button>
          }
        </div>
        @for (row of attachedHistoryEntries; track row.key) {
          <div class="grid grid-cols-3 px-4 py-2 border-b border-gray-50 last:border-0 text-sm items-center">
            <span class="text-gray-500 text-xs font-medium">{{ row.label }}</span>
            @if (row.key === 'group_id' || proposal.status !== 'pending') {
              <span class="col-span-2 text-xs text-gray-700">{{ resolveId(row.key, editedData['_history'][row.key]) }}</span>
            } @else {
              <input type="text" [(ngModel)]="editedData['_history'][row.key]" [name]="'attach_' + row.key"
                class="col-span-2 w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-pink-300"/>
            }
          </div>
        }
      </div>
    }
```

Note: `editedData = { ...proposed_data }` is a shallow copy, so editing `editedData._history.x` mutates `proposal.proposed_data._history` too and the `hasEdits` JSON compare would miss it. In `ngOnInit`, deep-copy instead:

```ts
        this.editedData = structuredClone(this.proposal.proposed_data);
```

- [ ] **Step 4: Build + manual check**

`npx ng build` succeeds. Open the proposal created in Task 4 Step 7 under /admin/proposals: block shows group name, status, date; edit status → approve → member page shows the history with the edited status. On a second test proposal click 移除附帶經歷 → approve → member created, no history.

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/admin/admin-proposal-review
git commit -m "✨ feat(admin): review a new member's attached history before approval

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Final verification

- [ ] **Step 1:** `npx ng test --watch=false` — all specs pass.
- [ ] **Step 2:** `npx ng build` — `Application bundle generation complete.`
- [ ] **Step 3:** Hand off via superpowers:finishing-a-development-branch.
