# Photography Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add photography/videography policy fields to group and member pages, with display section, Proposal system support, and admin direct-edit.

**Architecture:** Add 5 columns (`photo_status`, `photo_notes`, `video_status`, `video_notes`, `photography_source`) to existing `groups` and `members` tables. Pure utility functions handle badge styling. Both front-end pages and admin panels are updated independently.

**Tech Stack:** Angular 17 SSR, Supabase (PostgreSQL), Karma/Jasmine tests, inline Angular templates.

**Spec:** `docs/superpowers/specs/2026-06-01-photography-policy-design.md`

---

### Task 1: SQL Migration

**Files:**
- Create: `supabase/migrations/066_add_photography_policy.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/066_add_photography_policy.sql
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS photo_status  TEXT CHECK (photo_status  IN ('allowed','not_allowed','conditional')),
  ADD COLUMN IF NOT EXISTS photo_notes   TEXT,
  ADD COLUMN IF NOT EXISTS video_status  TEXT CHECK (video_status  IN ('allowed','not_allowed','conditional')),
  ADD COLUMN IF NOT EXISTS video_notes   TEXT,
  ADD COLUMN IF NOT EXISTS photography_source TEXT;

ALTER TABLE members
  ADD COLUMN IF NOT EXISTS photo_status  TEXT CHECK (photo_status  IN ('allowed','not_allowed','conditional')),
  ADD COLUMN IF NOT EXISTS photo_notes   TEXT,
  ADD COLUMN IF NOT EXISTS video_status  TEXT CHECK (video_status  IN ('allowed','not_allowed','conditional')),
  ADD COLUMN IF NOT EXISTS video_notes   TEXT,
  ADD COLUMN IF NOT EXISTS photography_source TEXT;
```

- [ ] **Step 2: Apply migration to Supabase**

Run in Supabase dashboard SQL editor, or via CLI:
```bash
supabase db push
```
Expected: No errors. Verify columns exist by running `SELECT column_name FROM information_schema.columns WHERE table_name = 'groups' AND column_name LIKE '%photo%';`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/066_add_photography_policy.sql
git commit -m "✨ feat(db): add photography policy columns to groups and members"
```

---

### Task 2: Photography Policy Utility Functions (TDD)

**Files:**
- Create: `src/app/core/photography-policy.utils.ts`
- Create: `src/app/core/photography-policy.utils.spec.ts`

- [ ] **Step 1: Write the failing tests first**

Create `src/app/core/photography-policy.utils.spec.ts`:

```ts
import {
  photographyBadgeColor,
  photographyBadgeTextColor,
  photographyBadgeBorderColor,
  photographyStatusLabel,
} from './photography-policy.utils';

describe('photographyBadgeColor', () => {
  it('returns green bg for allowed', () =>
    expect(photographyBadgeColor('allowed')).toBe('rgba(34,197,94,0.12)'));
  it('returns red bg for not_allowed', () =>
    expect(photographyBadgeColor('not_allowed')).toBe('rgba(239,68,68,0.12)'));
  it('returns yellow bg for conditional', () =>
    expect(photographyBadgeColor('conditional')).toBe('rgba(251,191,36,0.12)'));
  it('returns transparent for null', () =>
    expect(photographyBadgeColor(null)).toBe('transparent'));
});

describe('photographyBadgeTextColor', () => {
  it('returns #4ade80 for allowed', () =>
    expect(photographyBadgeTextColor('allowed')).toBe('#4ade80'));
  it('returns #f87171 for not_allowed', () =>
    expect(photographyBadgeTextColor('not_allowed')).toBe('#f87171'));
  it('returns #fbbf24 for conditional', () =>
    expect(photographyBadgeTextColor('conditional')).toBe('#fbbf24'));
  it('returns faint color for null', () =>
    expect(photographyBadgeTextColor(null)).toBe('var(--text-faint-55)'));
});

describe('photographyBadgeBorderColor', () => {
  it('returns green border for allowed', () =>
    expect(photographyBadgeBorderColor('allowed')).toBe('rgba(34,197,94,0.25)'));
  it('returns red border for not_allowed', () =>
    expect(photographyBadgeBorderColor('not_allowed')).toBe('rgba(239,68,68,0.25)'));
  it('returns yellow border for conditional', () =>
    expect(photographyBadgeBorderColor('conditional')).toBe('rgba(251,191,36,0.25)'));
  it('returns transparent for null', () =>
    expect(photographyBadgeBorderColor(null)).toBe('transparent'));
});

