# My Favorites — Desktop Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 240px sidebar layout to the my-favorites page that activates at ≥1024px without modifying any existing mobile behavior.

**Architecture:** Add a `layout` input to `FavoritesAvatarRowComponent` so it can render in wrap-grid mode on desktop. Restructure `MyFavoritesComponent`'s template into `.mf-sidebar` (desktop-only) + `.mf-mobile-header` + `.mf-mobile-avatars` (mobile-only) + `.mf-main` (shared). All desktop styles live in a new `my-favorites.component.css` gated by `@media (min-width: 1024px)`. The existing `position:fixed;inset:0` overlay is kept for both viewports; on desktop the root becomes a flex container with independent scroll per column.

**Tech Stack:** Angular 17+ standalone components, signals, Angular TestBed + Karma/Jasmine, CSS media queries

---

### Task 1: Add `layout` input to `FavoritesAvatarRowComponent`

**Files:**
- Modify: `src/app/pages/my-favorites/favorites-avatar-row.component.ts`
- Create: `src/app/pages/my-favorites/favorites-avatar-row.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/pages/my-favorites/favorites-avatar-row.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FavoritesAvatarRowComponent } from './favorites-avatar-row.component';
import { FavoritesService } from '../../core/favorites.service';
import { GroupService } from '../../core/group.service';
import { MemberService } from '../../core/member.service';

const mockFavoritesService = { favorites: () => [], favoriteIds: () => [] };
const mockGroupService = { getAll: async () => [] };
const mockMemberService = { getAll: async () => [] };

describe('FavoritesAvatarRowComponent', () => {
  let fixture: ComponentFixture<FavoritesAvatarRowComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FavoritesAvatarRowComponent],
      providers: [
        provideRouter([]),
        { provide: FavoritesService, useValue: mockFavoritesService },
        { provide: GroupService, useValue: mockGroupService },
        { provide: MemberService, useValue: mockMemberService },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FavoritesAvatarRowComponent);
  });

  it('defaults to row layout (overflow-x: auto)', () => {
    fixture.detectChanges();
    const container: HTMLElement = fixture.nativeElement.querySelector('[data-avatar-container]');
    expect(container.style.overflowX).toBe('auto');
    expect(container.style.flexWrap).toBe('nowrap');
  });

  it('applies wrap layout when layout input is grid', () => {
    fixture.componentRef.setInput('layout', 'grid');
    fixture.detectChanges();
    const container: HTMLElement = fixture.nativeElement.querySelector('[data-avatar-container]');
    expect(container.style.flexWrap).toBe('wrap');
    expect(container.style.overflowX).not.toBe('auto');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- --no-watch --include=**/favorites-avatar-row.component.spec.ts
```

Expected: FAIL — `[data-avatar-container]` not found.

- [ ] **Step 3: Add `layout` input and update avatar container**

In `src/app/pages/my-favorites/favorites-avatar-row.component.ts`:

Add `layout` after the existing `filter` input (line 65):

```typescript
filter = input<string | undefined>();
layout = input<'row' | 'grid'>('row');
```

Replace the avatar list container div in the template (the `<div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;">` line) with:

```html
<div
  data-avatar-container
  [style.display]="'flex'"
  [style.flex-wrap]="layout() === 'grid' ? 'wrap' : 'nowrap'"
  [style.overflow-x]="layout() === 'grid' ? 'visible' : 'auto'"
  [style.gap]="'10px'"
  [style.padding-bottom]="layout() === 'grid' ? '0' : '4px'"
>
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test -- --no-watch --include=**/favorites-avatar-row.component.spec.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/my-favorites/favorites-avatar-row.component.ts \
        src/app/pages/my-favorites/favorites-avatar-row.component.spec.ts
git commit -m "feat(favorites): add layout input to FavoritesAvatarRowComponent for desktop grid mode"
```

---

### Task 2: Create `my-favorites.component.css`

**Files:**
- Create: `src/app/pages/my-favorites/my-favorites.component.css`

- [ ] **Step 1: Create the CSS file**

Create `src/app/pages/my-favorites/my-favorites.component.css` with the following content:

```css
/* ── Mobile base ──────────────────────────────────────────── */

.mf-root {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: var(--bg-base, #fdf6fa);
  overflow-y: auto;
}

.mf-sidebar {
  display: none;
}

.mf-mobile-header {
  border-bottom: 1px solid rgba(232, 121, 160, 0.15);
}

.mf-mobile-header-inner {
  max-width: 680px;
  margin: 0 auto;
  padding: 20px 20px 0;
}

.mf-mobile-avatars,
.mf-main {
  max-width: 680px;
  margin: 0 auto;
}

.mf-main {
  padding-bottom: 80px;
}

/* ── Desktop ≥1024px ──────────────────────────────────────── */

@media (min-width: 1024px) {
  .mf-root {
    overflow: hidden;
    display: flex;
  }

  .mf-sidebar {
    display: flex;
    flex-direction: column;
    width: 240px;
    flex-shrink: 0;
    border-right: 1px solid rgba(232, 121, 160, 0.12);
    overflow-y: auto;
    padding: 24px 16px;
    gap: 20px;
  }

  .mf-mobile-header,
  .mf-mobile-avatars {
    display: none;
  }

  .mf-main {
    flex: 1;
    max-width: none;
    margin: 0;
    padding: 24px 32px 80px;
    overflow-y: auto;
  }
}

/* ── Sidebar elements ─────────────────────────────────────── */
/* These classes are inside .mf-sidebar which is display:none on mobile,
   so they are effectively desktop-only without needing @media guards. */

.mf-back-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.65rem;
  color: var(--text-faint-55);
  text-decoration: none;
  letter-spacing: 0.04em;
}

.mf-sidebar-label {
  font-size: 0.58rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-label);
  margin-bottom: 3px;
}

.mf-sidebar-greeting {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.mf-filter-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  border-top: 1px solid rgba(232, 121, 160, 0.1);
  padding-top: 12px;
  margin-top: auto;
}

.mf-filter-btn {
  padding: 7px 10px;
  font-size: 0.65rem;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  font-family: var(--font-sans);
  letter-spacing: 0.04em;
  font-weight: 500;
  color: var(--text-faint-55);
  width: 100%;
}

.mf-filter-btn:hover {
  background: rgba(232, 121, 160, 0.06);
}

.mf-filter-btn.mf-filter-active {
  color: rgba(232, 121, 160, 1);
  background: rgba(232, 121, 160, 0.1);
  font-weight: 600;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/pages/my-favorites/my-favorites.component.css
git commit -m "feat(favorites): add desktop responsive CSS for my-favorites sidebar layout"
```

---

### Task 3: Restructure template and wire styleUrl

**Files:**
- Modify: `src/app/pages/my-favorites/my-favorites.component.html`
- Modify: `src/app/pages/my-favorites/my-favorites.component.ts`
- Create: `src/app/pages/my-favorites/my-favorites.component.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/pages/my-favorites/my-favorites.component.spec.ts`:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MyFavoritesComponent } from './my-favorites.component';
import { FavoritesService } from '../../core/favorites.service';
import { SupabaseService } from '../../core/supabase.service';
import { GroupService } from '../../core/group.service';
import { MemberService } from '../../core/member.service';

const mockFavoritesService = {
  favorites: () => [],
  favoriteIds: () => [],
  load: async () => {},
};
const mockSupabaseService = { getSessionOnce: async () => null };
const mockGroupService = { getAll: async () => [] };
const mockMemberService = { getAll: async () => [] };

