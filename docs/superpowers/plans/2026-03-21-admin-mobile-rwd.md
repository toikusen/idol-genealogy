# Admin Mobile RWD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin backend usable on mobile by adding a slide-in drawer navigation, responsive proposal list cards, a stacked diff table, and a sticky approve/reject action bar.

**Architecture:** Pure Tailwind CSS responsive approach using `md:` breakpoint (768 px) — mobile styles are default, desktop overrides use `md:` prefix. Three HTML templates are modified; only `AdminShellComponent` TS gets new drawer state. Desktop layout is unchanged.

**Tech Stack:** Angular 17+ standalone components, Tailwind CSS, Karma/Jasmine for unit tests, Playwright MCP for visual verification.

---

## File Map

| File | Change |
|------|--------|
| `src/app/pages/admin/admin-shell/admin-shell.component.ts` | Add `drawerOpen`, `toggleDrawer()`, `closeDrawer()`, hook `_navSub` + `ngOnDestroy` |
| `src/app/pages/admin/admin-shell/admin-shell.component.spec.ts` | New — unit tests for drawer state methods |
| `src/app/pages/admin/admin-shell/admin-shell.component.html` | Add mobile header bar + drawer + backdrop; hide sidebar on mobile |
| `src/app/pages/admin/admin-proposals/admin-proposals.component.html` | Restructure list items into two-row responsive cards |
| `src/app/pages/admin/admin-proposal-review/admin-proposal-review.component.html` | Stack diff table; add sticky action bar; add bottom padding |

---

## Task 1: Drawer State in AdminShellComponent (TS)

**Files:**
- Modify: `src/app/pages/admin/admin-shell/admin-shell.component.ts`
- Create: `src/app/pages/admin/admin-shell/admin-shell.component.spec.ts`

- [ ] **Step 1: Write the failing unit tests**

Create `src/app/pages/admin/admin-shell/admin-shell.component.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { AdminShellComponent } from './admin-shell.component';
import { RouterTestingModule } from '@angular/router/testing';
import { AdminRoleService } from '../../../core/admin-role.service';
import { ProposalService } from '../../../core/proposal.service';
import { SupabaseService } from '../../../core/supabase.service';
import { BehaviorSubject } from 'rxjs';

describe('AdminShellComponent drawer', () => {
  let component: AdminShellComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminShellComponent, RouterTestingModule],
      providers: [
        { provide: AdminRoleService, useValue: { isAdmin$: new BehaviorSubject(false) } },
        { provide: ProposalService, useValue: { getPendingCount: () => Promise.resolve(0) } },
        { provide: SupabaseService, useValue: { signOut: () => Promise.resolve() } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(AdminShellComponent);
    component = fixture.componentInstance;
  });

  it('starts with drawerOpen false', () => {
    expect(component.drawerOpen).toBeFalse();
  });

  it('toggleDrawer opens the drawer', () => {
    component.toggleDrawer();
    expect(component.drawerOpen).toBeTrue();
  });

  it('toggleDrawer closes an open drawer', () => {
    component.drawerOpen = true;
    component.toggleDrawer();
    expect(component.drawerOpen).toBeFalse();
  });

  it('closeDrawer sets drawerOpen to false', () => {
    component.drawerOpen = true;
    component.closeDrawer();
    expect(component.drawerOpen).toBeFalse();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/seitumbp2025/idol-genealogy
npx ng test --include="**/admin-shell.component.spec.ts" --watch=false --browsers=ChromeHeadless
```

Expected: 4 failures — `drawerOpen`, `toggleDrawer`, `closeDrawer` do not exist yet.

- [ ] **Step 3: Add drawer state to AdminShellComponent TS**

In `src/app/pages/admin/admin-shell/admin-shell.component.ts`, make these changes:

```typescript
// Add drawerOpen property after line 18 (pendingProposalCount)
drawerOpen = false;

// Add these two methods before signOut():
toggleDrawer(): void {
  this.drawerOpen = !this.drawerOpen;
  if (this.drawerOpen) {
    document.body.classList.add('overflow-hidden');
  } else {
    document.body.classList.remove('overflow-hidden');
  }
}

closeDrawer(): void {
  this.drawerOpen = false;
  document.body.classList.remove('overflow-hidden');
}
```

