# Role & Audit Log Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin/editor role management, full audit logging of all data changes via DB triggers, and one-click revert from the audit log.

**Architecture:** A `user_roles` table stores admin/editor designations; a `log_changes()` PostgreSQL trigger on all 4 data tables auto-writes field diffs to `audit_log` as JSONB. Angular gains `AdminRoleService` (role checks), `AuditLogService` (log queries + revert), and `adminGuard` (admin-only routes). Two new admin pages handle role management and audit log browsing with revert.

**Tech Stack:** Angular 19 standalone components, Supabase PostgreSQL (triggers, RLS), Tailwind CSS, Jasmine/Karma tests.

---

## Chunk 1: Database Migration & Models

### Task 1: Database migration SQL

**Files:**
- Create: `supabase/migrations/002_roles_and_audit.sql`

This migration must be applied manually in the Supabase Dashboard SQL Editor after the file is committed.

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/002_roles_and_audit.sql
-- Apply manually in Supabase Dashboard SQL Editor

-- ============================================================
-- 1. user_roles table
-- ============================================================
create table user_roles (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  role       text not null check (role in ('admin', 'editor')),
  created_at timestamptz default now()
);

create index on user_roles (email);

-- ============================================================
-- 2. audit_log table
-- ============================================================
create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  table_name  text not null,
  record_id   uuid not null,
  operation   text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  user_id     uuid,       -- NULL if no JWT context (should not happen from frontend)
  user_email  text,
  old_data    jsonb,      -- NULL for INSERT
  new_data    jsonb,      -- NULL for DELETE
  created_at  timestamptz default now()
);

-- Index for filtered queries + sort
create index on audit_log (table_name, operation, created_at desc);

-- ============================================================
-- 3. Trigger function (shared across all 4 tables)
-- SECURITY DEFINER lets it bypass RLS to write to audit_log.
-- auth.uid() / auth.email() are session GUCs set by PostgREST
-- from the JWT — available even in SECURITY DEFINER context.
-- ============================================================
create or replace function log_changes()
returns trigger as $$
begin
  insert into audit_log (table_name, record_id, operation, user_id, user_email, old_data, new_data)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    auth.uid(),
    auth.email(),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return null; -- AFTER trigger: return value is ignored
end;
$$ language plpgsql security definer;

-- ============================================================
-- 4. Attach triggers to all 4 tables
-- ============================================================
create trigger members_audit
  after insert or update or delete on members
  for each row execute function log_changes();

create trigger groups_audit
  after insert or update or delete on groups
  for each row execute function log_changes();

create trigger teams_audit
  after insert or update or delete on teams
  for each row execute function log_changes();

create trigger history_audit
  after insert or update or delete on history
  for each row execute function log_changes();

-- ============================================================
-- 5. RLS on new tables
-- ============================================================
alter table user_roles enable row level security;
alter table audit_log enable row level security;

-- Admin check helper (used in all admin-only policies below):
-- EXISTS (SELECT 1 FROM user_roles WHERE email = auth.email() AND role = 'admin')

-- user_roles: admin only (all operations)
create policy "admins can read user_roles" on user_roles
  for select using (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );
create policy "admins can insert user_roles" on user_roles
  for insert with check (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );
create policy "admins can update user_roles" on user_roles
  for update using (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );
create policy "admins can delete user_roles" on user_roles
  for delete using (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );

-- audit_log: admin read only; no INSERT/UPDATE/DELETE policies
-- (trigger writes via SECURITY DEFINER, bypassing RLS entirely)
create policy "admins can read audit_log" on audit_log
  for select using (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );

-- ============================================================
-- 6. Update DELETE policies on existing tables
-- Drop old permissive policies, add admin-only replacements
-- ============================================================
drop policy "auth users can delete members" on members;
drop policy "auth users can delete groups" on groups;
drop policy "auth users can delete teams" on teams;
drop policy "auth users can delete history" on history;

create policy "admins can delete members" on members
  for delete using (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );
create policy "admins can delete groups" on groups
  for delete using (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );
create policy "admins can delete teams" on teams
  for delete using (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );
create policy "admins can delete history" on history
  for delete using (
    exists (select 1 from user_roles where email = auth.email() and role = 'admin')
  );
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/002_roles_and_audit.sql
git commit -m "feat: add migration for user_roles, audit_log, triggers, updated RLS"
```

**After commit:** Apply this migration manually in Supabase Dashboard → SQL Editor.

---

### Task 2: Add TypeScript interfaces to models

**Files:**
- Modify: `src/app/models/index.ts`

- [ ] **Step 1: Add `UserRole` and `AuditLog` interfaces to `src/app/models/index.ts`**

Append to the end of the file:

```ts
export interface UserRole {
  id: string;
  email: string;
  role: 'admin' | 'editor';
  created_at: string;
}

export interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  user_id: string | null;
  user_email: string | null;
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  created_at: string;
}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
npx tsc --noEmit
```

Expected: no output (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/app/models/index.ts
git commit -m "feat: add UserRole and AuditLog TypeScript interfaces"
```

---

## Chunk 2: Services & Guard (TDD)

### Task 3: AdminRoleService

