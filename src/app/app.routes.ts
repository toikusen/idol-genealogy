import { Routes } from '@angular/router';
import { AuthGuard } from './core/auth.guard';

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
