# Plan 2: 最愛系統 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓登入使用者可追蹤最愛的團體和成員，並在 `/my-favorites` 頁面查看動態 feed，在成員/團體頁面用愛心按鈕快速追蹤。

**Architecture:** Supabase `user_favorites` table 儲存追蹤關係；`FavoritesService` 以 Angular Signal 在前端快取狀態，所有元件共用同一份 Signal（zero extra API calls）；`FavoriteToggleComponent` 可重用；`/my-favorites` 採 tab + avatar row + feed 設計；新增最愛用 bottom sheet。

**Tech Stack:** Angular 19 Standalone, Angular Signals, Supabase JS v2, Jasmine/Karma

**前置條件：** Plan 1 已完成（PWA + authGuard 已設定）

---

## File Map

| 動作 | 檔案 |
|------|------|
| Create | `supabase/migrations/055_add_user_favorites.sql` |
| Modify | `src/app/models/index.ts` |
| Create | `src/app/core/favorites.service.ts` |
| Create | `src/app/core/favorites.service.spec.ts` |
| Create | `src/app/shared/favorite-toggle/favorite-toggle.component.ts` |
| Create | `src/app/shared/favorite-toggle/favorite-toggle.component.spec.ts` |
| Create | `src/app/pages/my-favorites/my-favorites.component.ts` |
| Create | `src/app/pages/my-favorites/my-favorites.component.html` |
| Create | `src/app/pages/my-favorites/favorites-avatar-row.component.ts` |
| Create | `src/app/pages/my-favorites/favorites-feed.component.ts` |
| Create | `src/app/pages/my-favorites/favorites-add-sheet.component.ts` |
| Create | `src/app/pages/my-favorites/push-settings.component.ts` |
| Modify | `src/app/app.routes.ts` |
| Modify | `src/app/app.component.html` |
| Modify | `src/app/pages/group-page/group-page.component.ts` |
| Modify | `src/app/pages/group-page/group-page.component.html` |
| Modify | `src/app/pages/member-page/member-page.component.ts` |
| Modify | `src/app/pages/member-page/member-page.component.html` |
| Modify | `src/app/pages/contributors/contributors.component.html` |

---

### Task 1: Supabase Migration — user_favorites

**Files:**
- Create: `supabase/migrations/055_add_user_favorites.sql`

- [ ] **Step 1: 建立 migration 檔案**

`supabase/migrations/055_add_user_favorites.sql`：

```sql
-- Migration 055: Add user_favorites table for PWA favorites feature

create table if not exists user_favorites (
  user_id      uuid not null references auth.users on delete cascade,
  entity_type  text not null check (entity_type in ('group', 'member')),
  entity_id    uuid not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, entity_type, entity_id)
);

-- RLS: users can only read/write their own favorites
alter table user_favorites enable row level security;

create policy "users can read own favorites"
  on user_favorites for select
  using (auth.uid() = user_id);

create policy "users can insert own favorites"
  on user_favorites for insert
  with check (auth.uid() = user_id);

create policy "users can delete own favorites"
  on user_favorites for delete
  using (auth.uid() = user_id);
```

- [ ] **Step 2: 套用 migration 到 Supabase**

```bash
npx supabase db push
```

Expected：`Applied 1 migration` 或類似成功訊息。

- [ ] **Step 3: 確認 table 存在**

在 Supabase Dashboard > Table Editor 確認 `user_favorites` table 存在，或：

```bash
npx supabase db diff
```

Expected：無 pending migration。

---

### Task 2: 新增 Models

**Files:**
- Modify: `src/app/models/index.ts`

- [ ] **Step 1: 在 models/index.ts 末尾加入新 interface**

在檔案最後加入：

```typescript
export type FavoriteEntityType = 'group' | 'member';

export interface UserFavorite {
  user_id: string;
  entity_type: FavoriteEntityType;
  entity_id: string;
  created_at: string;
}

export interface FeedItem {
  id: string;
  entity_type: FavoriteEntityType;
  entity_id: string;
  entity_name: string;
  event_type: 'event' | 'song' | 'member_change';
  title: string;
  occurred_at: string;
  url?: string;
}
```

---

### Task 3: FavoritesService — 測試先行

**Files:**
- Create: `src/app/core/favorites.service.ts`
- Create: `src/app/core/favorites.service.spec.ts`

- [ ] **Step 1: 先寫 spec 檔案**

`src/app/core/favorites.service.spec.ts`：

```typescript
import { TestBed } from '@angular/core/testing';
import { FavoritesService } from './favorites.service';
import { SupabaseService } from './supabase.service';

const makeDb = (overrides: Partial<ReturnType<typeof makeDb>> = {}) => {
  const base = {
    from: jasmine.createSpy('from').and.callFake((table: string) => ({
      select: jasmine.createSpy('select').and.returnValue({
        eq: jasmine.createSpy('eq').and.returnValue(
          Promise.resolve({ data: [], error: null })
        ),
      }),
      insert: jasmine.createSpy('insert').and.returnValue(
        Promise.resolve({ error: null })
      ),
      delete: jasmine.createSpy('delete').and.returnValue({
        eq: jasmine.createSpy('eq').and.callFake(() => ({
          eq: jasmine.createSpy('eq2').and.callFake(() => ({
            eq: jasmine.createSpy('eq3').and.returnValue(
              Promise.resolve({ error: null })
            ),
          })),
        })),
      }),
    })),
  };
  return { ...base, ...overrides };
};

describe('FavoritesService', () => {
  let service: FavoritesService;
  let mockDb: ReturnType<typeof makeDb>;

  beforeEach(() => {
    mockDb = makeDb();
    TestBed.configureTestingModule({
      providers: [
        FavoritesService,
        {
          provide: SupabaseService,
          useValue: { client: mockDb, getSessionOnce: () => Promise.resolve({ user: { id: 'u-1' } }) },
        },
      ],
    });
    service = TestBed.inject(FavoritesService);
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('isFavorite returns false before loading', () => {
    expect(service.isFavorite('group', 'g-1')).toBeFalse();
  });

  it('isFavorite returns true after add', async () => {
    await service.add('group', 'g-1');
    expect(service.isFavorite('group', 'g-1')).toBeTrue();
  });

  it('isFavorite returns false after remove', async () => {
    await service.add('group', 'g-1');
    await service.remove('group', 'g-1');
    expect(service.isFavorite('group', 'g-1')).toBeFalse();
  });

  it('favoriteIds returns ids for given entity_type', async () => {
    await service.add('group', 'g-1');
    await service.add('group', 'g-2');
    await service.add('member', 'm-1');
    expect(service.favoriteIds('group')).toEqual(['g-1', 'g-2']);
    expect(service.favoriteIds('member')).toEqual(['m-1']);
  });
});
```

