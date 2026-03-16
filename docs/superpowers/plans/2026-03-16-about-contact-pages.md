# About & Contact Pages Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/about` and `/contact` public pages, a Supabase-backed `team_members` table, and an `/admin/team` management page editable by editor/admin roles.

**Architecture:** 8 self-contained tasks — DB migration → model → service → admin component → admin routing/nav → public About page → public Contact page → routing/footer/sitemap. Each task commits independently. No task depends on later tasks.

**Tech Stack:** Angular 17+ standalone components, Supabase JS, Jasmine/Karma tests, existing `SeoService`.

**Spec:** `docs/superpowers/specs/2026-03-16-about-contact-pages-design.md`

---

## Chunk 1: Backend and service layer

### Task 1: DB Migration — create team_members table

**Files:**
- Create: `supabase/migrations/023_create_team_members.sql`

> **Note:** This migration must be run manually in the Supabase SQL Editor after the file is committed. The Angular app will not function for the about page until this migration is applied.

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/023_create_team_members.sql

CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  bio text,
  photo_url text,
  instagram text,
  x text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Public read
CREATE POLICY "team_members_select_public"
  ON team_members FOR SELECT
  USING (true);

-- Authenticated write (editor + admin)
CREATE POLICY "team_members_write_authenticated"
  ON team_members FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Auto-update updated_at
CREATE OR REPLACE TRIGGER team_members_updated_at
  BEFORE UPDATE ON team_members
  FOR EACH ROW EXECUTE PROCEDURE extensions.moddatetime(updated_at);
```

- [ ] **Step 2: Verify file content looks correct**

```bash
cat supabase/migrations/023_create_team_members.sql
```

Expected: file contains CREATE TABLE, ENABLE ROW LEVEL SECURITY, two CREATE POLICY statements, and the trigger.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/023_create_team_members.sql
git commit -m "feat(db): add team_members table migration"
```

---

### Task 2: TypeScript model — add TeamMember interface

**Files:**
- Modify: `src/app/models/index.ts` (append after the `Company` interface, before `SearchResult`)

- [ ] **Step 1: Add TeamMember interface**

Open `src/app/models/index.ts`. After the closing `}` of the `Company` interface (currently around line 89), insert:

```ts
export interface TeamMember {
  id: string;
  name: string;
  bio: string | null;
  photo_url: string | null;
  instagram: string | null;
  x: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Verify the file compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/models/index.ts
git commit -m "feat(models): add TeamMember interface"
```

---

### Task 3: TeamMemberService + unit tests

**Files:**
- Create: `src/app/core/team-member.service.ts`
- Create: `src/app/core/team-member.service.spec.ts`

- [ ] **Step 1: Write the failing test first**

> **Note on pre-existing test failures:** The project has a pre-existing failure in `member.service.spec.ts` (uses a stale `name_jp` field that no longer exists on the `Member` model). This failure is unrelated to this feature. When you run the full test suite, expect to see this pre-existing failure in addition to any new failures from your code.