describe('photographyStatusLabel', () => {
  it('photo: allowed → 可拍', () =>
    expect(photographyStatusLabel('allowed', 'photo')).toBe('可拍'));
  it('photo: not_allowed → 不可拍', () =>
    expect(photographyStatusLabel('not_allowed', 'photo')).toBe('不可拍'));
  it('photo: conditional → 條件式', () =>
    expect(photographyStatusLabel('conditional', 'photo')).toBe('條件式'));
  it('video: allowed → 可錄', () =>
    expect(photographyStatusLabel('allowed', 'video')).toBe('可錄'));
  it('video: not_allowed → 不可錄', () =>
    expect(photographyStatusLabel('not_allowed', 'video')).toBe('不可錄'));
  it('video: conditional → 條件式', () =>
    expect(photographyStatusLabel('conditional', 'video')).toBe('條件式'));
  it('null → empty string', () =>
    expect(photographyStatusLabel(null, 'photo')).toBe(''));
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
ng test --watch=false --include="**/photography-policy.utils.spec.ts"
```
Expected: errors about missing module `./photography-policy.utils`

- [ ] **Step 3: Create the utility file**

Create `src/app/core/photography-policy.utils.ts`:

```ts
import { PhotographyPolicyStatus } from '../models';

export function photographyBadgeColor(status: PhotographyPolicyStatus | null): string {
  switch (status) {
    case 'allowed':     return 'rgba(34,197,94,0.12)';
    case 'not_allowed': return 'rgba(239,68,68,0.12)';
    case 'conditional': return 'rgba(251,191,36,0.12)';
    default:            return 'transparent';
  }
}

export function photographyBadgeTextColor(status: PhotographyPolicyStatus | null): string {
  switch (status) {
    case 'allowed':     return '#4ade80';
    case 'not_allowed': return '#f87171';
    case 'conditional': return '#fbbf24';
    default:            return 'var(--text-faint-55)';
  }
}

export function photographyBadgeBorderColor(status: PhotographyPolicyStatus | null): string {
  switch (status) {
    case 'allowed':     return 'rgba(34,197,94,0.25)';
    case 'not_allowed': return 'rgba(239,68,68,0.25)';
    case 'conditional': return 'rgba(251,191,36,0.25)';
    default:            return 'transparent';
  }
}

export function photographyStatusLabel(
  status: PhotographyPolicyStatus | null,
  type: 'photo' | 'video',
): string {
  if (!status) return '';
  if (type === 'photo') {
    switch (status) {
      case 'allowed':     return '可拍';
      case 'not_allowed': return '不可拍';
      case 'conditional': return '條件式';
    }
  }
  switch (status) {
    case 'allowed':     return '可錄';
    case 'not_allowed': return '不可錄';
    case 'conditional': return '條件式';
  }
}
```

Note: `PhotographyPolicyStatus` will be added to `models/index.ts` in Task 3. The import will cause a compile error until then — that's fine, tests for this file will pass once models are updated.

- [ ] **Step 4: Run tests — verify they pass**

```bash
ng test --watch=false --include="**/photography-policy.utils.spec.ts"
```
Expected: 16 specs, 0 failures

- [ ] **Step 5: Commit**

```bash
git add src/app/core/photography-policy.utils.ts src/app/core/photography-policy.utils.spec.ts
git commit -m "✨ feat(core): add photography policy utility functions with tests"
```

---

### Task 3: TypeScript Model Changes

**Files:**
- Modify: `src/app/models/index.ts`

- [ ] **Step 1: Add `PhotographyPolicyStatus` type and update both interfaces**

In `src/app/models/index.ts`, add after the existing imports (before `export interface Member`):

```ts
export type PhotographyPolicyStatus = 'allowed' | 'not_allowed' | 'conditional';
```

Add these 5 fields to the `Member` interface (after `no_sns: boolean;`):

```ts
  photo_status: PhotographyPolicyStatus | null;
  photo_notes: string | null;
  video_status: PhotographyPolicyStatus | null;
  video_notes: string | null;
  photography_source: string | null;
```

Add the same 5 fields to the `Group` interface (after `updated_at: string;`... actually insert before `updated_at`):

```ts
  photo_status: PhotographyPolicyStatus | null;
  photo_notes: string | null;
  video_status: PhotographyPolicyStatus | null;
  video_notes: string | null;
  photography_source: string | null;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
ng build --configuration=development 2>&1 | grep -E "error|Error" | head -20
```
Expected: no new errors (the build may warn about other things, ignore those)

- [ ] **Step 3: Commit**

```bash
git add src/app/models/index.ts
git commit -m "✨ feat(models): add PhotographyPolicyStatus type and fields to Group and Member"
```

---

### Task 4: Proposal Fields Config

**Files:**
- Modify: `src/app/core/proposal-fields.config.ts`

- [ ] **Step 1: Add fields to allowed lists and labels**

In `PROPOSAL_ALLOWED_FIELDS`, add to both `groups` and `members` arrays:
```ts
'photo_status', 'photo_notes', 'video_status', 'video_notes', 'photography_source',
```

In `FIELD_LABELS`, add to both `groups` and `members` objects:
```ts
photo_status: '攝影規範',
photo_notes: '攝影備註',
video_status: '錄影規範',
video_notes: '錄影備註',
photography_source: '資料來源',
```

After editing, the `groups` section of `PROPOSAL_ALLOWED_FIELDS` should look like:
```ts
groups: [
  'name', 'name_jp', 'color', 'founded_at', 'disbanded_at',
  'instagram', 'facebook', 'x', 'youtube', 'timetree_url', 'company_id', 'photo_url',
  'photo_status', 'photo_notes', 'video_status', 'video_notes', 'photography_source',
],
```

And `members`:
```ts
members: [
  'name', 'name_hiragana', 'name_roman', 'emoji', 'nickname', 'birthdate',
  'color', 'color_name', 'instagram', 'facebook', 'x', 'maid_url', 'photo_url',
  'photo_status', 'photo_notes', 'video_status', 'video_notes', 'photography_source',
],
```

- [ ] **Step 2: Commit**

```bash
git add src/app/core/proposal-fields.config.ts
git commit -m "✨ feat(proposal): register photography policy fields in allowed list and labels"
```

---

### Task 5: Proposal Panel — Add Select for Status Fields

**Files:**
- Modify: `src/app/shared/proposal-panel/proposal-panel.component.ts` (inline template)

The template in `proposal-panel.component.ts` has an `@if/@else if/@else` chain that renders different inputs per field. The `photo_status` and `video_status` fields currently fall through to the default `<input type="text">`, which would allow invalid enum values. Add a dedicated `@else if` branch before the default branch.

- [ ] **Step 1: Find the insertion point**

The insertion point is just before this block (around line 579):
```
              <!-- Default: text input -->
              } @else {
                <input
                  type="text"
                  [(ngModel)]="formData[field]"
```

- [ ] **Step 2: Insert the new branch**

Replace:
```
              <!-- Default: text input -->
              } @else {
```

With:
```
              <!-- Photography policy status select -->
              } @else if (field === 'photo_status' || field === 'video_status') {
                <select
                  [(ngModel)]="formData[field]"
                  [name]="field"
                  class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-pink-300"
                >
                  <option [ngValue]="null">— 未設定 —</option>
                  <option value="allowed">{{ field === 'photo_status' ? '✅ 可拍' : '✅ 可錄' }}</option>
                  <option value="not_allowed">{{ field === 'photo_status' ? '❌ 不可拍' : '❌ 不可錄' }}</option>
                  <option value="conditional">⚠️ 條件式</option>
                </select>
                @if (operation === 'UPDATE' && original(field)) {
                  <p class="text-xs text-gray-300 mt-0.5">原始值：{{ original(field) }}</p>
                }

              <!-- Default: text input -->
              } @else {
```

- [ ] **Step 3: Verify build**

```bash
ng build --configuration=development 2>&1 | grep -E "error|Error" | head -20
```
Expected: no new errors

- [ ] **Step 4: Commit**

```bash
git add src/app/shared/proposal-panel/proposal-panel.component.ts
git commit -m "✨ feat(proposal-panel): render select for photo_status and video_status fields"
```

---

### Task 6: Group Page — Display Section + Helper Methods

**Files:**
- Modify: `src/app/pages/group-page/group-page.component.ts`
- Modify: `src/app/pages/group-page/group-page.component.html`

- [ ] **Step 1: Add helper methods to group-page.component.ts**

Add this import at the top of the file (with the other core imports):
```ts
import {
  photographyBadgeColor,
  photographyBadgeTextColor,
  photographyBadgeBorderColor,
  photographyStatusLabel,
} from '../../core/photography-policy.utils';
```

Add these 4 methods to the `GroupPageComponent` class (after `formatRelativeTime`):
```ts
  photographyBadgeColor = photographyBadgeColor;
  photographyBadgeTextColor = photographyBadgeTextColor;
  photographyBadgeBorderColor = photographyBadgeBorderColor;
  photographyStatusLabel = photographyStatusLabel;
```

(Assigning imported functions as class properties is the standard pattern for using pure functions in Angular templates.)

- [ ] **Step 2: Add photography section to group-page.component.html**

Find the closing `</header>` tag of the group header (after the SNS links, notes, and photo — around line 324 in the original file). Insert the photography section immediately after `</header>` and before `<!-- ══ Selected member detail panel ══ -->`:

```html
      <!-- ══ Photography policy section ══ -->
      @if (group.photo_status || group.photo_notes || group.video_status || group.video_notes) {
        <div style="
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: 4px;
          padding: 14px 20px;
          margin-bottom: 24px;
          position: relative; overflow: hidden;
        ">
          <div style="
            position: absolute; top: 0; left: 0;
            width: 3px; height: 100%;
            background: linear-gradient(to bottom, rgba(232,127,160,0.5), rgba(124,108,242,0.2));
          "></div>

          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding-left: 4px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 0.62rem; letter-spacing: 0.25em; text-transform: uppercase; color: var(--text-label);">攝錄規範</span>
              <span style="font-size: 0.62rem; color: var(--text-faint-38); letter-spacing: 0.05em;">以主辦方規定為前提</span>
            </div>
            <button
              (click)="showGroupProposalPanel = true"
              style="font-size: 0.65rem; color: rgba(232,127,160,0.5); background: none; border: 1px solid rgba(232,127,160,0.15); border-radius: 3px; padding: 2px 8px; cursor: pointer;"
            >提案修改</button>
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px; padding-left: 4px;">
            @if (group.photo_status || group.photo_notes) {
              <div style="display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px;">
                <span style="font-size: 0.72rem; color: var(--text-faint-40); flex-shrink: 0;">📷</span>
                @if (group.photo_status) {
                  <span
                    [style.background]="photographyBadgeColor(group.photo_status)"
                    [style.color]="photographyBadgeTextColor(group.photo_status)"
                    [style.border]="'1px solid ' + photographyBadgeBorderColor(group.photo_status)"
                    style="border-radius: 3px; padding: 1px 8px; font-size: 0.72rem; flex-shrink: 0;"
                  >{{ photographyStatusLabel(group.photo_status, 'photo') }}</span>
                }
                @if (group.photo_notes) {
                  <span style="font-size: 0.75rem; color: var(--text-faint-55); line-height: 1.5;">{{ group.photo_notes }}</span>
                }
              </div>
            }
            @if (group.video_status || group.video_notes) {
              <div style="display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px;">
                <span style="font-size: 0.72rem; color: var(--text-faint-40); flex-shrink: 0;">🎥</span>
                @if (group.video_status) {
                  <span
                    [style.background]="photographyBadgeColor(group.video_status)"
                    [style.color]="photographyBadgeTextColor(group.video_status)"
                    [style.border]="'1px solid ' + photographyBadgeBorderColor(group.video_status)"
                    style="border-radius: 3px; padding: 1px 8px; font-size: 0.72rem; flex-shrink: 0;"
                  >{{ photographyStatusLabel(group.video_status, 'video') }}</span>
                }
                @if (group.video_notes) {
                  <span style="font-size: 0.75rem; color: var(--text-faint-55); line-height: 1.5;">{{ group.video_notes }}</span>
                }
              </div>
            }
          </div>

          @if (group.photography_source) {
            <div style="margin-top: 10px; padding-left: 4px; border-top: 1px solid rgba(255,255,255,0.04); padding-top: 8px;">
              <span style="font-size: 0.65rem; color: var(--text-faint-38);">資料來源：{{ group.photography_source }}</span>
            </div>
          }
        </div>
      }
```

- [ ] **Step 3: Verify build**

```bash
ng build --configuration=development 2>&1 | grep -E "error|Error" | head -20
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/group-page/group-page.component.ts src/app/pages/group-page/group-page.component.html
git commit -m "✨ feat(group-page): add photography policy display section"
```

---

### Task 7: Member Page — Display Section + Helper Methods

**Files:**
- Modify: `src/app/pages/member-page/member-page.component.ts`
- Modify: `src/app/pages/member-page/member-page.component.html`

- [ ] **Step 1: Add helper methods to member-page.component.ts**

Add this import at the top of the file (with the other core imports):
```ts
import {
  photographyBadgeColor,
  photographyBadgeTextColor,
  photographyBadgeBorderColor,
  photographyStatusLabel,
} from '../../core/photography-policy.utils';
```

Add these 4 properties to the `MemberPageComponent` class (after the existing property declarations):
```ts
  photographyBadgeColor = photographyBadgeColor;
  photographyBadgeTextColor = photographyBadgeTextColor;
  photographyBadgeBorderColor = photographyBadgeBorderColor;
  photographyStatusLabel = photographyStatusLabel;
```

- [ ] **Step 2: Add photography section to member-page.component.html**

Find the closing `</header>` tag (the `<header class="member-header">` block closes around line 298). Insert the photography section immediately after `</header>` and before `<!-- ══ Activity history section ══ -->`:

```html
      <!-- ══ Photography policy section ══ -->
      @if (member.photo_status || member.photo_notes || member.video_status || member.video_notes) {
        <div style="
          background: var(--bg-surface);
          border: 1px solid var(--border-subtle);
          border-radius: 4px;
          padding: 14px 20px;
          margin-bottom: 24px;
          margin-top: 24px;
          position: relative; overflow: hidden;
        ">
          <div style="
            position: absolute; top: 0; left: 0;
            width: 3px; height: 100%;
            background: linear-gradient(to bottom, rgba(232,127,160,0.5), rgba(124,108,242,0.2));
          "></div>

          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding-left: 4px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 0.62rem; letter-spacing: 0.25em; text-transform: uppercase; color: var(--text-label);">攝錄規範</span>
              <span style="font-size: 0.62rem; color: var(--text-faint-38); letter-spacing: 0.05em;">以主辦方規定為前提</span>
            </div>
            <button
              (click)="showProposalPanel = true"
              style="font-size: 0.65rem; color: rgba(232,127,160,0.5); background: none; border: 1px solid rgba(232,127,160,0.15); border-radius: 3px; padding: 2px 8px; cursor: pointer;"
            >提案修改</button>
          </div>

          <div style="display: flex; flex-direction: column; gap: 6px; padding-left: 4px;">
            @if (member.photo_status || member.photo_notes) {
              <div style="display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px;">
                <span style="font-size: 0.72rem; color: var(--text-faint-40); flex-shrink: 0;">📷</span>
                @if (member.photo_status) {
                  <span
                    [style.background]="photographyBadgeColor(member.photo_status)"
                    [style.color]="photographyBadgeTextColor(member.photo_status)"
                    [style.border]="'1px solid ' + photographyBadgeBorderColor(member.photo_status)"
                    style="border-radius: 3px; padding: 1px 8px; font-size: 0.72rem; flex-shrink: 0;"
                  >{{ photographyStatusLabel(member.photo_status, 'photo') }}</span>
                }
                @if (member.photo_notes) {
                  <span style="font-size: 0.75rem; color: var(--text-faint-55); line-height: 1.5;">{{ member.photo_notes }}</span>
                }
              </div>
            }
            @if (member.video_status || member.video_notes) {
              <div style="display: flex; align-items: baseline; flex-wrap: wrap; gap: 8px;">
                <span style="font-size: 0.72rem; color: var(--text-faint-40); flex-shrink: 0;">🎥</span>
                @if (member.video_status) {
                  <span
                    [style.background]="photographyBadgeColor(member.video_status)"
                    [style.color]="photographyBadgeTextColor(member.video_status)"
                    [style.border]="'1px solid ' + photographyBadgeBorderColor(member.video_status)"
                    style="border-radius: 3px; padding: 1px 8px; font-size: 0.72rem; flex-shrink: 0;"
                  >{{ photographyStatusLabel(member.video_status, 'video') }}</span>
                }
                @if (member.video_notes) {
                  <span style="font-size: 0.75rem; color: var(--text-faint-55); line-height: 1.5;">{{ member.video_notes }}</span>
                }
              </div>
            }
          </div>

          @if (member.photography_source) {
            <div style="margin-top: 10px; padding-left: 4px; border-top: 1px solid rgba(255,255,255,0.04); padding-top: 8px;">
              <span style="font-size: 0.65rem; color: var(--text-faint-38);">資料來源：{{ member.photography_source }}</span>
            </div>
          }
        </div>
      }
```

- [ ] **Step 3: Verify build**

```bash
ng build --configuration=development 2>&1 | grep -E "error|Error" | head -20
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/member-page/member-page.component.ts src/app/pages/member-page/member-page.component.html
git commit -m "✨ feat(member-page): add photography policy display section"
```

---

### Task 8: Admin Groups — Form Fields + Null Normalization

**Files:**
- Modify: `src/app/pages/admin/admin-groups/admin-groups.component.html`
- Modify: `src/app/pages/admin/admin-groups/admin-groups.component.ts`

- [ ] **Step 1: Add form fields to admin-groups.component.html**

Find `<!-- Error -->` in the modal (around line 380). Insert the photography section immediately before it:

```html
      <!-- photography policy -->
      <div>
        <p class="text-xs font-semibold text-gray-500 mb-2 mt-1">攝錄規範</p>
        <div class="space-y-2">
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">攝影</label>
            <select [(ngModel)]="editing.photo_status"
              class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300">
              <option [ngValue]="null">— 未設定 —</option>
              <option value="allowed">✅ 可拍</option>
              <option value="not_allowed">❌ 不可拍</option>
              <option value="conditional">⚠️ 條件式</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">攝影備註</label>
            <input type="text" [(ngModel)]="editing.photo_notes"
              placeholder="例：需審核後發布，需標記官方帳號"
              class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">錄影</label>
            <select [(ngModel)]="editing.video_status"
              class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300">
              <option [ngValue]="null">— 未設定 —</option>
              <option value="allowed">✅ 可錄</option>
              <option value="not_allowed">❌ 不可錄</option>
              <option value="conditional">⚠️ 條件式</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">錄影備註</label>
            <input type="text" [(ngModel)]="editing.video_notes"
              placeholder="例：免審，需標記"
              class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">資料來源</label>
            <input type="text" [(ngModel)]="editing.photography_source"
              placeholder="例：官方 Threads · 2025.05"
              class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"/>
          </div>
        </div>
      </div>
```

- [ ] **Step 2: Add null normalization to save() in admin-groups.component.ts**

In the `save()` method, right after the existing empty-string normalizations (lines ~219–221 that do `if (this.editing.founded_at === '') this.editing.founded_at = null;`), add:

```ts
    if (this.editing.photo_status === ('' as any)) this.editing.photo_status = null;
    if (this.editing.video_status === ('' as any)) this.editing.video_status = null;
    if (this.editing.photo_notes === '') this.editing.photo_notes = null;
    if (this.editing.video_notes === '') this.editing.video_notes = null;
    if (this.editing.photography_source === '') this.editing.photography_source = null;
```

- [ ] **Step 3: Verify build**

```bash
ng build --configuration=development 2>&1 | grep -E "error|Error" | head -20
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/admin/admin-groups/admin-groups.component.html src/app/pages/admin/admin-groups/admin-groups.component.ts
git commit -m "✨ feat(admin): add photography policy fields to group edit form"
```

---

### Task 9: Admin Members — Form Fields + Null Normalization

**Files:**
- Modify: `src/app/pages/admin/admin-members/admin-members.component.html`
- Modify: `src/app/pages/admin/admin-members/admin-members.component.ts`

- [ ] **Step 1: Add form fields to admin-members.component.html**

Find `<!-- Error -->` in the modal (around line 423). Insert immediately before it:

```html
      <!-- photography policy -->
      <div>
        <p class="text-xs font-semibold text-gray-500 mb-2 mt-1">攝錄規範（個人活動）</p>
        <div class="space-y-2">
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">攝影</label>
            <select [(ngModel)]="editing.photo_status"
              class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300">
              <option [ngValue]="null">— 未設定 —</option>
              <option value="allowed">✅ 可拍</option>
              <option value="not_allowed">❌ 不可拍</option>
              <option value="conditional">⚠️ 條件式</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">攝影備註</label>
            <input type="text" [(ngModel)]="editing.photo_notes"
              placeholder="例：需審核後發布，需標記帳號"
              class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"/>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">錄影</label>
            <select [(ngModel)]="editing.video_status"
              class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300">
              <option [ngValue]="null">— 未設定 —</option>
              <option value="allowed">✅ 可錄</option>
              <option value="not_allowed">❌ 不可錄</option>
              <option value="conditional">⚠️ 條件式</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">錄影備註</label>
            <input type="text" [(ngModel)]="editing.video_notes"
              placeholder="例：免審，需標記"
              class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"/>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">資料來源</label>
            <input type="text" [(ngModel)]="editing.photography_source"
              placeholder="例：官方 Threads · 2025.05"
              class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"/>
          </div>
        </div>
      </div>
```

- [ ] **Step 2: Add null normalization to save() in admin-members.component.ts**

In the `save()` method, right after `this.editing.birthdate = null;` (line ~158), add:

```ts
    if (this.editing.photo_status === ('' as any)) this.editing.photo_status = null;
    if (this.editing.video_status === ('' as any)) this.editing.video_status = null;
    if (this.editing.photo_notes === '') this.editing.photo_notes = null;
    if (this.editing.video_notes === '') this.editing.video_notes = null;
    if (this.editing.photography_source === '') this.editing.photography_source = null;
```

- [ ] **Step 3: Verify build**

```bash
ng build --configuration=development 2>&1 | grep -E "error|Error" | head -20
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/admin/admin-members/admin-members.component.html src/app/pages/admin/admin-members/admin-members.component.ts
git commit -m "✨ feat(admin): add photography policy fields to member edit form"
```

---

### Task 10: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
ng test --watch=false
```
Expected: all specs pass, no regressions

- [ ] **Step 2: Manual smoke test — Group page**

Start dev server: `ng serve`

1. Open any group page in the browser
2. Confirm no photography section is visible (all fields null by default)
3. In Supabase dashboard, set `photo_status = 'allowed'`, `photo_notes = '需審核'`, `video_status = 'conditional'`, `video_notes = '現場宣布'` for one group
4. Reload the group page — confirm the section appears with correct badge colors and text
5. Click「提案修改」— confirm proposal panel opens

- [ ] **Step 3: Manual smoke test — Admin**

1. Open admin → 團體管理 → 編輯 a group
2. Confirm the 攝錄規範 section appears in the modal
3. Set photo_status to「可拍」, fill in photo_notes, save
4. Re-open the same group — confirm the saved values are shown
5. Set photo_status back to「未設定」, save — confirm null is stored (check Supabase dashboard)

- [ ] **Step 4: Manual smoke test — Member page**

Repeat steps 2–5 from Group page smoke test but for a member record.

- [ ] **Step 5: Manual smoke test — Proposal panel**

1. Open any group page (not logged in)
2. Click「提案修改」in the photography section
3. Confirm `photo_status` and `video_status` render as `<select>` dropdowns, not text inputs
4. Submit a proposal — confirm it appears in admin proposal review queue

---

## Self-Review Checklist

- [x] SQL migration covers both `groups` and `members` tables with `IF NOT EXISTS`
- [x] `PhotographyPolicyStatus` type defined before it's used in utils
- [x] Utility functions tested (Task 2 is TDD)
- [x] Proposal panel select branch placed before default `@else` — prevents invalid enum input
- [x] Both admin forms normalize `''` → `null` before save — prevents CHECK constraint violation
- [x] `[ngValue]="null"` used for blank options — Angular binds `null` not `''`
- [x] Photography section hidden when all 4 policy fields are null
- [x] `photography_source` only shown if at least one policy field is set (visibility guard on outer `@if`)
- [x] Member page uses `showProposalPanel`, group page uses `showGroupProposalPanel` — these variables already exist
- [x] Helper methods assigned as class properties (`photographyBadgeColor = photographyBadgeColor`) — standard pattern for using pure functions in Angular templates