- [ ] **Step 2: 執行測試確認 FAIL（service 尚不存在）**

```bash
npm test -- --include="**/favorites.service.spec.ts" 2>&1 | tail -20
```

Expected：`Cannot find module './favorites.service'` 或類似錯誤。

- [ ] **Step 3: 實作 FavoritesService**

`src/app/core/favorites.service.ts`：

```typescript
import { Injectable, signal, computed } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { FavoriteEntityType, UserFavorite } from '../models';

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly _favorites = signal<UserFavorite[]>([]);
  private _userId: string | null = null;
  private _loaded = false;

  private get db() { return this.supabase.client; }

  constructor(private supabase: SupabaseService) {}

  /** Call once after login to populate the Signal. */
  async load(userId: string): Promise<void> {
    if (this._loaded && this._userId === userId) return;
    this._userId = userId;
    const { data, error } = await this.db
      .from('user_favorites')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    this._favorites.set(data ?? []);
    this._loaded = true;
  }

  isFavorite(type: FavoriteEntityType, entityId: string): boolean {
    return this._favorites().some(
      f => f.entity_type === type && f.entity_id === entityId
    );
  }

  favoriteIds(type: FavoriteEntityType): string[] {
    return this._favorites()
      .filter(f => f.entity_type === type)
      .map(f => f.entity_id);
  }

  favorites(type?: FavoriteEntityType): UserFavorite[] {
    const all = this._favorites();
    return type ? all.filter(f => f.entity_type === type) : all;
  }

  async add(type: FavoriteEntityType, entityId: string): Promise<void> {
    if (!this._userId) return;
    const entry: UserFavorite = {
      user_id: this._userId,
      entity_type: type,
      entity_id: entityId,
      created_at: new Date().toISOString(),
    };
    // Optimistic update
    this._favorites.update(favs => [...favs, entry]);
    const { error } = await this.db.from('user_favorites').insert({
      user_id: this._userId,
      entity_type: type,
      entity_id: entityId,
    });
    if (error) {
      // Rollback
      this._favorites.update(favs =>
        favs.filter(f => !(f.entity_type === type && f.entity_id === entityId))
      );
      throw error;
    }
  }

  async remove(type: FavoriteEntityType, entityId: string): Promise<void> {
    if (!this._userId) return;
    const prev = this._favorites();
    // Optimistic update
    this._favorites.update(favs =>
      favs.filter(f => !(f.entity_type === type && f.entity_id === entityId))
    );
    const { error } = await this.db
      .from('user_favorites')
      .delete()
      .eq('user_id', this._userId)
      .eq('entity_type', type)
      .eq('entity_id', entityId);
    if (error) {
      // Rollback
      this._favorites.set(prev);
      throw error;
    }
  }

  reset(): void {
    this._favorites.set([]);
    this._userId = null;
    this._loaded = false;
  }
}
```

- [ ] **Step 4: 執行測試確認 PASS**

```bash
npm test -- --include="**/favorites.service.spec.ts" 2>&1 | tail -20
```

Expected：`4 specs, 0 failures`

- [ ] **Step 5: 在 app.component.ts 登入後自動 load favorites**

在 `src/app/app.component.ts` 中找到處理 session 變化的地方（`authState$` 訂閱），在 session 存在時呼叫 `favoritesService.load(session.user.id)`：

```typescript
// 在 import 區加入
import { FavoritesService } from './core/favorites.service';

// 在 scheduleAuthChromeLoad 或 auth 初始化處，加入：
// （在 session 變化的訂閱裡）
if (session) {
  inject(FavoritesService).load(session.user.id).catch(() => {});
} else {
  inject(FavoritesService).reset();
}
```

> **注意**：`app.component.ts` 使用 lazy-loaded auth（`scheduleAuthChromeLoad`）。找到 `authState$` 的訂閱位置（在 auth chrome 載入後），在 `_authState.next(session)` 發射前或後加入 favorites load。若找不到合適位置，在 `FavoritesService` 加 `loadFromSession()` 讓頁面各自 call 也可。

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/055_add_user_favorites.sql \
        src/app/models/index.ts \
        src/app/core/favorites.service.ts \
        src/app/core/favorites.service.spec.ts
