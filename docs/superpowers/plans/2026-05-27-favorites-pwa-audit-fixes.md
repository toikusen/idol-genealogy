# Favorites & PWA Audit Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five categories of verified bugs found in the favorites/PWA audit: race condition + hasMore pagination logic, avatar row full-table fetch, add-sheet accessibility, tab ARIA semantics, and skeleton/manifest polish.

**Architecture:** All changes are confined to the `my-favorites` page components and supporting services. No new files needed — each task modifies existing files. Changes are backward-compatible; no DB migrations required.

**Tech Stack:** Angular 17+ (signals, effect, computed), Supabase JS client, Jasmine/Karma unit tests, CSS custom properties.

---

## File Map

| File | Task(s) | Change |
|------|---------|--------|
| `src/app/pages/my-favorites/favorites-feed.component.ts` | 1 | Add `_loadSeq` race guard; fix `hasMore`; update `fetchEntries` return type |
| `src/app/pages/my-favorites/favorites-feed.component.spec.ts` | 1 | Add tests for race guard + hasMore |
| `src/app/pages/my-favorites/favorites-avatar-row.component.ts` | 2 | Replace `getAll()` with targeted `.in()` queries; remove GroupService/MemberService deps |
| `src/app/pages/my-favorites/favorites-avatar-row.component.spec.ts` | 2 | Update mock providers; add fetch-targeted test |
| `src/app/pages/my-favorites/favorites-add-sheet.component.ts` | 3 | dialog role, focus trap, Escape, focus return, heart aria-label |
| `src/app/pages/my-favorites/favorites-avatar-row.component.ts` | 3 | Add aria-label to remove button |
| `src/app/pages/my-favorites/push-settings.component.ts` | 3 | Add aria-label to hidden checkbox inputs |
| `src/app/pages/my-favorites/my-favorites.component.html` | 4 | mobile tablist/tab/aria-selected; main tabpanel; desktop aria-current |
| `src/app/pages/my-favorites/my-favorites.component.ts` | 4 | Add tab id helpers |
| `src/app/pages/my-favorites/my-favorites.component.spec.ts` | 4 | Add ARIA attribute tests |
| `src/app/pages/my-favorites/favorites-feed.component.ts` | 5 | Fix skeleton CSS for light mode |
| `src/app/pages/my-favorites/my-favorites.component.html` | 5 | Fix sidebar push-tab filter guard |
| `public/manifest.webmanifest` | 5 | Add `id`, `description` |

---

## Task 1 — Fix `loadFeed` Race Condition + `hasMore` Pagination Logic

**Files:**
- Modify: `src/app/pages/my-favorites/favorites-feed.component.ts`
- Test: `src/app/pages/my-favorites/favorites-feed.component.spec.ts`

### Background

Two problems exist in `loadFeed()`:

1. **Race condition:** No request guard. If user rapidly switches tabs (all→group→member), three `loadFeed()` calls fire concurrently. The last one to *resolve* (not fire) wins, potentially overwriting newer UI state with older data.

2. **hasMore always true:** `this.hasMore.set(entries.length > 0)` shows "載入更多" even when only 1 entry was fetched. `hasMore` should only be true if at least one table returned exactly `PAGE_LIMIT` items (indicating there may be more pages in that table).

### Fix Design

- Add `private _loadSeq = 0` counter. Increment at start of each `loadFeed()`. Capture the value as a local `const seq = ++this._loadSeq`. After all awaits, check `if (seq !== this._loadSeq) return` — stale responses are silently discarded.
- Change `fetchEntries` to return `{ entries: FeedEntry[]; mightHaveMore: boolean }`. Set `mightHaveMore = true` inside the function whenever any individual table query returns exactly `PAGE_LIMIT` rows.
- `appendPage` also uses the returned `mightHaveMore`.

- [ ] **Step 1: Write the failing tests**

Add to `favorites-feed.component.spec.ts` (after existing `describe` block):