Create `src/app/core/team-member.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { TeamMemberService } from './team-member.service';
import { SupabaseService } from './supabase.service';
import { TeamMember } from '../models';

const mockMember: TeamMember = {
  id: 'tm-1', name: '小花', bio: '主編', photo_url: null,
  instagram: null, x: null, sort_order: 0,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z'
};

// getAll() calls .order() twice (sort_order then created_at), so the mock
// must chain order → order → Promise to avoid a TypeError.
const mockClient = {
  from: jasmine.createSpy('from').and.returnValue({
    select: jasmine.createSpy('select').and.returnValue({
      order: jasmine.createSpy('order1').and.returnValue({
        order: jasmine.createSpy('order2').and.returnValue(
          Promise.resolve({ data: [mockMember], error: null })
        ),
      }),
    }),
    insert: jasmine.createSpy('insert').and.returnValue(Promise.resolve({ error: null })),
    update: jasmine.createSpy('update').and.returnValue({
      eq: jasmine.createSpy('eq').and.returnValue(Promise.resolve({ error: null }))
    }),
    delete: jasmine.createSpy('delete').and.returnValue({
      eq: jasmine.createSpy('eq').and.returnValue(Promise.resolve({ error: null }))
    }),
  })
};

describe('TeamMemberService', () => {
  let service: TeamMemberService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TeamMemberService,
        { provide: SupabaseService, useValue: { client: mockClient } }
      ]
    });
    service = TestBed.inject(TeamMemberService);
  });

  it('should be created', () => expect(service).toBeTruthy());
  it('getAll() should return members', async () => {
    const members = await service.getAll();
    expect(Array.isArray(members)).toBeTrue();
    expect(members[0].name).toBe('小花');
  });
  it('create() should call insert', async () => {
    await service.create({ name: '新成員' });
    expect(mockClient.from).toHaveBeenCalledWith('team_members');
  });
  it('update() should call update().eq()', async () => {
    await service.update('tm-1', { name: '更新' });
    expect(mockClient.from).toHaveBeenCalledWith('team_members');
  });
  it('delete() should call delete().eq()', async () => {
    await service.delete('tm-1');
    expect(mockClient.from).toHaveBeenCalledWith('team_members');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx ng test --include="**/team-member.service.spec.ts" --watch=false --browsers=ChromeHeadless 2>&1 | tail -20
```

Expected: FAILED — `TeamMemberService` not found.

- [ ] **Step 3: Create the service**

Create `src/app/core/team-member.service.ts`:

```ts
import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { TeamMember } from '../models';

@Injectable({ providedIn: 'root' })
export class TeamMemberService {
  private get db() { return this.supabase.client; }

  constructor(private supabase: SupabaseService) {}

  async getAll(): Promise<TeamMember[]> {
    const { data, error } = await this.db
      .from('team_members')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async create(member: Partial<TeamMember>): Promise<void> {
    const { error } = await this.db.from('team_members').insert(member);
    if (error) throw error;
  }

  async update(id: string, member: Partial<TeamMember>): Promise<void> {
    const { error } = await this.db.from('team_members').update(member).eq('id', id);
    if (error) throw error;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('team_members').delete().eq('id', id);
    if (error) throw error;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx ng test --include="**/team-member.service.spec.ts" --watch=false --browsers=ChromeHeadless 2>&1 | tail -20
```

Expected: 5 specs, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/team-member.service.ts src/app/core/team-member.service.spec.ts
git commit -m "feat(core): add TeamMemberService with unit tests"
```

---

## Chunk 2: Admin UI

### Task 4: AdminTeamComponent — CRUD admin page

**Files:**
- Create: `src/app/pages/admin/admin-team/admin-team.component.ts`
- Create: `src/app/pages/admin/admin-team/admin-team.component.html`

> **Pattern reference:** Follow the structure of `src/app/pages/admin/admin-companies/admin-companies.component.ts/.html` — same `showModal` overlay pattern, same Tailwind classes, same `*ngIf`/`*ngFor` template syntax. Do NOT use `@if`/`@for` in this component.
>
> **Important difference from admin-companies:** Do NOT inject `AdminRoleService` and do NOT add an `OnDestroy` / `Subscription` — this component has no admin-only actions. Every editor and admin can create, edit, and delete team members. The code below reflects this — follow it exactly rather than copying admin-companies directly.

- [ ] **Step 1: Create the TypeScript component**

Create `src/app/pages/admin/admin-team/admin-team.component.ts`:

```ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TeamMemberService } from '../../../core/team-member.service';
import { TeamMember } from '../../../models';

@Component({
  selector: 'app-admin-team',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-team.component.html',
})
export class AdminTeamComponent implements OnInit {
  members: TeamMember[] = [];
  loading = true;
  showModal = false;
  editing: Partial<TeamMember> = {};
  isEdit = false;
  saving = false;
  error = '';

