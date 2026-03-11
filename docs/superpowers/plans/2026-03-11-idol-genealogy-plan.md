# 偶像成員經歷族譜網頁 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Angular + Supabase idol member genealogy webapp with member timeline view, group tree view, and admin CRUD interface.

**Architecture:** Angular standalone components with D3.js visualizations. Supabase handles PostgreSQL data, Auth (Google OAuth), and Row Level Security. Frontend deploys as static site to GitHub Pages or Netlify.

**Tech Stack:** Angular 17+, Tailwind CSS, D3.js, @supabase/supabase-js, Jasmine/Karma (tests)

---

## File Structure

```
idol-genealogy/
├── src/
│   ├── app/
│   │   ├── app.config.ts              # provideRouter, provideHttpClient
│   │   ├── app.routes.ts              # all route definitions
│   │   ├── core/
│   │   │   ├── supabase.service.ts    # Supabase client + auth session
│   │   │   ├── member.service.ts      # member CRUD + search
│   │   │   ├── group.service.ts       # group + team CRUD
│   │   │   ├── history.service.ts     # history CRUD
│   │   │   └── auth.guard.ts          # CanActivate for /admin
│   │   ├── models/
│   │   │   └── index.ts               # Member, Group, Team, History interfaces
│   │   ├── pages/
│   │   │   ├── home/
│   │   │   │   ├── home.component.ts
│   │   │   │   └── home.component.html
│   │   │   ├── member-page/
│   │   │   │   ├── member-page.component.ts
│   │   │   │   └── member-page.component.html
│   │   │   ├── group-page/
│   │   │   │   ├── group-page.component.ts
│   │   │   │   └── group-page.component.html
│   │   │   ├── login/
│   │   │   │   ├── login.component.ts
│   │   │   │   └── login.component.html
│   │   │   └── admin/
│   │   │       ├── admin-shell/
│   │   │       │   ├── admin-shell.component.ts
│   │   │       │   └── admin-shell.component.html
│   │   │       ├── admin-members/
│   │   │       │   ├── admin-members.component.ts
│   │   │       │   └── admin-members.component.html
│   │   │       ├── admin-groups/
│   │   │       │   ├── admin-groups.component.ts
│   │   │       │   └── admin-groups.component.html
│   │   │       └── admin-history/
│   │   │           ├── admin-history.component.ts
│   │   │           └── admin-history.component.html
│   │   └── shared/
│   │       ├── member-timeline/
│   │       │   └── member-timeline.component.ts   # D3 vertical timeline
│   │       ├── group-tree/
│   │       │   └── group-tree.component.ts        # D3 tree layout
│   │       └── record-modal/
│   │           └── record-modal.component.ts      # shared admin modal form
│   ├── environments/
│   │   ├── environment.ts
│   │   └── environment.prod.ts
│   └── styles.css
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── tailwind.config.js
└── angular.json
```

---

## Chunk 1: Project Setup & Database Schema

### Task 1: Initialize Angular project

**Files:**
- Create: `idol-genealogy/` (project root)
- Create: `angular.json`, `package.json`, `tsconfig.json`

- [ ] **Step 1: Create Angular project**

```bash
cd /Users/seitumbp2025
ng new idol-genealogy --standalone --routing --style=css --skip-git
cd idol-genealogy
```

Expected: Angular project scaffolded with `src/app/app.config.ts` present.

- [ ] **Step 2: Install dependencies**

```bash
npm install @supabase/supabase-js d3 @types/d3
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init
```

Expected: `node_modules/@supabase`, `node_modules/d3` present.

- [ ] **Step 3: Configure Tailwind**

Edit `tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        blush: '#fdf4f9',
        lavender: '#f0f4ff',
        'idol-pink': '#e879a0',
        'idol-purple': '#7c6cf2',
        'idol-mint': '#4ade80',
        'idol-sky': '#60a5fa',
      },
      fontFamily: {
        sans: ['Nunito', 'Noto Sans JP', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
```

Edit `src/styles.css`:
```css
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;900&family=Noto+Sans+JP:wght@300;400;700&display=swap');
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background: linear-gradient(135deg, #fdf4f9 0%, #f0f4ff 100%);
  min-height: 100vh;
  font-family: 'Nunito', 'Noto Sans JP', sans-serif;
}
```

- [ ] **Step 4: Set up environment files**

Edit `src/environments/environment.ts`:
```typescript
export const environment = {
  production: false,
  supabaseUrl: 'YOUR_SUPABASE_URL',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY',
};
```

Edit `src/environments/environment.prod.ts`:
```typescript
export const environment = {
  production: true,
  supabaseUrl: 'YOUR_SUPABASE_URL',
  supabaseAnonKey: 'YOUR_SUPABASE_ANON_KEY',
};
```

- [ ] **Step 5: Verify build**

```bash
ng build --configuration development
```

Expected: Build succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: initialize Angular project with Tailwind and dependencies"
```

---

### Task 2: Supabase database schema

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`

- [ ] **Step 1: Write migration SQL**

Create `supabase/migrations/001_initial_schema.sql`:
```sql
-- Enable moddatetime extension for auto updated_at
create extension if not exists moddatetime schema extensions;

-- Members
create table members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  name_jp     text,
  photo_url   text,
  birthdate   date,
  notes       text,
  updated_at  timestamptz default now(),
  created_at  timestamptz default now()
);

create trigger members_updated_at
  before update on members
  for each row execute procedure extensions.moddatetime(updated_at);

-- Groups
create table groups (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  name_jp       text,
  color         text default '#e879a0',
  founded_at    date,
  disbanded_at  date,
  updated_at    timestamptz default now(),
  created_at    timestamptz default now()
);

create trigger groups_updated_at
  before update on groups
  for each row execute procedure extensions.moddatetime(updated_at);

-- Teams
create table teams (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid references groups(id) on delete restrict,
  name        text not null,
  color       text,
  created_at  timestamptz default now()
);

-- History
create table history (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid references members(id) on delete restrict,
  group_id    uuid references groups(id) on delete restrict,
  team_id     uuid references teams(id) on delete set null,
  role        text,
  status      text check (status in ('active','graduated','transferred','concurrent')),
  joined_at   date not null,
  left_at     date,
  notes       text,
  is_approved boolean default true,
  updated_at  timestamptz default now(),
  created_at  timestamptz default now()
);

create trigger history_updated_at
  before update on history
  for each row execute procedure extensions.moddatetime(updated_at);

-- RLS: enable on all tables
alter table members enable row level security;
alter table groups enable row level security;
alter table teams enable row level security;
alter table history enable row level security;

-- RLS policies: all can read, authenticated can write
create policy "anyone can read members" on members for select using (true);
create policy "auth users can insert members" on members for insert with check (auth.uid() is not null);
create policy "auth users can update members" on members for update using (auth.uid() is not null);
create policy "auth users can delete members" on members for delete using (auth.uid() is not null);

create policy "anyone can read groups" on groups for select using (true);
create policy "auth users can insert groups" on groups for insert with check (auth.uid() is not null);
create policy "auth users can update groups" on groups for update using (auth.uid() is not null);
create policy "auth users can delete groups" on groups for delete using (auth.uid() is not null);

create policy "anyone can read teams" on teams for select using (true);
create policy "auth users can insert teams" on teams for insert with check (auth.uid() is not null);
create policy "auth users can update teams" on teams for update using (auth.uid() is not null);
create policy "auth users can delete teams" on teams for delete using (auth.uid() is not null);

create policy "anyone can read history" on history for select using (true);
create policy "auth users can insert history" on history for insert with check (auth.uid() is not null);
create policy "auth users can update history" on history for update using (auth.uid() is not null);
create policy "auth users can delete history" on history for delete using (auth.uid() is not null);
```

- [ ] **Step 2: Apply migration in Supabase dashboard**

Go to Supabase project → SQL Editor → paste and run the SQL above.

Expected: Tables `members`, `groups`, `teams`, `history` appear in Table Editor.

- [ ] **Step 3: Copy Supabase URL and anon key into environment files**

Go to Supabase project → Settings → API. Copy `Project URL` and `anon public` key into both `environment.ts` and `environment.prod.ts`.

- [ ] **Step 4: Commit**

```bash
git add supabase/ src/environments/
git commit -m "feat: add Supabase schema and environment config"
```

---

## Chunk 2: Models, Services & Auth Guard

### Task 3: TypeScript models

**Files:**
- Create: `src/app/models/index.ts`

- [ ] **Step 1: Write interfaces**

Create `src/app/models/index.ts`:
```typescript
export interface Member {
  id: string;
  name: string;
  name_jp: string | null;
  photo_url: string | null;
  birthdate: string | null;
  notes: string | null;
  updated_at: string;
  created_at: string;
}

export interface Group {
  id: string;
  name: string;
  name_jp: string | null;
  color: string;
  founded_at: string | null;
  disbanded_at: string | null;
  updated_at: string;
  created_at: string;
}

export interface Team {
  id: string;
  group_id: string;
  name: string;
  color: string | null;
  created_at: string;
}

export interface History {
  id: string;
  member_id: string;
  group_id: string;
  team_id: string | null;
  role: string | null;
  status: 'active' | 'graduated' | 'transferred' | 'concurrent' | null;
  joined_at: string;
  left_at: string | null;
  notes: string | null;
  is_approved: boolean;
  updated_at: string;
  created_at: string;
  // joined from queries:
  group?: Group;
  team?: Team;
  member?: Member;
}

export interface SearchResult {
  members: Member[];
  groups: Group[];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/models/
git commit -m "feat: add TypeScript models"
```