```typescript
describe('FavoritesFeedComponent — pagination', () => {
  const _favs = signal<{ user_id: string; entity_type: FavoriteEntityType; entity_id: string; created_at: string }[]>([
    { user_id: 'u1', entity_type: 'group', entity_id: 'g1', created_at: '' },
  ]);

  function makeChainWithRows(rows: unknown[]) {
    const p = Promise.resolve({ data: rows, error: null });
    const chain: any = { then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p) };
    ['select', 'in', 'eq', 'not', 'is', 'order', 'lt'].forEach(m => (chain[m] = () => chain));
    chain.limit = () => chain;
    return chain;
  }

  const mockFavoritesService = {
    favoriteIds: (type: FavoriteEntityType) => _favs().filter(f => f.entity_type === type).map(f => f.entity_id),
    favorites: (type?: FavoriteEntityType) => type ? _favs().filter(f => f.entity_type === type) : _favs(),
  };

  it('hasMore is false when all tables return fewer than PAGE_LIMIT rows', fakeAsync(() => {
    const rows = [{ id: '1', title: 'T', created_at: '2024-01-01', group: { id: 'g1', name: 'G', photo_url: null } }];
    const mockSupa = { client: { from: (_: string) => makeChainWithRows(rows) } };

    TestBed.configureTestingModule({
      imports: [FavoritesFeedComponent],
      providers: [
        provideRouter([]),
        { provide: FavoritesService, useValue: mockFavoritesService },
        { provide: SupabaseService, useValue: mockSupa },
      ],
    }).compileComponents();

    const fixture2 = TestBed.createComponent(FavoritesFeedComponent);
    fixture2.detectChanges();
    tick();
    fixture2.detectChanges();

    expect(fixture2.componentInstance.hasMore()).toBeFalse();
  }));

  it('hasMore is true when a table returns exactly PAGE_LIMIT rows', fakeAsync(() => {
    // PAGE_LIMIT = 20
    const rows = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      title: `Song ${i}`,
      created_at: `2024-01-0${(i % 9) + 1}`,
      group: { id: 'g1', name: 'G', photo_url: null },
    }));
    const mockSupa = { client: { from: (_: string) => makeChainWithRows(rows) } };

    TestBed.configureTestingModule({
      imports: [FavoritesFeedComponent],
      providers: [
        provideRouter([]),
        { provide: FavoritesService, useValue: mockFavoritesService },
        { provide: SupabaseService, useValue: mockSupa },
      ],
    }).compileComponents();

    const fixture3 = TestBed.createComponent(FavoritesFeedComponent);
    fixture3.detectChanges();
    tick();
    fixture3.detectChanges();

    expect(fixture3.componentInstance.hasMore()).toBeTrue();
  }));
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/seitumbp2025/idol-genealogy
npx ng test --include='**/favorites-feed.component.spec.ts' --watch=false
```

Expected: the two new `hasMore` tests fail (current logic always returns `true` when entries exist).

- [ ] **Step 3: Apply the fix to `favorites-feed.component.ts`**

**3a — Add `_loadSeq` field** after the existing private fields (~line 261):

```typescript
private _loadSeq = 0;
```

**3b — Update `fetchEntries` return type signature** (line 456):

Change:
```typescript
private async fetchEntries(groupIds: string[], memberIds: string[]): Promise<FeedEntry[]> {
  const entries: FeedEntry[] = [];
```

To:
```typescript
private async fetchEntries(groupIds: string[], memberIds: string[]): Promise<{ entries: FeedEntry[]; mightHaveMore: boolean }> {
  const entries: FeedEntry[] = [];
  let mightHaveMore = false;
```

**3c — After each `if (songs?.length)` cursor line in `fetchEntries`, add a limit-hit check.** There are 5 table fetches. Add after each `this._tableCursors.X = ...` line:

After `this._tableCursors.groupSongs = songs[songs.length - 1].created_at;` (~line 469):
```typescript
if (songs.length === PAGE_LIMIT) mightHaveMore = true;
```

After `this._tableCursors.memberSongs = mSongs[mSongs.length - 1].created_at;` (~line 490):
```typescript
if (mSongs.length === PAGE_LIMIT) mightHaveMore = true;
```

After `this._tableCursors.history = historyRows[historyRows.length - 1].created_at;` (~line 509):
```typescript
if (historyRows.length === PAGE_LIMIT) mightHaveMore = true;
```