  constructor(private teamService: TeamMemberService) {}

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading = true;
    try {
      this.members = await this.teamService.getAll();
    } finally {
      this.loading = false;
    }
  }

  openCreate() {
    this.editing = { sort_order: 0 };
    this.isEdit = false;
    this.error = '';
    this.showModal = true;
  }

  openEdit(m: TeamMember) {
    this.editing = { ...m };
    this.isEdit = true;
    this.error = '';
    this.showModal = true;
  }

  async save() {
    if (!this.editing.name?.trim()) { this.error = '名稱為必填'; return; }
    this.saving = true;
    try {
      if (this.isEdit && this.editing.id) {
        await this.teamService.update(this.editing.id, this.editing);
      } else {
        await this.teamService.create(this.editing);
      }
      this.showModal = false;
      await this.load();
    } catch (e: any) {
      this.error = e.message || '儲存失敗';
    } finally { this.saving = false; }
  }

  async delete(m: TeamMember) {
    if (!confirm(`確定刪除「${m.name}」？`)) return;
    try {
      await this.teamService.delete(m.id);
      await this.load();
    } catch (e: any) {
      alert(e.message || '刪除失敗');
    }
  }

  getInitial(name: string): string {
    return name.charAt(0).toUpperCase();
  }
}
```

- [ ] **Step 2: Create the HTML template**

Create `src/app/pages/admin/admin-team/admin-team.component.html`:

```html
<div class="p-8">
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-2xl font-semibold text-gray-800">團隊管理</h1>
    <button (click)="openCreate()"
      class="px-4 py-2 bg-pink-500 text-white text-sm rounded-md hover:bg-pink-600 transition-colors">
      + 新增成員
    </button>
  </div>

  <div *ngIf="loading" class="text-center py-16 text-gray-400">載入中…</div>
  <div *ngIf="!loading && members.length === 0" class="text-center py-16 text-gray-400">尚無團隊成員</div>

  <div *ngIf="!loading && members.length > 0" class="bg-white rounded-lg shadow-sm overflow-hidden">
    <table class="w-full text-sm">
      <thead class="bg-gray-50 border-b border-gray-200">
        <tr>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">頭貼</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">名稱</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">一句話介紹</th>
          <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">排序</th>
          <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider w-28">操作</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-100">
        <tr *ngFor="let m of members" class="hover:bg-gray-50 transition-colors">
          <td class="px-4 py-3">
            <img *ngIf="m.photo_url" [src]="m.photo_url" [alt]="m.name"
              class="w-8 h-8 rounded-full object-cover"/>
            <div *ngIf="!m.photo_url"
              class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
              style="background: rgba(232,121,160,0.15); color: #c2507a;">
              {{ getInitial(m.name) }}
            </div>
          </td>
          <td class="px-4 py-3 font-medium text-gray-800">{{ m.name }}</td>
          <td class="px-4 py-3 text-gray-500 max-w-xs truncate">{{ m.bio || '—' }}</td>
          <td class="px-4 py-3 text-gray-500 text-center">{{ m.sort_order }}</td>
          <td class="px-4 py-3 text-right space-x-2">
            <button (click)="openEdit(m)"
              class="text-xs px-2 py-1 rounded text-pink-600 hover:bg-pink-50 transition-colors">
              編輯
            </button>
            <button (click)="delete(m)"
              class="text-xs px-2 py-1 rounded text-red-500 hover:bg-red-50 transition-colors">
              刪除
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</div>

