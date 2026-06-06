# Photo Lightbox Design

**Date:** 2026-06-06
**Scope:** Member page, group page, company page — main entity image/logo

## Summary

Add a click-to-enlarge lightbox for the main image on member, group, and company pages. A new standalone Angular component `PhotoLightboxComponent` handles all display and interaction logic; the three pages each integrate it with minimal changes.

## Goals

- Users can click the main entity image to see it enlarged
- Clean, distraction-free overlay with blur backdrop
- Three close methods: backdrop click, ✕ button, Esc key
- SSR-compatible (no browser APIs on server)
- Accessible: keyboard navigable, ARIA roles

## Out of Scope

- Thumbnails / avatars in lists (gantt, member lists, song covers)
- Navigation between multiple photos (only one main image per entity)
- Photo metadata beyond name (source already shown on page)

---

## Component: PhotoLightboxComponent

**Location:** `src/app/shared/photo-lightbox/`

**Files:**
```
photo-lightbox.component.ts
photo-lightbox.component.html
photo-lightbox.component.css
```

### API

```ts
@Input() photoUrl: string | null = null;  // raw Supabase URL, piped through supabaseImg:1200 inside component
@Input() name: string = '';               // displayed below photo
@Input() open: boolean = false;           // controlled by parent
@Output() closed = new EventEmitter<void>();
```

### Imports (inside PhotoLightboxComponent)

`PhotoLightboxComponent` is standalone and must declare its own `imports`:

```ts
imports: [SupabaseImgPipe]
```

`SupabaseImgPipe` is located at `src/app/shared/supabase-img.pipe.ts`.

### Image URL

The component applies `supabaseImg:1200` internally. Do **not** pre-transform the URL in the parent — pass the raw `photo_url` value directly. This ensures lightbox always requests a large image regardless of what size the page thumbnail uses.

### Behavior

| Trigger | Action |
|---|---|
| `open` becomes `true` | Show overlay, save current `document.body.style.overflow`, set it to `'hidden'` |
| Click backdrop | Emit `closed`, parent sets `open = false` |
| Click content area | `stopPropagation()` — prevents backdrop click from firing |
| Click ✕ button | Emit `closed` |
| Press Esc | Emit `closed` (via `@HostListener('document:keydown.escape')`) |
| `open` becomes `false` | Hide overlay, restore saved `document.body.style.overflow` |
| `ngOnDestroy` | Restore `document.body.style.overflow` if component is destroyed while open |

### SSR Guard

Scroll lock and `@HostListener` for Esc are wrapped with `isPlatformBrowser(this.platformId)`. On the server these are no-ops.

### Scroll Lock Implementation

```ts
private _savedOverflow = '';
private _scrollLocked = false;

private lockScroll() {
  if (this._scrollLocked) return;          // avoid double-lock overwriting saved value
  this._savedOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  this._scrollLocked = true;
}

private unlockScroll() {
  if (!this._scrollLocked) return;         // avoid clearing unrelated overflow settings
  document.body.style.overflow = this._savedOverflow;
  this._scrollLocked = false;
}

ngOnDestroy() {
  if (isPlatformBrowser(this.platformId)) {
    this.unlockScroll();                   // safe: no-op if never locked
  }
}
```

### Accessibility

- The `<img>` in parent pages is wrapped in `<button type="button">` (not bare `<img (click)>`)
- Lightbox overlay: `role="dialog"` + `aria-modal="true"` + `aria-label="[name] 照片"`
- ✕ button: `aria-label="關閉"`
- Esc key already handled via `@HostListener`

#### Focus Management

- When lightbox opens: move focus to the ✕ close button (`closeBtn.nativeElement.focus()`) via `afterNextRender` or `setTimeout(0)` so the DOM is visible before focusing
- When lightbox closes: return focus to the trigger `<button>` that opened it — parent passes a `ViewChild` reference or the component uses `document.activeElement` captured at open time
- Minimum requirement: focus must not remain on a background element while the dialog is open; full focus trap is optional for this scope

### Visual Design

