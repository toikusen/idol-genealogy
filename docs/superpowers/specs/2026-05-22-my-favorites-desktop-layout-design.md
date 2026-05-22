# My Favorites — Desktop Layout Design

**Date:** 2026-05-22  
**Scope:** Add responsive desktop layout to the my-favorites page without modifying existing mobile styles.

---

## Problem

The my-favorites page was designed as a mobile-first PWA with `position:fixed;inset:0` and `max-width:680px`. On desktop (≥1024px), this renders as a narrow centered column with large dead zones on both sides — it looks like a shrunken phone app.

## Goal

A desktop layout that uses horizontal screen space naturally, without touching any existing mobile styles.

---

## Design Decision: Sidebar + Main Content (Option A)

**Breakpoint:** `min-width: 1024px` only. Tablet and below keeps the existing mobile layout unchanged.

**Why sidebar over alternatives:**
- Option B (wider single column) doesn't actually use horizontal space — just pushes margins out further.
- Option C (two-column feed) breaks chronological reading order — unclear whether to read left-then-right or column-by-column.
- Option A moves the avatar row and filter tabs into a natural left-panel position, freeing the right side for the feed as a clean reading area.

---

## Layout Structure

No top header bar. All navigation and identity lives in the sidebar; the main area is feed-only.

```
┌───────────────────┬─────────────────────────┐
│  SIDEBAR (240px)  │  MAIN FEED              │
│  (sticky)         │  (scrollable)           │
│                   │                         │
│  ← 首頁           │  最新動態                │
│  MY FAVORITES     │                         │
│  Hi, Sei ♥        │  📅 TWICE               │
│                   │  World Tour 2025 首爾場  │
│  [已追蹤]         │  2 小時前               │
│  ○ ○ ○ ○         │                         │
│  ○ ○ ○ ○         │  🎵 aespa               │
│  ○ +              │  新增歌曲《Supernova》   │
│                   │  5 小時前               │
│  ────────         │                         │
│  [篩選]           │  ...                    │
│  ● 全部           │                         │
│    團體            │                         │
│    成員            │                         │
│    通知設定        │                         │
└───────────────────┴─────────────────────────┘
```

---

## Component Changes

### `my-favorites.component.html`

Add a wrapper with two CSS classes that activate only at `≥1024px`:

- `.mf-layout` — root flex container, `display:flex`, `min-height:100vh`
- `.mf-sidebar` — left panel, `width:240px`, `flex-shrink:0`, `position:sticky; top:0; height:100vh; overflow-y:auto` so the filter nav stays visible as the feed scrolls
- `.mf-main` — right area, `flex:1`, `overflow-y:auto`

The outermost div currently uses inline styles (`position:fixed;inset:0`, `max-width:680px`). To allow media-query overrides, these need to move to a CSS class (e.g., `.mf-root`). The class carries the mobile defaults, and `@media (min-width:1024px)` overrides them to `position:static; max-width:none`.

### Sidebar contents

1. **Back link + Identity** — `← 首頁` link, MY FAVORITES label, `Hi, {{ displayName }} ♥` greeting (moved from mobile header into sidebar)
2. **Avatar grid** — `app-favorites-avatar-row` rendered in wrap-grid mode instead of horizontal scroll. Pass an `@Input() layout: 'row' | 'grid'` flag; default stays `'row'` (mobile unchanged).
3. **Filter nav** — replaces tab bar. Same `tabs` array, rendered as a vertical `<nav>` list instead of horizontal buttons.

### Main area contents

- Feed section label ("最新動態") + `app-favorites-feed`
- When `activeTab() === 'push'`, the push settings component renders in the main area (sidebar still shows avatars + nav)

### `favorites-avatar-row.component.ts`

Add `layout = input<'row' | 'grid'>('row')`.  
In grid mode: `display:flex; flex-wrap:wrap; gap:10px` instead of `overflow-x:auto`.  
No logic changes — only the container style differs.

---

## Styling Approach

Use `<style>` with a scoped media query in the component template (Angular inline styles), or a companion `.component.css` file. Either works; prefer the pattern already used in the project.

All desktop styles are wrapped in `@media (min-width: 1024px) { ... }` so they cannot affect mobile.

Sidebar background: `var(--bg-base)` with a right border `1px solid rgba(232,121,160,0.12)`.  
Feed cards: same existing styles — no visual redesign of individual items.

---

## Out of Scope

- No sidebar collapse/toggle
- No changes to feed item design
- No changes to the add-sheet or push-settings internals
- No changes below 1024px

---

## Success Criteria

- At ≥1024px: sidebar visible on left, feed on right, no horizontal overflow
- At <1024px: layout identical to current mobile version
- Avatar grid wraps correctly with 10+ followed entities
- Tab switching (all/group/member/push) works from sidebar nav