---

### Task 4: SupabaseService

**Files:**
- Create: `src/app/core/supabase.service.ts`
- Test: `src/app/core/supabase.service.spec.ts`

- [ ] **Step 1: Write failing test**

Create `src/app/core/supabase.service.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { SupabaseService } from './supabase.service';

describe('SupabaseService', () => {
  let service: SupabaseService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SupabaseService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should expose a supabase client', () => {
    expect(service.client).toBeTruthy();
  });

  it('should expose authState$ observable', () => {
    expect(service.authState$).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
ng test --include='**/supabase.service.spec.ts' --watch=false
```

Expected: FAIL — `SupabaseService` not found.

- [ ] **Step 3: Implement SupabaseService**

Create `src/app/core/supabase.service.ts`:
```typescript
import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, Session } from '@supabase/supabase-js';
import { BehaviorSubject } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseAnonKey
  );

  private _authState = new BehaviorSubject<Session | null>(null);
  readonly authState$ = this._authState.asObservable();

  constructor() {
    this.client.auth.getSession().then(({ data }) => {
      this._authState.next(data.session);
    });
    this.client.auth.onAuthStateChange((_event, session) => {
      this._authState.next(session);
    });
  }

  signInWithGoogle(): Promise<void> {
    return this.client.auth.signInWithOAuth({ provider: 'google' }).then(() => {});
  }

  signOut(): Promise<void> {
    return this.client.auth.signOut().then(() => {});
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
ng test --include='**/supabase.service.spec.ts' --watch=false
```

Expected: PASS — 3 specs passing.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/supabase.service.ts src/app/core/supabase.service.spec.ts
git commit -m "feat: add SupabaseService with auth state observable"
```

---

### Task 5: MemberService

**Files:**
- Create: `src/app/core/member.service.ts`
- Test: `src/app/core/member.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `src/app/core/member.service.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { MemberService } from './member.service';
import { SupabaseService } from './supabase.service';
import { Member } from '../models';

const mockMember: Member = {
  id: 'uuid-1', name: '山田花子', name_jp: '山田花子',
  photo_url: null, birthdate: '1995-01-01', notes: null,
  updated_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z'
};

const mockSupabaseService = {
  client: {
    from: jasmine.createSpy('from').and.returnValue({
      select: jasmine.createSpy('select').and.returnValue({
        or: jasmine.createSpy('or').and.returnValue(
          Promise.resolve({ data: [mockMember], error: null })
        ),
        eq: jasmine.createSpy('eq').and.returnValue(
          Promise.resolve({ data: mockMember, error: null })
        ),
        order: jasmine.createSpy('order').and.returnValue({
          limit: jasmine.createSpy('limit').and.returnValue(
            Promise.resolve({ data: [mockMember], error: null })
          )
        }),
        single: jasmine.createSpy('single').and.returnValue(
          Promise.resolve({ data: mockMember, error: null })
        ),
      }),
      insert: jasmine.createSpy('insert').and.returnValue(
        Promise.resolve({ data: mockMember, error: null })
      ),
      update: jasmine.createSpy('update').and.returnValue({
        eq: jasmine.createSpy('eq').and.returnValue(
          Promise.resolve({ data: mockMember, error: null })
        )
      }),
      delete: jasmine.createSpy('delete').and.returnValue({
        eq: jasmine.createSpy('eq').and.returnValue(
          Promise.resolve({ data: null, error: null })
        )
      }),
    })
  }
};

describe('MemberService', () => {
  let service: MemberService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        MemberService,
        { provide: SupabaseService, useValue: mockSupabaseService }
      ]
    });
    service = TestBed.inject(MemberService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('search() should call supabase with or() covering name and name_jp', async () => {
    const results = await service.search('山田');
    expect(mockSupabaseService.client.from).toHaveBeenCalledWith('members');
    expect(results).toEqual([mockMember]);
  });

  it('getById() should return a single member', async () => {
    const member = await service.getById('uuid-1');
    expect(member).toEqual(mockMember);
  });

  it('getRecent() should return list of members', async () => {
    const members = await service.getRecent(10);
    expect(Array.isArray(members)).toBeTrue();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
ng test --include='**/member.service.spec.ts' --watch=false
```

Expected: FAIL — `MemberService` not found.

- [ ] **Step 3: Implement MemberService**

Create `src/app/core/member.service.ts`:
```typescript
import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Member } from '../models';

@Injectable({ providedIn: 'root' })
export class MemberService {
  private db = this.supabase.client;

  constructor(private supabase: SupabaseService) {}

  async search(query: string): Promise<Member[]> {
    const { data, error } = await this.db
      .from('members')
      .select('*')
      .or(`name.ilike.%${query}%,name_jp.ilike.%${query}%`);
    if (error) throw error;
    return data ?? [];
  }

  async getById(id: string): Promise<Member | null> {
    const { data, error } = await this.db
      .from('members')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  async getRecent(limit = 10): Promise<Member[]> {
    const { data, error } = await this.db
      .from('members')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }

  async create(member: Partial<Member>): Promise<void> {
    const { error } = await this.db.from('members').insert(member);
    if (error) throw error;
  }

  async update(id: string, member: Partial<Member>): Promise<void> {
    const { error } = await this.db
      .from('members')
      .update(member)
      .eq('id', id);
    if (error) throw error;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('members').delete().eq('id', id);
    if (error) throw error;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
ng test --include='**/member.service.spec.ts' --watch=false
```

Expected: PASS — 4 specs.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/member.service.ts src/app/core/member.service.spec.ts
git commit -m "feat: add MemberService with CRUD and search"
```

---

### Task 6: GroupService & HistoryService

**Files:**
- Create: `src/app/core/group.service.ts`
- Create: `src/app/core/history.service.ts`
- Test: `src/app/core/group.service.spec.ts`
- Test: `src/app/core/history.service.spec.ts`

- [ ] **Step 1: Write failing test for GroupService**

Create `src/app/core/group.service.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { GroupService } from './group.service';
import { SupabaseService } from './supabase.service';
import { Group } from '../models';

const mockGroup: Group = {
  id: 'g-1', name: 'AKB48', name_jp: 'AKB48', color: '#e879a0',
  founded_at: '2005-12-08', disbanded_at: null,
  updated_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z'
};