<!-- Modal -->
<div *ngIf="showModal" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
  <div class="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
    <div class="flex items-center justify-between mb-5">
      <h2 class="text-lg font-semibold text-gray-800">{{ isEdit ? '編輯成員' : '新增成員' }}</h2>
      <button (click)="showModal = false" class="text-gray-400 hover:text-gray-600 transition-colors p-1 -mr-1">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <div class="space-y-4">
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">名稱 <span class="text-red-400">*</span></label>
        <input [(ngModel)]="editing.name" placeholder="暱稱"
          class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"/>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">一句話介紹</label>
        <input [(ngModel)]="editing.bio" placeholder="簡短介紹"
          class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"/>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">頭貼 URL</label>
        <input [(ngModel)]="editing.photo_url" placeholder="https://..."
          class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"/>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">Instagram</label>
        <input [(ngModel)]="editing.instagram" placeholder="https://www.instagram.com/..."
          class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"/>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">X (Twitter)</label>
        <input [(ngModel)]="editing.x" placeholder="https://x.com/..."
          class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"/>
      </div>
      <div>
        <label class="block text-xs font-medium text-gray-600 mb-1">排序（數字小的排前面）</label>
        <input [(ngModel)]="editing.sort_order" type="number" placeholder="0"
          class="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"/>
      </div>

      <div *ngIf="error" class="text-red-500 text-xs">{{ error }}</div>

      <div class="flex justify-end gap-2 pt-2">
        <button (click)="showModal = false"
          class="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors">
          取消
        </button>
        <button (click)="save()" [disabled]="saving"
          class="px-4 py-2 bg-pink-500 text-white text-sm rounded-md hover:bg-pink-600 disabled:opacity-50 transition-colors">
          {{ saving ? '儲存中…' : '儲存' }}
        </button>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/admin/admin-team/
git commit -m "feat(admin): add AdminTeamComponent for team member CRUD"
```

---

### Task 5: Admin route + nav link

**Files:**
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/pages/admin/admin-shell/admin-shell.component.html`

- [ ] **Step 1: Add admin child route in app.routes.ts**

In `src/app/app.routes.ts`, inside the `admin` route's `children` array, add the following **before** the `{ path: '', redirectTo: 'members', pathMatch: 'full' }` entry (currently around line 40):

```ts
{ path: 'team', loadComponent: () => import('./pages/admin/admin-team/admin-team.component').then(m => m.AdminTeamComponent) },
```

The children array should end up looking like:
```ts
children: [
  { path: 'members', ... },
  { path: 'groups', ... },
  { path: 'companies', ... },
  { path: 'history', ... },
  { path: 'audit-log', canActivate: [adminGuard], ... },
  { path: 'roles', ... },
  { path: 'team', loadComponent: () => import('./pages/admin/admin-team/admin-team.component').then(m => m.AdminTeamComponent) },
  { path: '', redirectTo: 'members', pathMatch: 'full' },
  { path: '**', redirectTo: 'members' }
]
```

- [ ] **Step 2: Add nav link in admin-shell.component.html**

In `src/app/pages/admin/admin-shell/admin-shell.component.html`, inside the `<nav>` element, add the 「團隊管理」link after the 「公司管理」link (after line 31):

```html
<a
  routerLink="/admin/team"
  routerLinkActive="bg-pink-100 text-pink-700 font-medium"
  class="flex items-center px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-pink-50 hover:text-pink-600 transition-colors"
>
  團隊管理
</a>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/app.routes.ts src/app/pages/admin/admin-shell/admin-shell.component.html
git commit -m "feat(admin): add /admin/team route and nav link"
```

---

## Chunk 3: Public pages

### Task 6: AboutComponent — 關於我們 public page

**Files:**
- Create: `src/app/pages/about/about.component.ts`
- Create: `src/app/pages/about/about.component.html`

> **Pattern reference:** Follow `src/app/pages/privacy/privacy.component.ts` for the TS shell. For the HTML, follow `src/app/pages/privacy/privacy.component.html` for the visual style (same background, container, fonts, back link, footer tagline). Use `@if`/`@for` (not `*ngIf`/`*ngFor`) — this is a public page, not an admin page.

- [ ] **Step 1: Create the TypeScript component**

Create `src/app/pages/about/about.component.ts`:

```ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TeamMemberService } from '../../core/team-member.service';
import { SeoService } from '../../core/seo.service';
import { TeamMember } from '../../models';

const SITE_URL = 'https://idol-genealogy.pages.dev';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './about.component.html',
})
export class AboutComponent implements OnInit {
  members: TeamMember[] = [];

  constructor(
    private teamService: TeamMemberService,
    private seo: SeoService
  ) {}

  async ngOnInit() {
    this.seo.setPage(
      '關於我們 | 台灣地下偶像族譜',
      '了解台灣地下偶像族譜的成立緣起與編輯團隊。',
      `${SITE_URL}/about`
    );
    try {
      this.members = await this.teamService.getAll();
    } catch {
      this.members = [];
    }
  }

  getInitial(name: string): string {
    return name.charAt(0).toUpperCase();
  }
}
```

- [ ] **Step 2: Create the HTML template**

Create `src/app/pages/about/about.component.html`:

```html
<div style="min-height: 100vh; background: linear-gradient(135deg, #fdf6fa 0%, #f5eef8 50%, #fdf6fa 100%);">

  <!-- Back nav -->
  <div style="max-width: 720px; margin: 0 auto; padding: 32px 32px 0;">
    <a routerLink="/" style="
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 0.78rem; color: rgba(122,90,122,0.7);
      text-decoration: none; letter-spacing: 0.05em;
      transition: color 0.2s;
    ">← 返回首頁</a>
  </div>

  <div style="max-width: 720px; margin: 0 auto; padding: 32px 32px 96px;">

    <!-- Header -->
    <div style="margin-bottom: 48px; padding-bottom: 24px; border-bottom: 1px solid rgba(232,121,160,0.15);">
      <p style="
        font-family: 'Shippori Mincho', serif;
        font-size: 0.7rem; letter-spacing: 0.4em;
        color: rgba(232,121,160,0.6); margin-bottom: 12px;
        text-transform: uppercase;
      ">About</p>
      <h1 style="
        font-family: 'Cormorant Garamond', Georgia, serif;
        font-size: 2rem; font-weight: 400;
        color: #3a2040; letter-spacing: 0.02em;
      ">關於我們</h1>
    </div>

    <!-- Website introduction -->
    <section style="margin-bottom: 48px; color: #4a3050; line-height: 1.9; font-size: 0.92rem;">
      <h2 style="font-size: 1rem; font-weight: 600; color: #3a2040; margin-bottom: 16px;">這個網站是什麼？</h2>
      <p style="margin-bottom: 16px;">
        台灣地下偶像族譜是一個記錄台灣地下偶像生態的開放檔案庫。我們整理成員履歷、組合歷史與事務所資訊，希望為這個領域留下完整的文字紀錄。
      </p>
      <p>
        地下偶像的資訊往往散落在各社群平台，活動結束後便難以追溯。本站希望透過系統化的整理，讓每一段活動歷程都能被記住。
      </p>
    </section>

    <!-- Editorial team -->
    @if (members.length > 0) {
      <section style="margin-bottom: 48px;">
        <h2 style="font-size: 1rem; font-weight: 600; color: #3a2040; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid rgba(232,121,160,0.1);">編輯團隊</h2>
        <div style="display: flex; flex-wrap: wrap; gap: 20px;">
          @for (member of members; track member.id) {
            <div style="display: flex; align-items: flex-start; gap: 14px; min-width: 200px; flex: 1 1 200px;">
              <!-- Avatar -->
              @if (member.photo_url) {
                <img [src]="member.photo_url" [alt]="member.name" style="
                  width: 56px; height: 56px; border-radius: 50%;
                  object-fit: cover; flex-shrink: 0;
                "/>
              } @else {
                <div style="
                  width: 56px; height: 56px; border-radius: 50%; flex-shrink: 0;
                  background: rgba(232,121,160,0.15); color: #c2507a;
                  display: flex; align-items: center; justify-content: center;
                  font-size: 1.2rem; font-weight: 600;
                  font-family: 'Cormorant Garamond', Georgia, serif;
                ">{{ getInitial(member.name) }}</div>
              }
              <!-- Info -->
              <div>
                <div style="font-weight: 600; color: #3a2040; margin-bottom: 4px; font-size: 0.95rem;">{{ member.name }}</div>
                @if (member.bio) {
                  <div style="color: rgba(122,90,122,0.7); font-size: 0.82rem; line-height: 1.5; margin-bottom: 6px;">{{ member.bio }}</div>
                }
                <!-- Social links -->
                <div style="display: flex; gap: 8px;">
                  @if (member.instagram) {
                    <a [href]="member.instagram" target="_blank" rel="noopener" style="
                      color: rgba(122,90,122,0.5); transition: color 0.2s;
                    " title="Instagram">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                    </a>
                  }
                  @if (member.x) {
                    <a [href]="member.x" target="_blank" rel="noopener" style="
                      color: rgba(122,90,122,0.5); transition: color 0.2s;
                    " title="X">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                      </svg>
                    </a>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      </section>
    }

    <!-- Footer -->
    <div style="margin-top: 64px; padding-top: 24px; border-top: 1px solid rgba(232,121,160,0.12); text-align: center;">
      <p style="
        font-family: 'Cormorant Garamond', Georgia, serif;
        font-style: italic; font-size: 0.78rem;
        color: rgba(184,160,184,0.5); letter-spacing: 0.15em;
      ">偶像成員記録 · Idol Archive</p>
    </div>

  </div>
</div>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/about/
git commit -m "feat: add AboutComponent public page"
```

