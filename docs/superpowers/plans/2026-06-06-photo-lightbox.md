# Photo Lightbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a click-to-enlarge lightbox for the main entity image on member, group, and company pages.

**Architecture:** A new standalone `PhotoLightboxComponent` handles all display and interaction logic (backdrop blur overlay, scroll lock, Esc/click-to-close, ARIA). Three pages each import it and add a `<button>` wrapper around their main photo plus `lightboxOpen` state.

**Tech Stack:** Angular 19 SSR, Karma/Jasmine, `supabaseImg` pipe for image resizing, no third-party UI libraries.

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/app/shared/photo-lightbox/photo-lightbox.component.ts` | **Create** | Component class: inputs/outputs, scroll lock, Esc listener, focus management |
| `src/app/shared/photo-lightbox/photo-lightbox.component.html` | **Create** | Overlay template: backdrop, content container, close button, photo, name |
| `src/app/shared/photo-lightbox/photo-lightbox.component.css` | **Create** | Styles: fade/scale animation, photo sizing, backdrop, close button |
| `src/app/shared/photo-lightbox/photo-lightbox.component.spec.ts` | **Create** | Unit tests: emit on close, Esc handler, stopProp |
| `src/app/pages/member-page/member-page.component.ts` | **Modify** | Add `PhotoLightboxComponent` to `imports`, add `lightboxOpen` + methods |
| `src/app/pages/member-page/member-page.component.html` | **Modify** | Wrap portrait `<img>` in `<button>`, append `<app-photo-lightbox>` |
| `src/app/pages/member-page/member-page.component.css` | **Modify** | Add `.member-portrait-btn` hover/focus styles |
| `src/app/pages/group-page/group-page.component.ts` | **Modify** | Same pattern as member-page |
| `src/app/pages/group-page/group-page.component.html` | **Modify** | Wrap group ring in `<button>`, append `<app-photo-lightbox>` |
| `src/app/pages/group-page/group-page.component.css` | **Modify** | Add `.group-photo-btn` hover/focus styles |
| `src/app/pages/company-page/company-page.component.ts` | **Modify** | Same pattern as member-page |
| `src/app/pages/company-page/company-page.component.html` | **Modify** | Wrap logo `<img>` in `<button>`, append `<app-photo-lightbox>` |
| `src/app/pages/company-page/company-page.component.css` | **Modify** | Add `.company-logo-btn` hover/focus styles |

---

## Task 1: Create PhotoLightboxComponent

**Files:**
- Create: `src/app/shared/photo-lightbox/photo-lightbox.component.ts`
- Create: `src/app/shared/photo-lightbox/photo-lightbox.component.html`
- Create: `src/app/shared/photo-lightbox/photo-lightbox.component.css`
- Create: `src/app/shared/photo-lightbox/photo-lightbox.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/shared/photo-lightbox/photo-lightbox.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PhotoLightboxComponent } from './photo-lightbox.component';