- Full-screen `position: fixed` overlay, `z-index: 1000`
- Backdrop: `background: rgba(0,0,0,0.82)`, `backdrop-filter: blur(6px)`
- Photo: `object-fit: contain`, max dimensions `min(90vw, 600px)` × `min(85vh, 800px)`, rounded corners, large drop shadow
- Image rendered with `supabaseImg:1200` pipe
- Name label: below photo, white, `font-size: 1rem`, `font-weight: 600`
- ✕ button: top-right, circular, semi-transparent white, `36px`
- Entry animation: `opacity` 0 → 1, `transform: scale(0.97)` → `1`, 150ms ease

### Hover on Trigger Button (in parent pages)

Each page has a different CSS class for the main image. Apply hover styles to the respective selectors:

```css
/* member-page.component.css */
.member-portrait-btn:hover .member-portrait,
.member-portrait-btn:focus-visible .member-portrait {
  transform: scale(1.02);
  filter: brightness(1.05);
  transition: transform 150ms ease, filter 150ms ease;
}

/* group-page.component.css */
.group-photo-btn:hover img,
.group-photo-btn:focus-visible img {
  transform: scale(1.02);
  filter: brightness(1.05);
  transition: transform 150ms ease, filter 150ms ease;
}

/* company-page.component.css */
.company-logo-btn:hover img,
.company-logo-btn:focus-visible img {
  transform: scale(1.02);
  filter: brightness(1.05);
  transition: transform 150ms ease, filter 150ms ease;
}
```

Buttons themselves should have `background: none; border: none; padding: 0; cursor: pointer;` to stay visually transparent.

---

## Integration: Three Pages

Each page component adds the same pattern. Only bound property names differ.

### Template changes

1. Wrap the existing `<img>` in `<button type="button" class="*-btn" (click)="openLightbox()">` — place inside the existing `@if (*.photo_url)` block
2. Add hover/focus CSS for the button wrapper
3. Add `<app-photo-lightbox>` inside `@if (member/group/company)` at the bottom of the template, using safe navigation

```html
<!-- member-page: inside @if (member) block -->
<app-photo-lightbox
  [photoUrl]="member.photo_url ?? null"
  [name]="member.name ?? ''"
  [open]="lightboxOpen"
  (closed)="closeLightbox()"
/>
```

### Component class changes

```ts
lightboxOpen = false;
openLightbox() { this.lightboxOpen = true; }
closeLightbox() { this.lightboxOpen = false; }
```

Also add `PhotoLightboxComponent` to the component's `imports` array (it is standalone).

### Property names by page

| Page | `photoUrl` binding | `name` binding | Wrapper class |
|---|---|---|---|
| `member-page` | `member.photo_url ?? null` | `member.name ?? ''` | `.member-portrait-btn` |
| `group-page` | `group.photo_url ?? null` | `group.name ?? ''` | `.group-photo-btn` |
| `company-page` | `company.photo_url ?? null` | `company.name ?? ''` | `.company-logo-btn` |

---

## File Changelist

| File | Change |
|---|---|
| `src/app/shared/photo-lightbox/photo-lightbox.component.ts` | **New** — standalone component |
| `src/app/shared/photo-lightbox/photo-lightbox.component.html` | **New** |
| `src/app/shared/photo-lightbox/photo-lightbox.component.css` | **New** |
| `src/app/pages/member-page/member-page.component.ts` | Add `imports: [PhotoLightboxComponent]`, `lightboxOpen`, `openLightbox`, `closeLightbox` |
| `src/app/pages/member-page/member-page.component.html` | Wrap portrait `<img>` in `<button>`, add `<app-photo-lightbox>` |
| `src/app/pages/member-page/member-page.component.css` | Add `.member-portrait-btn` hover/focus styles |
| `src/app/pages/group-page/group-page.component.ts` | Same pattern |
| `src/app/pages/group-page/group-page.component.html` | Same pattern |
| `src/app/pages/group-page/group-page.component.css` | Same pattern |
| `src/app/pages/company-page/company-page.component.ts` | Same pattern |
| `src/app/pages/company-page/company-page.component.html` | Same pattern |
| `src/app/pages/company-page/company-page.component.css` | Same pattern |