Also update `_navSub` subscription to call `closeDrawer()` on navigation:

```typescript
this._navSub = this.router.events.pipe(
  filter(e => e instanceof NavigationEnd),
).subscribe(() => {
  this.closeDrawer();   // ← add this line
  if (this.isAdmin) {
    this.proposalService.getPendingCount().then(n => this.pendingProposalCount = n).catch(() => {});
  }
});
```

And update `ngOnDestroy` to call `closeDrawer()`:

```typescript
ngOnDestroy(): void {
  this.closeDrawer();   // ← add this line
  this._sub.unsubscribe();
  this._navSub.unsubscribe();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx ng test --include="**/admin-shell.component.spec.ts" --watch=false --browsers=ChromeHeadless
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/admin/admin-shell/admin-shell.component.ts \
        src/app/pages/admin/admin-shell/admin-shell.component.spec.ts
git commit -m "feat: add drawer state to AdminShellComponent for mobile nav"
```

---

## Task 2: Mobile Header + Drawer Template (admin-shell HTML)

**Files:**
- Modify: `src/app/pages/admin/admin-shell/admin-shell.component.html`

- [ ] **Step 1: Add `hidden md:flex` to the existing sidebar**

The existing `<aside>` element opens with:
```html
<aside class="w-52 bg-white shadow-md flex flex-col flex-shrink-0">
```

Change to:
```html
<aside class="hidden md:flex w-52 bg-white shadow-md flex-col flex-shrink-0">
```

- [ ] **Step 2: Add mobile header bar at the top of the root div**

Insert immediately after `<div class="flex h-screen bg-gray-50">` (line 1), before the `<aside>`:

```html
<!-- Mobile header — hidden on desktop -->
<header class="md:hidden fixed top-0 left-0 right-0 z-20 bg-white border-b border-gray-100 flex items-center justify-between px-4 h-12">
  <span class="font-['Cormorant_Garamond'] text-lg font-semibold text-gray-800 tracking-wide">族譜管理</span>
  <button
    (click)="toggleDrawer()"
    class="p-2 text-gray-500 hover:text-pink-600 transition-colors"
    aria-label="開啟導覽選單"
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="3" y1="6" x2="21" y2="6"/>
      <line x1="3" y1="12" x2="21" y2="12"/>
      <line x1="3" y1="18" x2="21" y2="18"/>
    </svg>
  </button>
</header>
```

- [ ] **Step 3: Add top padding to main content for mobile header offset**

Change:
```html
<main class="flex-1 overflow-auto">
```
To:
```html
<main class="flex-1 overflow-auto pt-12 md:pt-0">
```

- [ ] **Step 4: Add backdrop and drawer panel**

Insert after the `</header>` mobile header block (before `<aside>`):