**Files:**
- Create: `src/app/core/admin-role.service.ts`
- Create: `src/app/core/admin-role.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/core/admin-role.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { AdminRoleService } from './admin-role.service';
import { SupabaseService } from './supabase.service';
import { BehaviorSubject } from 'rxjs';

describe('AdminRoleService', () => {
  let service: AdminRoleService;
  let dbSpy: jasmine.SpyObj<any>;
  let authState$: BehaviorSubject<any>;

  beforeEach(() => {
    authState$ = new BehaviorSubject<any>(null);
    dbSpy = {
      from: jasmine.createSpy('from'),
    };

    TestBed.configureTestingModule({
      providers: [
        AdminRoleService,
        {
          provide: SupabaseService,
          useValue: { client: dbSpy, authState$, getSessionOnce: jasmine.createSpy('getSessionOnce') }
        }
      ]
    });
    service = TestBed.inject(AdminRoleService);
  });

  it('isAdmin$ starts as false before any auth event', () => {
    let val: boolean | undefined;
    service.isAdmin$.subscribe(v => val = v).unsubscribe();
    expect(val).toBeFalse();
  });

  it('isAdmin$ becomes true when authState$ emits a session and user is admin', async () => {
    const supabase = TestBed.inject(SupabaseService) as any;
    const eqEmailSpy = jasmine.createSpy('eqEmail').and.returnValue({
      eq: jasmine.createSpy('eqRole').and.returnValue({
        limit: jasmine.createSpy('limit').and.returnValue(
          Promise.resolve({ data: [{ id: '1' }], error: null })
        )
      })
    });
    dbSpy.from.and.returnValue({ select: jasmine.createSpy().and.returnValue({ eq: eqEmailSpy }) });
    supabase.getSessionOnce.and.returnValue(Promise.resolve({ user: { email: 'admin@test.com' } }));
    authState$.next({ user: { email: 'admin@test.com' } });
    await new Promise(r => setTimeout(r, 10)); // let the async subscribe settle
    let val: boolean | undefined;
    service.isAdmin$.subscribe(v => val = v).unsubscribe();
    expect(val).toBeTrue();
  });

  it('isAdmin$ resets to false when authState$ emits null (logout)', async () => {
    authState$.next(null);
    let val: boolean | undefined;
    service.isAdmin$.subscribe(v => val = v).unsubscribe();
    expect(val).toBeFalse();
  });

  it('isAdmin() returns false when current user is not in user_roles', async () => {
    const supabase = TestBed.inject(SupabaseService) as any;
    supabase.getSessionOnce.and.returnValue(Promise.resolve({ user: { email: 'user@test.com' } }));
    const limitSpy = jasmine.createSpy('limit').and.returnValue(Promise.resolve({ data: [], error: null }));
    const eqRoleSpy = jasmine.createSpy('eqRole').and.returnValue({ limit: limitSpy });
    const eqEmailSpy = jasmine.createSpy('eqEmail').and.returnValue({ eq: eqRoleSpy });
    dbSpy.from.and.returnValue({ select: jasmine.createSpy().and.returnValue({ eq: eqEmailSpy }) });
    const result = await service.isAdmin();
    expect(result).toBeFalse();
  });

  it('isAdmin() returns true when current user has admin role', async () => {
    const supabase = TestBed.inject(SupabaseService) as any;
    supabase.getSessionOnce.and.returnValue(Promise.resolve({ user: { email: 'admin@test.com' } }));
    const limitSpy = jasmine.createSpy('limit').and.returnValue(
      Promise.resolve({ data: [{ id: '1' }], error: null })
    );
    const eqRoleSpy = jasmine.createSpy('eqRole').and.returnValue({ limit: limitSpy });
    const eqEmailSpy = jasmine.createSpy('eqEmail').and.returnValue({ eq: eqRoleSpy });
    dbSpy.from.and.returnValue({ select: jasmine.createSpy().and.returnValue({ eq: eqEmailSpy }) });
    const result = await service.isAdmin();
    expect(result).toBeTrue();
  });

  it('getAll() returns user_roles list', async () => {
    const roles = [{ id: '1', email: 'a@b.com', role: 'admin', created_at: '' }];
    const fromChain = {
      select: jasmine.createSpy().and.returnValue({ data: roles, error: null })
    };
    dbSpy.from.and.returnValue(fromChain);
    const result = await service.getAll();
    expect(result).toEqual(roles as any);
  });

  it('add() inserts a new user_role', async () => {
    const fromChain = {
      insert: jasmine.createSpy().and.returnValue(Promise.resolve({ error: null }))
    };
    dbSpy.from.and.returnValue(fromChain);
    await expectAsync(service.add('new@test.com', 'editor')).toBeResolved();
    expect(fromChain.insert).toHaveBeenCalledWith({ email: 'new@test.com', role: 'editor' });
  });

  it('remove() deletes a user_role by id', async () => {
    const eqSpy = jasmine.createSpy('eq').and.returnValue(Promise.resolve({ error: null }));
    const fromChain = {
      delete: jasmine.createSpy().and.returnValue({ eq: eqSpy })
    };
    dbSpy.from.and.returnValue(fromChain);
    await expectAsync(service.remove('role-id-1')).toBeResolved();
    expect(eqSpy).toHaveBeenCalledWith('id', 'role-id-1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
ng test --watch=false --include="**/admin-role.service.spec.ts" 2>&1 | tail -20
```

Expected: FAILED — `AdminRoleService` not found.

- [ ] **Step 3: Implement `AdminRoleService`**

Create `src/app/core/admin-role.service.ts`:

```ts
import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { UserRole } from '../models';

@Injectable({ providedIn: 'root' })
export class AdminRoleService implements OnDestroy {
  private _isAdmin = new BehaviorSubject<boolean>(false);
  readonly isAdmin$ = this._isAdmin.asObservable();
  private _sub: Subscription;

  constructor(private supabase: SupabaseService) {
    // Re-check admin status whenever auth state changes
    this._sub = this.supabase.authState$.subscribe(session => {
      if (session) {
        this.isAdmin().then(val => this._isAdmin.next(val));
      } else {
        this._isAdmin.next(false);
      }
    });
  }

  ngOnDestroy(): void {
    this._sub.unsubscribe();
  }

  /** Check if the currently logged-in user has role='admin' in user_roles. */
  async isAdmin(): Promise<boolean> {
    const session = await this.supabase.getSessionOnce();
    if (!session?.user?.email) return false;
    const { data, error } = await this.supabase.client
      .from('user_roles')
      .select('id')
      .eq('email', session.user.email)
      .eq('role', 'admin')
      .limit(1);
    if (error || !data) return false;
    return data.length > 0;
  }

  async getAll(): Promise<UserRole[]> {
    const { data, error } = await this.supabase.client
      .from('user_roles')
      .select('*');
    if (error) throw error;
    return data ?? [];
  }

  async add(email: string, role: 'admin' | 'editor'): Promise<void> {
    const { error } = await this.supabase.client
      .from('user_roles')
      .insert({ email, role });
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('user_roles')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
ng test --watch=false --include="**/admin-role.service.spec.ts" 2>&1 | tail -10
```

Expected: `8 SUCCESS`

- [ ] **Step 5: Commit**