describe('PhotoLightboxComponent', () => {
  let component: PhotoLightboxComponent;
  let fixture: ComponentFixture<PhotoLightboxComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PhotoLightboxComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(PhotoLightboxComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('close() emits the closed event', () => {
    let emitted = false;
    component.closed.subscribe(() => (emitted = true));

    component.close();

    expect(emitted).toBeTrue();
  });

  it('onEsc() emits closed when open is true', () => {
    component.open = true;
    let emitted = false;
    component.closed.subscribe(() => (emitted = true));

    component.onEsc();

    expect(emitted).toBeTrue();
  });

  it('onEsc() does nothing when open is false', () => {
    component.open = false;
    let emitted = false;
    component.closed.subscribe(() => (emitted = true));

    component.onEsc();

    expect(emitted).toBeFalse();
  });

  it('stopProp() calls stopPropagation on the event', () => {
    const mockEvent = { stopPropagation: jasmine.createSpy('stopPropagation') } as unknown as MouseEvent;

    component.stopProp(mockEvent);

    expect(mockEvent.stopPropagation).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
ng test --include="**/photo-lightbox.component.spec.ts" --watch=false
```

Expected: `ERROR: photo-lightbox.component.ts not found` or similar compile error.

- [ ] **Step 3: Create the component TypeScript file**

Create `src/app/shared/photo-lightbox/photo-lightbox.component.ts`:

```typescript
import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
  ElementRef,
  HostListener,
  PLATFORM_ID,
  inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SupabaseImgPipe } from '../supabase-img.pipe';

@Component({
  selector: 'app-photo-lightbox',
  standalone: true,
  imports: [SupabaseImgPipe],
  templateUrl: './photo-lightbox.component.html',
  styleUrl: './photo-lightbox.component.css',
})
export class PhotoLightboxComponent implements OnChanges, OnDestroy {
  @Input() photoUrl: string | null = null;
  @Input() name: string = '';
  @Input() open: boolean = false;
  @Output() closed = new EventEmitter<void>();

  @ViewChild('closeBtn') closeBtnRef!: ElementRef<HTMLButtonElement>;

  private readonly platformId = inject(PLATFORM_ID);
  private _savedOverflow = '';
  private _scrollLocked = false;
  private _triggerEl: HTMLElement | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (changes['open']) {
      if (this.open) {
        this._triggerEl = document.activeElement as HTMLElement;
        this.lockScroll();
        setTimeout(() => this.closeBtnRef?.nativeElement.focus(), 0);
      } else {
        this.unlockScroll();
        this._triggerEl?.focus();
        this._triggerEl = null;
      }
    }
  }

  close(): void {
    this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.open) this.close();
  }

  stopProp(event: MouseEvent): void {
    event.stopPropagation();
  }

  private lockScroll(): void {
    if (this._scrollLocked) return;
    this._savedOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    this._scrollLocked = true;
  }

  private unlockScroll(): void {
    if (!this._scrollLocked) return;
    document.body.style.overflow = this._savedOverflow;
    this._scrollLocked = false;
  }

  ngOnDestroy(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.unlockScroll();
    }
  }
}
```

- [ ] **Step 4: Create the template**

Create `src/app/shared/photo-lightbox/photo-lightbox.component.html`:

```html
@if (open && photoUrl) {
  <div
    class="lb-backdrop"
    role="dialog"
    aria-modal="true"
    [attr.aria-label]="name + ' 照片'"
    (click)="close()"
  >
    <button
      #closeBtn
      class="lb-close"
      type="button"
      aria-label="關閉"
      (click)="close()"
    >✕</button>

    <div class="lb-content" (click)="stopProp($event)">
      <img
        [src]="photoUrl | supabaseImg:1200"
        [alt]="name"
        class="lb-photo"
      />
      @if (name) {
        <p class="lb-name">{{ name }}</p>
      }
    </div>
  </div>
}
```

- [ ] **Step 5: Create the styles**

Create `src/app/shared/photo-lightbox/photo-lightbox.component.css`:

```css
.lb-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.82);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: lb-fade-in 150ms ease both;
}

@keyframes lb-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

.lb-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  animation: lb-scale-in 150ms ease both;
}

@keyframes lb-scale-in {
  from { transform: scale(0.97); }
  to { transform: scale(1); }
}

.lb-photo {
  max-width: min(90vw, 600px);
  max-height: min(85vh, 800px);
  object-fit: contain;
  border-radius: 10px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
  display: block;
}

.lb-name {
  color: #fff;
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  margin: 0;
}

.lb-close {
  position: fixed;
  top: 16px;
  right: 20px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  transition: background 150ms ease;
  z-index: 1001;
}