const mockClient = {
  from: jasmine.createSpy('from').and.returnValue({
    select: jasmine.createSpy('select').and.returnValue({
      eq: jasmine.createSpy('eq').and.returnValue({
        single: jasmine.createSpy('single').and.returnValue(
          Promise.resolve({ data: mockGroup, error: null })
        )
      }),
      order: jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: [mockGroup], error: null })
      ),
      ilike: jasmine.createSpy('ilike').and.returnValue(
        Promise.resolve({ data: [mockGroup], error: null })
      ),
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

describe('GroupService', () => {
  let service: GroupService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        GroupService,
        { provide: SupabaseService, useValue: { client: mockClient } }
      ]
    });
    service = TestBed.inject(GroupService);
  });

  it('should be created', () => expect(service).toBeTruthy());

  it('getById() should return a group', async () => {
    const group = await service.getById('g-1');
    expect(group).toEqual(mockGroup);
  });

  it('getAll() should return groups ordered by name', async () => {
    const groups = await service.getAll();
    expect(Array.isArray(groups)).toBeTrue();
  });

  it('search() should use ilike', async () => {
    const groups = await service.search('AKB');
    expect(Array.isArray(groups)).toBeTrue();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
ng test --include='**/group.service.spec.ts' --watch=false
```

Expected: FAIL.

- [ ] **Step 3: Implement GroupService**

Create `src/app/core/group.service.ts`:
```typescript
import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Group, Team } from '../models';

@Injectable({ providedIn: 'root' })
export class GroupService {
  private db = this.supabase.client;

  constructor(private supabase: SupabaseService) {}

  async getAll(): Promise<Group[]> {
    const { data, error } = await this.db
      .from('groups')
      .select('*')
      .order('name', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async search(query: string): Promise<Group[]> {
    const { data, error } = await this.db
      .from('groups')
      .select('*')
      .or(`name.ilike.%${query}%,name_jp.ilike.%${query}%`);
    if (error) throw error;
    return data ?? [];
  }

  async getById(id: string): Promise<Group | null> {
    const { data, error } = await this.db
      .from('groups')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  async getTeamsByGroup(groupId: string): Promise<Team[]> {
    const { data, error } = await this.db
      .from('teams')
      .select('*')
      .eq('group_id', groupId);
    if (error) throw error;
    return data ?? [];
  }

  async create(group: Partial<Group>): Promise<void> {
    const { error } = await this.db.from('groups').insert(group);
    if (error) throw error;
  }

  async update(id: string, group: Partial<Group>): Promise<void> {
    const { error } = await this.db.from('groups').update(group).eq('id', id);
    if (error) throw error;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('groups').delete().eq('id', id);
    if (error) throw error;
  }

  async createTeam(team: Partial<Team>): Promise<void> {
    const { error } = await this.db.from('teams').insert(team);
    if (error) throw error;
  }

  async updateTeam(id: string, team: Partial<Team>): Promise<void> {
    const { error } = await this.db.from('teams').update(team).eq('id', id);
    if (error) throw error;
  }

  async deleteTeam(id: string): Promise<void> {
    const { error } = await this.db.from('teams').delete().eq('id', id);
    if (error) throw error;
  }
}
```

- [ ] **Step 4: Write failing test for HistoryService**

Create `src/app/core/history.service.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { HistoryService } from './history.service';
import { SupabaseService } from './supabase.service';
import { History } from '../models';

const mockHistory: History = {
  id: 'h-1', member_id: 'm-1', group_id: 'g-1', team_id: null,
  role: '正式成員', status: 'graduated',
  joined_at: '2013-04-01', left_at: '2019-03-01',
  notes: null, is_approved: true,
  updated_at: '2026-01-01T00:00:00Z', created_at: '2026-01-01T00:00:00Z'
};

const mockClient = {
  from: jasmine.createSpy('from').and.returnValue({
    select: jasmine.createSpy('select').and.returnValue({
      eq: jasmine.createSpy('eq').and.returnValue({
        order: jasmine.createSpy('order').and.returnValue(
          Promise.resolve({ data: [mockHistory], error: null })
        )
      }),
      order: jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: [mockHistory], error: null })
      ),
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

describe('HistoryService', () => {
  let service: HistoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        HistoryService,
        { provide: SupabaseService, useValue: { client: mockClient } }
      ]
    });
    service = TestBed.inject(HistoryService);
  });

  it('should be created', () => expect(service).toBeTruthy());

  it('getByMember() should return history records', async () => {
    const records = await service.getByMember('m-1');
    expect(Array.isArray(records)).toBeTrue();
    expect(records[0]).toEqual(mockHistory);
  });

  it('getByGroup() should return history records', async () => {
    const records = await service.getByGroup('g-1');
    expect(Array.isArray(records)).toBeTrue();
  });
});
```

- [ ] **Step 4a: Run HistoryService test to verify it fails**

```bash
ng test --include='**/history.service.spec.ts' --watch=false
```

Expected: FAIL — `HistoryService` not found.

- [ ] **Step 5: Implement HistoryService**

Create `src/app/core/history.service.ts`:
```typescript
import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { History } from '../models';

@Injectable({ providedIn: 'root' })
export class HistoryService {
  private db = this.supabase.client;

  constructor(private supabase: SupabaseService) {}

  async getByMember(memberId: string): Promise<History[]> {
    const { data, error } = await this.db
      .from('history')
      .select('*, group:groups(*), team:teams(*)')
      .eq('member_id', memberId)
      .order('joined_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async getByGroup(groupId: string): Promise<History[]> {
    const { data, error } = await this.db
      .from('history')
      .select('*, member:members(*), team:teams(*)')
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async getAll(): Promise<History[]> {
    const { data, error } = await this.db
      .from('history')
      .select('*, member:members(name,name_jp), group:groups(name,color), team:teams(name)')
      .order('joined_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async create(history: Partial<History>): Promise<void> {
    const { error } = await this.db.from('history').insert(history);
    if (error) throw error;
  }

  async update(id: string, history: Partial<History>): Promise<void> {
    const { error } = await this.db.from('history').update(history).eq('id', id);
    if (error) throw error;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('history').delete().eq('id', id);
    if (error) throw error;
  }
}
```

- [ ] **Step 5: Run GroupService test**

```bash
ng test --include='**/group.service.spec.ts' --watch=false
```

Expected: PASS — 4 specs.

- [ ] **Step 6a: Run HistoryService test to verify it passes**

```bash
ng test --include='**/history.service.spec.ts' --watch=false
```

Expected: PASS — 3 specs.

- [ ] **Step 6b: Commit**

```bash
git add src/app/core/group.service.ts src/app/core/group.service.spec.ts src/app/core/history.service.ts src/app/core/history.service.spec.ts
git commit -m "feat: add GroupService and HistoryService with tests"
```

---

### Task 7: AuthGuard & Routing

**Files:**
- Create: `src/app/core/auth.guard.ts`
- Create: `src/app/app.routes.ts`
- Modify: `src/app/app.config.ts`
- Test: `src/app/core/auth.guard.spec.ts`

- [ ] **Step 1: Write failing test for AuthGuard**

Create `src/app/core/auth.guard.spec.ts`:
```typescript
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthGuard } from './auth.guard';
import { SupabaseService } from './supabase.service';
import { BehaviorSubject } from 'rxjs';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let routerSpy: jasmine.SpyObj<Router>;
  let authState$: BehaviorSubject<any>;

  beforeEach(() => {
    authState$ = new BehaviorSubject(null);
    routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        AuthGuard,
        { provide: Router, useValue: routerSpy },
        { provide: SupabaseService, useValue: { authState$ } }
      ]
    });
    guard = TestBed.inject(AuthGuard);
  });

  it('should be created', () => expect(guard).toBeTruthy());

  it('should block unauthenticated users and navigate to /login', async () => {
    authState$.next(null);
    const result = await guard.canActivate(null as any, { url: '/admin' } as any);
    expect(result).toBeFalse();
    expect(routerSpy.navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/admin' } });
  });

  it('should allow authenticated users', async () => {
    authState$.next({ user: { id: 'uid-1' } });
    const result = await guard.canActivate(null as any, { url: '/admin' } as any);
    expect(result).toBeTrue();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
ng test --include='**/auth.guard.spec.ts' --watch=false
```

Expected: FAIL.

- [ ] **Step 3: Implement AuthGuard**

Create `src/app/core/auth.guard.ts`:
```typescript
import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  constructor(private supabase: SupabaseService, private router: Router) {}

  async canActivate(_route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Promise<boolean> {
    const session = await firstValueFrom(this.supabase.authState$);
    if (session) return true;
    this.router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
    return false;
  }
}
```

- [ ] **Step 4: Set up routes**

Create `src/app/app.routes.ts`:
```typescript
import { Routes } from '@angular/router';
import { AuthGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent) },
  { path: 'member/:id', loadComponent: () => import('./pages/member-page/member-page.component').then(m => m.MemberPageComponent) },
  { path: 'group/:id', loadComponent: () => import('./pages/group-page/group-page.component').then(m => m.GroupPageComponent) },
  { path: 'login', loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) },
  {
    path: 'admin',
    canActivate: [AuthGuard],
    loadComponent: () => import('./pages/admin/admin-shell/admin-shell.component').then(m => m.AdminShellComponent),
    children: [
      { path: 'members', loadComponent: () => import('./pages/admin/admin-members/admin-members.component').then(m => m.AdminMembersComponent) },
      { path: 'groups', loadComponent: () => import('./pages/admin/admin-groups/admin-groups.component').then(m => m.AdminGroupsComponent) },
      { path: 'history', loadComponent: () => import('./pages/admin/admin-history/admin-history.component').then(m => m.AdminHistoryComponent) },
      { path: '', redirectTo: 'members', pathMatch: 'full' }
    ]
  },
  { path: '**', redirectTo: '' }
];
```

Update `src/app/app.config.ts`:
```typescript
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes)]
};
```

- [ ] **Step 5: Run AuthGuard test**

```bash
ng test --include='**/auth.guard.spec.ts' --watch=false
```

Expected: PASS — 3 specs.

- [ ] **Step 6: Commit**

```bash
git add src/app/core/auth.guard.ts src/app/core/auth.guard.spec.ts src/app/app.routes.ts src/app/app.config.ts
git commit -m "feat: add AuthGuard and app routing"
```

---

## Chunk 3: Pages — Login & Home

### Task 8: Login Page

**Files:**
- Create: `src/app/pages/login/login.component.ts`
- Create: `src/app/pages/login/login.component.html`

- [ ] **Step 1: Create login component**

Create `src/app/pages/login/login.component.ts`:
```typescript
import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.component.html',
})
export class LoginComponent {
  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.supabase.authState$.subscribe(session => {
      if (session) {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/admin';
        this.router.navigateByUrl(returnUrl);
      }
    });
  }

  async signIn() {
    await this.supabase.signInWithGoogle();
  }
}
```

Create `src/app/pages/login/login.component.html`:
```html
<div class="min-h-screen flex items-center justify-center">
  <div class="bg-white rounded-2xl shadow-md p-10 flex flex-col items-center gap-6 max-w-sm w-full">
    <h1 class="text-2xl font-black text-gray-800">管理員登入</h1>
    <p class="text-sm text-gray-500 text-center">登入後可新增及編輯族譜資料</p>
    <button
      (click)="signIn()"
      class="flex items-center gap-3 bg-white border border-gray-300 rounded-full px-6 py-3 text-gray-700 font-semibold shadow hover:shadow-md transition w-full justify-center">
      <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" class="w-5 h-5" alt="Google">
      使用 Google 帳號登入
    </button>
  </div>