After `this._tableCursors.groupEvents = events[events.length - 1].first_seen_at;` (~line 548):
```typescript
if (events.length === PAGE_LIMIT) mightHaveMore = true;
```

After `this._tableCursors.disbanded = disbanded[disbanded.length - 1].disbanded_at;` (~line 565):
```typescript
if (disbanded.length === PAGE_LIMIT) mightHaveMore = true;
```

**3d — Update `fetchEntries` return statement** (currently just `entries.sort(...); return entries;`):

```typescript
entries.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
return { entries, mightHaveMore };
```

**3e — Update `loadFeed()` to use the race guard and new return type.** Replace the entire `loadFeed()` method body:

```typescript
private async loadFeed(): Promise<void> {
  const seq = ++this._loadSeq;
  this.loading.set(true);
  this.error.set(false);
  this.hasMore.set(false);
  this._tableCursors = {};

  const previousVisit = this.isBrowser ? localStorage.getItem(LAST_VISITED_KEY) : null;
  if (this.isBrowser) localStorage.setItem(LAST_VISITED_KEY, new Date().toISOString());

  const groupIds = this.filter === 'member' ? [] : this.favService.favoriteIds('group');
  const memberIds = this.filter === 'group' ? [] : this.favService.favoriteIds('member');

  if (!memberIds.length) this.birthdayItems.set([]);

  try {
    const [{ entries, mightHaveMore }] = await Promise.all([
      this.fetchEntries(groupIds, memberIds),
      memberIds.length ? this.loadBirthdays(memberIds) : Promise.resolve(),
    ]);

    if (seq !== this._loadSeq) return;

    if (previousVisit) {
      let count = 0;
      for (const e of entries) {
        if (e.occurredAt > previousVisit) { e.isNew = true; count++; }
      }
      this.newCount.set(count);
    }

    this.items.set(entries);
    this.hasMore.set(mightHaveMore);
    this.subscribeRealtime();
  } catch {
    if (seq !== this._loadSeq) return;
    this.error.set(true);
    this.items.set([]);
  } finally {
    if (seq === this._loadSeq) this.loading.set(false);
  }
}
```

**3f — Update `appendPage()` to use new return type:**

```typescript
private async appendPage(): Promise<void> {
  this.loadingMore.set(true);
  try {
    const groupIds = this.filter === 'member' ? [] : this.favService.favoriteIds('group');
    const memberIds = this.filter === 'group' ? [] : this.favService.favoriteIds('member');
    const { entries, mightHaveMore } = await this.fetchEntries(groupIds, memberIds);
    if (entries.length === 0) { this.hasMore.set(false); return; }
    const existingIds = new Set(this.items().map(e => e.id));
    const fresh = entries.filter(e => !existingIds.has(e.id));
    this.items.update(prev => [...prev, ...fresh]);
    this.hasMore.set(mightHaveMore && fresh.length > 0);
  } catch {
    // silently ignore
  } finally {
    this.loadingMore.set(false);
  }
}
```

- [ ] **Step 4: Run tests and verify they pass**

```bash
npx ng test --include='**/favorites-feed.component.spec.ts' --watch=false
```