.lb-close:hover,
.lb-close:focus-visible {
  background: rgba(255, 255, 255, 0.24);
  outline: 2px solid rgba(255, 255, 255, 0.5);
  outline-offset: 2px;
}
```

- [ ] **Step 6: Run tests to confirm they pass**

```bash
ng test --include="**/photo-lightbox.component.spec.ts" --watch=false
```

Expected: `4 specs, 0 failures`

- [ ] **Step 7: Commit**

```bash
git add src/app/shared/photo-lightbox/
git commit -m "feat(lightbox): add PhotoLightboxComponent"
```

---

## Task 2: Integrate into member-page

**Files:**
- Modify: `src/app/pages/member-page/member-page.component.ts:39`
- Modify: `src/app/pages/member-page/member-page.component.html:109-122`
- Modify: `src/app/pages/member-page/member-page.component.css`

- [ ] **Step 1: Add import and lightbox state to component class**

In `src/app/pages/member-page/member-page.component.ts`, make two changes:

**Change A** — add `PhotoLightboxComponent` to imports (line 39, inside the existing `imports: [...]` array):

```typescript
// Before
imports: [CommonModule, FormsModule, RouterLink, MemberTimelineComponent, MemberCareerGraphComponent, ProposalPanelComponent, RecordEditHistoryComponent, SupabaseImgPipe, GroupEventsComponent, FavoriteToggleComponent],

// After
imports: [CommonModule, FormsModule, RouterLink, MemberTimelineComponent, MemberCareerGraphComponent, ProposalPanelComponent, RecordEditHistoryComponent, SupabaseImgPipe, GroupEventsComponent, FavoriteToggleComponent, PhotoLightboxComponent],
```

Also add the import statement at the top of the file, alongside the other shared imports:

```typescript
import { PhotoLightboxComponent } from '../../shared/photo-lightbox/photo-lightbox.component';
```

**Change B** — add lightbox state to the class body (after the existing class properties, e.g. after `photographyStatusLabel = photographyStatusLabel;`):

```typescript
lightboxOpen = false;
openLightbox(): void { this.lightboxOpen = true; }
closeLightbox(): void { this.lightboxOpen = false; }
```

- [ ] **Step 2: Wrap the portrait img in a button**

In `src/app/pages/member-page/member-page.component.html`, the `@if (member.photo_url)` block (line ~109) has an `} @else {` branch — only replace the `<img>` inside the `@if` branch, do not touch the `@else` branch.

Find and replace just the `<img>` inside the `@if (member.photo_url)` block:

```html
<!-- Before (inside @if (member.photo_url) { ... }): -->
<img
  [src]="member.photo_url | supabaseImg:320"
  [alt]="member.name"
  class="member-portrait"
  loading="lazy"
/>
```

```html
<!-- After (inside @if (member.photo_url) { ... }): -->
<button type="button" class="member-portrait-btn" (click)="openLightbox()">
  <img
    [src]="member.photo_url | supabaseImg:320"
    [alt]="member.name"
    class="member-portrait"
    loading="lazy"
  />
</button>
```

The `} @else {` branch and the fallback `<div class="member-portrait member-portrait--fallback">` remain untouched.

- [ ] **Step 3: Add lightbox element at the end of the template**

Append at the very end of `src/app/pages/member-page/member-page.component.html` (after the last `}` on line 828):

```html
@if (member) {
  <app-photo-lightbox
    [photoUrl]="member.photo_url ?? null"
    [name]="member.name ?? ''"
    [open]="lightboxOpen"
    (closed)="closeLightbox()"
  />
}
```

- [ ] **Step 4: Add hover/focus CSS**

Append to the end of `src/app/pages/member-page/member-page.component.css`:

```css
.member-portrait-btn {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  display: block;
}

.member-portrait-btn:hover .member-portrait,
.member-portrait-btn:focus-visible .member-portrait {
  transform: scale(1.02);
  filter: brightness(1.05);
  transition: transform 150ms ease, filter 150ms ease;
}

.member-portrait-btn:focus-visible {
  outline: 2px solid rgba(232, 121, 160, 0.6);
  outline-offset: 3px;
  border-radius: 50%;
}
```

- [ ] **Step 5: Build check**

```bash
ng build --configuration=development 2>&1 | tail -20
```

Expected: no TypeScript or template errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/pages/member-page/
git commit -m "feat(lightbox): integrate photo lightbox into member-page"
```