</div>
```

- [ ] **Step 2: Verify build**

```bash
ng build --configuration development 2>&1 | tail -5
```

Expected: Build success, no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/login/
git commit -m "feat: add login page with Google OAuth"
```

---

### Task 9: Home Page

**Files:**
- Create: `src/app/pages/home/home.component.ts`
- Create: `src/app/pages/home/home.component.html`

- [ ] **Step 1: Implement home component**

Create `src/app/pages/home/home.component.ts`:
```typescript
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MemberService } from '../../core/member.service';
import { GroupService } from '../../core/group.service';
import { Member, Group } from '../../models';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit {
  query = '';
  recentMembers: Member[] = [];
  memberResults: Member[] = [];
  groupResults: Group[] = [];
  searching = false;

  constructor(
    private memberService: MemberService,
    private groupService: GroupService
  ) {}

  async ngOnInit() {
    this.recentMembers = await this.memberService.getRecent(10);
  }

  async search() {
    if (!this.query.trim()) {
      this.memberResults = [];
      this.groupResults = [];
      return;
    }
    this.searching = true;
    const [members, groups] = await Promise.all([
      this.memberService.search(this.query),
      this.groupService.search(this.query)
    ]);
    this.memberResults = members;
    this.groupResults = groups;
    this.searching = false;
  }
}
```

Create `src/app/pages/home/home.component.html`:
```html
<div class="max-w-3xl mx-auto px-4 py-12">
  <!-- Header -->
  <div class="text-center mb-10">
    <h1 class="text-4xl font-black text-gray-800 mb-2">偶像成員族譜</h1>
    <p class="text-gray-500">追蹤 J-pop 偶像成員跨組合的完整歷程</p>
  </div>

  <!-- Search -->
  <div class="flex gap-3 mb-8">
    <input
      [(ngModel)]="query"
      (ngModelChange)="search()"
      placeholder="搜尋成員或組合名稱..."
      class="flex-1 rounded-full border border-pink-200 px-5 py-3 text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
    />
  </div>

  <!-- Search results -->
  @if (memberResults.length || groupResults.length) {
    <div class="mb-8 space-y-4">
      @if (memberResults.length) {
        <div>
          <h2 class="text-xs font-bold tracking-widest text-pink-400 uppercase mb-2">成員</h2>
          <div class="flex flex-col gap-2">
            @for (m of memberResults; track m.id) {
              <a [routerLink]="['/member', m.id]"
                 class="flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm hover:shadow-md transition">
                @if (m.photo_url) {
                  <img [src]="m.photo_url" class="w-10 h-10 rounded-full object-cover" [alt]="m.name">
                } @else {
                  <div class="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center text-pink-400 font-bold">{{ m.name[0] }}</div>
                }
                <span class="font-semibold text-gray-800">{{ m.name_jp || m.name }}</span>
              </a>
            }
          </div>
        </div>
      }
      @if (groupResults.length) {
        <div>
          <h2 class="text-xs font-bold tracking-widest text-purple-400 uppercase mb-2">組合</h2>
          <div class="flex flex-col gap-2">
            @for (g of groupResults; track g.id) {
              <a [routerLink]="['/group', g.id]"
                 class="flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm hover:shadow-md transition">
                <span class="w-4 h-4 rounded-full flex-shrink-0" [style.background]="g.color"></span>
                <span class="font-semibold text-gray-800">{{ g.name }}</span>
              </a>
            }
          </div>
        </div>
      }
    </div>
  }

  <!-- Recent members -->
  @if (!memberResults.length && !groupResults.length) {
    <div>
      <h2 class="text-xs font-bold tracking-widest text-gray-400 uppercase mb-3">最近更新</h2>
      <div class="flex flex-col gap-2">
        @for (m of recentMembers; track m.id) {
          <a [routerLink]="['/member', m.id]"
             class="flex items-center gap-3 bg-white rounded-xl px-4 py-3 shadow-sm hover:shadow-md transition">
            @if (m.photo_url) {
              <img [src]="m.photo_url" class="w-10 h-10 rounded-full object-cover" [alt]="m.name">
            } @else {
              <div class="w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center text-pink-400 font-bold">{{ m.name[0] }}</div>
            }
            <span class="font-semibold text-gray-800">{{ m.name_jp || m.name }}</span>
          </a>
        }
        @if (!recentMembers.length) {
          <p class="text-gray-400 text-center py-8">尚無資料，請先新增成員。</p>
        }
      </div>
    </div>
  }
</div>
```

- [ ] **Step 2: Verify build**

```bash
ng build --configuration development 2>&1 | tail -5
```

Expected: Build success.

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/home/
git commit -m "feat: add home page with search and recent members"
```

---

## Chunk 4: Visualization Components

### Task 10: MemberTimeline Component (D3.js)

**Files:**
- Create: `src/app/shared/member-timeline/member-timeline.component.ts`

- [ ] **Step 1: Create the component**

Create `src/app/shared/member-timeline/member-timeline.component.ts`:
```typescript
import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { History } from '../../models';

interface TimelineSegment {
  history: History;
  concurrent: boolean;
  lane: number; // 0 = main, 1 = branch
}

@Component({
  selector: 'app-member-timeline',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative">
      @for (seg of segments; track seg.history.id) {
        <div class="flex gap-4 mb-4" [class.ml-16]="seg.lane === 1">
          <!-- Color bar -->
          <div class="flex flex-col items-center">
            <div class="w-4 h-4 rounded-full border-2 border-white shadow"
                 [style.background]="seg.history.group?.color || '#e879a0'"></div>
            <!-- Use border-left as the line so border-dashed actually renders dashes -->
            <div class="flex-1 mt-1 border-l-2"
                 [style.borderLeftColor]="seg.history.group?.color || '#e4e4e7'"
                 [class.border-solid]="!seg.concurrent"
                 [class.border-dashed]="seg.concurrent"></div>
          </div>
          <!-- Card -->
          <div class="bg-white rounded-xl shadow-sm px-4 py-3 flex-1 hover:shadow-md transition mb-1">
            <div class="flex items-start justify-between gap-2">
              <div>
                <span class="inline-block text-xs font-bold px-2 py-0.5 rounded-full mb-1"
                      [style.background]="seg.history.group?.color + '22' || '#fce4f0'"
                      [style.color]="seg.history.group?.color || '#e879a0'">
                  {{ seg.history.group?.name || '未知組合' }}
                  @if (seg.history.team) { / {{ seg.history.team.name }} }
                </span>
                @if (seg.concurrent) {
                  <span class="ml-1 text-xs text-purple-400 font-semibold">兼任</span>
                }
              </div>
              <span class="text-xs text-gray-400 whitespace-nowrap">
                {{ seg.history.joined_at | date:'yyyy.MM' }} ～
                {{ seg.history.left_at ? (seg.history.left_at | date:'yyyy.MM') : '現在' }}
              </span>
            </div>
            @if (seg.history.role) {
              <p class="text-xs text-gray-500 mt-1">{{ seg.history.role }}</p>
            }
            @if (seg.history.notes) {
              <p class="text-xs text-gray-400 mt-1 italic">{{ seg.history.notes }}</p>
            }
          </div>
        </div>
      }
      @if (segments.length === 0) {
        <p class="text-gray-400 text-center py-8">此成員尚無歷史記錄，歡迎登入補充資料。</p>
      }
    </div>
  `
})
export class MemberTimelineComponent implements OnChanges {
  @Input() histories: History[] = [];
  segments: TimelineSegment[] = [];

  ngOnChanges() {
    this.buildSegments();
  }

  private buildSegments() {
    // Detect concurrent: any record where status='concurrent' and date ranges overlap
    const concurrentIds = new Set<string>();
    for (let i = 0; i < this.histories.length; i++) {
      for (let j = i + 1; j < this.histories.length; j++) {
        const a = this.histories[i];
        const b = this.histories[j];
        if (a.status === 'concurrent' || b.status === 'concurrent') {
          const aEnd = a.left_at ? new Date(a.left_at) : new Date();
          const bEnd = b.left_at ? new Date(b.left_at) : new Date();
          const aStart = new Date(a.joined_at);
          const bStart = new Date(b.joined_at);
          if (aStart <= bEnd && bStart <= aEnd) {
            concurrentIds.add(a.id);
            concurrentIds.add(b.id);
          }
        }
      }
    }

    this.segments = this.histories.map((h, i) => ({
      history: h,
      concurrent: concurrentIds.has(h.id),
      lane: concurrentIds.has(h.id) && i % 2 === 1 ? 1 : 0
    }));
  }
}
```

- [ ] **Step 2: Verify build**

```bash
ng build --configuration development 2>&1 | tail -5
```

Expected: Build success.

- [ ] **Step 3: Commit**

```bash
git add src/app/shared/member-timeline/
git commit -m "feat: add MemberTimeline component with concurrent fork display"
```

---

### Task 11: GroupTree Component

**Files:**
- Create: `src/app/shared/group-tree/group-tree.component.ts`

- [ ] **Step 1: Create component**

Create `src/app/shared/group-tree/group-tree.component.ts`:
```typescript
import { Component, Input, OnChanges, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { History, Team, Group } from '../../models';

interface TreeNode {
  type: 'team' | 'member';
  id: string;
  label: string;
  sublabel?: string;
  photo_url?: string | null;
  history?: History;
  children?: TreeNode[];
  color?: string;
}

@Component({
  selector: 'app-group-tree',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-6">
      @for (team of teamNodes; track team.id) {
        <div>
          @if (team.type === 'team') {
            <div class="inline-flex items-center gap-2 mb-3">
              <span class="w-3 h-3 rounded-full" [style.background]="team.color || group?.color || '#e879a0'"></span>
              <h3 class="font-bold text-gray-700">{{ team.label }}</h3>
            </div>
          }
          <div class="flex flex-wrap gap-3">
            @for (child of (team.children || [team]); track child.id) {
              <div class="bg-white rounded-xl shadow-sm p-3 w-32 cursor-pointer hover:shadow-md transition text-center"
                   (click)="selectMember.emit(child.history!)">
                @if (child.photo_url) {
                  <img [src]="child.photo_url" [alt]="child.label"
                       class="w-14 h-14 rounded-full object-cover mx-auto mb-2">
                } @else {
                  <div class="w-14 h-14 rounded-full bg-pink-100 flex items-center justify-center text-pink-400 font-bold text-lg mx-auto mb-2">
                    {{ child.label[0] }}
                  </div>
                }
                <p class="text-xs font-semibold text-gray-800 leading-tight">{{ child.label }}</p>
                @if (child.sublabel) {
                  <p class="text-xs text-gray-400 mt-0.5">{{ child.sublabel }}</p>
                }
              </div>
            }
          </div>
        </div>
      }
      @if (teamNodes.length === 0) {
        <p class="text-gray-400 text-center py-8">此組合尚無成員資料，歡迎登入補充。</p>
      }
    </div>
  `
})
export class GroupTreeComponent implements OnChanges {
  @Input() group: Group | null = null;
  @Input() histories: History[] = [];
  @Input() teams: Team[] = [];
  @Output() selectMember = new EventEmitter<History>();