```bash
git add src/app/core/admin-role.service.ts src/app/core/admin-role.service.spec.ts
git commit -m "feat: add AdminRoleService with isAdmin$ and CRUD for user_roles"
```

---

### Task 4: AuditLogService

**Files:**
- Create: `src/app/core/audit-log.service.ts`
- Create: `src/app/core/audit-log.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/core/audit-log.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { AuditLogService } from './audit-log.service';
import { SupabaseService } from './supabase.service';
import { AuditLog } from '../models';

function makeLog(overrides: Partial<AuditLog> = {}): AuditLog {
  return {
    id: 'log-1',
    table_name: 'members',
    record_id: 'rec-1',
    operation: 'UPDATE',
    user_id: 'uid-1',
    user_email: 'a@b.com',
    old_data: { name: 'Old Name' },
    new_data: { name: 'New Name' },
    created_at: '2026-01-01T00:00:00Z',
    ...overrides
  };
}

describe('AuditLogService', () => {
  let service: AuditLogService;
  let dbSpy: jasmine.SpyObj<any>;

  beforeEach(() => {
    dbSpy = { from: jasmine.createSpy('from') };

    TestBed.configureTestingModule({
      providers: [
        AuditLogService,
        { provide: SupabaseService, useValue: { client: dbSpy } }
      ]
    });
    service = TestBed.inject(AuditLogService);
  });

  it('getAll() returns audit log entries ordered by created_at desc', async () => {
    const logs = [makeLog()];
    const chain = {
      select: jasmine.createSpy().and.returnValue({
        order: jasmine.createSpy().and.returnValue({
          limit: jasmine.createSpy().and.returnValue(Promise.resolve({ data: logs, error: null }))
        })
      })
    };
    dbSpy.from.and.returnValue(chain);
    const result = await service.getAll();
    expect(result).toEqual(logs);
  });

  it('getAll() applies table_name filter when provided', async () => {
    const eqSpy = jasmine.createSpy('eq').and.returnValue({
      order: jasmine.createSpy().and.returnValue({
        limit: jasmine.createSpy().and.returnValue(Promise.resolve({ data: [], error: null }))
      })
    });
    const chain = {
      select: jasmine.createSpy().and.returnValue({ eq: eqSpy })
    };
    dbSpy.from.and.returnValue(chain);
    await service.getAll({ table_name: 'members' });
    expect(eqSpy).toHaveBeenCalledWith('table_name', 'members');
  });

  it('revert() calls update with old_data for UPDATE operation', async () => {
    const log = makeLog({ operation: 'UPDATE', old_data: { name: 'Old' }, record_id: 'rec-1' });
    const eqSpy = jasmine.createSpy('eq').and.returnValue(Promise.resolve({ error: null }));
    const updateChain = { eq: eqSpy };
    const chain = {
      update: jasmine.createSpy().and.returnValue(updateChain),
      delete: jasmine.createSpy(),
      insert: jasmine.createSpy(),
    };
    dbSpy.from.and.returnValue(chain);
    await service.revert(log);
    expect(chain.update).toHaveBeenCalledWith(log.old_data);
    expect(eqSpy).toHaveBeenCalledWith('id', 'rec-1');
  });

  it('revert() calls delete for INSERT operation', async () => {
    const log = makeLog({ operation: 'INSERT', record_id: 'rec-2' });
    const eqSpy = jasmine.createSpy('eq').and.returnValue(Promise.resolve({ error: null }));
    const chain = {
      delete: jasmine.createSpy().and.returnValue({ eq: eqSpy }),
      update: jasmine.createSpy(),
      insert: jasmine.createSpy(),
    };
    dbSpy.from.and.returnValue(chain);
    await service.revert(log);
    expect(chain.delete).toHaveBeenCalled();
    expect(eqSpy).toHaveBeenCalledWith('id', 'rec-2');
  });

  it('revert() calls insert with old_data for DELETE operation', async () => {
    const log = makeLog({ operation: 'DELETE', old_data: { id: 'rec-3', name: 'Gone' } });
    const chain = {
      insert: jasmine.createSpy().and.returnValue(Promise.resolve({ error: null })),
      delete: jasmine.createSpy(),
      update: jasmine.createSpy(),
    };
    dbSpy.from.and.returnValue(chain);
    await service.revert(log);
    expect(chain.insert).toHaveBeenCalledWith(log.old_data);
  });

  it('revert() throws when Supabase returns an error', async () => {
    const log = makeLog({ operation: 'UPDATE' });
    const eqSpy = jasmine.createSpy('eq').and.returnValue(
      Promise.resolve({ error: { message: 'FK violation' } })
    );
    const chain = {
      update: jasmine.createSpy().and.returnValue({ eq: eqSpy }),
      delete: jasmine.createSpy(),
      insert: jasmine.createSpy(),
    };
    dbSpy.from.and.returnValue(chain);
    await expectAsync(service.revert(log)).toBeRejectedWithError('FK violation');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
ng test --watch=false --include="**/audit-log.service.spec.ts" 2>&1 | tail -10
```

Expected: FAILED — `AuditLogService` not found.

- [ ] **Step 3: Implement `AuditLogService`**

Create `src/app/core/audit-log.service.ts`:

```ts
import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuditLog } from '../models';

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  constructor(private supabase: SupabaseService) {}

  private get db() { return this.supabase.client; }

  async getAll(filter?: { table_name?: string; operation?: string }): Promise<AuditLog[]> {
    let query = this.db.from('audit_log').select('*');
    if (filter?.table_name) query = (query as any).eq('table_name', filter.table_name);
    if (filter?.operation) query = (query as any).eq('operation', filter.operation);
    const { data, error } = await (query as any)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  }

  async revert(log: AuditLog): Promise<void> {
    let result: { error: any };
    if (log.operation === 'INSERT') {
      result = await this.db.from(log.table_name).delete().eq('id', log.record_id);
    } else if (log.operation === 'UPDATE') {
      result = await this.db.from(log.table_name).update(log.old_data!).eq('id', log.record_id);
    } else {
      // DELETE → re-insert old_data
      result = await this.db.from(log.table_name).insert(log.old_data!);
    }
    if (result.error) throw new Error(result.error.message ?? '還原失敗');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
ng test --watch=false --include="**/audit-log.service.spec.ts" 2>&1 | tail -10
```