git commit -m "feat(favorites): add user_favorites migration and FavoritesService"
```

---

### Task 4: FavoriteToggleComponent — 測試先行

**Files:**
- Create: `src/app/shared/favorite-toggle/favorite-toggle.component.ts`
- Create: `src/app/shared/favorite-toggle/favorite-toggle.component.spec.ts`

- [ ] **Step 1: 寫測試**

`src/app/shared/favorite-toggle/favorite-toggle.component.spec.ts`：

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FavoriteToggleComponent } from './favorite-toggle.component';
import { FavoritesService } from '../../core/favorites.service';

const mockFavService = {
  isFavorite: jasmine.createSpy('isFavorite').and.returnValue(false),
  add: jasmine.createSpy('add').and.returnValue(Promise.resolve()),
  remove: jasmine.createSpy('remove').and.returnValue(Promise.resolve()),
};

describe('FavoriteToggleComponent', () => {
  let fixture: ComponentFixture<FavoriteToggleComponent>;
  let comp: FavoriteToggleComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FavoriteToggleComponent],
      providers: [{ provide: FavoritesService, useValue: mockFavService }],
    }).compileComponents();
    fixture = TestBed.createComponent(FavoriteToggleComponent);
    comp = fixture.componentInstance;
    comp.entityType = 'group';
    comp.entityId = 'g-1';
    fixture.detectChanges();
  });

  it('should create', () => expect(comp).toBeTruthy());

  it('shows empty heart when not favorite', () => {
    mockFavService.isFavorite.and.returnValue(false);
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('button');
    expect(btn.getAttribute('aria-label')).toBe('加入最愛');
  });

  it('calls add when clicked and not favorite', async () => {
    mockFavService.isFavorite.and.returnValue(false);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click();
    expect(mockFavService.add).toHaveBeenCalledWith('group', 'g-1');
  });

  it('calls remove when clicked and already favorite', async () => {
    mockFavService.isFavorite.and.returnValue(true);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('button').click();
    expect(mockFavService.remove).toHaveBeenCalledWith('group', 'g-1');
  });
});
```

- [ ] **Step 2: 執行確認 FAIL**

```bash
npm test -- --include="**/favorite-toggle.component.spec.ts" 2>&1 | tail -10
```

- [ ] **Step 3: 實作 FavoriteToggleComponent**

`src/app/shared/favorite-toggle/favorite-toggle.component.ts`：

```typescript
import { Component, Input, inject, signal } from '@angular/core';
import { FavoritesService } from '../../core/favorites.service';
import { FavoriteEntityType } from '../../models';

@Component({
  selector: 'app-favorite-toggle',
  standalone: true,
  template: `
    <button
      (click)="toggle()"
      [attr.aria-label]="isFav() ? '取消最愛' : '加入最愛'"
      [class.is-fav]="isFav()"
      [disabled]="loading()"
      style="
        width: 38px; height: 38px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 1.2rem; cursor: pointer;
        border: 1.5px solid rgba(232,121,160,0.3);
        background: rgba(255,255,255,0.7);
        transition: all 0.2s;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
      "
      [style.color]="isFav() ? 'rgba(232,121,160,1)' : 'rgba(232,121,160,0.4)'"
      [style.background]="isFav() ? 'rgba(232,121,160,0.12)' : 'rgba(255,255,255,0.7)'"
      [style.border-color]="isFav() ? 'rgba(232,121,160,0.5)' : 'rgba(232,121,160,0.3)'"
      [style.box-shadow]="isFav() ? '0 2px 8px rgba(232,121,160,0.25)' : 'none'"
    >
      {{ isFav() ? '♥' : '♡' }}
    </button>
  `,
})
export class FavoriteToggleComponent {
  @Input({ required: true }) entityType!: FavoriteEntityType;
  @Input({ required: true }) entityId!: string;

  private favService = inject(FavoritesService);
  readonly loading = signal(false);

  isFav(): boolean {
    return this.favService.isFavorite(this.entityType, this.entityId);
  }

  async toggle(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    try {
      if (this.isFav()) {
        await this.favService.remove(this.entityType, this.entityId);
      } else {
        await this.favService.add(this.entityType, this.entityId);
      }
    } finally {
      this.loading.set(false);
    }
  }
}
```

- [ ] **Step 4: 執行確認 PASS**

```bash
npm test -- --include="**/favorite-toggle.component.spec.ts" 2>&1 | tail -10
```

Expected：`4 specs, 0 failures`

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/favorite-toggle/
git commit -m "feat(favorites): add FavoriteToggleComponent with heart button"
```

---

### Task 5: 建立 /my-favorites 頁面骨架

**Files:**
- Create: `src/app/pages/my-favorites/my-favorites.component.ts`
- Create: `src/app/pages/my-favorites/my-favorites.component.html`
- Modify: `src/app/app.routes.ts`

- [ ] **Step 1: 建立 my-favorites.component.ts**

`src/app/pages/my-favorites/my-favorites.component.ts`：

```typescript
import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FavoritesService } from '../../core/favorites.service';
import { SupabaseService } from '../../core/supabase.service';
import { FavoritesAvatarRowComponent } from './favorites-avatar-row.component';
import { FavoritesFeedComponent } from './favorites-feed.component';
import { FavoritesAddSheetComponent } from './favorites-add-sheet.component';
import { PushSettingsComponent } from './push-settings.component';

export type FavoritesTab = 'all' | 'group' | 'member' | 'push';

@Component({
  selector: 'app-my-favorites',
  standalone: true,
  imports: [
    CommonModule,
    FavoritesAvatarRowComponent,
    FavoritesFeedComponent,
    FavoritesAddSheetComponent,
    PushSettingsComponent,
  ],
  templateUrl: './my-favorites.component.html',
})
export class MyFavoritesComponent implements OnInit {
  private favService = inject(FavoritesService);
  private supabase = inject(SupabaseService);

  readonly activeTab = signal<FavoritesTab>('all');
  readonly showAddSheet = signal(false);
  displayName = '';

  async ngOnInit(): Promise<void> {
    const session = await this.supabase.getSessionOnce();
    if (session) {
      this.displayName = session.user.user_metadata?.['display_name'] ?? '';
      await this.favService.load(session.user.id);
    }
  }

  setTab(tab: FavoritesTab): void {
    this.activeTab.set(tab);
  }

  openAddSheet(): void {
    this.showAddSheet.set(true);
  }