  teamNodes: TreeNode[] = [];

  ngOnChanges() {
    this.buildTree();
  }

  private buildTree() {
    if (this.teams.length === 0) {
      // Flat list — no team layer
      this.teamNodes = this.histories.map(h => this.historyToNode(h));
      return;
    }

    const teamMap = new Map<string, TreeNode>();
    for (const team of this.teams) {
      teamMap.set(team.id, {
        type: 'team', id: team.id, label: team.name,
        color: team.color || this.group?.color, children: []
      });
    }

    const noTeam: TreeNode[] = [];
    for (const h of this.histories) {
      const node = this.historyToNode(h);
      if (h.team_id && teamMap.has(h.team_id)) {
        teamMap.get(h.team_id)!.children!.push(node);
      } else {
        noTeam.push(node);
      }
    }

    this.teamNodes = [
      ...Array.from(teamMap.values()).filter(t => t.children!.length > 0),
      ...noTeam
    ];
  }

  private historyToNode(h: History): TreeNode {
    const name = h.member?.name_jp || h.member?.name || '未知成員';
    const period = `${h.joined_at.slice(0,7)} ～ ${h.left_at ? h.left_at.slice(0,7) : '現在'}`;
    return {
      type: 'member', id: h.id, label: name, sublabel: period,
      photo_url: h.member?.photo_url, history: h,
      color: this.group?.color
    };
  }
}
```

- [ ] **Step 2: Verify build**

```bash
ng build --configuration development 2>&1 | tail -5
```

Expected: Build success.

- [ ] **Step 3: Commit**

```bash
git add src/app/shared/group-tree/
git commit -m "feat: add GroupTree component with team layer support"
```

---

## Chunk 5: Member Page & Group Page

### Task 12: Member Page

**Files:**
- Create: `src/app/pages/member-page/member-page.component.ts`
- Create: `src/app/pages/member-page/member-page.component.html`

- [ ] **Step 1: Implement component**

Create `src/app/pages/member-page/member-page.component.ts`:
```typescript
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MemberService } from '../../core/member.service';
import { HistoryService } from '../../core/history.service';
import { MemberTimelineComponent } from '../../shared/member-timeline/member-timeline.component';
import { Member, History } from '../../models';

@Component({
  selector: 'app-member-page',
  standalone: true,
  imports: [CommonModule, RouterLink, MemberTimelineComponent],
  templateUrl: './member-page.component.html',
})
export class MemberPageComponent implements OnInit {
  member: Member | null = null;
  histories: History[] = [];
  loading = true;

  constructor(
    private route: ActivatedRoute,
    private memberService: MemberService,
    private historyService: HistoryService
  ) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    try {
      const [member, histories] = await Promise.all([
        this.memberService.getById(id),
        this.historyService.getByMember(id)
      ]);
      this.member = member;
      this.histories = histories;
    } finally {
      this.loading = false;
    }
  }
}
```

Create `src/app/pages/member-page/member-page.component.html`:
```html
@if (loading) {
  <div class="flex justify-center items-center min-h-screen">
    <div class="w-8 h-8 border-4 border-pink-300 border-t-transparent rounded-full animate-spin"></div>
  </div>
} @else if (!member) {
  <div class="text-center py-24 text-gray-400">找不到此成員。</div>
} @else {
  <div class="max-w-2xl mx-auto px-4 py-10">
    <!-- Back -->
    <a routerLink="/" class="text-sm text-pink-400 hover:underline mb-6 inline-block">← 返回首頁</a>

    <!-- Member header -->
    <div class="flex items-center gap-5 mb-10">
      @if (member.photo_url) {
        <img [src]="member.photo_url" [alt]="member.name"
             class="w-20 h-20 rounded-full object-cover shadow-md">
      } @else {
        <div class="w-20 h-20 rounded-full bg-pink-100 flex items-center justify-center text-3xl text-pink-400 font-black shadow-md">
          {{ member.name[0] }}
        </div>
      }
      <div>
        <h1 class="text-2xl font-black text-gray-800">{{ member.name_jp || member.name }}</h1>
        @if (member.name_jp && member.name !== member.name_jp) {
          <p class="text-gray-500 text-sm">{{ member.name }}</p>
        }
        @if (member.birthdate) {
          <p class="text-gray-400 text-sm mt-0.5">{{ member.birthdate | date:'yyyy 年 MM 月 dd 日' }}</p>
        }
        @if (member.notes) {
          <p class="text-gray-500 text-sm mt-1">{{ member.notes }}</p>
        }
      </div>
    </div>

    <!-- Timeline -->
    <h2 class="text-sm font-bold tracking-widest text-pink-400 uppercase mb-4">活動歷程</h2>
    <app-member-timeline [histories]="histories"></app-member-timeline>
  </div>
}
```

- [ ] **Step 2: Verify build**

```bash
ng build --configuration development 2>&1 | tail -5
```

Expected: Build success.

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/member-page/
git commit -m "feat: add member page with timeline view"
```

---

### Task 13: Group Page

**Files:**
- Create: `src/app/pages/group-page/group-page.component.ts`
- Create: `src/app/pages/group-page/group-page.component.html`

- [ ] **Step 1: Implement component**

Create `src/app/pages/group-page/group-page.component.ts`:
```typescript
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { GroupService } from '../../core/group.service';
import { HistoryService } from '../../core/history.service';
import { GroupTreeComponent } from '../../shared/group-tree/group-tree.component';
import { Group, Team, History } from '../../models';

@Component({
  selector: 'app-group-page',
  standalone: true,
  imports: [CommonModule, RouterLink, GroupTreeComponent],
  templateUrl: './group-page.component.html',
})
export class GroupPageComponent implements OnInit {
  group: Group | null = null;
  teams: Team[] = [];
  histories: History[] = [];
  selectedHistory: History | null = null;
  loading = true;

  constructor(
    private route: ActivatedRoute,
    private groupService: GroupService,
    private historyService: HistoryService
  ) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    try {
      const [group, teams, histories] = await Promise.all([
        this.groupService.getById(id),
        this.groupService.getTeamsByGroup(id),
        this.historyService.getByGroup(id)
      ]);
      this.group = group;
      this.teams = teams;
      this.histories = histories;
    } finally {
      this.loading = false;
    }
  }

  selectMember(h: History) {
    this.selectedHistory = this.selectedHistory?.id === h.id ? null : h;
  }
}
```