```html
<!-- Mobile drawer backdrop -->
@if (drawerOpen) {
  <div
    class="md:hidden fixed inset-0 z-40 bg-black/40"
    (click)="closeDrawer()"
  ></div>
}

<!-- Mobile drawer panel -->
<div
  class="md:hidden fixed top-0 left-0 h-full z-50 w-64 bg-white shadow-xl flex flex-col transition-transform"
  [class.-translate-x-full]="!drawerOpen"
>
  <!-- App name -->
  <div class="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
    <span class="font-['Cormorant_Garamond'] text-xl font-semibold text-gray-800 tracking-wide">族譜管理</span>
    <button (click)="closeDrawer()" class="p-1 text-gray-400 hover:text-gray-600">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
      </svg>
    </button>
  </div>

  <!-- Nav links (same as sidebar) -->
  <nav class="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
    <a routerLink="/admin/members" routerLinkActive="bg-pink-100 text-pink-700 font-medium"
       class="flex items-center px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-pink-50 hover:text-pink-600 transition-colors">
      成員管理
    </a>
    <a routerLink="/admin/groups" routerLinkActive="bg-pink-100 text-pink-700 font-medium"
       class="flex items-center px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-pink-50 hover:text-pink-600 transition-colors">
      團體管理
    </a>
    <a routerLink="/admin/companies" routerLinkActive="bg-pink-100 text-pink-700 font-medium"
       class="flex items-center px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-pink-50 hover:text-pink-600 transition-colors">
      公司管理
    </a>
    <a routerLink="/admin/team" routerLinkActive="bg-pink-100 text-pink-700 font-medium"
       class="flex items-center px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-pink-50 hover:text-pink-600 transition-colors">
      團隊管理
    </a>
    <a routerLink="/admin/history" routerLinkActive="bg-pink-100 text-pink-700 font-medium"
       class="flex items-center px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-pink-50 hover:text-pink-600 transition-colors">
      歷史記錄
    </a>
    @if (isAdmin) {
      <div class="pt-2 mt-2 border-t border-gray-100">
        <a routerLink="/admin/audit-log" routerLinkActive="bg-purple-100 text-purple-700 font-medium"
           class="flex items-center px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-purple-50 hover:text-purple-600 transition-colors">
          變更記錄
        </a>
        <a routerLink="/admin/proposals" routerLinkActive="bg-purple-100 text-purple-700 font-medium"
           class="flex items-center justify-between px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-purple-50 hover:text-purple-600 transition-colors">
          <span>提案審核</span>
          @if (pendingProposalCount > 0) {
            <span class="ml-2 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
              {{ pendingProposalCount > 99 ? '99+' : pendingProposalCount }}
            </span>
          }
        </a>
        <a routerLink="/admin/roles" routerLinkActive="bg-purple-100 text-purple-700 font-medium"
           class="flex items-center px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-purple-50 hover:text-purple-600 transition-colors">
          角色管理
        </a>
      </div>
    }
  </nav>

  <!-- Bottom actions -->
  <div class="px-4 py-4 border-t border-gray-100 space-y-2">
    <a routerLink="/"
       class="flex items-center px-3 py-2 rounded-md text-sm text-gray-500 hover:text-pink-600 hover:bg-pink-50 transition-colors">
      ← 回到首頁
    </a>
    <button
      (click)="signOut()"
      class="w-full text-left px-3 py-2 rounded-md text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
    >
      登出
    </button>
  </div>
</div>
```

- [ ] **Step 5: Verify the app compiles without errors**

```bash
npx ng build --configuration=development 2>&1 | tail -5
```

Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/pages/admin/admin-shell/admin-shell.component.html
git commit -m "feat: add mobile header and slide-in drawer to admin shell"
```

---

## Task 3: Responsive Proposal List Cards

**Files:**
- Modify: `src/app/pages/admin/admin-proposals/admin-proposals.component.html`

- [ ] **Step 1: Restructure the proposal list item**

Find the existing `<a>` list item (lines 30–48). Replace it entirely with:

```html
<a
  [routerLink]="['/admin/proposals', p.id]"
  class="flex items-center gap-3 px-4 py-3 bg-white rounded-lg border border-gray-100 hover:border-pink-200 hover:shadow-sm transition-all"
>
  <!-- Operation badge — always visible -->
  <span [class]="'text-xs px-2 py-0.5 rounded font-medium flex-shrink-0 ' + operationClass(p.operation)">
    {{ operationLabel(p.operation) }}
  </span>

  <!-- Left block: name row + meta row -->
  <span class="flex-1 min-w-0 flex flex-col gap-0.5">
    <!-- Record name — always visible -->
    <span class="text-sm text-gray-800 truncate">
      {{ tableLabel(p.table_name) }}：<span class="font-medium">{{ recordName(p) }}</span>
    </span>
    <!-- Meta row: mobile shows it here, desktop hides it here (shows inline below) -->
    <span class="flex items-center gap-1.5 md:hidden">
      <span class="text-xs text-gray-500">{{ p.submitter_name }}</span>
      @if (p.submitter_id) {
        <span class="text-xs px-1.5 py-0.5 rounded-full" style="background:rgba(124,108,242,0.1);color:rgba(124,108,242,0.8);">登入</span>
      } @else {
        <span class="text-xs px-1.5 py-0.5 rounded-full" style="background:rgba(122,90,122,0.07);color:rgba(122,90,122,0.45);">訪客</span>
      }
      <span class="text-xs text-gray-400">{{ relativeTime(p.created_at) }}</span>
    </span>
  </span>

  <!-- Desktop-only inline meta — hidden on mobile -->
  <span class="text-xs text-gray-500 flex-shrink-0 hidden md:inline">提案者：{{ p.submitter_name }}</span>
  @if (p.submitter_id) {
    <span class="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 hidden md:inline-flex" style="background:rgba(124,108,242,0.1);color:rgba(124,108,242,0.8);">登入</span>
  } @else {
    <span class="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 hidden md:inline-flex" style="background:rgba(122,90,122,0.07);color:rgba(122,90,122,0.45);">訪客</span>
  }
  <span class="text-xs text-gray-400 flex-shrink-0 hidden md:inline">{{ relativeTime(p.created_at) }}</span>

  <!-- Chevron — always pinned right -->
  <span class="text-gray-300 flex-shrink-0">›</span>
