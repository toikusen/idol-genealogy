import { inject, Injector, runInInjectionContext } from '@angular/core';
import { CanActivateFn, ResolveFn, Routes, UrlMatchResult, UrlSegment } from '@angular/router';

function lazyResolver<T>(loadResolver: () => Promise<ResolveFn<T>>): ResolveFn<T> {
  return (route, state) => {
    const injector = inject(Injector);
    return loadResolver().then(resolve =>
      runInInjectionContext(injector, () => resolve(route, state))
    ) as ReturnType<ResolveFn<T>>;
  };
}

function lazyGuard(loadGuard: () => Promise<CanActivateFn>): CanActivateFn {
  return (route, state) => {
    const injector = inject(Injector);
    return loadGuard().then(guard =>
      runInInjectionContext(injector, () => guard(route, state))
    ) as ReturnType<CanActivateFn>;
  };
}

const homePageResolver = lazyResolver(() =>
  import('./core/page-data.resolvers').then(m => m.homePageResolver)
);
const membersListResolver = lazyResolver(() =>
  import('./core/page-data.resolvers').then(m => m.membersListResolver)
);
const memberPageResolver = lazyResolver(() =>
  import('./core/page-data.resolvers').then(m => m.memberPageResolver)
);
const groupPageResolver = lazyResolver(() =>
  import('./core/page-data.resolvers').then(m => m.groupPageResolver)
);
const companyPageResolver = lazyResolver(() =>
  import('./core/page-data.resolvers').then(m => m.companyPageResolver)
);
const staffGuard = lazyGuard(() =>
  import('./core/staff.guard').then(m => m.staffGuard)
);
const adminGuard = lazyGuard(() =>
  import('./core/admin.guard').then(m => m.adminGuard)
);

function handleMatcher(segments: UrlSegment[]): UrlMatchResult | null {
  if (segments.length !== 1) return null;
  const segment = segments[0].path;
  if (!segment.startsWith('@') || segment.length < 2) return null;
  return {
    consumed: segments,
    posParams: {
      handle: new UrlSegment(segment.slice(1), {}),
    },
  };
}

export const routes: Routes = [
  {
    path: '',
    resolve: { pageData: homePageResolver },
    loadComponent: () => import('./pages/home/home.component').then(m => m.HomeComponent)
  },
  {
    path: 'members',
    resolve: { pageData: membersListResolver },
    loadComponent: () => import('./pages/members-list/members-list.component').then(m => m.MembersListComponent)
  },
  {
    path: 'member/:id',
    resolve: { pageData: memberPageResolver },
    loadComponent: () => import('./pages/member-page/member-page.component').then(m => m.MemberPageComponent)
  },
  {
    matcher: handleMatcher,
    resolve: { pageData: memberPageResolver },
    loadComponent: () => import('./pages/member-page/member-page.component').then(m => m.MemberPageComponent)
  },
  {
    path: 'group/:id',
    resolve: { pageData: groupPageResolver },
    loadComponent: () => import('./pages/group-page/group-page.component').then(m => m.GroupPageComponent)
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'admin',
    canActivate: [staffGuard],
    loadComponent: () => import('./pages/admin/admin-shell/admin-shell.component').then(m => m.AdminShellComponent),
    children: [
      { path: 'members', loadComponent: () => import('./pages/admin/admin-members/admin-members.component').then(m => m.AdminMembersComponent) },
      { path: 'groups', loadComponent: () => import('./pages/admin/admin-groups/admin-groups.component').then(m => m.AdminGroupsComponent) },
      { path: 'companies', loadComponent: () => import('./pages/admin/admin-companies/admin-companies.component').then(m => m.AdminCompaniesComponent) },
      { path: 'history', loadComponent: () => import('./pages/admin/admin-history/admin-history.component').then(m => m.AdminHistoryComponent) },
      { path: 'songs', loadComponent: () => import('./pages/admin/admin-songs/admin-songs.component').then(m => m.AdminSongsComponent) },
      { path: 'venues', loadComponent: () => import('./pages/admin/admin-venues/admin-venues.component').then(m => m.AdminVenuesComponent) },
      {
        path: 'audit-log',
        loadComponent: () => import('./pages/admin/admin-audit-log/admin-audit-log.component').then(m => m.AdminAuditLogComponent)
      },
      {
        path: 'proposals',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/admin/admin-proposals/admin-proposals.component').then(m => m.AdminProposalsComponent)
      },
      {
        path: 'proposals/:id',
        canActivate: [adminGuard],
        loadComponent: () => import('./pages/admin/admin-proposal-review/admin-proposal-review.component').then(m => m.AdminProposalReviewComponent)
      },
      {
        path: 'roles',
        loadComponent: () => import('./pages/admin/admin-roles/admin-roles.component').then(m => m.AdminRolesComponent)
      },
      { path: 'team', loadComponent: () => import('./pages/admin/admin-team/admin-team.component').then(m => m.AdminTeamComponent) },
      { path: '', redirectTo: 'members', pathMatch: 'full' },
      { path: '**', redirectTo: 'members' }
    ]
  },
  {
    path: 'company/:id',
    resolve: { pageData: companyPageResolver },
    loadComponent: () => import('./pages/company-page/company-page.component').then(m => m.CompanyPageComponent)
  },
  {
    path: 'privacy',
    loadComponent: () => import('./pages/privacy/privacy.component').then(m => m.PrivacyComponent)
  },
  {
    path: 'terms',
    loadComponent: () => import('./pages/terms/terms.component').then(m => m.TermsComponent)
  },
  {
    path: 'about',
    loadComponent: () => import('./pages/about/about.component').then(m => m.AboutComponent)
  },
  {
    path: 'contact',
    loadComponent: () => import('./pages/contact/contact.component').then(m => m.ContactComponent)
  },
  {
    path: 'contributors',
    loadComponent: () =>
      import('./pages/contributors/contributors.component').then(m => m.ContributorsComponent),
  },
  {
    path: 'guide',
    loadComponent: () =>
      import('./pages/guide/guide.component').then(m => m.GuideComponent),
  },
  {
    path: 'learn',
    loadComponent: () =>
      import('./pages/knowledge/knowledge-index.component').then(m => m.KnowledgeIndexComponent),
  },
  {
    path: 'learn/:slug',
    loadComponent: () =>
      import('./pages/knowledge/knowledge-article.component').then(m => m.KnowledgeArticleComponent),
  },
  {
    path: 'my-favorites',
    canActivate: [lazyGuard(() => import('./core/auth.guard').then(m => m.authGuard))],
    loadComponent: () =>
      import('./pages/my-favorites/my-favorites.component').then(m => m.MyFavoritesComponent),
  },
  {
    path: 'my-contributions',
    loadComponent: () =>
      import('./pages/my-contributions/my-contributions.component').then(m => m.MyContributionsComponent),
  },
  {
    path: 'wanted',
    loadComponent: () => import('./pages/wanted/wanted.component').then(m => m.WantedComponent)
  },
  {
    path: '**',
    loadComponent: () => import('./pages/not-found/not-found.component').then(m => m.NotFoundComponent)
  }
];