---

### Task 7: ContactComponent — 聯絡我們 public page

**Files:**
- Create: `src/app/pages/contact/contact.component.ts`
- Create: `src/app/pages/contact/contact.component.html`

- [ ] **Step 1: Create the TypeScript component**

Create `src/app/pages/contact/contact.component.ts`:

```ts
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo.service';

const SITE_URL = 'https://idol-genealogy.pages.dev';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './contact.component.html',
})
export class ContactComponent implements OnInit {
  constructor(private seo: SeoService) {}

  ngOnInit() {
    this.seo.setPage(
      '聯絡我們 | 台灣地下偶像族譜',
      '有任何資料錯誤或補充建議，歡迎與我們聯絡。',
      `${SITE_URL}/contact`
    );
  }
}
```

- [ ] **Step 2: Create the HTML template**

Create `src/app/pages/contact/contact.component.html`:

```html
<div style="min-height: 100vh; background: linear-gradient(135deg, #fdf6fa 0%, #f5eef8 50%, #fdf6fa 100%);">

  <!-- Back nav -->
  <div style="max-width: 720px; margin: 0 auto; padding: 32px 32px 0;">
    <a routerLink="/" style="
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 0.78rem; color: rgba(122,90,122,0.7);
      text-decoration: none; letter-spacing: 0.05em;
      transition: color 0.2s;
    ">← 返回首頁</a>
  </div>

  <div style="max-width: 720px; margin: 0 auto; padding: 32px 32px 96px;">

    <!-- Header -->
    <div style="margin-bottom: 48px; padding-bottom: 24px; border-bottom: 1px solid rgba(232,121,160,0.15);">
      <p style="
        font-family: 'Shippori Mincho', serif;
        font-size: 0.7rem; letter-spacing: 0.4em;
        color: rgba(232,121,160,0.6); margin-bottom: 12px;
        text-transform: uppercase;
      ">Contact</p>
      <h1 style="
        font-family: 'Cormorant Garamond', Georgia, serif;
        font-size: 2rem; font-weight: 400;
        color: #3a2040; letter-spacing: 0.02em;
      ">聯絡我們</h1>
    </div>

    <!-- Content -->
    <div style="color: #4a3050; line-height: 1.9; font-size: 0.92rem;">
      <p style="margin-bottom: 32px;">
        有任何資料錯誤、補充建議，歡迎透過以下方式聯絡。我們會盡快回覆。
      </p>

      <!-- Email block -->
      <div style="
        display: inline-flex; align-items: center; gap: 12px;
        padding: 16px 24px;
        background: rgba(232,121,160,0.06);
        border: 1px solid rgba(232,121,160,0.15);
        border-radius: 10px;
      ">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(194,80,122,0.7)" stroke-width="1.5">
          <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
        </svg>
        <a href="mailto:your-email@gmail.com" style="
          color: #c2507a; text-decoration: none;
          font-size: 0.92rem; letter-spacing: 0.02em;
        ">your-email&#64;gmail.com</a>
      </div>
    </div>

    <!-- Footer -->
    <div style="margin-top: 64px; padding-top: 24px; border-top: 1px solid rgba(232,121,160,0.12); text-align: center;">
      <p style="
        font-family: 'Cormorant Garamond', Georgia, serif;
        font-style: italic; font-size: 0.78rem;
        color: rgba(184,160,184,0.5); letter-spacing: 0.15em;
      ">偶像成員記録 · Idol Archive</p>
    </div>

  </div>
</div>
```