Create `src/app/pages/group-page/group-page.component.html`:
```html
@if (loading) {
  <div class="flex justify-center items-center min-h-screen">
    <div class="w-8 h-8 border-4 border-purple-300 border-t-transparent rounded-full animate-spin"></div>
  </div>
} @else if (!group) {
  <div class="text-center py-24 text-gray-400">找不到此組合。</div>
} @else {
  <div class="max-w-3xl mx-auto px-4 py-10">
    <a routerLink="/" class="text-sm text-purple-400 hover:underline mb-6 inline-block">← 返回首頁</a>

    <!-- Group header -->
    <div class="flex items-center gap-4 mb-8">
      <span class="w-6 h-6 rounded-full flex-shrink-0 shadow" [style.background]="group.color"></span>
      <div>
        <h1 class="text-2xl font-black text-gray-800">{{ group.name }}</h1>
        @if (group.name_jp && group.name !== group.name_jp) {
          <p class="text-sm text-gray-500">{{ group.name_jp }}</p>
        }
        <p class="text-xs text-gray-400 mt-0.5">
          {{ group.founded_at | date:'yyyy 年 MM 月' }} 成立
          @if (group.disbanded_at) { ／ {{ group.disbanded_at | date:'yyyy 年 MM 月' }} 解散 }
        </p>
      </div>
    </div>

    <!-- Selected member panel -->
    @if (selectedHistory) {
      <div class="bg-white rounded-2xl shadow-md p-5 mb-6 flex items-start gap-4">
        @if (selectedHistory.member?.photo_url) {
          <img [src]="selectedHistory.member!.photo_url" class="w-14 h-14 rounded-full object-cover">
        } @else {
          <div class="w-14 h-14 rounded-full bg-pink-100 flex items-center justify-center text-pink-400 font-bold text-xl">
            {{ (selectedHistory.member?.name_jp || selectedHistory.member?.name || '?')[0] }}
          </div>
        }
        <div class="flex-1">
          <p class="font-bold text-gray-800">{{ selectedHistory.member?.name_jp || selectedHistory.member?.name }}</p>
          <p class="text-xs text-gray-400">{{ selectedHistory.joined_at | date:'yyyy.MM' }} ～ {{ selectedHistory.left_at ? (selectedHistory.left_at | date:'yyyy.MM') : '現在' }}</p>
          @if (selectedHistory.role) { <p class="text-xs text-gray-500 mt-1">{{ selectedHistory.role }}</p> }
          @if (selectedHistory.notes) { <p class="text-xs text-gray-400 mt-1 italic">{{ selectedHistory.notes }}</p> }
        </div>
        <a [routerLink]="['/member', selectedHistory.member_id]"
           class="text-xs text-pink-400 hover:underline whitespace-nowrap">查看完整歷程 →</a>
      </div>
    }

    <!-- Tree -->
    <h2 class="text-sm font-bold tracking-widest text-purple-400 uppercase mb-4">成員列表</h2>
    <app-group-tree
      [group]="group"
      [histories]="histories"
      [teams]="teams"
      (selectMember)="selectMember($event)">
    </app-group-tree>
  </div>
}
```

- [ ] **Step 2: Verify build**

```bash
ng build --configuration development 2>&1 | tail -5
```

Expected: Build success.

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/group-page/
git commit -m "feat: add group page with tree view and member detail panel"
```

---

## Chunk 6: Admin Interface

### Task 14: Admin Shell

**Files:**
- Create: `src/app/pages/admin/admin-shell/admin-shell.component.ts`
- Create: `src/app/pages/admin/admin-shell/admin-shell.component.html`

- [ ] **Step 1: Implement admin shell**

Create `src/app/pages/admin/admin-shell/admin-shell.component.ts`:
```typescript
import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SupabaseService } from '../../../core/supabase.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './admin-shell.component.html',
})
export class AdminShellComponent {
  constructor(private supabase: SupabaseService, private router: Router) {}

  async signOut() {
    await this.supabase.signOut();
    this.router.navigate(['/']);
  }
}
```

Create `src/app/pages/admin/admin-shell/admin-shell.component.html`:
```html
<div class="min-h-screen flex">
  <!-- Sidebar -->
  <aside class="w-52 bg-white shadow-sm flex flex-col">
    <div class="px-5 py-6 border-b border-gray-100">
      <h2 class="font-black text-gray-800 text-sm">族譜管理</h2>
    </div>
    <nav class="flex-1 px-3 py-4 space-y-1">
      <a routerLink="/admin/members" routerLinkActive="bg-pink-50 text-pink-600"
         class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">
        成員管理
      </a>
      <a routerLink="/admin/groups" routerLinkActive="bg-pink-50 text-pink-600"
         class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">
        組合管理
      </a>
      <a routerLink="/admin/history" routerLinkActive="bg-pink-50 text-pink-600"
         class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition">
        歷史記錄
      </a>
    </nav>
    <div class="px-3 py-4 border-t border-gray-100">
      <a routerLink="/" class="text-xs text-gray-400 hover:underline block mb-2">← 回到首頁</a>
      <button (click)="signOut()" class="text-xs text-gray-400 hover:text-red-400 transition">登出</button>
    </div>
  </aside>

  <!-- Main -->
  <main class="flex-1 p-8 overflow-auto">
    <router-outlet></router-outlet>
  </main>
</div>
```

- [ ] **Step 2: Verify build**

```bash
ng build --configuration development 2>&1 | tail -5
```

Expected: Build success.

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/admin/admin-shell/
git commit -m "feat: add admin shell layout with sidebar navigation"
```

---

### Task 15: Admin Members CRUD

**Files:**
- Create: `src/app/pages/admin/admin-members/admin-members.component.ts`
- Create: `src/app/pages/admin/admin-members/admin-members.component.html`

- [ ] **Step 1: Implement component**

Create `src/app/pages/admin/admin-members/admin-members.component.ts`:
```typescript
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MemberService } from '../../../core/member.service';
import { Member } from '../../../models';

@Component({
  selector: 'app-admin-members',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-members.component.html',
})
export class AdminMembersComponent implements OnInit {
  members: Member[] = [];
  loading = true;
  showModal = false;
  editing: Partial<Member> = {};
  isEdit = false;
  saving = false;
  error = '';

  constructor(private memberService: MemberService) {}

  async ngOnInit() {
    await this.load();
  }

  async load() {
    this.loading = true;
    this.members = await this.memberService.getRecent(200);
    this.loading = false;
  }

  openCreate() {
    this.editing = {};
    this.isEdit = false;
    this.error = '';
    this.showModal = true;
  }

  openEdit(member: Member) {
    this.editing = { ...member };
    this.isEdit = true;
    this.error = '';
    this.showModal = true;
  }

  async save() {
    if (!this.editing.name?.trim()) { this.error = '姓名為必填'; return; }
    this.saving = true;
    try {
      if (this.isEdit && this.editing.id) {
        await this.memberService.update(this.editing.id, this.editing);
      } else {
        await this.memberService.create(this.editing);
      }
      this.showModal = false;
      await this.load();
    } catch (e: any) {
      this.error = e.message || '儲存失敗';
    } finally {
      this.saving = false;
    }
  }

  async delete(member: Member) {
    if (!confirm(`確定刪除「${member.name}」？若此成員有歷史記錄，刪除將失敗。`)) return;
    try {
      await this.memberService.delete(member.id);
      await this.load();
    } catch (e: any) {
      alert(e.message || '刪除失敗，請先刪除相關歷史記錄。');
    }
  }
}
```

Create `src/app/pages/admin/admin-members/admin-members.component.html`:
```html
<div>
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-xl font-black text-gray-800">成員管理</h1>
    <button (click)="openCreate()"
            class="bg-pink-500 text-white rounded-full px-5 py-2 text-sm font-semibold hover:bg-pink-600 transition">
      + 新增成員
    </button>
  </div>

  @if (loading) {
    <p class="text-gray-400">載入中...</p>
  } @else {
    <div class="bg-white rounded-2xl shadow-sm overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
          <tr>
            <th class="px-4 py-3 text-left">姓名</th>
            <th class="px-4 py-3 text-left">日文名</th>
            <th class="px-4 py-3 text-left">生日</th>
            <th class="px-4 py-3 text-left">備註</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          @for (m of members; track m.id) {
            <tr class="hover:bg-gray-50 transition">
              <td class="px-4 py-3 font-semibold text-gray-800">{{ m.name }}</td>
              <td class="px-4 py-3 text-gray-500">{{ m.name_jp || '—' }}</td>
              <td class="px-4 py-3 text-gray-400">{{ m.birthdate || '—' }}</td>
              <td class="px-4 py-3 text-gray-400 max-w-xs truncate">{{ m.notes || '—' }}</td>
              <td class="px-4 py-3 text-right space-x-2">
                <button (click)="openEdit(m)" class="text-xs text-purple-500 hover:underline">編輯</button>
                <button (click)="delete(m)" class="text-xs text-red-400 hover:underline">刪除</button>
              </td>
            </tr>
          }
          @if (!members.length) {
            <tr><td colspan="5" class="text-center py-8 text-gray-400">尚無成員資料</td></tr>
          }
        </tbody>
      </table>
    </div>
  }

  <!-- Modal -->
  @if (showModal) {
    <div class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" (click)="showModal=false">
      <div class="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md" (click)="$event.stopPropagation()">
        <h2 class="text-lg font-black text-gray-800 mb-4">{{ isEdit ? '編輯成員' : '新增成員' }}</h2>
        @if (error) { <p class="text-red-400 text-sm mb-3">{{ error }}</p> }
        <div class="space-y-3">
          <div>
            <label class="text-xs text-gray-500 font-semibold">姓名 *</label>
            <input [(ngModel)]="editing.name" class="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300" placeholder="中文或英文名">
          </div>
          <div>
            <label class="text-xs text-gray-500 font-semibold">日文名</label>
            <input [(ngModel)]="editing.name_jp" class="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300" placeholder="ひらがな 或 漢字">
          </div>
          <div>
            <label class="text-xs text-gray-500 font-semibold">照片 URL</label>
            <input [(ngModel)]="editing.photo_url" class="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300" placeholder="https://...">
          </div>
          <div>
            <label class="text-xs text-gray-500 font-semibold">生日</label>
            <input [(ngModel)]="editing.birthdate" type="date" class="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300">
          </div>
          <div>
            <label class="text-xs text-gray-500 font-semibold">備註</label>
            <textarea [(ngModel)]="editing.notes" rows="2" class="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"></textarea>
          </div>
        </div>
        <div class="flex justify-end gap-3 mt-5">
          <button (click)="showModal=false" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">取消</button>
          <button (click)="save()" [disabled]="saving"
                  class="bg-pink-500 text-white rounded-full px-5 py-2 text-sm font-semibold hover:bg-pink-600 disabled:opacity-50 transition">
            {{ saving ? '儲存中...' : '儲存' }}
          </button>
        </div>
      </div>
    </div>
  }
</div>
```