Expected: `5 SUCCESS`

- [ ] **Step 5: Commit**

```bash
git add src/app/core/audit-log.service.ts src/app/core/audit-log.service.spec.ts
git commit -m "feat: add AuditLogService with getAll, filter, and revert"
```

---

### Task 5: AdminGuard

**Files:**
- Create: `src/app/core/admin.guard.ts`
- Create: `src/app/core/admin.guard.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/app/core/admin.guard.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { Router, RouterStateSnapshot } from '@angular/router';
import { adminGuard } from './admin.guard';
import { AdminRoleService } from './admin-role.service';

describe('adminGuard', () => {
  let routerSpy: jasmine.SpyObj<Router>;

  function setup(isAdmin: boolean) {
    routerSpy = jasmine.createSpyObj('Router', ['createUrlTree']);
    routerSpy.createUrlTree.and.returnValue('/admin' as any);
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: routerSpy },
        { provide: AdminRoleService, useValue: { isAdmin: () => Promise.resolve(isAdmin) } }
      ]
    });
  }

  it('allows admin users', async () => {
    setup(true);
    const result = await TestBed.runInInjectionContext(() =>
      adminGuard(null as any, { url: '/admin/audit-log' } as RouterStateSnapshot)
    );
    expect(result).toBeTrue();
  });

  it('redirects non-admin users to /admin', async () => {
    setup(false);
    const result = await TestBed.runInInjectionContext(() =>
      adminGuard(null as any, { url: '/admin/audit-log' } as RouterStateSnapshot)
    );
    expect(result).not.toBeTrue(); // must return a UrlTree, not boolean true
    expect(routerSpy.createUrlTree).toHaveBeenCalledWith(['/admin']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
ng test --watch=false --include="**/admin.guard.spec.ts" 2>&1 | tail -10
```

Expected: FAILED — `adminGuard` not found.

- [ ] **Step 3: Implement `AdminGuard`**

Create `src/app/core/admin.guard.ts`:

```ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminRoleService } from './admin-role.service';

export const adminGuard: CanActivateFn = async (_route, _state) => {
  const adminRole = inject(AdminRoleService);
  const router = inject(Router);
  const isAdmin = await adminRole.isAdmin();
  if (isAdmin) return true;
  return router.createUrlTree(['/admin']);
};
```

- [ ] **Step 4: Run all tests**

```bash
ng test --watch=false 2>&1 | tail -10
```

Expected: all passing (previous 19 + 5 + 5 + 2 = 31 SUCCESS).

- [ ] **Step 5: Commit**

```bash
git add src/app/core/admin.guard.ts src/app/core/admin.guard.spec.ts
git commit -m "feat: add adminGuard — redirects non-admin to /admin"
```

---

## Chunk 3: Routes & Existing Page Updates

### Task 6: Update routes

**Files:**
- Modify: `src/app/app.routes.ts`

- [ ] **Step 1: Add two new admin child routes to `src/app/app.routes.ts`**

In the `children` array under the `admin` path, add before the `{ path: '', redirectTo: ... }` entry:

```ts
import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { adminGuard } from './core/admin.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent)
  },
  {
    path: 'member/:id',
    loadComponent: () => import('./pages/member-page/member-page.component').then(m => m.MemberPageComponent)
  },
  {
    path: 'group/:id',
    loadComponent: () => import('./pages/group-page/group-page.component').then(m => m.GroupPageComponent)
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/admin/admin-shell/admin-shell.component').then(m => m.AdminShellComponent),
    children: [
      { path: 'members', loadComponent: () => import('./pages/admin/admin-members/admin-members.component').then(m => m.AdminMembersComponent) },
      { path: 'groups', loadComponent: () => import('./pages/admin/admin-groups/admin-groups.component').then(m => m.AdminGroupsComponent) },
      { path: 'history', loadComponent: () => import('./pages/admin/admin-history/admin-history.component').then(m => m.AdminHistoryComponent) },
      {
        path: 'audit-log',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/admin/admin-audit-log/admin-audit-log.component').then(m => m.AdminAuditLogComponent)
      },
      {
        path: 'roles',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/admin/admin-roles/admin-roles.component').then(m => m.AdminRolesComponent)
      },
      { path: '', redirectTo: 'members', pathMatch: 'full' }
    ]
  },
  { path: '**', redirectTo: '' }
];
```

- [ ] **Step 2: Run tests to confirm no breakage**

```bash
ng test --watch=false 2>&1 | tail -5
```

Expected: all previously passing tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/app.routes.ts
git commit -m "feat: add audit-log and roles admin routes with adminGuard"
```

---

### Task 7: Update Admin Shell — conditional sidebar links

**Files:**
- Modify: `src/app/pages/admin/admin-shell/admin-shell.component.ts`
- Modify: `src/app/pages/admin/admin-shell/admin-shell.component.html`

- [ ] **Step 1: Update `admin-shell.component.ts`**

Replace the entire file content:

```ts
import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SupabaseService } from '../../../core/supabase.service';
import { AdminRoleService } from '../../../core/admin-role.service';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './admin-shell.component.html',
})
export class AdminShellComponent implements OnDestroy {
  isAdmin = false;
  private _sub: Subscription;

  constructor(
    private supabase: SupabaseService,
    private adminRole: AdminRoleService,
    private router: Router
  ) {
    this._sub = this.adminRole.isAdmin$.subscribe(v => this.isAdmin = v);
  }

  ngOnDestroy(): void {
    this._sub.unsubscribe();
  }