</a>
```

- [ ] **Step 2: Verify the app compiles**

```bash
npx ng build --configuration=development 2>&1 | tail -5
```

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/admin/admin-proposals/admin-proposals.component.html
git commit -m "feat: responsive two-row card layout for admin proposals list"
```

---

## Task 4: Stacked Diff Table + Sticky Action Bar (proposal review)

**Files:**
- Modify: `src/app/pages/admin/admin-proposal-review/admin-proposal-review.component.html`

- [ ] **Step 1: Add bottom padding to the page container**

Change line 2:
```html
<div class="p-6 max-w-4xl mx-auto">
```
To:
```html
<div class="p-6 pb-24 md:pb-6 max-w-4xl mx-auto">
```

- [ ] **Step 2: Hide the diff table header row on mobile**

Change:
```html
<div class="grid grid-cols-3 bg-gray-50 text-xs font-medium text-gray-500 px-4 py-2 border-b border-gray-100">
```
To:
```html
<div class="hidden md:grid grid-cols-3 bg-gray-50 text-xs font-medium text-gray-500 px-4 py-2 border-b border-gray-100">
```

- [ ] **Step 3: Change each diff field row to stack on mobile**

Change:
```html
<div
  class="grid grid-cols-3 px-4 py-3 border-b border-gray-50 last:border-0 text-sm"
  [class.bg-yellow-50]="isChanged(field)"
>
```
To:
```html
<div
  class="grid grid-cols-1 md:grid-cols-3 px-4 py-3 border-b border-gray-50 last:border-0 text-sm gap-1 md:gap-0"
  [class.bg-yellow-50]="isChanged(field)"
>
```

- [ ] **Step 4: Add field label prefix on mobile for original/proposed values**

The field label cell (currently `<span class="text-gray-500 text-xs font-medium pt-1">`) is fine as-is — it becomes the top row of the stacked block.

For the original value cell, add a mobile label prefix. Change:
```html
<span class="text-gray-600 text-xs pt-1 break-words">{{ resolveId(field, original(field)) || '—' }}</span>
```
To:
```html
<div class="flex gap-2 items-baseline">
  <span class="text-gray-400 text-xs md:hidden flex-shrink-0">原始：</span>
  <span class="text-gray-600 text-xs break-words">{{ resolveId(field, original(field)) || '—' }}</span>
</div>
```

And for the proposed read-only value (non-pending status):
```html
<span class="text-gray-700 text-xs pt-1 break-words">{{ resolveId(field, proposed(field)) || '—' }}</span>
```
To:
```html
<div class="flex gap-2 items-baseline">
  <span class="text-gray-400 text-xs md:hidden flex-shrink-0">提案：</span>
  <span class="text-gray-700 text-xs break-words">{{ resolveId(field, proposed(field)) || '—' }}</span>
</div>
```

For editable inputs (pending status), add a mobile label above the input:
```html
} @else {
  <input
    type="text"
    [(ngModel)]="editedData[field]"
```
Change to:
```html
} @else {
  <span class="text-gray-400 text-xs md:hidden">提案（可編輯）：</span>
  <input
    type="text"
    [(ngModel)]="editedData[field]"
```

- [ ] **Step 5: Hide existing inline action buttons on mobile**