---

## Task 3: Integrate into group-page

**Files:**
- Modify: `src/app/pages/group-page/group-page.component.ts:61`
- Modify: `src/app/pages/group-page/group-page.component.html:298-316`
- Modify: `src/app/pages/group-page/group-page.component.css`

- [ ] **Step 1: Add import and lightbox state to component class**

In `src/app/pages/group-page/group-page.component.ts`:

**Change A** — add to imports array (line 61):

```typescript
// Before
imports: [CommonModule, FormsModule, RouterLink, GroupTreeComponent, GroupConnectionGraphComponent, SafeUrlPipe, ProposalPanelComponent, RecordEditHistoryComponent, SupabaseImgPipe, GroupEventsComponent, FavoriteToggleComponent],

// After
imports: [CommonModule, FormsModule, RouterLink, GroupTreeComponent, GroupConnectionGraphComponent, SafeUrlPipe, ProposalPanelComponent, RecordEditHistoryComponent, SupabaseImgPipe, GroupEventsComponent, FavoriteToggleComponent, PhotoLightboxComponent],
```

Add import statement at the top:

```typescript
import { PhotoLightboxComponent } from '../../shared/photo-lightbox/photo-lightbox.component';
```

**Change B** — add to class body:

```typescript
lightboxOpen = false;
openLightbox(): void { this.lightboxOpen = true; }
closeLightbox(): void { this.lightboxOpen = false; }
```

- [ ] **Step 2: Wrap the group photo in a button**

In `src/app/pages/group-page/group-page.component.html`, the group photo block at lines ~298–316 currently looks like:

```html
@if (group.photo_url) {
  <div class="group-hero-photo" style="flex-shrink: 0; align-self: flex-start; margin-top: 4px;">
    <div class="group-portrait-ring" style="
      width: 140px; height: 140px;
      border-radius: 50%;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(45,27,46,0.12);
      border: 3px solid rgba(255,255,255,0.9);
      outline: 2px solid rgba(232,121,160,0.2);
      flex-shrink: 0;
    " [style.outline-color]="group.color + '44'">
      <img [src]="group.photo_url | supabaseImg:280" [alt]="group.name" loading="lazy" style="
        width: 100%; height: 100%; object-fit: cover;
        display: block;
      ">
    </div>
  </div>
}
```

Replace with (wrap the inner `<div class="group-portrait-ring">` in a button):

```html
@if (group.photo_url) {
  <div class="group-hero-photo" style="flex-shrink: 0; align-self: flex-start; margin-top: 4px;">
    <button type="button" class="group-photo-btn" (click)="openLightbox()">
      <div class="group-portrait-ring" style="
        width: 140px; height: 140px;
        border-radius: 50%;
        overflow: hidden;
        box-shadow: 0 4px 20px rgba(45,27,46,0.12);
        border: 3px solid rgba(255,255,255,0.9);
        outline: 2px solid rgba(232,121,160,0.2);
        flex-shrink: 0;
      " [style.outline-color]="group.color + '44'">
        <img [src]="group.photo_url | supabaseImg:280" [alt]="group.name" loading="lazy" style="
          width: 100%; height: 100%; object-fit: cover;
          display: block;
        ">
      </div>
    </button>
  </div>
}
```

- [ ] **Step 3: Add lightbox element at the end of the template**

Append at the very end of `src/app/pages/group-page/group-page.component.html` (after the last `}` on line 1417):

```html
@if (group) {
  <app-photo-lightbox
    [photoUrl]="group.photo_url ?? null"
    [name]="group.name ?? ''"
    [open]="lightboxOpen"
    (closed)="closeLightbox()"
  />
}
```

- [ ] **Step 4: Add hover/focus CSS**

Append to the end of `src/app/pages/group-page/group-page.component.css`:

```css
.group-photo-btn {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  display: block;
  border-radius: 50%;
}

.group-photo-btn:hover .group-portrait-ring img,
.group-photo-btn:focus-visible .group-portrait-ring img {
  transform: scale(1.02);
  filter: brightness(1.05);
  transition: transform 150ms ease, filter 150ms ease;
}

.group-photo-btn:focus-visible {
  outline: 2px solid rgba(232, 121, 160, 0.6);
  outline-offset: 3px;
  border-radius: 50%;
}
```

- [ ] **Step 5: Build check**

```bash
ng build --configuration=development 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/pages/group-page/
git commit -m "feat(lightbox): integrate photo lightbox into group-page"
```

---

## Task 4: Integrate into company-page

**Files:**
- Modify: `src/app/pages/company-page/company-page.component.ts:23`
- Modify: `src/app/pages/company-page/company-page.component.html:48-58`
- Modify: `src/app/pages/company-page/company-page.component.css`

- [ ] **Step 1: Add import and lightbox state to component class**

In `src/app/pages/company-page/company-page.component.ts`:

**Change A** — add to imports array (line 23):

```typescript
// Before
imports: [CommonModule, RouterLink, ProposalPanelComponent, RecordEditHistoryComponent, SupabaseImgPipe],

// After
imports: [CommonModule, RouterLink, ProposalPanelComponent, RecordEditHistoryComponent, SupabaseImgPipe, PhotoLightboxComponent],
```

Add import statement at the top:

```typescript
import { PhotoLightboxComponent } from '../../shared/photo-lightbox/photo-lightbox.component';
```

**Change B** — add to class body (after existing properties):

```typescript
lightboxOpen = false;
openLightbox(): void { this.lightboxOpen = true; }
closeLightbox(): void { this.lightboxOpen = false; }
```

- [ ] **Step 2: Wrap the company logo in a button**

In `src/app/pages/company-page/company-page.component.html`, the logo block at lines ~48–58 currently looks like:

```html
@if (company.photo_url) {
  <img [src]="company.photo_url | supabaseImg:144" [alt]="company.name" loading="lazy"
    class="company-logo-border"
    style="
      width: 72px; height: 72px; border-radius: 50%;
      object-fit: cover;
      border: 3px solid white;
      box-shadow: 0 4px 16px rgba(45,27,46,0.15);
      flex-shrink: 0;
    "/>
}
```

Replace with:

```html
@if (company.photo_url) {
  <button type="button" class="company-logo-btn" (click)="openLightbox()">
    <img [src]="company.photo_url | supabaseImg:144" [alt]="company.name" loading="lazy"
      class="company-logo-border"
      style="
        width: 72px; height: 72px; border-radius: 50%;
        object-fit: cover;
        border: 3px solid white;
        box-shadow: 0 4px 16px rgba(45,27,46,0.15);
        flex-shrink: 0;
      "/>
  </button>
}
```

- [ ] **Step 3: Add lightbox element at the end of the template**

Append at the very end of `src/app/pages/company-page/company-page.component.html` (after the last `}` on line 403):

```html
@if (company) {
  <app-photo-lightbox
    [photoUrl]="company.photo_url ?? null"
    [name]="company.name ?? ''"
    [open]="lightboxOpen"
    (closed)="closeLightbox()"
  />
}
```

- [ ] **Step 4: Add hover/focus CSS**

Append to the end of `src/app/pages/company-page/company-page.component.css`:

```css
.company-logo-btn {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  display: block;
  border-radius: 50%;
}

.company-logo-btn:hover img,
.company-logo-btn:focus-visible img {
  transform: scale(1.02);
  filter: brightness(1.05);
  transition: transform 150ms ease, filter 150ms ease;
}

.company-logo-btn:focus-visible {
  outline: 2px solid rgba(232, 121, 160, 0.6);
  outline-offset: 3px;
  border-radius: 50%;
}
```

- [ ] **Step 5: Final build and test**

```bash
ng build --configuration=development 2>&1 | tail -20
```

Expected: no errors.

```bash
ng test --watch=false 2>&1 | tail -10
```

Expected: all specs pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/pages/company-page/
git commit -m "feat(lightbox): integrate photo lightbox into company-page"
```