- [ ] **Step 2: Verify build**

```bash
ng build --configuration development 2>&1 | tail -5
```

Expected: Build success.

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/admin/admin-members/
git commit -m "feat: add admin members CRUD page"
```

---

### Task 16: Admin Groups & History CRUD

**Files:**
- Create: `src/app/pages/admin/admin-groups/admin-groups.component.ts`
- Create: `src/app/pages/admin/admin-groups/admin-groups.component.html`
- Create: `src/app/pages/admin/admin-history/admin-history.component.ts`
- Create: `src/app/pages/admin/admin-history/admin-history.component.html`

- [ ] **Step 1: Implement AdminGroupsComponent**

Create `src/app/pages/admin/admin-groups/admin-groups.component.ts`:
```typescript
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GroupService } from '../../../core/group.service';
import { Group } from '../../../models';

@Component({
  selector: 'app-admin-groups',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-groups.component.html',
})
export class AdminGroupsComponent implements OnInit {
  groups: Group[] = [];
  loading = true;
  showModal = false;
  editing: Partial<Group> = {};
  isEdit = false;
  saving = false;
  error = '';

  constructor(private groupService: GroupService) {}

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading = true;
    this.groups = await this.groupService.getAll();
    this.loading = false;
  }

  openCreate() { this.editing = { color: '#e879a0' }; this.isEdit = false; this.error = ''; this.showModal = true; }
  openEdit(g: Group) { this.editing = { ...g }; this.isEdit = true; this.error = ''; this.showModal = true; }

  async save() {
    if (!this.editing.name?.trim()) { this.error = '組合名稱為必填'; return; }
    this.saving = true;
    try {
      if (this.isEdit && this.editing.id) {
        await this.groupService.update(this.editing.id, this.editing);
      } else {
        await this.groupService.create(this.editing);
      }
      this.showModal = false;
      await this.load();
    } catch (e: any) {
      this.error = e.message || '儲存失敗';
    } finally { this.saving = false; }
  }

  async delete(g: Group) {
    if (!confirm(`確定刪除「${g.name}」？`)) return;
    try {
      await this.groupService.delete(g.id);
      await this.load();
    } catch (e: any) { alert(e.message || '刪除失敗，請先刪除相關記錄。'); }
  }
}
```

Create `src/app/pages/admin/admin-groups/admin-groups.component.html`:
```html
<div>
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-xl font-black text-gray-800">組合管理</h1>
    <button (click)="openCreate()" class="bg-purple-500 text-white rounded-full px-5 py-2 text-sm font-semibold hover:bg-purple-600 transition">+ 新增組合</button>
  </div>
  @if (loading) { <p class="text-gray-400">載入中...</p> }
  @else {
    <div class="bg-white rounded-2xl shadow-sm overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
          <tr>
            <th class="px-4 py-3 text-left">顏色</th>
            <th class="px-4 py-3 text-left">名稱</th>
            <th class="px-4 py-3 text-left">成立</th>
            <th class="px-4 py-3 text-left">解散</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          @for (g of groups; track g.id) {
            <tr class="hover:bg-gray-50 transition">
              <td class="px-4 py-3"><span class="w-4 h-4 rounded-full inline-block" [style.background]="g.color"></span></td>
              <td class="px-4 py-3 font-semibold text-gray-800">{{ g.name }}</td>
              <td class="px-4 py-3 text-gray-400">{{ g.founded_at || '—' }}</td>
              <td class="px-4 py-3 text-gray-400">{{ g.disbanded_at || '—' }}</td>
              <td class="px-4 py-3 text-right space-x-2">
                <button (click)="openEdit(g)" class="text-xs text-purple-500 hover:underline">編輯</button>
                <button (click)="delete(g)" class="text-xs text-red-400 hover:underline">刪除</button>
              </td>
            </tr>
          }
          @if (!groups.length) { <tr><td colspan="5" class="text-center py-8 text-gray-400">尚無組合資料</td></tr> }
        </tbody>
      </table>
    </div>
  }

  @if (showModal) {
    <div class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" (click)="showModal=false">
      <div class="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md" (click)="$event.stopPropagation()">
        <h2 class="text-lg font-black text-gray-800 mb-4">{{ isEdit ? '編輯組合' : '新增組合' }}</h2>
        @if (error) { <p class="text-red-400 text-sm mb-3">{{ error }}</p> }
        <div class="space-y-3">
          <div>
            <label class="text-xs text-gray-500 font-semibold">名稱 *</label>
            <input [(ngModel)]="editing.name" class="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" placeholder="例：AKB48">
          </div>
          <div>
            <label class="text-xs text-gray-500 font-semibold">日文名</label>
            <input [(ngModel)]="editing.name_jp" class="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300">
          </div>
          <div>
            <label class="text-xs text-gray-500 font-semibold">組合顏色</label>
            <div class="flex gap-2 mt-1 items-center">
              <input type="color" [(ngModel)]="editing.color" class="w-10 h-8 rounded cursor-pointer border-0">
              <input [(ngModel)]="editing.color" class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" placeholder="#e879a0">
            </div>
          </div>
          <div class="flex gap-3">
            <div class="flex-1">
              <label class="text-xs text-gray-500 font-semibold">成立日期</label>
              <input [(ngModel)]="editing.founded_at" type="date" class="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300">
            </div>
            <div class="flex-1">
              <label class="text-xs text-gray-500 font-semibold">解散日期</label>
              <input [(ngModel)]="editing.disbanded_at" type="date" class="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300">
            </div>
          </div>
        </div>
        <div class="flex justify-end gap-3 mt-5">
          <button (click)="showModal=false" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">取消</button>
          <button (click)="save()" [disabled]="saving" class="bg-purple-500 text-white rounded-full px-5 py-2 text-sm font-semibold hover:bg-purple-600 disabled:opacity-50 transition">
            {{ saving ? '儲存中...' : '儲存' }}
          </button>
        </div>
      </div>
    </div>
  }
</div>
```

- [ ] **Step 2: Implement AdminHistoryComponent**

Create `src/app/pages/admin/admin-history/admin-history.component.ts`:
```typescript
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HistoryService } from '../../../core/history.service';
import { MemberService } from '../../../core/member.service';
import { GroupService } from '../../../core/group.service';
import { History, Member, Group, Team } from '../../../models';

@Component({
  selector: 'app-admin-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-history.component.html',
})
export class AdminHistoryComponent implements OnInit {
  histories: History[] = [];
  members: Member[] = [];
  groups: Group[] = [];
  teams: Team[] = [];
  loading = true;
  showModal = false;
  editing: Partial<History> = {};
  isEdit = false;
  saving = false;
  error = '';

  statusOptions = [
    { value: 'active', label: '正常在籍' },
    { value: 'concurrent', label: '兼任' },
    { value: 'transferred', label: '移籍' },
    { value: 'graduated', label: '畢業' },
  ];

  constructor(
    private historyService: HistoryService,
    private memberService: MemberService,
    private groupService: GroupService
  ) {}

  async ngOnInit() {
    const [histories, members, groups] = await Promise.all([
      this.historyService.getAll(),
      this.memberService.getRecent(500),
      this.groupService.getAll()
    ]);
    this.histories = histories;
    this.members = members;
    this.groups = groups;
    this.loading = false;
  }

  async onGroupChange() {
    if (this.editing.group_id) {
      this.teams = await this.groupService.getTeamsByGroup(this.editing.group_id);
    } else {
      this.teams = [];
    }
    this.editing.team_id = undefined;
  }

  openCreate() { this.editing = {}; this.teams = []; this.isEdit = false; this.error = ''; this.showModal = true; }
  openEdit(h: History) { this.editing = { ...h }; this.isEdit = true; this.error = ''; this.showModal = true; this.onGroupChange(); }