describe('MyFavoritesComponent desktop structure', () => {
  let fixture: ComponentFixture<MyFavoritesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyFavoritesComponent],
      providers: [
        provideRouter([]),
        { provide: FavoritesService, useValue: mockFavoritesService },
        { provide: SupabaseService, useValue: mockSupabaseService },
        { provide: GroupService, useValue: mockGroupService },
        { provide: MemberService, useValue: mockMemberService },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MyFavoritesComponent);
    fixture.detectChanges();
  });

  it('renders desktop sidebar element in DOM', () => {
    const sidebar = fixture.nativeElement.querySelector('.mf-sidebar');
    expect(sidebar).toBeTruthy();
  });

  it('renders mobile header element in DOM', () => {
    const mobileHeader = fixture.nativeElement.querySelector('.mf-mobile-header');
    expect(mobileHeader).toBeTruthy();
  });

  it('sidebar filter nav has all four tabs', () => {
    const buttons = fixture.nativeElement.querySelectorAll('.mf-filter-btn');
    expect(buttons.length).toBe(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- --no-watch --include=**/my-favorites.component.spec.ts
```

Expected: FAIL — `.mf-sidebar` and `.mf-mobile-header` not found.

- [ ] **Step 3: Replace `my-favorites.component.html`**

Replace the entire file with:

```html
<div class="mf-root">

  <!-- Desktop sidebar (display:none on mobile via CSS) -->
  <aside class="mf-sidebar">
    <a routerLink="/" class="mf-back-link">← 首頁</a>
    <div>
      <div class="mf-sidebar-label">MY FAVORITES · 我的最愛</div>
      @if (displayName) {
        <div class="mf-sidebar-greeting">Hi, {{ displayName }} ♥</div>
      }
    </div>
    <app-favorites-avatar-row
      [layout]="'grid'"
      [filter]="activeTab() === 'all' ? undefined : activeTab()"
      (addClicked)="openAddSheet()"
    />
    <nav class="mf-filter-nav">
      @for (tab of tabs; track tab.id) {
        <button
          (click)="setTab(tab.id)"
          class="mf-filter-btn"
          [class.mf-filter-active]="activeTab() === tab.id"
        >{{ tab.label }}</button>
      }
    </nav>
  </aside>

  <!-- Mobile header (display:none on desktop via CSS) -->
  <div class="mf-mobile-header">
    <div class="mf-mobile-header-inner">
      <div style="margin-bottom:3px;">
        <a routerLink="/" style="display:inline-flex;align-items:center;gap:4px;font-size:0.65rem;color:var(--text-faint-55);text-decoration:none;letter-spacing:0.04em;margin-bottom:6px;">← 首頁</a>
      </div>
      <div style="font-size:0.58rem;letter-spacing:0.2em;text-transform:uppercase;color:var(--text-label);margin-bottom:3px;">
        MY FAVORITES · 我的最愛
      </div>
      @if (displayName) {
        <div style="font-size:1rem;font-weight:700;color:var(--text-primary);margin-bottom:12px;">
          Hi, {{ displayName }} ♥
        </div>
      }
      <div style="display:flex;gap:0;overflow-x:auto;">
        @for (tab of tabs; track tab.id) {
          <button
            (click)="setTab(tab.id)"
            [style.color]="activeTab() === tab.id ? 'rgba(232,121,160,1)' : 'var(--text-faint-55)'"
            [style.border-bottom]="activeTab() === tab.id ? '2px solid rgba(232,121,160,1)' : '2px solid transparent'"
            style="padding:6px 14px 10px;font-size:0.62rem;background:transparent;border:none;border-radius:0;cursor:pointer;white-space:nowrap;font-family:var(--font-sans);letter-spacing:0.04em;font-weight:600;"
          >{{ tab.label }}</button>
        }
      </div>
    </div>
  </div>

  <!-- Mobile avatar row (display:none on desktop via CSS) -->
  <div class="mf-mobile-avatars">
    @if (activeTab() !== 'push') {
      <app-favorites-avatar-row
        [filter]="activeTab() === 'all' ? undefined : activeTab()"
        (addClicked)="openAddSheet()"
      />
    }
  </div>

  <!-- Main content area (shared) -->
  <main class="mf-main">
    @if (activeTab() !== 'push') {
      <app-favorites-feed [filter]="activeTab() === 'all' ? undefined : activeTab()" />
    } @else {
      <app-push-settings />
    }
  </main>

</div>

@if (showAddSheet()) {
  <app-favorites-add-sheet [initialTab]="addSheetInitialTab" (close)="closeAddSheet()" />
}
```

- [ ] **Step 4: Add `styleUrl` to the component decorator**

In `src/app/pages/my-favorites/my-favorites.component.ts`, update the `@Component` decorator:

```typescript
@Component({
  selector: 'app-my-favorites',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FavoritesAvatarRowComponent,
    FavoritesFeedComponent,
    FavoritesAddSheetComponent,
    PushSettingsComponent,
  ],
  templateUrl: './my-favorites.component.html',
  styleUrl: './my-favorites.component.css',
})
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test -- --no-watch --include=**/my-favorites.component.spec.ts
```

Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/app/pages/my-favorites/my-favorites.component.html \
        src/app/pages/my-favorites/my-favorites.component.ts \
        src/app/pages/my-favorites/my-favorites.component.spec.ts
git commit -m "feat(favorites): restructure template for responsive desktop sidebar layout"
```

---

### Task 4: Visual verification

- [ ] **Step 1: Start the dev server**

```bash
pnpm start
```

- [ ] **Step 2: Verify desktop layout (≥1024px)**

Open `http://localhost:4200` and navigate to `/my-favorites` (login if needed).

At ≥1024px:
- Left sidebar (240px) visible: ← 首頁 link, MY FAVORITES label, greeting, avatar grid (wrap), filter nav buttons
- Right main area shows feed
- Clicking sidebar filter buttons (全部/團體/成員/通知設定) switches feed content
- 通知設定 tab renders push settings in main area; sidebar still shows avatars and nav

- [ ] **Step 3: Verify mobile layout unchanged (<1024px)**

Resize browser to <1024px or use DevTools device emulation.

- Sidebar not visible
- Mobile header shows back link, MY FAVORITES label, greeting, horizontal tab bar
- Avatar row scrolls horizontally
- Push tab hides avatar row (same as before)
- Behavior identical to before this change

- [ ] **Step 4: Commit any visual fixes**

If any spacing or visual issues arise after inspection, edit `my-favorites.component.css` only and commit:

```bash
git add src/app/pages/my-favorites/my-favorites.component.css
git commit -m "fix(favorites): desktop sidebar visual adjustments"
```