  async signOut() {
    await this.supabase.signOut();
    this.router.navigate(['/']);
  }
}
```

- [ ] **Step 2: Update `admin-shell.component.html`**

Replace the entire file content:

```html
<div class="flex h-screen bg-gray-50">
  <!-- Left Sidebar -->
  <aside class="w-52 bg-white shadow-md flex flex-col flex-shrink-0">
    <!-- App name -->
    <div class="px-6 py-6 border-b border-gray-100">
      <span class="font-['Cormorant_Garamond'] text-xl font-semibold text-gray-800 tracking-wide">族譜管理</span>
    </div>

    <!-- Nav links -->
    <nav class="flex-1 px-3 py-4 space-y-1">
      <a
        routerLink="/admin/members"
        routerLinkActive="bg-pink-100 text-pink-700 font-medium"
        class="flex items-center px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-pink-50 hover:text-pink-600 transition-colors"
      >
        成員管理
      </a>
      <a
        routerLink="/admin/groups"
        routerLinkActive="bg-pink-100 text-pink-700 font-medium"
        class="flex items-center px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-pink-50 hover:text-pink-600 transition-colors"
      >
        組合管理
      </a>
      <a
        routerLink="/admin/history"
        routerLinkActive="bg-pink-100 text-pink-700 font-medium"
        class="flex items-center px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-pink-50 hover:text-pink-600 transition-colors"
      >
        歷史記錄
      </a>

      <!-- Admin-only links -->
      @if (isAdmin) {
        <div class="pt-2 mt-2 border-t border-gray-100">
          <a
            routerLink="/admin/audit-log"
            routerLinkActive="bg-purple-100 text-purple-700 font-medium"
            class="flex items-center px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-purple-50 hover:text-purple-600 transition-colors"
          >
            變更記錄
          </a>
          <a
            routerLink="/admin/roles"
            routerLinkActive="bg-purple-100 text-purple-700 font-medium"
            class="flex items-center px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-purple-50 hover:text-purple-600 transition-colors"
          >
            角色管理
          </a>
        </div>
      }
    </nav>

    <!-- Bottom actions -->
    <div class="px-4 py-4 border-t border-gray-100 space-y-2">
      <a
        routerLink="/"
        class="flex items-center px-3 py-2 rounded-md text-sm text-gray-500 hover:text-pink-600 hover:bg-pink-50 transition-colors"
      >
        ← 回到首頁
      </a>
      <button
        (click)="signOut()"
        class="w-full text-left px-3 py-2 rounded-md text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors"
      >
        登出
      </button>
    </div>
  </aside>

  <!-- Main content area -->
  <main class="flex-1 overflow-auto">
    <router-outlet />
  </main>
</div>
```

- [ ] **Step 3: Run tests**

```bash
ng test --watch=false 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/admin/admin-shell/admin-shell.component.ts src/app/pages/admin/admin-shell/admin-shell.component.html
git commit -m "feat: admin shell shows audit-log and roles links for admin users only"
```

---

### Task 8: Hide delete buttons from non-admin users

**Files:**
- Modify: `src/app/pages/admin/admin-members/admin-members.component.ts`
- Modify: `src/app/pages/admin/admin-members/admin-members.component.html`
- Modify: `src/app/pages/admin/admin-groups/admin-groups.component.ts`
- Modify: `src/app/pages/admin/admin-groups/admin-groups.component.html`
- Modify: `src/app/pages/admin/admin-history/admin-history.component.ts`
- Modify: `src/app/pages/admin/admin-history/admin-history.component.html`

The pattern is identical for all three components. For each:

1. Import `AdminRoleService` and `Subscription`
2. Add `isAdmin = false` property
3. Subscribe to `adminRole.isAdmin$` in constructor, unsubscribe in `ngOnDestroy`
4. In template: wrap delete button with `@if (isAdmin)`

- [ ] **Step 1: Update `admin-members.component.ts`**

```ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MemberService } from '../../../core/member.service';
import { AdminRoleService } from '../../../core/admin-role.service';
import { Member } from '../../../models';

@Component({
  selector: 'app-admin-members',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-members.component.html',
})
export class AdminMembersComponent implements OnInit, OnDestroy {
  members: Member[] = [];
  loading = true;
  showModal = false;
  editing: Partial<Member> = {};
  isEdit = false;
  saving = false;
  error = '';
  isAdmin = false;
  private _sub: Subscription;

  constructor(
    private memberService: MemberService,
    private adminRole: AdminRoleService
  ) {
    this._sub = this.adminRole.isAdmin$.subscribe(v => this.isAdmin = v);
  }

  ngOnDestroy(): void { this._sub.unsubscribe(); }

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading = true;
    try {
      this.members = await this.memberService.getRecent(200);
    } finally {
      this.loading = false;
    }
  }

  openCreate() { this.editing = {}; this.isEdit = false; this.error = ''; this.showModal = true; }
  openEdit(m: Member) { this.editing = { ...m }; this.isEdit = true; this.error = ''; this.showModal = true; }

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
    } finally { this.saving = false; }
  }

  async delete(m: Member) {
    if (!confirm(`確定刪除「${m.name}」？若此成員有歷史記錄，刪除將失敗。`)) return;
    try {
      await this.memberService.delete(m.id);
      await this.load();
    } catch (e: any) {
      alert(e.message || '刪除失敗，請先刪除相關歷史記錄。');
    }
  }
}
```

- [ ] **Step 2: In `admin-members.component.html`, find every `<button` that calls `delete(m)` and wrap it**

In the template, find each button that calls `(click)="delete(m)"` and wrap it. Preserve the existing button element and its classes exactly — only add the `@if` wrapper:

```html
@if (isAdmin) {
  <button (click)="delete(m)" class="text-xs text-red-400 hover:text-red-600 transition-colors">刪除</button>
}
```

- [ ] **Step 3: Update `admin-groups.component.ts`**

Replace the entire file content:

```ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { GroupService } from '../../../core/group.service';
import { AdminRoleService } from '../../../core/admin-role.service';
import { Group } from '../../../models';

@Component({
  selector: 'app-admin-groups',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-groups.component.html',
})
export class AdminGroupsComponent implements OnInit, OnDestroy {
  groups: Group[] = [];
  loading = true;
  showModal = false;
  editing: Partial<Group> = {};
  isEdit = false;
  saving = false;
  error = '';
  isAdmin = false;
  private _sub: Subscription;

  constructor(
    private groupService: GroupService,
    private adminRole: AdminRoleService
  ) {
    this._sub = this.adminRole.isAdmin$.subscribe(v => this.isAdmin = v);
  }