  async save() {
    if (!this.editing.member_id) { this.error = '請選擇成員'; return; }
    if (!this.editing.group_id) { this.error = '請選擇組合'; return; }
    if (!this.editing.joined_at) { this.error = '加入日期為必填'; return; }
    this.saving = true;
    try {
      if (this.isEdit && this.editing.id) {
        await this.historyService.update(this.editing.id, this.editing);
      } else {
        await this.historyService.create(this.editing);
      }
      this.showModal = false;
      this.histories = await this.historyService.getAll();
    } catch (e: any) {
      this.error = e.message || '儲存失敗';
    } finally { this.saving = false; }
  }

  async delete(h: History) {
    if (!confirm('確定刪除此記錄？')) return;
    try {
      await this.historyService.delete(h.id);
      this.histories = await this.historyService.getAll();
    } catch (e: any) {
      alert(e.message || '刪除失敗');
    }
  }
}
```

Create `src/app/pages/admin/admin-history/admin-history.component.html`:
```html
<div>
  <div class="flex items-center justify-between mb-6">
    <h1 class="text-xl font-black text-gray-800">歷史記錄管理</h1>
    <button (click)="openCreate()" class="bg-pink-500 text-white rounded-full px-5 py-2 text-sm font-semibold hover:bg-pink-600 transition">+ 新增記錄</button>
  </div>
  @if (loading) { <p class="text-gray-400">載入中...</p> }
  @else {
    <div class="bg-white rounded-2xl shadow-sm overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-gray-500 text-xs uppercase tracking-wider">
          <tr>
            <th class="px-4 py-3 text-left">成員</th>
            <th class="px-4 py-3 text-left">組合</th>
            <th class="px-4 py-3 text-left">期間</th>
            <th class="px-4 py-3 text-left">狀態</th>
            <th class="px-4 py-3"></th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-50">
          @for (h of histories; track h.id) {
            <tr class="hover:bg-gray-50 transition">
              <td class="px-4 py-3 font-semibold text-gray-800">{{ h.member?.name_jp || h.member?.name }}</td>
              <td class="px-4 py-3 text-gray-600">{{ h.group?.name }}</td>
              <td class="px-4 py-3 text-gray-400 text-xs">{{ h.joined_at }} ～ {{ h.left_at || '現在' }}</td>
              <td class="px-4 py-3">
                <span class="text-xs px-2 py-0.5 rounded-full"
                      [class]="h.status === 'graduated' ? 'bg-gray-100 text-gray-500' :
                               h.status === 'concurrent' ? 'bg-purple-100 text-purple-600' :
                               h.status === 'transferred' ? 'bg-blue-100 text-blue-600' :
                               'bg-green-100 text-green-600'">
                  {{ h.status === 'active' ? '在籍' : h.status === 'concurrent' ? '兼任' : h.status === 'transferred' ? '移籍' : '畢業' }}
                </span>
              </td>
              <td class="px-4 py-3 text-right space-x-2">
                <button (click)="openEdit(h)" class="text-xs text-purple-500 hover:underline">編輯</button>
                <button (click)="delete(h)" class="text-xs text-red-400 hover:underline">刪除</button>
              </td>
            </tr>
          }
          @if (!histories.length) { <tr><td colspan="5" class="text-center py-8 text-gray-400">尚無記錄</td></tr> }
        </tbody>
      </table>
    </div>
  }

  @if (showModal) {
    <div class="fixed inset-0 bg-black/30 flex items-center justify-center z-50" (click)="showModal=false">
      <div class="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md" (click)="$event.stopPropagation()">
        <h2 class="text-lg font-black text-gray-800 mb-4">{{ isEdit ? '編輯記錄' : '新增記錄' }}</h2>
        @if (error) { <p class="text-red-400 text-sm mb-3">{{ error }}</p> }
        <div class="space-y-3">
          <div>
            <label class="text-xs text-gray-500 font-semibold">成員 *</label>
            <select [(ngModel)]="editing.member_id" class="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300">
              <option value="">請選擇成員</option>
              @for (m of members; track m.id) {
                <option [value]="m.id">{{ m.name_jp || m.name }}</option>
              }
            </select>
          </div>
          <div>
            <label class="text-xs text-gray-500 font-semibold">組合 *</label>
            <select [(ngModel)]="editing.group_id" (ngModelChange)="onGroupChange()" class="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300">
              <option value="">請選擇組合</option>
              @for (g of groups; track g.id) {
                <option [value]="g.id">{{ g.name }}</option>
              }
            </select>
          </div>
          @if (teams.length) {
            <div>
              <label class="text-xs text-gray-500 font-semibold">Team（可選）</label>
              <select [(ngModel)]="editing.team_id" class="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300">
                <option value="">不指定 Team</option>
                @for (t of teams; track t.id) {
                  <option [value]="t.id">{{ t.name }}</option>
                }
              </select>
            </div>
          }
          <div>
            <label class="text-xs text-gray-500 font-semibold">角色（role）</label>
            <input [(ngModel)]="editing.role" class="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300" placeholder="研究生、正式成員、兼任...">
          </div>
          <div>
            <label class="text-xs text-gray-500 font-semibold">狀態（status）</label>
            <select [(ngModel)]="editing.status" class="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300">
              <option value="">請選擇</option>
              @for (s of statusOptions; track s.value) {
                <option [value]="s.value">{{ s.label }}</option>
              }
            </select>
          </div>
          <div class="flex gap-3">
            <div class="flex-1">
              <label class="text-xs text-gray-500 font-semibold">加入日期 *</label>
              <input [(ngModel)]="editing.joined_at" type="date" class="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300">
            </div>
            <div class="flex-1">
              <label class="text-xs text-gray-500 font-semibold">離開日期</label>
              <input [(ngModel)]="editing.left_at" type="date" class="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300">
            </div>
          </div>
          <div>
            <label class="text-xs text-gray-500 font-semibold">備註</label>
            <textarea [(ngModel)]="editing.notes" rows="2" class="w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"></textarea>
          </div>
        </div>
        <div class="flex justify-end gap-3 mt-5">
          <button (click)="showModal=false" class="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">取消</button>
          <button (click)="save()" [disabled]="saving" class="bg-pink-500 text-white rounded-full px-5 py-2 text-sm font-semibold hover:bg-pink-600 disabled:opacity-50 transition">
            {{ saving ? '儲存中...' : '儲存' }}
          </button>
        </div>
      </div>
    </div>
  }
</div>
```

- [ ] **Step 3: Verify build**

```bash
ng build --configuration development 2>&1 | tail -5
```

Expected: Build success.

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/admin/admin-groups/ src/app/pages/admin/admin-history/
git commit -m "feat: add admin groups and history CRUD pages"
```

---

## Chunk 7: Final Verification & Deployment

### Task 17: End-to-End Smoke Test

- [ ] **Step 1: Run dev server and verify all routes**

```bash
ng serve --open
```

Visit and manually verify each route:
- `http://localhost:4200/` — home page loads, search box works
- `http://localhost:4200/login` — Google login button visible
- `http://localhost:4200/admin` — redirects to `/login` (not logged in)
- After logging in: `http://localhost:4200/admin/members` — members table visible
- After creating a member + group + history in admin:
  - Visit `/member/<id>` — timeline shows the history record
  - Visit `/group/<id>` — tree shows the member card

Expected: All routes render without console errors.

- [ ] **Step 2: Run full test suite**

```bash
ng test --watch=false
```

Expected: All specs pass (SupabaseService: 3, MemberService: 4, GroupService: 4, HistoryService: 3, AuthGuard: 3).

- [ ] **Step 3: Production build**

```bash
ng build --configuration production
```

Expected: Build succeeds, `dist/` folder created.

---

### Task 18: Supabase Auth Configuration

- [ ] **Step 1: Add redirect URL in Supabase dashboard**

In Supabase project → Authentication → URL Configuration:
- Add `http://localhost:4200` to "Redirect URLs"
- Add your production URL (e.g., `https://yourname.github.io/idol-genealogy`) to "Redirect URLs"

- [ ] **Step 2: Enable Google OAuth provider**

In Supabase → Authentication → Providers → Google:
- Enable Google provider
- Add Google OAuth client ID and secret (from Google Cloud Console)

Expected: Google sign-in flow completes without error.

---

### Task 19: Deploy to GitHub Pages (optional)

- [ ] **Step 1: Install gh-pages**

```bash
npm install -D gh-pages
```

- [ ] **Step 2: Add deploy script to package.json**

```json
"scripts": {
  "deploy": "ng build --configuration production --base-href=/idol-genealogy/ && npx gh-pages -d dist/idol-genealogy/browser"
}
```

- [ ] **Step 3: Deploy**

```bash
npm run deploy
```

Expected: Site live at `https://<your-github-username>.github.io/idol-genealogy/`

- [ ] **Step 4: Final commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add gh-pages deploy script"
```

---

## Summary

| Chunk | Tasks | Deliverable |
|-------|-------|-------------|
| 1 | 1–2 | Angular project + Supabase schema |
| 2 | 3–7 | Models + Services + AuthGuard + Routing |
| 3 | 8–9 | Login + Home pages |
| 4 | 10–11 | Timeline + Tree visualization components |
| 5 | 12–13 | Member + Group pages |
| 6 | 14–16 | Full admin CRUD interface |
| 7 | 17–19 | Testing + Auth config + Deploy |