Change:
```html
<div class="flex gap-3 flex-wrap">
```
To:
```html
<div class="hidden md:flex gap-3 flex-wrap">
```

- [ ] **Step 6: Add sticky mobile action bar**

Insert after the closing `}` of `@if (proposal.status === 'pending')` inline buttons block (after line `</div>` of the `flex gap-3 flex-wrap` div), and before the closing `}` of `@else if (!proposal)`:

Actually, insert just before the outer closing `}` at line 251 (the `@else` branch end), after the existing `@if (proposal.status === 'pending')` block:

```html
<!-- Sticky action bar — mobile only, pending proposals only -->
@if (proposal.status === 'pending') {
  <div class="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-100 px-4 py-3">
    @if (!showRejectForm) {
      <div class="flex gap-3">
        <button
          (click)="approve()"
          [disabled]="saving"
          class="flex-1 py-2.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white rounded-full text-sm font-medium transition-colors"
        >
          {{ proposal.operation === 'DELETE' ? '🗑️ 確認刪除' : '✅ 核准' }}
        </button>
        <button
          (click)="showRejectForm = true"
          class="flex-1 py-2.5 border border-red-300 text-red-500 hover:bg-red-50 rounded-full text-sm font-medium transition-colors"
        >
          ❌ 拒絕
        </button>
      </div>
    } @else {
      <!-- Reject confirm/cancel in sticky bar; textarea is inline in page body above -->
      <div class="flex gap-2">
        <button
          (click)="reject()"
          [disabled]="saving"
          class="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white rounded-full text-sm transition-colors"
        >
          確認拒絕
        </button>
        <button
          (click)="showRejectForm = false"
          class="flex-1 py-2.5 text-gray-500 border border-gray-200 hover:text-gray-700 rounded-full text-sm transition-colors"
        >
          取消
        </button>
      </div>
    }
  </div>
}
```

Also add the rejection note textarea to the page body (visible above the sticky bar when `showRejectForm` is true). Insert just before the sticky bar block above:

```html
<!-- Mobile reject note textarea — appears in body above sticky bar -->
@if (proposal.status === 'pending' && showRejectForm) {
  <div class="md:hidden mt-4 mb-2">
    <textarea
      [(ngModel)]="rejectNote"
      name="rejectNoteMobile"
      rows="3"
      class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-300"
      placeholder="拒絕理由（選填）"
    ></textarea>
  </div>
}
```

- [ ] **Step 7: Verify the app compiles**

```bash
npx ng build --configuration=development 2>&1 | tail -5
```

Expected: Build succeeds with no errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/pages/admin/admin-proposal-review/admin-proposal-review.component.html
git commit -m "feat: mobile stacked diff table and sticky approve/reject bar"
```

---

## Task 5: Playwright Visual Verification

**Files:** None (verification only)

- [ ] **Step 1: Verify mobile — sidebar hidden, header visible**

Using Playwright MCP:
1. Resize to 390×844
2. Navigate to `http://localhost:4200/admin`
3. Take screenshot
4. Verify: sidebar `w-52` is not visible; mobile header bar with hamburger button is shown at top

- [ ] **Step 2: Verify drawer opens and closes**

1. Click the hamburger button
2. Take screenshot — drawer should slide in from left with backdrop
3. Click the backdrop
4. Take screenshot — drawer should be closed

- [ ] **Step 3: Verify proposals list on mobile**

1. Navigate to `http://localhost:4200/admin/proposals`
2. Take screenshot
3. Verify: no horizontal scroll; each list item shows two rows (name + meta below)

- [ ] **Step 4: Verify proposal review on mobile**

1. Navigate to a pending proposal review page
2. Take screenshot
3. Verify: diff table stacks vertically; sticky action bar visible at bottom with 核准/拒絕 buttons

- [ ] **Step 5: Verify desktop layout unchanged**

1. Resize to 1024×768
2. Navigate through admin/proposals and a review page
3. Take screenshots
4. Verify: sidebar is visible; `grid-cols-3` diff table is shown; no sticky bar at bottom

- [ ] **Step 6: Commit verification screenshots (optional)**

```bash
git add -f *.png 2>/dev/null; echo "screenshots committed if any"
```