  ngOnDestroy(): void { this._sub.unsubscribe(); }

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading = true;
    try {
      this.groups = await this.groupService.getAll();
    } finally {
      this.loading = false;
    }
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

- [ ] **Step 4: In `admin-groups.component.html`, find each `<button` that calls `delete(g)` and wrap it**

```html
@if (isAdmin) {
  <button (click)="delete(g)" class="text-xs text-red-400 hover:text-red-600 transition-colors">刪除</button>
}
```

- [ ] **Step 5: Update `admin-history.component.ts`**

Replace the entire file content:

```ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { HistoryService } from '../../../core/history.service';
import { MemberService } from '../../../core/member.service';
import { GroupService } from '../../../core/group.service';
import { AdminRoleService } from '../../../core/admin-role.service';
import { History, Member, Group, Team } from '../../../models';

@Component({
  selector: 'app-admin-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-history.component.html',
})
export class AdminHistoryComponent implements OnInit, OnDestroy {
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
  isAdmin = false;
  private _sub: Subscription;

  statusOptions = [
    { value: 'active', label: '正常在籍' },
    { value: 'concurrent', label: '兼任' },
    { value: 'transferred', label: '移籍' },
    { value: 'graduated', label: '畢業' },
  ];

  constructor(
    private historyService: HistoryService,
    private memberService: MemberService,
    private groupService: GroupService,
    private adminRole: AdminRoleService
  ) {
    this._sub = this.adminRole.isAdmin$.subscribe(v => this.isAdmin = v);
  }

  ngOnDestroy(): void { this._sub.unsubscribe(); }

  async ngOnInit() {
    try {
      const [histories, members, groups] = await Promise.all([
        this.historyService.getAll(),
        this.memberService.getRecent(500),
        this.groupService.getAll()
      ]);
      this.histories = histories;
      this.members = members;
      this.groups = groups;
    } catch (e: any) {
      this.error = e.message || '載入失敗';
    } finally {
      this.loading = false;
    }
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
  openEdit(h: History) { this.editing = { ...h }; this.isEdit = true; this.error = ''; this.showModal = true; void this.onGroupChange(); }

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

- [ ] **Step 6: In `admin-history.component.html`, find each `<button` that calls `delete(h)` and wrap it**

```html
@if (isAdmin) {
  <button (click)="delete(h)" class="text-xs text-red-400 hover:text-red-600 transition-colors">刪除</button>
}
```

- [ ] **Step 7: Run tests**

```bash
ng test --watch=false 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 8: Build to verify no template errors**

```bash
ng build 2>&1 | tail -5
```

Expected: `Application bundle generation complete.`

- [ ] **Step 9: Commit**

```bash
git add src/app/pages/admin/admin-members/ src/app/pages/admin/admin-groups/ src/app/pages/admin/admin-history/
git commit -m "feat: hide delete buttons from non-admin users in all CRUD pages"
```

---

## Chunk 4: New Admin Pages

### Task 9: Admin Audit Log page

**Files:**
- Create: `src/app/pages/admin/admin-audit-log/admin-audit-log.component.ts`
- Create: `src/app/pages/admin/admin-audit-log/admin-audit-log.component.html`

- [ ] **Step 1: Create `admin-audit-log.component.ts`**

```ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuditLogService } from '../../../core/audit-log.service';
import { AuditLog } from '../../../models';

@Component({
  selector: 'app-admin-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-audit-log.component.html',
})
export class AdminAuditLogComponent implements OnInit {
  logs: AuditLog[] = [];
  loading = true;
  error = '';
  filterTable = '';
  filterOperation = '';
  expandedId: string | null = null;
  revertError: { [id: string]: string } = {};
  revertSuccess: { [id: string]: boolean } = {};
  reverting: { [id: string]: boolean } = {};
  showConfirm: string | null = null;

  tableOptions = ['members', 'groups', 'teams', 'history'];
  operationOptions = ['INSERT', 'UPDATE', 'DELETE'];

  constructor(private auditLog: AuditLogService) {}

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading = true;
    this.error = '';
    try {
      const filter: any = {};
      if (this.filterTable) filter.table_name = this.filterTable;
      if (this.filterOperation) filter.operation = this.filterOperation;
      this.logs = await this.auditLog.getAll(filter);
    } catch (e: any) {
      this.error = e.message || '載入失敗';
    } finally {
      this.loading = false;
    }
  }

  toggleExpand(id: string) {
    this.expandedId = this.expandedId === id ? null : id;
  }

  getDiff(log: AuditLog): { field: string; before: any; after: any }[] {
    if (!log.old_data && !log.new_data) return [];
    const fields = new Set([
      ...Object.keys(log.old_data ?? {}),
      ...Object.keys(log.new_data ?? {})
    ]);
    const diffs: { field: string; before: any; after: any }[] = [];
    for (const f of fields) {
      const before = log.old_data?.[f] ?? null;
      const after = log.new_data?.[f] ?? null;
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        diffs.push({ field: f, before, after });
      }
    }
    return diffs;
  }

  confirmRevert(id: string) {
    this.showConfirm = id;
  }

  cancelRevert() {
    this.showConfirm = null;
  }

  async executeRevert(log: AuditLog) {
    this.showConfirm = null;
    this.reverting[log.id] = true;
    this.revertError[log.id] = '';
    this.revertSuccess[log.id] = false;
    try {
      await this.auditLog.revert(log);
      this.revertSuccess[log.id] = true;
      setTimeout(() => { this.revertSuccess[log.id] = false; }, 3000);
      await this.load();
    } catch (e: any) {
      this.revertError[log.id] = e.message || '還原失敗';
    } finally {
      this.reverting[log.id] = false;
    }
  }

  operationLabel(op: string): string {
    return { INSERT: '新增', UPDATE: '編輯', DELETE: '刪除' }[op] ?? op;
  }

  operationClass(op: string): string {
    return {
      INSERT: 'bg-green-100 text-green-700',
      UPDATE: 'bg-blue-100 text-blue-700',
      DELETE: 'bg-red-100 text-red-700'
    }[op] ?? 'bg-gray-100 text-gray-600';
  }

  revertActionLabel(op: string): string {
    return {
      INSERT: '刪除此新增的資料',
      UPDATE: '將資料還原為編輯前的狀態',
      DELETE: '重新插入被刪除的資料'
    }[op] ?? '還原';
  }
}
```

- [ ] **Step 2: Create `admin-audit-log.component.html`**

```html
<div class="p-6">
  <h1 class="font-['Cormorant_Garamond'] text-2xl font-semibold text-gray-800 mb-6">變更記錄</h1>

  <!-- Filters -->
  <div class="flex gap-4 mb-4">
    <select [(ngModel)]="filterTable" (change)="load()"
      class="border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-1 focus:ring-pink-300">
      <option value="">全部資料表</option>
      @for (t of tableOptions; track t) {
        <option [value]="t">{{ t }}</option>
      }
    </select>
    <select [(ngModel)]="filterOperation" (change)="load()"
      class="border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-1 focus:ring-pink-300">
      <option value="">全部操作</option>
      @for (op of operationOptions; track op) {
        <option [value]="op">{{ operationLabel(op) }}</option>
      }
    </select>
    <button (click)="load()" class="px-3 py-1.5 text-sm text-gray-500 hover:text-pink-600 transition-colors">
      重新載入
    </button>
  </div>

  <!-- Loading / error -->
  @if (loading) {
    <div class="text-sm text-gray-400 py-8 text-center">載入中…</div>
  } @else if (error) {
    <div class="text-sm text-red-500 py-4">{{ error }}</div>
  } @else if (logs.length === 0) {
    <div class="text-sm text-gray-400 py-8 text-center">尚無變更記錄</div>
  } @else {
    <div class="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-100">
          <tr>
            <th class="px-4 py-3 text-left text-xs text-gray-500 font-medium">時間</th>
            <th class="px-4 py-3 text-left text-xs text-gray-500 font-medium">操作者</th>
            <th class="px-4 py-3 text-left text-xs text-gray-500 font-medium">資料表</th>
            <th class="px-4 py-3 text-left text-xs text-gray-500 font-medium">操作</th>
            <th class="px-4 py-3 text-right text-xs text-gray-500 font-medium">還原</th>
          </tr>
        </thead>
        <tbody>
          @for (log of logs; track log.id) {
            <!-- Main row -->
            <tr
              class="border-b border-gray-50 hover:bg-pink-50/30 cursor-pointer transition-colors"
              (click)="toggleExpand(log.id)"
            >
              <td class="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                {{ log.created_at | date:'yyyy/MM/dd HH:mm' }}
              </td>
              <td class="px-4 py-3 text-gray-600 text-xs">
                {{ log.user_email ?? '—' }}
              </td>
              <td class="px-4 py-3 text-gray-600 text-xs font-mono">{{ log.table_name }}</td>
              <td class="px-4 py-3">
                <span class="px-2 py-0.5 rounded-full text-xs font-medium" [ngClass]="operationClass(log.operation)">
                  {{ operationLabel(log.operation) }}
                </span>
              </td>
              <td class="px-4 py-3 text-right" (click)="$event.stopPropagation()">
                @if (revertSuccess[log.id]) {
                  <span class="text-xs text-green-600">✓ 已還原</span>
                } @else if (revertError[log.id]) {
                  <span class="text-xs text-red-500" [title]="revertError[log.id]">還原失敗</span>
                } @else if (showConfirm === log.id) {
                  <div class="flex items-center gap-2 justify-end">
                    <span class="text-xs text-gray-500">{{ revertActionLabel(log.operation) }}？</span>
                    <button (click)="executeRevert(log)"
                      class="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 transition-colors">
                      確認
                    </button>
                    <button (click)="cancelRevert()"
                      class="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 transition-colors">
                      取消
                    </button>
                  </div>
                } @else {
                  <button
                    (click)="confirmRevert(log.id)"
                    [disabled]="reverting[log.id]"
                    class="px-3 py-1 text-xs border border-orange-300 text-orange-600 rounded hover:bg-orange-50 transition-colors disabled:opacity-40"
                  >
                    還原
                  </button>
                }
              </td>
            </tr>

            <!-- Expanded diff row -->
            @if (expandedId === log.id) {
              <tr class="bg-gray-50">
                <td colspan="5" class="px-6 py-4">
                  @let diffs = getDiff(log);
                  @if (diffs.length === 0) {
                    <span class="text-xs text-gray-400">無欄位差異</span>
                  } @else {
                    <table class="text-xs w-full max-w-2xl">
                      <thead>
                        <tr class="text-gray-400">
                          <th class="text-left pb-1 pr-4 font-medium">欄位</th>
                          <th class="text-left pb-1 pr-4 font-medium">改前</th>
                          <th class="text-left pb-1 font-medium">改後</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (d of diffs; track d.field) {
                          <tr class="border-t border-gray-100">
                            <td class="py-1 pr-4 font-mono text-gray-500">{{ d.field }}</td>
                            <td class="py-1 pr-4 text-red-600 font-mono">{{ d.before ?? '—' }}</td>
                            <td class="py-1 text-green-700 font-mono">{{ d.after ?? '—' }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  }
                  @if (revertError[log.id]) {
                    <div class="mt-2 text-xs text-red-500">
                      ⚠ {{ revertError[log.id] }}（可能原因：關聯資料已被刪除，無法還原）
                    </div>
                  }
                </td>
              </tr>
            }
          }
        </tbody>
      </table>
    </div>
  }
</div>
```

- [ ] **Step 3: Run tests**

```bash
ng test --watch=false 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 4: Build to verify no template errors**

```bash
ng build 2>&1 | tail -5
```

Expected: `Application bundle generation complete.`

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/admin/admin-audit-log/
git commit -m "feat: add admin audit log page with diff viewer and revert"
```

---

### Task 10: Admin Roles page

> **Note:** `AdminRolesComponent` calls `supabase.getSessionOnce()` to get the current user's email for self-removal protection. This method already exists on `SupabaseService` (added in an earlier fix: `src/app/core/supabase.service.ts` line 32). No changes to `SupabaseService` are needed.

**Files:**
- Create: `src/app/pages/admin/admin-roles/admin-roles.component.ts`
- Create: `src/app/pages/admin/admin-roles/admin-roles.component.html`

- [ ] **Step 1: Create `admin-roles.component.ts`**

```ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminRoleService } from '../../../core/admin-role.service';
import { SupabaseService } from '../../../core/supabase.service';
import { UserRole } from '../../../models';

@Component({
  selector: 'app-admin-roles',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-roles.component.html',
})
export class AdminRolesComponent implements OnInit {
  roles: UserRole[] = [];
  loading = true;
  error = '';
  newEmail = '';
  newRole: 'admin' | 'editor' = 'editor';
  saving = false;
  saveError = '';
  currentEmail = '';

  constructor(
    private adminRole: AdminRoleService,
    private supabase: SupabaseService
  ) {}

  async ngOnInit() {
    // Get current user email to prevent self-removal
    const session = await this.supabase.getSessionOnce();
    this.currentEmail = session?.user?.email ?? '';
    await this.load();
  }

  async load() {
    this.loading = true;
    this.error = '';
    try {
      this.roles = await this.adminRole.getAll();
    } catch (e: any) {
      this.error = e.message || '載入失敗';
    } finally {
      this.loading = false;
    }
  }

  async add() {
    if (!this.newEmail.trim()) { this.saveError = '請輸入 Email'; return; }
    this.saving = true;
    this.saveError = '';
    try {
      await this.adminRole.add(this.newEmail.trim(), this.newRole);
      this.newEmail = '';
      this.newRole = 'editor';
      await this.load();
    } catch (e: any) {
      this.saveError = e.message || '新增失敗';
    } finally {
      this.saving = false;
    }
  }

  async remove(role: UserRole) {
    if (role.email === this.currentEmail) {
      alert('您不能移除自己的角色');
      return;
    }
    if (!confirm(`確定移除 ${role.email} 的角色？`)) return;
    try {
      await this.adminRole.remove(role.id);
      await this.load();
    } catch (e: any) {
      alert(e.message || '移除失敗');
    }
  }

  roleLabel(role: string): string {
    return role === 'admin' ? '管理員' : '編輯者';
  }

  roleClass(role: string): string {
    return role === 'admin'
      ? 'bg-purple-100 text-purple-700'
      : 'bg-blue-100 text-blue-700';
  }
}
```

- [ ] **Step 2: Create `admin-roles.component.html`**

```html
<div class="p-6">
  <h1 class="font-['Cormorant_Garamond'] text-2xl font-semibold text-gray-800 mb-6">角色管理</h1>

  <!-- Add form -->
  <div class="bg-white rounded-lg shadow-sm border border-gray-100 p-4 mb-6">
    <h2 class="text-sm font-medium text-gray-700 mb-3">新增角色</h2>
    <div class="flex gap-3 items-end flex-wrap">
      <div>
        <label class="block text-xs text-gray-500 mb-1">Email</label>
        <input
          type="email"
          [(ngModel)]="newEmail"
          placeholder="user@example.com"
          class="border border-gray-200 rounded-md px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-1 focus:ring-pink-300"
        />
      </div>
      <div>
        <label class="block text-xs text-gray-500 mb-1">角色</label>
        <select [(ngModel)]="newRole"
          class="border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-pink-300">
          <option value="editor">編輯者</option>
          <option value="admin">管理員</option>
        </select>
      </div>
      <button
        (click)="add()"
        [disabled]="saving"
        class="px-4 py-1.5 text-sm bg-pink-500 text-white rounded-md hover:bg-pink-600 transition-colors disabled:opacity-40"
      >
        {{ saving ? '新增中…' : '新增' }}
      </button>
    </div>
    @if (saveError) {
      <p class="text-xs text-red-500 mt-2">{{ saveError }}</p>
    }
  </div>

  <!-- Roles table -->
  @if (loading) {
    <div class="text-sm text-gray-400 py-8 text-center">載入中…</div>
  } @else if (error) {
    <div class="text-sm text-red-500 py-4">{{ error }}</div>
  } @else if (roles.length === 0) {
    <div class="text-sm text-gray-400 py-8 text-center">尚無角色記錄</div>
  } @else {
    <div class="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b border-gray-100">
          <tr>
            <th class="px-4 py-3 text-left text-xs text-gray-500 font-medium">Email</th>
            <th class="px-4 py-3 text-left text-xs text-gray-500 font-medium">角色</th>
            <th class="px-4 py-3 text-left text-xs text-gray-500 font-medium">加入時間</th>
            <th class="px-4 py-3 text-right text-xs text-gray-500 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          @for (role of roles; track role.id) {
            <tr class="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
              <td class="px-4 py-3 text-gray-700">
                {{ role.email }}
                @if (role.email === currentEmail) {
                  <span class="ml-2 text-xs text-gray-400">(你)</span>
                }
              </td>
              <td class="px-4 py-3">
                <span class="px-2 py-0.5 rounded-full text-xs font-medium" [ngClass]="roleClass(role.role)">
                  {{ roleLabel(role.role) }}
                </span>
              </td>
              <td class="px-4 py-3 text-gray-500 text-xs">
                {{ role.created_at | date:'yyyy/MM/dd' }}
              </td>
              <td class="px-4 py-3 text-right">
                @if (role.email !== currentEmail) {
                  <button
                    (click)="remove(role)"
                    class="text-xs text-red-400 hover:text-red-600 transition-colors"
                  >
                    移除
                  </button>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  }
</div>
```

- [ ] **Step 3: Run full test suite**

```bash
ng test --watch=false 2>&1 | tail -10
```

Expected: all tests pass.

- [ ] **Step 4: Production build**

```bash
ng build --configuration production 2>&1 | tail -8
```

Expected: `Application bundle generation complete.` No errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/admin/admin-roles/
git commit -m "feat: add admin roles management page (add/remove admin and editor roles)"
```

---

## Post-Implementation: Apply DB Migration

After all code tasks are complete:

1. Open Supabase Dashboard → SQL Editor
2. Paste the entire contents of `supabase/migrations/002_roles_and_audit.sql`
3. Execute
4. Seed the first admin:
   ```sql
   INSERT INTO user_roles (email, role) VALUES ('your-google-email@gmail.com', 'admin');
   ```
5. Log in to the app → navigate to `/admin/roles` to verify you can see the page
6. Make a test edit (e.g., add a member) → navigate to `/admin/audit-log` to verify it appears