  closeAddSheet(): void {
    this.showAddSheet.set(false);
  }
}
```

- [ ] **Step 2: 建立 my-favorites.component.html**

`src/app/pages/my-favorites/my-favorites.component.html`：

```html
<div style="max-width:680px;margin:0 auto;padding:0 0 80px;">

  <!-- Header -->
  <div style="padding:20px 20px 0;border-bottom:1px solid rgba(232,121,160,0.15);">
    <div style="font-size:0.58rem;letter-spacing:0.2em;text-transform:uppercase;color:var(--text-label);margin-bottom:3px;">
      MY FAVORITES · 我的最愛
    </div>
    @if (displayName) {
      <div style="font-size:1rem;font-weight:700;color:var(--text-primary);margin-bottom:12px;">
        Hi, {{ displayName }} ♥
      </div>
    }

    <!-- Tab bar -->
    <div style="display:flex;gap:0;overflow-x:auto;">
      @for (tab of [
        {id:'all', label:'全部'},
        {id:'group', label:'團體'},
        {id:'member', label:'成員'},
        {id:'push', label:'通知設定'}
      ]; track tab.id) {
        <button
          (click)="setTab(tab.id)"
          [style.color]="activeTab() === tab.id ? 'rgba(232,121,160,1)' : 'var(--text-faint-55)'"
          [style.border-bottom]="activeTab() === tab.id ? '2px solid rgba(232,121,160,1)' : '2px solid transparent'"
          style="
            padding:6px 14px 10px;
            font-size:0.62rem;
            background:transparent;
            border:none;
            border-radius:0;
            cursor:pointer;
            white-space:nowrap;
            font-family:var(--font-sans);
            letter-spacing:0.04em;
            font-weight:600;
          "
        >{{ tab.label }}</button>
      }
    </div>
  </div>

  <!-- Tab content -->
  @if (activeTab() !== 'push') {
    <app-favorites-avatar-row
      [filter]="activeTab() === 'all' ? undefined : activeTab()"
      (addClicked)="openAddSheet()"
    />
    <app-favorites-feed [filter]="activeTab() === 'all' ? undefined : activeTab()" />
  } @else {
    <app-push-settings />
  }

</div>

<!-- Bottom sheet -->
@if (showAddSheet()) {
  <app-favorites-add-sheet (close)="closeAddSheet()" />
}
```

- [ ] **Step 3: 加入路由（需要 authGuard）**

在 `src/app/app.routes.ts` 找到 `my-contributions` 那段，在它上面加入：

```typescript
{
  path: 'my-favorites',
  canActivate: [lazyGuard(() => import('./core/auth.guard').then(m => m.authGuard))],
  loadComponent: () =>
    import('./pages/my-favorites/my-favorites.component').then(m => m.MyFavoritesComponent),
},
```

- [ ] **Step 4: 確認路由可存取（登入後導到 /my-favorites 不報錯）**

```bash
npm start
```

瀏覽器開 http://localhost:4200/my-favorites（需已登入）。

---

### Task 6: FavoritesAvatarRowComponent

**Files:**
- Create: `src/app/pages/my-favorites/favorites-avatar-row.component.ts`

- [ ] **Step 1: 實作**

`src/app/pages/my-favorites/favorites-avatar-row.component.ts`：

```typescript
import { Component, Input, Output, EventEmitter, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FavoritesService } from '../../core/favorites.service';
import { GroupService } from '../../core/group.service';
import { MemberService } from '../../core/member.service';
import { FavoriteEntityType } from '../../models';