Expected: all tests pass including the two new hasMore tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/my-favorites/favorites-feed.component.ts src/app/pages/my-favorites/favorites-feed.component.spec.ts
git commit -m "fix(favorites): add loadFeed race guard and correct hasMore pagination logic"
```

---

## Task 2 — Fix Avatar Row Full-Table Fetch

**Files:**
- Modify: `src/app/pages/my-favorites/favorites-avatar-row.component.ts`
- Test: `src/app/pages/my-favorites/favorites-avatar-row.component.spec.ts`

### Background

`loadDetails()` calls `groupService.getAll()` and `memberService.getAll()`, which fetch the entire groups and members tables just to resolve names and photo URLs for a handful of favorites. On first load, this downloads every group and member record unnecessarily.

The fix: inject `SupabaseService` (already present in the component) and query only the specific IDs needed.

After the fix, `GroupService` and `MemberService` are no longer needed in this component — remove them to keep the dependency graph clean.

- [ ] **Step 1: Write the failing test**

Add to `favorites-avatar-row.component.spec.ts` after the existing `describe`:

```typescript
describe('FavoritesAvatarRowComponent — loadDetails fetches only needed IDs', () => {
  it('calls supabase .in() with the favorited group ids, not getAll()', async () => {
    const groupIds = ['g-1', 'g-2'];
    const inSpy = jasmine.createSpy('in').and.returnValue(
      Promise.resolve({ data: [{ id: 'g-1', name: 'Group One', photo_url: null }, { id: 'g-2', name: 'Group Two', photo_url: null }] })
    );
    const selectSpy = jasmine.createSpy('select').and.returnValue({ in: inSpy });
    const fromSpy = jasmine.createSpy('from').and.returnValue({ select: selectSpy });

    const mockSupa = { client: { from: fromSpy } };

    const mockFavs = {
      favorites: () => groupIds.map(id => ({ entity_id: id, entity_type: 'group' as const, user_id: 'u1', created_at: '' })),
      favoriteIds: () => groupIds,
    };

    await TestBed.configureTestingModule({
      imports: [FavoritesAvatarRowComponent],
      providers: [
        provideRouter([]),
        { provide: FavoritesService, useValue: mockFavs },
        { provide: SupabaseService, useValue: mockSupa },
      ],
    }).compileComponents();

    const fixture2 = TestBed.createComponent(FavoritesAvatarRowComponent);
    fixture2.detectChanges();
    await fixture2.whenStable();

    expect(fromSpy).toHaveBeenCalledWith('groups');
    expect(inSpy).toHaveBeenCalledWith('id', groupIds);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx ng test --include='**/favorites-avatar-row.component.spec.ts' --watch=false
```

Expected: new test fails because `loadDetails` currently calls `groupService.getAll()` not supabase `.in()`.

- [ ] **Step 3: Rewrite `loadDetails` and remove unused deps**

In `favorites-avatar-row.component.ts`:

**3a — Remove `GroupService` and `MemberService` imports and injections.** Remove these lines from the import block:
```typescript
import { GroupService } from '../../core/group.service';
import { MemberService } from '../../core/member.service';
```
And remove these two injection lines from the class body:
```typescript
private groupService = inject(GroupService);
private memberService = inject(MemberService);
```

**3b — Replace the `loadDetails` method entirely:**

```typescript
async loadDetails(groupIds: string[], memberIds: string[]): Promise<void> {
  const [groupRes, memberRes] = await Promise.all([
    groupIds.length
      ? this.supabase.client.from('groups').select('id,name,photo_url').in('id', groupIds)
      : Promise.resolve({ data: [] }),
    memberIds.length
      ? this.supabase.client.from('members').select('id,name,photo_url').in('id', memberIds)
      : Promise.resolve({ data: [] }),
  ]);

  const names: Record<string, string> = {};
  const photos: Record<string, string | null> = {};
  (groupRes.data ?? []).forEach((g: { id: string; name: string; photo_url: string | null }) => {
    names[g.id] = g.name;
    photos[g.id] = g.photo_url;
  });
  (memberRes.data ?? []).forEach((m: { id: string; name: string; photo_url: string | null }) => {
    names[m.id] = m.name;
    photos[m.id] = m.photo_url;
  });
  this._nameCache.set({ ...this._nameCache(), ...names });
  this._photoCache.set({ ...this._photoCache(), ...photos });
}
```

**3c — Update existing mock in `favorites-avatar-row.component.spec.ts`** — remove `GroupService` and `MemberService` from providers since they're no longer injected. Replace the top-level mock declarations and `beforeEach` providers:

Remove:
```typescript
const mockGroupService = { getAll: async () => [] };
const mockMemberService = { getAll: async () => [] };
```

And in `providers` array inside `beforeEach`, remove:
```typescript
{ provide: GroupService, useValue: mockGroupService },
{ provide: MemberService, useValue: mockMemberService },
```

Also remove `GroupService` and `MemberService` imports at top of the spec file, and add `SupabaseService`:
```typescript
import { SupabaseService } from '../../core/supabase.service';
```

Add a `SupabaseService` mock to the existing `beforeEach` providers:
```typescript
{ provide: SupabaseService, useValue: { client: { from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [] }) }) }) } } },
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx ng test --include='**/favorites-avatar-row.component.spec.ts' --watch=false
```

Expected: all tests pass. The new test verifies `.in()` is called.

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/my-favorites/favorites-avatar-row.component.ts src/app/pages/my-favorites/favorites-avatar-row.component.spec.ts
git commit -m "perf(favorites): fetch avatar details by id instead of getAll"
```