> **Note:** The `@` in the email address is written as `&#64;` to avoid Angular template parsing errors.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/contact/
git commit -m "feat: add ContactComponent public page"
```

---

### Task 8: Public routes, footer links, sitemap

**Files:**
- Modify: `src/app/app.routes.ts`
- Modify: `src/app/pages/home/home.component.html`
- Modify: `public/sitemap.xml`

- [ ] **Step 1: Add public routes in app.routes.ts**

In `src/app/app.routes.ts`, add the following two routes **before** the final `{ path: '**', redirectTo: '' }` catch-all:

```ts
{
  path: 'about',
  loadComponent: () => import('./pages/about/about.component').then(m => m.AboutComponent)
},
{
  path: 'contact',
  loadComponent: () => import('./pages/contact/contact.component').then(m => m.ContactComponent)
},
```

- [ ] **Step 2: Add footer links in home.component.html**

In `src/app/pages/home/home.component.html`, find the footer's link row (the `<div>` with `display: flex; ... gap: 20px` containing the ko-fi and privacy links, currently around line 641). Add two new links before the `隱私政策` link:

```html
<a routerLink="/about" style="
  font-size: 0.75rem; color: rgba(122,90,122,0.55);
  text-decoration: none; letter-spacing: 0.04em;
">關於我們</a>
<span style="color: rgba(184,160,184,0.3); font-size: 0.7rem;">·</span>
<a routerLink="/contact" style="
  font-size: 0.75rem; color: rgba(122,90,122,0.55);
  text-decoration: none; letter-spacing: 0.04em;
">聯絡我們</a>
<span style="color: rgba(184,160,184,0.3); font-size: 0.7rem;">·</span>
```

The footer link area should now read: `支持本站 · 關於我們 · 聯絡我們 · 隱私政策`

- [ ] **Step 3: Update sitemap.xml**

In `public/sitemap.xml`, add two new `<url>` entries inside `<urlset>` after the existing `/privacy` entry:

```xml
<url>
  <loc>https://idol-genealogy.pages.dev/about</loc>
  <changefreq>monthly</changefreq>
  <priority>0.4</priority>
</url>
<url>
  <loc>https://idol-genealogy.pages.dev/contact</loc>
  <changefreq>monthly</changefreq>
  <priority>0.4</priority>
</url>
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/app.routes.ts src/app/pages/home/home.component.html public/sitemap.xml
git commit -m "feat: wire /about and /contact routes, footer links, sitemap"
```

---

## Post-implementation

After all 8 tasks are committed:

1. **Run the full test suite** to verify nothing is broken:
   ```bash
   npx ng test --watch=false --browsers=ChromeHeadless 2>&1 | tail -30
   ```
   Expected: all pre-existing tests pass, plus 4 new TeamMemberService tests.

2. **Run the dev server** and manually verify:
   - `/about` loads, shows intro text and "編輯團隊" section (empty if no DB data yet)
   - `/contact` loads, shows email block
   - Footer on home page shows `關於我們 · 聯絡我們 · 隱私政策`
   - `/admin/team` is accessible after login, CRUD works

3. **Apply migration in Supabase SQL Editor:**
   Copy and run `supabase/migrations/023_create_team_members.sql` in the Supabase dashboard → SQL Editor. Then add test team members via `/admin/team` to verify the about page renders them.