@Component({
  selector: 'app-favorites-avatar-row',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div style="padding:12px 20px 8px;border-bottom:1px solid rgba(232,121,160,0.08);">
      <div style="font-size:0.55rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--text-faint-40);margin-bottom:10px;">
        已追蹤
      </div>
      <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px;">

        @for (item of displayItems(); track item.id) {
          <a [routerLink]="item.link" style="display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;text-decoration:none;">
            <div [style.background]="item.isGroup
                ? 'linear-gradient(135deg,rgba(232,121,160,0.35),rgba(192,80,128,0.45))'
                : 'linear-gradient(135deg,rgba(134,239,172,0.35),rgba(74,222,128,0.5))'"
              [style.border-color]="item.isGroup ? 'rgba(232,121,160,0.5)' : 'rgba(134,239,172,0.55)'"
              style="
                width:44px;height:44px;border-radius:50%;
                border:2px solid;
                display:flex;align-items:center;justify-content:center;
                font-size:0.6rem;font-weight:600;color:white;
                overflow:hidden;
              "
            >
              @if (item.photoUrl) {
                <img [src]="item.photoUrl" [alt]="item.name" style="width:100%;height:100%;object-fit:cover;">
              } @else {
                {{ item.initials }}
              }
            </div>
            <span style="font-size:0.52rem;color:var(--text-faint-55);max-width:48px;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              {{ item.name }}
            </span>
          </a>
        }

        <!-- Add button -->
        <button (click)="addClicked.emit()" style="
          display:flex;flex-direction:column;align-items:center;gap:4px;flex-shrink:0;
          background:transparent;border:none;cursor:pointer;padding:0;
        ">
          <div style="
            width:44px;height:44px;border-radius:50%;
            border:1.5px dashed rgba(232,121,160,0.4);
            display:flex;align-items:center;justify-content:center;
            font-size:1.1rem;color:rgba(232,121,160,0.5);
          ">+</div>
          <span style="font-size:0.52rem;color:rgba(232,121,160,0.5);">新增</span>
        </button>

      </div>
    </div>
  `,
})
export class FavoritesAvatarRowComponent {
  @Input() filter?: string;
  @Output() addClicked = new EventEmitter<void>();

  private favService = inject(FavoritesService);
  private groupService = inject(GroupService);
  private memberService = inject(MemberService);

  private _groupCache = new Map<string, { name: string; photo_url: string | null }>();
  private _memberCache = new Map<string, { name: string; photo_url: string | null }>();

  // Synchronous computed view from Signal
  displayItems = computed(() => {
    const favs = this.favService.favorites(
      this.filter === 'group' ? 'group'
      : this.filter === 'member' ? 'member'
      : undefined
    );
    return favs.map(f => ({
      id: f.entity_id,
      isGroup: f.entity_type === 'group',
      name: this._nameFor(f.entity_type, f.entity_id),
      initials: this._initialsFor(f.entity_type, f.entity_id),
      photoUrl: this._photoFor(f.entity_type, f.entity_id),
      link: f.entity_type === 'group' ? `/group/${f.entity_id}` : `/member/${f.entity_id}`,
    }));
  });

  private _nameFor(type: FavoriteEntityType, id: string): string {
    if (type === 'group') return this._groupCache.get(id)?.name ?? id.slice(0, 4);
    return this._memberCache.get(id)?.name ?? id.slice(0, 4);
  }

  private _initialsFor(type: FavoriteEntityType, id: string): string {
    const name = this._nameFor(type, id);
    return name.slice(0, 2).toUpperCase();
  }

  private _photoFor(type: FavoriteEntityType, id: string): string | null {
    if (type === 'group') return this._groupCache.get(id)?.photo_url ?? null;
    return this._memberCache.get(id)?.photo_url ?? null;
  }

  /** Called by parent after groups/members are loaded */
  async loadDetails(groupIds: string[], memberIds: string[]): Promise<void> {
    const [groups, members] = await Promise.all([
      groupIds.length ? this.groupService.getAll() : Promise.resolve([]),
      memberIds.length ? this.memberService.getAll() : Promise.resolve([]),
    ]);
    groups.forEach(g => this._groupCache.set(g.id, { name: g.name, photo_url: g.photo_url }));
    members.forEach(m => this._memberCache.set(m.id, { name: m.name, photo_url: m.photo_url }));
  }
}
```

> **注意**：`FavoritesAvatarRowComponent` 依賴快取 Map 來顯示名稱。在 `MyFavoritesComponent.ngOnInit()` 中，favorites load 完之後呼叫 `avatarRowRef.loadDetails(groupIds, memberIds)` 來填充快取（可用 `@ViewChild`）。若實作複雜，也可改成在 service 內 join 資料。

---

### Task 7: FavoritesFeedComponent

**Files:**
- Create: `src/app/pages/my-favorites/favorites-feed.component.ts`

- [ ] **Step 1: 實作**

`src/app/pages/my-favorites/favorites-feed.component.ts`：

```typescript
import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FavoritesService } from '../../core/favorites.service';
import { SupabaseService } from '../../core/supabase.service';

interface FeedEntry {
  id: string;
  eventType: 'event' | 'song' | 'member_change';
  entityName: string;
  title: string;
  occurredAt: string;
  link?: string;
}

@Component({
  selector: 'app-favorites-feed',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div style="padding:10px 20px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
        <div style="font-size:0.55rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--text-faint-40);">最新動態</div>
        @if (newCount() > 0) {
          <span style="font-size:0.52rem;padding:1px 7px;background:rgba(232,121,160,0.12);border:1px solid rgba(232,121,160,0.22);border-radius:10px;color:rgba(232,121,160,1);">
            ● {{ newCount() }} 則新動態
          </span>
        }
      </div>

      @if (loading()) {
        <div style="text-align:center;padding:40px 0;color:var(--text-faint-40);font-size:0.8rem;">載入中…</div>
      } @else if (items().length === 0) {
        <div style="text-align:center;padding:40px 0;color:var(--text-faint-40);font-size:0.8rem;">
          還沒有動態，先追蹤一些團體或成員吧！
        </div>
      } @else {
        @for (item of items(); track item.id) {
          <div style="display:flex;gap:10px;padding:9px 0;border-bottom:1px solid rgba(232,121,160,0.07);align-items:flex-start;">
            <div [style.background]="iconBg(item.eventType)"
                 [style.border]="'1px solid ' + iconBorder(item.eventType)"
                 style="width:28px;height:28px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:0.65rem;">
              {{ iconEmoji(item.eventType) }}
            </div>
            <div style="flex:1;">
              <div style="font-size:0.58rem;font-weight:600;color:rgba(232,121,160,1);margin-bottom:1px;">{{ item.entityName }}</div>
              <div style="font-size:0.63rem;color:var(--text-primary);line-height:1.4;margin-bottom:2px;">{{ item.title }}</div>
              <div style="font-size:0.52rem;color:var(--text-faint-55);">
                {{ formatTime(item.occurredAt) }}
                <span [style.background]="tagBg(item.eventType)"
                      [style.color]="tagColor(item.eventType)"
                      style="margin-left:4px;font-size:0.5rem;padding:0 5px;border-radius:5px;border:1px solid currentColor;">
                  {{ tagLabel(item.eventType) }}
                </span>
              </div>
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class FavoritesFeedComponent implements OnInit {
  @Input() filter?: string;

  private favService = inject(FavoritesService);
  private supabase = inject(SupabaseService);

  readonly loading = signal(true);
  readonly items = signal<FeedEntry[]>([]);
  readonly newCount = signal(0);

  async ngOnInit(): Promise<void> {
    await this.loadFeed();
  }

  private async loadFeed(): Promise<void> {
    this.loading.set(true);
    try {
      const groupIds = this.filter === 'member' ? [] : this.favService.favoriteIds('group');
      const memberIds = this.filter === 'group' ? [] : this.favService.favoriteIds('member');
      const entries: FeedEntry[] = [];

      // Songs from favorite groups
      if (groupIds.length) {
        const { data: songs } = await this.supabase.client
          .from('group_songs')
          .select('id, title, created_at, group:groups(id, name)')
          .in('group_id', groupIds)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false })
          .limit(20);
        (songs ?? []).forEach((s: any) => entries.push({
          id: `song-${s.id}`,
          eventType: 'song',
          entityName: s.group?.name ?? '',
          title: `新增歌曲《${s.title}》`,
          occurredAt: s.created_at,
          link: `/group/${s.group?.id}`,
        }));
      }

      // Songs from favorite members
      if (memberIds.length) {
        const { data: mSongs } = await this.supabase.client
          .from('member_songs')
          .select('id, title, created_at, member:members(id, name)')
          .in('member_id', memberIds)
          .order('created_at', { ascending: false })
          .limit(10);
        (mSongs ?? []).forEach((s: any) => entries.push({
          id: `msong-${s.id}`,
          eventType: 'song',
          entityName: s.member?.name ?? '',
          title: `新增歌曲《${s.title}》`,
          occurredAt: s.created_at,
        }));
      }

      // Member status changes from history
      if (memberIds.length) {
        const { data: hist } = await this.supabase.client
          .from('history')
          .select('id, status, updated_at, member:members(id, name)')
          .in('member_id', memberIds)
          .in('status', ['active', 'graduated', 'withdrawn', 'hiatus'])
          .order('updated_at', { ascending: false })
          .limit(10);
        (hist ?? []).forEach((h: any) => entries.push({
          id: `hist-${h.id}`,
          eventType: 'member_change',
          entityName: h.member?.name ?? '',
          title: this.statusLabel(h.status),
          occurredAt: h.updated_at,
        }));
      }

      // Events from group_events (available after Plan 3)
      if (groupIds.length) {
        const { data: events } = await this.supabase.client
          .from('group_events')
          .select('id, title, starts_at, group_id, groups(name)')
          .in('group_id', groupIds)
          .order('first_seen_at', { ascending: false })
          .limit(20);
        (events ?? []).forEach((e: any) => entries.push({
          id: `evt-${e.id}`,
          eventType: 'event',
          entityName: e.groups?.name ?? '',
          title: e.title,
          occurredAt: e.starts_at,
        }));
      }

      // Sort all entries by occurredAt desc
      entries.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
      this.items.set(entries);
    } catch {
      this.items.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  iconEmoji(type: string): string {
    return type === 'event' ? '📅' : type === 'song' ? '🎵' : '⚡';
  }
  iconBg(type: string): string {
    return type === 'event' ? 'rgba(232,121,160,0.12)'
      : type === 'song' ? 'rgba(147,197,253,0.15)'
      : 'rgba(192,132,252,0.12)';
  }
  iconBorder(type: string): string {
    return type === 'event' ? 'rgba(232,121,160,0.25)'
      : type === 'song' ? 'rgba(147,197,253,0.35)'
      : 'rgba(192,132,252,0.3)';
  }
  tagBg(type: string): string { return 'transparent'; }
  tagColor(type: string): string {
    return type === 'event' ? 'rgba(232,121,160,0.8)'
      : type === 'song' ? '#3b82f6'
      : '#7c3aed';
  }
  tagLabel(type: string): string {
    return type === 'event' ? '活動' : type === 'song' ? '新歌' : '異動';
  }
  formatTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return '剛才';
    if (h < 24) return `${h} 小時前`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d} 天前`;
    return new Date(iso).toLocaleDateString('zh-TW');
  }
  private statusLabel(status: string): string {
    const map: Record<string, string> = {
      graduated: '畢業', withdrawn: '退出', hiatus: '休息', active: '復歸'
    };
    return `成員狀態更新：${map[status] ?? status}`;
  }
}
```

> **注意**：`group_events` table 在 Plan 3 才建立。這裡的 `.from('group_events')` query 會 silent fail（table 不存在 → error → `events = []`），不影響其他資料。Plan 3 完成後自動開始顯示活動資料。

---

### Task 8: FavoritesAddSheetComponent（Bottom Sheet）

**Files:**
- Create: `src/app/pages/my-favorites/favorites-add-sheet.component.ts`

- [ ] **Step 1: 實作**

`src/app/pages/my-favorites/favorites-add-sheet.component.ts`：

```typescript
import { Component, Output, EventEmitter, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FavoritesService } from '../../core/favorites.service';
import { GroupService } from '../../core/group.service';
import { MemberService } from '../../core/member.service';
import { Group, Member } from '../../models';

