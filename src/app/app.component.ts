import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, Router, NavigationEnd } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SupabaseService } from './core/supabase.service';
import { AdminRoleService } from './core/admin-role.service';
import { AnalyticsService } from './core/analytics.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, AsyncPipe],
  templateUrl: './app.component.html',
})
export class AppComponent {
  readonly session$;
  readonly isAdmin$;

  constructor(
    private supabase: SupabaseService,
    readonly router: Router,
    adminRole: AdminRoleService,
    analytics: AnalyticsService,
  ) {
    this.session$ = supabase.authState$;
    this.isAdmin$ = adminRole.isAdmin$;

    router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      takeUntilDestroyed(),
    ).subscribe(e => {
      analytics.trackPageView((e as NavigationEnd).urlAfterRedirects);
    });
  }

  get isAdminRoute(): boolean {
    return this.router.url.startsWith('/admin');
  }

  signOut() {
    this.supabase.signOut().then(() => this.router.navigate(['/']));
  }
}
