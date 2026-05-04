# Audit Log — Editor Access & Scoped Revert

**Date:** 2026-05-04  
**Status:** Approved

## Background

The audit log (`/admin/audit-log`) currently requires `adminGuard`, so only admin and superadmin can access it. Editors can log into the admin area but have no visibility into change history. This spec adds editor access with a scoped revert restriction.

## Goals

1. Allow editors to view the full audit log (all users' changes).
2. Restrict the revert action: editors can only revert their own changes.
3. Admin and superadmin retain unrestricted revert access.

## Non-Goals

- Supabase RLS changes (deferred; editors are trusted internal staff).
- Filtering the log list by user for editors (they see everything for context).

## Design

### 1. Route Layer (`app.routes.ts`)

Remove `canActivate: [adminGuard]` from the `audit-log` child route. The parent `/admin` route already requires `staffGuard`, which covers editor, admin, and superadmin.

```ts
// Before
{ path: 'audit-log', canActivate: [adminGuard], loadComponent: ... }

// After
{ path: 'audit-log', loadComponent: ... }
```

### 2. Navigation (`admin-shell.component.html`)

The audit-log nav link is currently gated by `*ngIf="isAdmin"`. Remove that condition so all staff can see the link.

### 3. Service Layer (`audit-log.service.ts`)

Add a `canRevertLog(log: AuditLog): Promise<boolean>` method:

- Fetches the current session email.
- If the user is admin/superadmin → returns `true`.
- If the user is editor → returns `log.user_email === currentEmail`.

Update `revert()` to call `canRevertLog()` first and throw `'僅能還原自己的操作'` if it returns `false`.

```ts
async canRevertLog(log: AuditLog): Promise<boolean> {
  const isAdmin = await this.adminRole.isAdmin();
  if (isAdmin) return true;
  const session = await this.supabase.getSessionOnce();
  return log.user_email === session?.user?.email;
}
```

### 4. Component Layer (`admin-audit-log.component.ts`)

Add on `ngOnInit`:
- `currentUserEmail: string` — from `supabase.getSessionOnce()`
- `isEditorOnly: boolean` — `true` when role is `editor`

Revert button display logic (in template):
- admin/superadmin: revert button shown for all logs (current behavior)
- editor: revert button shown only where `log.user_email === currentUserEmail`; other rows show nothing in that column

## Data Flow

```
User visits /admin/audit-log
  → staffGuard passes (editor, admin, superadmin)
  → Component loads all logs + currentUserEmail + role
  → Template shows revert button only if canRevert(log)

User clicks Revert
  → auditLogService.revert(log)
      → canRevertLog(log) checked
      → editor + not own log → throw '僅能還原自己的操作'
      → otherwise → execute revert
```

## Affected Files

| File | Change |
|------|--------|
| `src/app/app.routes.ts` | Remove `adminGuard` from `audit-log` route |
| `src/app/pages/admin/admin-shell/admin-shell.component.html` | Remove `*ngIf="isAdmin"` from audit-log nav link |
| `src/app/core/audit-log.service.ts` | Add `canRevertLog()`, update `revert()` |
| `src/app/pages/admin/admin-audit-log/admin-audit-log.component.ts` | Add `currentUserEmail`, `isEditorOnly`, update template |
| `src/app/pages/admin/admin-audit-log/admin-audit-log.component.html` | Conditional revert button |
