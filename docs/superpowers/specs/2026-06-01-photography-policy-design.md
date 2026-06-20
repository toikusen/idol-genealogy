# Photography Policy Feature — Design Spec

**Date:** 2026-06-01
**Status:** Approved for implementation

---

## Overview

Add photography/videography policy information to group and member pages. Fans need this before attending events. Policy data is submitted by users via the existing Proposal system and can be directly edited by admin/editor roles in the admin panel.

---

## Design Decisions

| Question | Decision |
|---|---|
| Scope | Both `groups` and `members` tables |
| Display location | Compact section between header card and Gantt/timeline section |
| Data structure | Semi-structured: status enum + free text notes per type |
| DB approach | Add columns to existing tables (no new table) |
| Public editing | Existing Proposal system (submitted → admin review) |
| Admin/editor editing | Direct edit in admin panel |
| Mobile layout | `flex-wrap` inline: badge and text on same row, wraps if long |
| Visibility | Section hidden when all 4 policy fields are null (`photo_status`, `photo_notes`, `video_status`, `video_notes`); `photography_source` alone is not enough to show the section |

---

## Database

### Columns to add — both `groups` and `members` tables

```sql
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

**Enum values:**
- `allowed` — 可拍／可錄（顯示綠色 badge）
- `not_allowed` — 不可拍／不可錄（顯示紅色 badge）
- `conditional` — 條件式（顯示黃色 badge）
- `null` — 未知／未填（不顯示 badge，文字照常顯示）

`photography_source`: 資訊來源說明，例如「官方 Threads · 2025.05」，顯示在 section 底部。

---

## TypeScript Model Changes

`src/app/models/index.ts` — add a shared type and fields to both interfaces:

```ts
export type PhotographyPolicyStatus = 'allowed' | 'not_allowed' | 'conditional';
```

Add to both `Group` and `Member` interfaces:

```ts
photo_status: PhotographyPolicyStatus | null;
photo_notes: string | null;
video_status: PhotographyPolicyStatus | null;
video_notes: string | null;
photography_source: string | null;
```

---

## Proposal System Changes

`src/app/core/proposal-fields.config.ts` — add to both `groups` and `members` arrays:

```ts
// groups and members:
'photo_status', 'photo_notes', 'video_status', 'video_notes', 'photography_source'
```

Add labels to `FIELD_LABELS` for both:

```ts
photo_status: '攝影規範',
photo_notes: '攝影備註',
video_status: '錄影規範',
video_notes: '錄影備註',
photography_source: '資訊來源',
```

---

## UI: Photography Policy Section

Inline template added directly to both group-page and member-page component HTML files, consistent with the existing pattern in these pages.

### Visibility rule

Show the section only when at least one of these is non-null:
`photo_status`, `photo_notes`, `video_status`, `video_notes`

`photography_source` alone (all 4 policy fields null) does not trigger display — showing a source with no actual policy would be confusing.

### Layout (desktop + mobile, same CSS)

```
┌─ left accent bar (2–3px, pink gradient) ──────────────────────────┐
│  攝錄規範 (uppercase label)               [提案修改] (small button) │
│                                                                     │
│  📷  [可拍 badge]  需審核後發布，發布時請標記官方帳號               │
│  🎥  [可錄 badge]  免審，發布請標記                                 │
│                                                                     │
│  來源：官方 Threads · 2025.05  (faint text, only if source set)    │
└─────────────────────────────────────────────────────────────────────┘
```

**Badge colors by status:**
- `allowed` → green (`rgba(34,197,94,…)` / `#4ade80`)
- `not_allowed` → red (`rgba(239,68,68,…)` / `#f87171`)
- `conditional` → yellow (`rgba(251,191,36,…)` / `#fbbf24`)

**Mobile behavior:**
- `display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px–10px`
- Badge and short notes stay on the same line; long notes wrap naturally
- No separate mobile breakpoint needed

**Position on group-page:** After `<header class="group-header">`, before the Gantt `<section>` (在籍期間)

**Position on member-page:** After the member header card, before the career timeline section

**「提案修改」button:** Opens the existing `<app-proposal-panel>` with `tableName` set to `"groups"` or `"members"`, `operation="UPDATE"`. Shows the full proposal form (all allowed fields for the table). Visible to all users, same as the existing 「提案修改」button in the group header.

**proposal-panel change required:** The panel's default branch renders all unknown fields as `<input type="text">`. `photo_status` and `video_status` must render as `<select>` to enforce the enum — a free-text input would let users submit values like `可拍` that fail the DB `CHECK` constraint. Add a branch for these two fields in `proposal-panel.component.ts`:

```html
<!-- inside the field-rendering @if/@else chain (Angular template): -->
} @else if (field === 'photo_status' || field === 'video_status') {
  <select [(ngModel)]="formData[field]" [name]="field" ...>
    <option [ngValue]="null">— 未設定</option>
    <option value="allowed">✅ 可拍／可錄</option>
    <option value="not_allowed">❌ 不可拍／不可錄</option>
    <option value="conditional">⚠️ 條件式</option>
  </select>
}
```

---

## Admin Panel Changes

### admin-groups and admin-members

Add a collapsible section「攝錄規範」to the existing edit modal/form:

- `photo_status`: `<select>` with `[ngValue]="null"` for the blank option — 未設定 / 可拍 / 不可拍 / 條件式
- `photo_notes`: `<input type="text">` — 攝影備註
- `video_status`: `<select>` with `[ngValue]="null"` for the blank option — same options
- `video_notes`: `<input type="text">` — 錄影備註
- `photography_source`: `<input type="text">` — 資訊來源（例：官方 Threads · 2025.05）

**Null handling:** Always use `[ngValue]="null"` (not `value=""`) for the blank option so Angular binds `null` instead of `''`. If any value is `''` at save time, normalize to `null` before calling `update()` — empty string violates the `CHECK` constraint.

These fields save directly via `GroupService.update()` / `MemberService.update()`, consistent with existing admin direct-edit pattern.

---

## Files to Modify

| File | Change |
|---|---|
| `src/app/models/index.ts` | Add `PhotographyPolicyStatus` type; add 5 fields to `Group` and `Member` interfaces |
| `src/app/core/proposal-fields.config.ts` | Add 5 fields + labels to `groups` and `members` |
| `src/app/shared/proposal-panel/proposal-panel.component.ts` | Add `@else if` branch to render `<select>` for `photo_status` / `video_status` |
| `src/app/pages/group-page/group-page.component.html` | Add photography section after header |
| `src/app/pages/group-page/group-page.component.ts` | Add `photographyBadgeColor(status)` and `photographyStatusLabel(status, type)` helper methods |
| `src/app/pages/member-page/member-page.component.html` | Add photography section after header |
| `src/app/pages/member-page/member-page.component.ts` | Add `photographyBadgeColor(status)` and `photographyStatusLabel(status, type)` helper methods |
| `src/app/pages/admin/admin-groups/admin-groups.component.html` | Add 5 form fields to edit modal |
| `src/app/pages/admin/admin-members/admin-members.component.html` | Add 5 form fields to edit modal |
| Supabase migration (new SQL file) | `ALTER TABLE … ADD COLUMN IF NOT EXISTS` for groups and members |

---

## Out of Scope

- "Verified group account" system (not in this iteration)
- Per-event policy overrides
- Filtering/searching groups by photography policy
- Notification when policy changes
