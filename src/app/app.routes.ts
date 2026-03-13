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
        loadComponent: () => import('./pages/admin/admin-roles/admin-roles.component').then(m => m.AdminRolesComponent)
      },
      { path: '', redirectTo: 'members', pathMatch: 'full' },
      { path: '**', redirectTo: 'members' }
    ]
  },
  {
    path: 'privacy',
    loadComponent: () => import('./pages/privacy/privacy.component').then(m => m.PrivacyComponent)
  },
  { path: '**', redirectTo: '' }
];