type SheetTab = 'group' | 'member';

@Component({
  selector: 'app-favorites-add-sheet',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- Overlay -->
    <div (click)="close.emit()" style="
      position:fixed;inset:0;background:rgba(0,0,0,0.3);z-index:1100;
      backdrop-filter:blur(2px);animation:fadeIn 0.2s;
    "></div>

    <!-- Sheet -->
    <div style="
      position:fixed;bottom:0;left:0;right:0;z-index:1200;
      background:var(--surface, #fff);border-radius:20px 20px 0 0;
      max-height:80vh;display:flex;flex-direction:column;
      box-shadow:0 -4px 30px rgba(45,27,46,0.15);
      animation:slideUp 0.25s ease-out;
    ">
      <!-- Handle -->
      <div style="display:flex;justify-content:center;padding:10px 0 4px;">
        <div style="width:36px;height:4px;border-radius:2px;background:rgba(45,27,46,0.15);"></div>
      </div>

      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 20px 0;">
        <div style="font-size:0.9rem;font-weight:700;color:var(--text-primary);">新增最愛</div>
        <button (click)="close.emit()" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--text-faint-55);">✕</button>
      </div>

      <!-- Tab bar -->
      <div style="display:flex;border-bottom:1px solid rgba(232,121,160,0.15);padding:0 20px;">
        <button (click)="tab.set('group')"
          [style.color]="tab() === 'group' ? 'rgba(232,121,160,1)' : 'var(--text-faint-55)'"
          [style.border-bottom]="tab() === 'group' ? '2px solid rgba(232,121,160,1)' : '2px solid transparent'"
          style="padding:6px 14px 10px;background:none;border:none;cursor:pointer;font-size:0.62rem;font-weight:600;font-family:var(--font-sans);"
        >團體</button>
        <button (click)="tab.set('member')"
          [style.color]="tab() === 'member' ? 'rgba(232,121,160,1)' : 'var(--text-faint-55)'"
          [style.border-bottom]="tab() === 'member' ? '2px solid rgba(232,121,160,1)' : '2px solid transparent'"
          style="padding:6px 14px 10px;background:none;border:none;cursor:pointer;font-size:0.62rem;font-weight:600;font-family:var(--font-sans);"
        >成員</button>
      </div>

      <!-- Search -->
      <div style="padding:10px 20px 6px;">
        <input [(ngModel)]="query" [placeholder]="tab() === 'group' ? '搜尋團體名稱…' : '搜尋成員名稱…'"
          style="
            width:100%;box-sizing:border-box;
            padding:7px 12px;border-radius:10px;
            border:1px solid rgba(232,121,160,0.22);
            background:rgba(232,121,160,0.05);
            font-size:0.65rem;font-family:var(--font-sans);
            outline:none;color:var(--text-primary);
          ">
      </div>

      <!-- List -->
      <div style="overflow-y:auto;flex:1;padding:0 20px 20px;">
        @if (loading()) {
          <div style="text-align:center;padding:30px 0;color:var(--text-faint-40);font-size:0.8rem;">載入中…</div>
        }

        @if (tab() === 'group') {
          @for (g of filteredGroups(); track g.id) {
            <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(232,121,160,0.07);">
              <div style="
                width:36px;height:36px;border-radius:50%;flex-shrink:0;
                background:linear-gradient(135deg,rgba(232,121,160,0.4),rgba(192,80,128,0.55));
                border:1.5px solid rgba(232,121,160,0.4);
                display:flex;align-items:center;justify-content:center;
                font-size:0.55rem;font-weight:600;color:white;overflow:hidden;
              ">
                @if (g.photo_url) {
                  <img [src]="g.photo_url" [alt]="g.name" style="width:100%;height:100%;object-fit:cover;">
                } @else {
                  {{ g.name.slice(0,2) }}
                }
              </div>
              <div style="flex:1;">
                <div style="font-size:0.65rem;font-weight:600;color:var(--text-primary);">{{ g.name }}</div>
                <div style="font-size:0.54rem;color:var(--text-faint-55);">{{ g.company ?? '' }}</div>
              </div>
              <button (click)="toggleGroup(g)"
                style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid rgba(232,121,160,0.3);background:transparent;font-size:0.85rem;"
                [style.background]="isFav('group', g.id) ? 'rgba(232,121,160,0.12)' : 'transparent'"
              >{{ isFav('group', g.id) ? '♥' : '♡' }}</button>
            </div>
          }
        }

        @if (tab() === 'member') {
          @for (m of filteredMembers(); track m.id) {
            <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(232,121,160,0.07);">
              <div style="
                width:36px;height:36px;border-radius:50%;flex-shrink:0;
                background:linear-gradient(135deg,rgba(134,239,172,0.4),rgba(74,222,128,0.55));
                border:1.5px solid rgba(134,239,172,0.4);
                display:flex;align-items:center;justify-content:center;
                font-size:0.55rem;font-weight:600;color:white;overflow:hidden;
              ">
                @if (m.photo_url) {
                  <img [src]="m.photo_url" [alt]="m.name" style="width:100%;height:100%;object-fit:cover;">
                } @else {
                  {{ m.name.slice(0,2) }}
                }
              </div>
              <div style="flex:1;">
                <div style="font-size:0.65rem;font-weight:600;color:var(--text-primary);">{{ m.name }}</div>
                <div style="font-size:0.54rem;color:var(--text-faint-55);">{{ m.name_roman ?? '' }}</div>
              </div>
              <button (click)="toggleMember(m)"
                style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;border:1px solid rgba(134,239,172,0.3);background:transparent;font-size:0.85rem;"
                [style.background]="isFav('member', m.id) ? 'rgba(134,239,172,0.12)' : 'transparent'"
              >{{ isFav('member', m.id) ? '♥' : '♡' }}</button>
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
    @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
  `],
})
export class FavoritesAddSheetComponent implements OnInit {
  @Output() close = new EventEmitter<void>();

  private favService = inject(FavoritesService);
  private groupService = inject(GroupService);
  private memberService = inject(MemberService);

  readonly tab = signal<SheetTab>('group');
  readonly loading = signal(true);
  query = '';

  private allGroups: Group[] = [];
  private allMembers: Member[] = [];

  async ngOnInit(): Promise<void> {
    const [groups, members] = await Promise.all([
      this.groupService.getAll(),
      this.memberService.getAll(),
    ]);
    this.allGroups = groups;
    this.allMembers = members;
    this.loading.set(false);
  }

  filteredGroups(): Group[] {
    const q = this.query.toLowerCase();
    return q ? this.allGroups.filter(g => g.name.toLowerCase().includes(q)) : this.allGroups;
  }

  filteredMembers(): Member[] {
    const q = this.query.toLowerCase();
    return q ? this.allMembers.filter(m => m.name.toLowerCase().includes(q) || (m.name_roman ?? '').toLowerCase().includes(q)) : this.allMembers;
  }

  isFav(type: 'group' | 'member', id: string): boolean {
    return this.favService.isFavorite(type, id);
  }

  async toggleGroup(g: Group): Promise<void> {
    this.isFav('group', g.id)
      ? await this.favService.remove('group', g.id)
      : await this.favService.add('group', g.id);
  }

  async toggleMember(m: Member): Promise<void> {
    this.isFav('member', m.id)
      ? await this.favService.remove('member', m.id)
      : await this.favService.add('member', m.id);
  }
}
```

---

### Task 9: PushSettingsComponent（MVP placeholder）

**Files:**
- Create: `src/app/pages/my-favorites/push-settings.component.ts`

- [ ] **Step 1: 實作 MVP 版本（全域開關 + iOS 提示）**

`src/app/pages/my-favorites/push-settings.component.ts`：

```typescript
import { Component, signal, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-push-settings',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div style="padding:20px;max-width:480px;">
      <div style="font-size:0.55rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--text-faint-40);margin-bottom:16px;">推播通知設定</div>

      <!-- Push not supported -->
      @if (!pushSupported()) {
        <div style="padding:16px;background:rgba(253,224,71,0.1);border:1px solid rgba(253,224,71,0.5);border-radius:12px;font-size:0.72rem;color:var(--text-primary);line-height:1.6;">
          ⚠️ 你的瀏覽器不支援推播通知。<br>
          iOS 用戶請先<strong>「加入主畫面」</strong>後再開啟通知（需 iOS 16.4+）。
        </div>
      }

      <!-- Push supported but not yet implemented (Plan 3 placeholder) -->
      @if (pushSupported()) {
        <div style="padding:16px;background:rgba(232,121,160,0.06);border:1px solid rgba(232,121,160,0.2);border-radius:12px;font-size:0.72rem;color:var(--text-primary);line-height:1.6;">
          🔔 推播通知功能即將推出，敬請期待！<br>
          <span style="color:var(--text-faint-55);font-size:0.65rem;">（本功能將在下個版本上線）</span>
        </div>
      }

      <!-- iOS instruction -->
      <div style="margin-top:16px;padding:12px 14px;background:rgba(147,197,253,0.08);border:1px solid rgba(147,197,253,0.25);border-radius:10px;font-size:0.65rem;color:var(--text-faint-75);line-height:1.7;">
        📱 <strong>iOS 推播通知說明</strong><br>
        1. 在 Safari 開啟本網站<br>
        2. 點「分享」→「加入主畫面」<br>
        3. 從主畫面開啟後，即可在此啟用推播
      </div>
    </div>
  `,
})
export class PushSettingsComponent {
  private platformId = inject(PLATFORM_ID);

  pushSupported(): boolean {
    return isPlatformBrowser(this.platformId)
      && 'PushManager' in window
      && 'serviceWorker' in navigator;
  }
}
```

> 此元件在 Plan 3 實作推播後，會替換成真實的訂閱流程。

---

### Task 10: 加入愛心按鈕到 GroupPage 和 MemberPage

**Files:**
- Modify: `src/app/pages/group-page/group-page.component.ts`
- Modify: `src/app/pages/group-page/group-page.component.html`
- Modify: `src/app/pages/member-page/member-page.component.ts`
- Modify: `src/app/pages/member-page/member-page.component.html`

- [ ] **Step 1: 在 group-page.component.ts 加入 FavoriteToggle import**

在 `imports` 陣列中加入 `FavoriteToggleComponent`：

```typescript
import { FavoriteToggleComponent } from '../../shared/favorite-toggle/favorite-toggle.component';

// 在 @Component imports 陣列加入：
// FavoriteToggleComponent,
```

- [ ] **Step 2: 在 group-page.component.html 的 hero 區加入愛心**

找到 group name 顯示的 hero 區塊（搜尋 `group.name` 或 `photo_url`），在頁面頂部標題旁加入：

```html
@if (session) {
  <app-favorite-toggle
    entityType="group"
    [entityId]="group.id"
    style="flex-shrink:0;"
  />
}
```

放在 group name 和頭像同一列的右側。需要先確認 `session` 是否已在 component 中取得；若無，加入：

```typescript
session: Session | null = null;

async ngOnInit() {
  this.session = await this.supabase.getSessionOnce();
  // ... 原有邏輯
}
```

- [ ] **Step 3: 對 member-page 做同樣的修改**

步驟同上，`entityType="member"`，`entityId="member.id"`。

- [ ] **Step 4: 開瀏覽器確認愛心出現在 group/member 頁面右上角（登入狀態）**

```bash
npm start
```

導到任意 group 頁面，確認右上角有愛心按鈕，點擊後變實心，重整後仍保持狀態。

---

### Task 11: 導覽調整

**Files:**
- Modify: `src/app/app.component.html`
- Modify: `src/app/pages/contributors/contributors.component.html`

- [ ] **Step 1: 將已登入 user pill 的連結從 /my-contributions 改為 /my-favorites**

在 `src/app/app.component.html` 找到：

```html
<a routerLink="/my-contributions"
```

改為：

```html
<a routerLink="/my-favorites"
```

- [ ] **Step 2: 在 contributors 頁面加入「我的貢獻」連結**

在 `src/app/pages/contributors/contributors.component.html` 找到適當位置（建議頁面底部），加入：

```html
<div style="text-align:center;margin-top:32px;padding-top:16px;border-top:1px solid rgba(232,121,160,0.12);">
  <a routerLink="/my-contributions"
    style="font-size:0.72rem;color:var(--text-faint-55);text-decoration:none;letter-spacing:0.04em;">
    查看我的貢獻紀錄 →
  </a>
</div>
```

---

### Task 12: Commit

- [ ] **Step 1: 加入所有變更**

```bash
git add src/app/pages/my-favorites/ \
        src/app/core/favorites.service.ts \
        src/app/core/favorites.service.spec.ts \
        src/app/shared/favorite-toggle/ \
        src/app/app.routes.ts \
        src/app/app.component.html \
        src/app/pages/group-page/group-page.component.ts \
        src/app/pages/group-page/group-page.component.html \
        src/app/pages/member-page/member-page.component.ts \
        src/app/pages/member-page/member-page.component.html \
        src/app/pages/contributors/contributors.component.html \
        src/app/models/index.ts
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat(favorites): add my-favorites page, favorite-toggle, and navigation updates"
```

---

## 驗證清單

- [ ] 登入後左下角 pill 連結到 `/my-favorites`
- [ ] `/my-favorites` 需登入，未登入導向 `/login?returnUrl=/my-favorites`
- [ ] 我的最愛頁面：tab 切換正常，頭像列顯示追蹤的團體/成員
- [ ] 點「+」開啟 bottom sheet，搜尋可 filter，愛心可切換
- [ ] Group/Member 頁面（登入後）右上角有愛心按鈕，狀態同步
- [ ] Contributors 頁面底部有「查看我的貢獻紀錄」連結
- [ ] `ng test` 無新增 failure

---

**下一步：** Plan 3 — 活動同步 + 推播通知
