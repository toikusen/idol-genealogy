import { Component, inject, PLATFORM_ID, signal } from '@angular/core';
import { RouterOutlet, RouterLink, Router, NavigationEnd } from '@angular/router';
import { AsyncPipe, isPlatformBrowser } from '@angular/common';
import { filter, fromEvent, map, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SupabaseService } from './core/supabase.service';
import { AdminRoleService } from './core/admin-role.service';
import { AnalyticsService } from './core/analytics.service';
import { CookieBannerComponent } from './shared/cookie-banner/cookie-banner.component';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, AsyncPipe, CookieBannerComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  readonly session$;
  readonly isAdmin$;
  readonly showScrollTop = signal(false);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor(
    private supabase: SupabaseService,
    readonly router: Router,
    adminRole: AdminRoleService,
    analytics: AnalyticsService,
    readonly themeService: ThemeService,
  ) {
    this.session$ = supabase.authState$;
    this.isAdmin$ = adminRole.isAdmin$;

    router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      takeUntilDestroyed(),
    ).subscribe(e => {
      analytics.trackPageView((e as NavigationEnd).urlAfterRedirects);
    });

    if (this.isBrowser) {
      fromEvent(window, 'scroll').pipe(
        takeUntilDestroyed(),
        map(() => window.scrollY > 300),
        distinctUntilChanged(),
      ).subscribe(show => this.showScrollTop.set(show));
    }
  }

  get isAdminRoute(): boolean {
    return this.router.url.startsWith('/admin');
  }

  signOut() {
    this.supabase.signOut().then(() => this.router.navigate(['/']));
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
