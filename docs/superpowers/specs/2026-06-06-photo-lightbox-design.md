# Photo Lightbox Design

**Date:** 2026-06-06
**Scope:** Member page, group page, company page — main hero photos only

## Summary

Add a click-to-enlarge lightbox for the main photo on member, group, and company pages. A new standalone Angular component `PhotoLightboxComponent` handles all display and interaction logic; the three pages each integrate it with minimal changes.

## Goals

- Users can click the main hero photo to see it enlarged
- Clean, distraction-free overlay with blur backdrop
- Three close methods: backdrop click, ✕ button, Esc key
- SSR-compatible (no browser APIs on server)

## Out of Scope

- Thumbnails / avatars in lists (gantt, member lists, song covers)
- Navigation between multiple photos (only one main photo per entity)
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
@Input() photoUrl: string | null = null;  // raw URL, piped through supabaseImg inside component
@Input() name: string = '';               // displayed below photo
@Input() open: boolean = false;           // controlled by parent
@Output() closed = new EventEmitter<void>();
```

### Behavior

| Trigger | Action |
|---|---|
| `open` becomes `true` | Show overlay, lock `document.body.overflow = 'hidden'` |
| Click backdrop | Emit `closed`, parent sets `open = false` |
| Click ✕ button | Emit `closed` |
| Press Esc | Emit `closed` (via `@HostListener('document:keydown.escape')`) |
| `open` becomes `false` | Hide overlay, restore `document.body.overflow` |

### SSR Guard

Scroll lock and Esc listener are wrapped with `isPlatformBrowser(this.platformId)` to avoid errors during server-side rendering.

### Visual Design

- Full-screen `position: fixed` overlay, `z-index: 1000`
- Backdrop: `background: rgba(0,0,0,0.82)`, `backdrop-filter: blur(6px)`
- Photo: `object-fit: contain`, max dimensions `min(90vw, 600px)` × `min(85vh, 800px)`, rounded corners, large drop shadow
- Image URL: passed through `supabaseImg` pipe with no size constraint (full resolution)
- Name label: below photo, white, `font-size: 1rem`, `font-weight: 600`
- ✕ button: top-right, circular, semi-transparent white, `36px`
- Entry animation: `opacity` 0 → 1, `transform: scale(0.97)` → `1`, 150ms ease

### Hover on Photo (in parent pages)

```css
.member-portrait:hover {
  cursor: pointer;
  transform: scale(1.02);
  filter: brightness(1.05);
  transition: transform 150ms ease, filter 150ms ease;
}
```

---

## Integration: Three Pages

Each page makes identical changes, only the bound property names differ.

### Template changes

1. Add `(click)="openLightbox()"` to the existing `<img>` element
2. Add hover CSS class or inline style
3. Add `<app-photo-lightbox>` at the bottom of the template

```html
<!-- at bottom of template -->
<app-photo-lightbox
  [photoUrl]="member.photo_url"
  [name]="member.name"
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

### Property names by page

| Page | `photoUrl` binding | `name` binding |
|---|---|---|
| `member-page` | `member.photo_url` | `member.name` |
| `group-page` | `group.photo_url` | `group.name` |
| `company-page` | `company.photo_url` | `company.name` |

---

## File Changelist

| File | Change |
|---|---|
| `src/app/shared/photo-lightbox/photo-lightbox.component.ts` | **New** |
| `src/app/shared/photo-lightbox/photo-lightbox.component.html` | **New** |
| `src/app/shared/photo-lightbox/photo-lightbox.component.css` | **New** |
| `src/app/pages/member-page/member-page.component.ts` | Add `lightboxOpen`, `openLightbox`, `closeLightbox` |
| `src/app/pages/member-page/member-page.component.html` | Add click handler + `<app-photo-lightbox>` |
| `src/app/pages/member-page/member-page.component.css` | Add hover styles |
| `src/app/pages/group-page/group-page.component.ts` | Same pattern |
| `src/app/pages/group-page/group-page.component.html` | Same pattern |
| `src/app/pages/group-page/group-page.component.css` | Same pattern |
| `src/app/pages/company-page/company-page.component.ts` | Same pattern |
| `src/app/pages/company-page/company-page.component.html` | Same pattern |
| `src/app/pages/company-page/company-page.component.css` | Same pattern |
