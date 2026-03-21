# Admin Mobile RWD Design

**Date:** 2026-03-21
**Scope:** Make the admin backend usable on mobile for proposal review workflows.

---

## Problem

The admin shell uses a fixed `w-52` sidebar with `flex h-screen`, leaving no room for content on narrow screens. The proposals list overflows horizontally, and the proposal review page uses a `grid-cols-3` diff table that becomes unreadable on mobile.

---

## Goals

1. Admin navigation is accessible on mobile via a slide-in Drawer.
2. The proposals list is readable and tappable on mobile.
3. The proposal review diff table is readable and editable on mobile.
4. Approve/reject actions are always reachable without scrolling.
5. Desktop layout is completely unchanged.

---

## Architecture

Pure CSS/Tailwind responsive approach using `md:` breakpoint prefix (768 px). No new dependencies or routing changes. All three components are modified in their HTML templates only, with minimal TS changes only in `AdminShellComponent`.

> **Note on breakpoint:** `md` (768 px) is used as the desktop boundary. The sidebar is `w-52` (208 px), leaving ~560 px for content at minimum desktop width — acceptable for an admin tool typically used in landscape or on tablet+. `lg:` (1024 px) was considered but rejected to keep tablet devices able to use the desktop layout.

---

## Components

### 1. admin-shell

**Desktop (md+):** Unchanged — fixed `w-52` sidebar + main content area.

**Mobile (<md):**
- Sidebar is hidden (`hidden md:flex`).
- A top header bar is added (`md:hidden`) containing:
  - App name "族譜管理" on the left.
  - Hamburger button (☰) on the right, calls `toggleDrawer()`.
- Clicking hamburger sets `drawerOpen = true`; clicking backdrop or a nav link sets `drawerOpen = false`.

**Drawer implementation:**
- Backdrop: `fixed inset-0 z-40 bg-black/40` — covers entire viewport behind the drawer.
- Drawer panel: `fixed top-0 left-0 h-full z-50 w-64 bg-white shadow-xl flex flex-col` — same nav links as the sidebar.
- When `drawerOpen` is true, add `overflow-hidden` to `<body>` (via `document.body.classList`) to prevent background scroll. Remove it on close.
- Drawer closes on: backdrop tap, nav link tap, or `closeDrawer()` call.

**TS changes to `AdminShellComponent`:**
- Add `drawerOpen = false`.
- Add `toggleDrawer()` and `closeDrawer()` methods. `closeDrawer()` sets `drawerOpen = false` and calls `document.body.classList.remove('overflow-hidden')`.
- In the existing `_navSub` (`NavigationEnd`) subscription, call `this.closeDrawer()` so navigating via the drawer auto-closes it.
- In `ngOnDestroy` (already exists), call `this.closeDrawer()` to guarantee scroll-lock is released if the component is destroyed while the drawer is open.

### 2. admin-proposals

**Desktop:** Unchanged.

**Mobile:**
Each proposal list item becomes a two-row card layout. The outer `<a>` keeps `flex items-center gap-3` but wraps a left flex-col block and a right-pinned chevron:

```
┌────────────────────────────────────────┐
│ [badge] 成員・田中花子                  ›│
│         提案者：匿名  訪客  2 分鐘前     │
└────────────────────────────────────────┘
```

Structure:
- Left block (`flex-1 min-w-0 flex flex-col gap-0.5`):
  - Row 1: operation badge + record name (truncated).
  - Row 2 (`md:hidden`): submitter name, login/guest badge, relative time — smaller muted text.
- Right: chevron (`›`) pinned with `flex-shrink-0`.
- On desktop (`md+`): Row 2 content is `hidden md:inline`, and submitter/badge/time remain in the original single-row positions (`flex-shrink-0 hidden md:inline-flex` etc.).

### 3. admin-proposal-review

**Desktop:** Unchanged — `grid-cols-3` diff table, inline approve/reject buttons.

**Mobile — diff table:**
- The header row (`grid-cols-3 bg-gray-50`) is hidden on mobile (`hidden md:grid`).
- Each field row switches from `grid grid-cols-3` to single-column stacking on mobile:
  ```
  [欄位名稱]
  原始值：[value]
  提案值：[editable input]
  ```
  Achieved with: `grid grid-cols-1 md:grid-cols-3`.
- Yellow `bg-yellow-50` highlight applies to the whole stacked block when changed.
- **`photo_url` field:** The existing three-thumbnail picker UI (`proposed` / `original` / `無圖片`) is preserved as-is within the stacked layout. The picker's inner `flex gap-3` renders full-width in the single-column block — no change to its structure needed.

**Mobile — sticky action bar:**
- The existing inline action buttons (`flex gap-3 flex-wrap` at bottom of content) are hidden on mobile: `hidden md:flex`.
- A new sticky bar is added at the bottom of the review page, visible only on mobile (`fixed bottom-0 left-0 right-0 md:hidden z-30 bg-white border-t border-gray-100 px-4 py-3`):
  - When `showRejectForm` is false: shows "✅ 核准" and "❌ 拒絕" buttons side-by-side.
  - When `showRejectForm` is true: the sticky bar replaces those buttons with "確認拒絕" + "取消" buttons. The `<textarea>` for the rejection note renders **inline in the page body** above the sticky bar (not inside the bar itself), revealed by scrolling up if needed.
- **Bottom padding:** The scrollable page container `<div class="p-6 max-w-4xl mx-auto">` gets `pb-24 md:pb-6` so the sticky bar never permanently obscures content.

---

## Responsive Strategy

Use Tailwind's `md:` prefix throughout:
- `hidden md:flex` — hide on mobile, show on desktop.
- `md:hidden` — show on mobile only.
- `grid-cols-1 md:grid-cols-3` — stack on mobile, three columns on desktop.
- `fixed bottom-0 left-0 right-0 md:hidden z-30` — sticky bar mobile only.
- `pb-24 md:pb-6` — bottom padding clearance for sticky bar.

No custom media query CSS files needed.

---

## Out of Scope

- admin-members, admin-groups, admin-companies, admin-team, admin-roles, admin-audit-log, admin-history — not modified in this pass.
- Authentication or routing changes.
- Swipe gestures to close the drawer.
- Transition/animation on drawer open/close.

---

## Testing

After implementation, verify with Playwright at `390×844` (iPhone 14 viewport):
1. Sidebar is hidden; header bar with hamburger is visible.
2. Tapping hamburger opens drawer; backdrop and nav link taps close it.
3. Navigating via drawer auto-closes it.
4. Proposals list items are readable without horizontal scroll; secondary info wraps to line 2.
5. Proposal review diff table stacks vertically per field; inputs are tappable.
6. `photo_url` picker renders full-width within stacked layout correctly.
7. Sticky approve/reject bar is visible; page content is not obscured beneath it.
8. Tapping Reject in sticky bar shows textarea in body + confirm/cancel in bar.
9. Resize to 1024 px wide — desktop layout is unchanged across all three pages.