---

## Task 3 — Accessibility: Add Sheet Dialog, Focus Trap, Escape, and All Missing ARIA Labels

**Files:**
- Modify: `src/app/pages/my-favorites/favorites-add-sheet.component.ts`
- Modify: `src/app/pages/my-favorites/favorites-avatar-row.component.ts`
- Modify: `src/app/pages/my-favorites/push-settings.component.ts`

### Background

Three separate `aria-label` / dialog accessibility gaps:

1. **Add sheet:** Missing `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus trap, Escape key handler, focus return on close. Also: the heart toggle button (`♥/♡`) has no `aria-label` — screen readers say "button ♥", which is useless.

2. **Avatar row remove button:** Only contains an SVG cross. No `aria-label`.

3. **Push settings checkboxes:** Each `<input type="checkbox">` is visually hidden (opacity:0) and the label text ("活動通知" etc.) is in a `<div>` outside the `<label>`. The checkbox has no accessible name.

### Fix Design

**Add sheet focus trap:** Simple JavaScript approach — capture all focusable elements within the sheet on first Tab, cycle within them. No new directive needed.

**Focus return:** Store `document.activeElement` at the moment the sheet opens; restore on close via the close button or Escape.

**Heart toggle `aria-label`:** Dynamic label naming the entity: `"加入 [name] 的最愛"` / `"移除 [name] 的最愛"`. The row template has access to `item`, so this is straightforward.

- [ ] **Step 1: Fix `favorites-add-sheet.component.ts`**

**1a — Add `_triggerEl` field** to the class:
```typescript
private _triggerEl: Element | null = null;
```

**1b — Store trigger element in `ngOnInit`** (before `await this.loadFavDetails()`):
```typescript
async ngOnInit(): Promise<void> {
  this._triggerEl = document.activeElement;
  this.tab.set(this.initialTab);
  await this.loadFavDetails();
  this.loadingFavs.set(false);
  // Move focus into the sheet heading after it opens
  const heading = document.querySelector<HTMLElement>('[data-sheet-title]');
  heading?.focus();
}
```

**1c — Add focus restoration in `ngOnDestroy`:**
```typescript
ngOnDestroy(): void {
  if (this.searchTimer) clearTimeout(this.searchTimer);
  if (this._triggerEl instanceof HTMLElement) this._triggerEl.focus();
}
```

**1d — Replace the overlay + sheet container HTML.** The sheet div currently starts at line 24. Replace it with:

```html
<!-- Overlay -->
<div (click)="close.emit()" style="
  position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:1100;
  backdrop-filter:blur(2px);animation:fadeIn 0.2s;
" aria-hidden="true"></div>

<!-- Sheet -->
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="add-sheet-title"
  (keydown.escape)="close.emit()"
  (keydown.tab)="onTabKey($event)"
  style="
    position:fixed;bottom:0;left:0;right:0;z-index:1200;
    background:var(--surface, #fff);border-radius:20px 20px 0 0;
    height:80vh;display:flex;flex-direction:column;
    box-shadow:0 -4px 30px rgba(45,27,46,0.15);
    animation:slideUp 0.25s ease-out;
  ">
  <!-- Handle -->
  <div style="display:flex;justify-content:center;padding:10px 0 4px;" aria-hidden="true">
    <div style="width:36px;height:4px;border-radius:2px;background:rgba(45,27,46,0.15);"></div>
  </div>

  <!-- Title + close -->
  <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 20px 0;">
    <div id="add-sheet-title" data-sheet-title tabindex="-1"
         style="font-size:0.9rem;font-weight:700;color:var(--text-primary);outline:none;">新增最愛</div>
    <button (click)="close.emit()" aria-label="關閉" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--text-faint-55);">✕</button>
  </div>
```

Note the `(keydown.escape)` and `(keydown.tab)` on the dialog div. The rest of the sheet content remains unchanged.

**1e — Add `onTabKey` method to the class:**

```typescript
onTabKey(event: KeyboardEvent): void {
  const focusable = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const sheet = (event.currentTarget as HTMLElement);
  const els = Array.from(sheet.querySelectorAll<HTMLElement>(focusable)).filter(
    el => !el.hasAttribute('disabled') && el.offsetParent !== null
  );
  if (!els.length) return;
  const first = els[0];
  const last = els[els.length - 1];
  if (event.shiftKey) {
    if (document.activeElement === first) { event.preventDefault(); last.focus(); }
  } else {
    if (document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
}
```

**1f — Add `aria-label` to the heart toggle button in `rowTpl`.** The `#rowTpl` template has:
```html
<button (click)="toggle(item)" ...>{{ isFav(item.id) ? '♥' : '♡' }}</button>
```
Change to:
```html
<button (click)="toggle(item)"
  [attr.aria-label]="isFav(item.id) ? ('移除 ' + item.name + ' 的最愛') : ('加入 ' + item.name + ' 的最愛')"
  ...>{{ isFav(item.id) ? '♥' : '♡' }}</button>
```

- [ ] **Step 2: Fix remove button aria-label in `favorites-avatar-row.component.ts`**

The remove button (line ~46) currently is:
```html
<button (click)="removeFav(item.id, item.entityType)" style="...">
  <svg ...>...</svg>
</button>
```

Change to:
```html
<button (click)="removeFav(item.id, item.entityType)"
  [attr.aria-label]="'移除 ' + item.name + ' 的最愛'"
  style="...">
  <svg aria-hidden="true" ...>...</svg>
</button>
```

- [ ] **Step 3: Fix push settings checkbox accessible names in `push-settings.component.ts`**

Each of the 5 `<input type="checkbox">` has no accessible name. Add `aria-label` to each one. The five inputs are for `notify_event`, `notify_new_song`, `notify_status`, `notify_birthday`, `notify_disbanded`.

Replace each hidden input. Example for `notify_event` (currently ~line 65):
```html
<input type="checkbox" [checked]="prefsService.prefs().notify_event"
  (change)="toggle('notify_event', $event)"
  aria-label="活動通知"
  style="opacity:0;width:0;height:0;position:absolute;">
```

Apply the same pattern for all five, with labels:
- `notify_event` → `aria-label="活動通知"`
- `notify_new_song` → `aria-label="新增歌曲通知"`
- `notify_status` → `aria-label="狀態異動通知"`
- `notify_birthday` → `aria-label="生日提醒通知"`
- `notify_disbanded` → `aria-label="解散公告通知"`

- [ ] **Step 4: Run all affected specs to verify no regressions**

```bash
npx ng test --include='**/my-favorites/**/*.spec.ts' --watch=false
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/my-favorites/favorites-add-sheet.component.ts src/app/pages/my-favorites/favorites-avatar-row.component.ts src/app/pages/my-favorites/push-settings.component.ts
git commit -m "fix(a11y): add dialog role, focus trap, Escape, and missing aria-labels in favorites"
```

---

## Task 4 — Tab and Filter ARIA Semantics

**Files:**
- Modify: `src/app/pages/my-favorites/my-favorites.component.html`
- Modify: `src/app/pages/my-favorites/my-favorites.component.spec.ts`

### Background

The mobile tab bar has no ARIA role semantics — buttons are anonymous `<button>` elements without `role="tab"`, `aria-selected`, or a `role="tablist"` container. The main content area has no `role="tabpanel"`.

The desktop sidebar filter buttons already have `aria-label="篩選分類"` on the `<nav>`, which is appropriate. They just need `aria-current="true"` on the active button.

Pattern for mobile: W3C ARIA tabs pattern (`tablist` / `tab` / `aria-selected` / `tabpanel`).
Pattern for desktop: filter navigation with `aria-current`.

- [ ] **Step 1: Write the failing test**

Add to `my-favorites.component.spec.ts`:

```typescript
describe('MyFavoritesComponent — ARIA tab semantics', () => {
  let fixture: ComponentFixture<MyFavoritesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyFavoritesComponent],
      providers: [
        provideRouter([]),
        { provide: FavoritesService, useValue: { favorites: () => [], favoriteIds: () => [], load: async () => {} } },
        { provide: SupabaseService, useValue: { getSessionOnce: async () => null } },
        { provide: GroupService, useValue: { getAll: async () => [] } },
        { provide: MemberService, useValue: { getAll: async () => [] } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MyFavoritesComponent);
    fixture.detectChanges();
  });

  it('mobile tab container has role="tablist"', () => {
    const tablist = fixture.nativeElement.querySelector('[role="tablist"]');
    expect(tablist).toBeTruthy();
  });

  it('first mobile tab has role="tab" and aria-selected="true"', () => {
    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBeGreaterThan(0);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
  });

  it('main content has role="tabpanel"', () => {
    const panel = fixture.nativeElement.querySelector('[role="tabpanel"]');
    expect(panel).toBeTruthy();
  });

  it('desktop active filter button has aria-current="true"', () => {
    const activeBtn = fixture.nativeElement.querySelector('.mf-filter-btn.mf-filter-active');
    expect(activeBtn?.getAttribute('aria-current')).toBe('true');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx ng test --include='**/my-favorites.component.spec.ts' --watch=false
```

Expected: the four new ARIA tests fail.

- [ ] **Step 3: Apply fixes to `my-favorites.component.html`**

**3a — Mobile tab bar:** Replace the `<div style="display:flex;gap:0;overflow-x:auto;">` and its inner `@for` block (lines 43-53) with:

```html
<div role="tablist" aria-label="內容分類" style="display:flex;gap:0;overflow-x:auto;">
  @for (tab of tabs; track tab.id) {
    <button
      role="tab"
      [attr.aria-selected]="activeTab() === tab.id"
      [attr.id]="'mob-tab-' + tab.id"
      [attr.aria-controls]="'tab-panel-main'"
      (click)="setTab(tab.id)"
      [style.color]="activeTab() === tab.id ? 'rgba(232,121,160,1)' : 'var(--text-faint-55)'"
      [style.border-bottom]="activeTab() === tab.id ? '2px solid rgba(232,121,160,1)' : '2px solid transparent'"
      style="padding:8px 16px 12px;font-size:0.82rem;background:transparent;border:none;border-radius:0;cursor:pointer;white-space:nowrap;font-family:var(--font-sans);letter-spacing:0.04em;font-weight:600;"
    >{{ tab.label }}</button>
  }
</div>
```

**3b — Main content area:** Add `role="tabpanel"` and `id` to the `<main>` tag (line 67):

```html
<main class="mf-main" role="tabpanel" id="tab-panel-main" [attr.aria-labelledby]="'mob-tab-' + activeTab()">
```

**3c — Desktop sidebar filter buttons:** Add `[attr.aria-current]` to each button in `.mf-filter-nav` (line 21):

```html
<button
  (click)="setTab(tab.id)"
  class="mf-filter-btn"
  [class.mf-filter-active]="activeTab() === tab.id"
  [attr.aria-current]="activeTab() === tab.id ? 'true' : null"
>{{ tab.label }}</button>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx ng test --include='**/my-favorites.component.spec.ts' --watch=false
```

Expected: all tests pass including the four new ARIA tests.

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/my-favorites/my-favorites.component.html src/app/pages/my-favorites/my-favorites.component.spec.ts
git commit -m "fix(a11y): add tablist/tab/tabpanel ARIA roles and aria-current to favorites tabs"
```

---

## Task 5 — Skeleton Light Mode, Sidebar Push-Tab Filter, Manifest

**Files:**
- Modify: `src/app/pages/my-favorites/favorites-feed.component.ts`
- Modify: `src/app/pages/my-favorites/my-favorites.component.html`
- Modify: `public/manifest.webmanifest`

### Background

Three unrelated small fixes bundled into one commit:

1. **Skeleton invisible in light mode:** The shimmer uses `rgba(255,255,255,0.04/0.09)` — white on white = invisible. Light mode needs a grey-tinted shimmer. Use CSS custom properties that resolve to different values in each theme, or use a dual-value approach with `var()`.

2. **Sidebar avatar row shows all favorites during push tab (desktop/mobile inconsistency):** Mobile hides the avatar row when `activeTab() === 'push'`. Desktop sidebar always shows it and passes `'push'` as filter, which `FavoritesAvatarRowComponent.displayItems` silently treats as "show all". The desktop sidebar intent (always-visible avatar grid) is fine, but the filter argument should be explicit — the guard `(activeTab() === 'all' || activeTab() === 'push') ? undefined : activeTab()` makes the behavior intentional and readable.

3. **Manifest missing `id` and `description`.**

- [ ] **Step 1: Fix skeleton in `favorites-feed.component.ts`**

Replace the `.skel` CSS rule inside the component `styles` (lines 62-74):

```css
.skel {
  background: linear-gradient(
    90deg,
    var(--skel-from) 25%,
    var(--skel-to)   50%,
    var(--skel-from) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.6s infinite;
  border-radius: 4px;
}
```

Then add the CSS variables to `src/styles.css` (or wherever the global theme tokens live). Check the project's existing global CSS file for the right location:

```css
/* In :root (light mode) */
:root, [data-theme="light"] {
  --skel-from: rgba(0, 0, 0, 0.05);
  --skel-to:   rgba(0, 0, 0, 0.10);
}

/* Dark mode */
[data-theme="dark"] {
  --skel-from: rgba(255, 255, 255, 0.04);
  --skel-to:   rgba(255, 255, 255, 0.09);
}
```

- [ ] **Step 2: Check where global theme tokens are defined**

```bash
grep -n "skel\|--bg-page\|data-theme" /Users/seitumbp2025/idol-genealogy/src/styles.css | head -30
```

If `[data-theme="dark"]` already has a block in `styles.css`, add `--skel-from` and `--skel-to` inside those existing blocks. If the project uses a different token file, add there.

- [ ] **Step 3: Fix sidebar push-tab filter in `my-favorites.component.html`**

Change line 15 (the sidebar avatar row `[filter]` binding) from:
```html
[filter]="activeTab() === 'all' ? undefined : activeTab()"
```
to:
```html
[filter]="(activeTab() === 'all' || activeTab() === 'push') ? undefined : activeTab()"
```

- [ ] **Step 4: Update `public/manifest.webmanifest`**

Add `id` and `description` fields:

```json
{
  "id": "/",
  "name": "IdolMaps",
  "short_name": "IdolMaps",
  "description": "台灣地下偶像成員與團體的完整資料庫",
  "theme_color": "#e879a0",
  "background_color": "#fdf6fa",
  "display": "standalone",
  "scope": "/",
  "start_url": "/",
  "icons": [...]
}
```

- [ ] **Step 5: Run full test suite to verify no regressions**

```bash
npx ng test --watch=false
```

Expected: all existing tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/pages/my-favorites/favorites-feed.component.ts src/styles.css src/app/pages/my-favorites/my-favorites.component.html public/manifest.webmanifest
git commit -m "fix(favorites): skeleton light mode, sidebar push filter guard, manifest id+description"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ hasMore pagination logic — Task 1
- ✅ loadFeed race condition — Task 1
- ✅ avatar row getAll() — Task 2
- ✅ add sheet dialog/focus trap/Escape/focus return — Task 3
- ✅ heart toggle aria-label — Task 3
- ✅ remove button aria-label — Task 3
- ✅ push settings checkbox aria-label — Task 3
- ✅ mobile tablist/tab/aria-selected — Task 4
- ✅ desktop aria-current — Task 4
- ✅ main content tabpanel — Task 4
- ✅ skeleton light mode — Task 5
- ✅ sidebar push filter guard — Task 5
- ✅ manifest id + description — Task 5

**Placeholder scan:** No TBD, TODO, or "similar to Task N" references found.

**Type consistency:** `fetchEntries` return type changed to `{ entries: FeedEntry[]; mightHaveMore: boolean }` consistently referenced in Task 1 steps 3d, 3e, 3f.
