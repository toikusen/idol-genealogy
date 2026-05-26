import { Component, DestroyRef, inject, Injector, PLATFORM_ID, signal } from '@angular/core';
import { RouterOutlet, RouterLink, Router, NavigationEnd, NavigationStart, NavigationCancel, NavigationError } from '@angular/router';
import { AsyncPipe, isPlatformBrowser } from '@angular/common';
import { BehaviorSubject, fromEvent, map, distinctUntilChanged } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { Session } from '@supabase/supabase-js';
import type { SupabaseService } from './core/supabase.service';
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
  private readonly sessionSubject = new BehaviorSubject<Session | null>(null);
  private readonly isAdminSubject = new BehaviorSubject(false);
  private readonly isStaffSubject = new BehaviorSubject(false);
  readonly session$ = this.sessionSubject.asObservable();
  readonly isAdmin$ = this.isAdminSubject.asObservable();
  readonly isStaff$ = this.isStaffSubject.asObservable();
  readonly showScrollTop = signal(false);
  readonly isNavigating = signal(false);
  readonly authReady = signal(false);
  readonly showLoginPill = signal(false);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private authChromePromise: Promise<void> | null = null;
  private supabase: SupabaseService | null = null;

  constructor(
    readonly router: Router,
    analytics: AnalyticsService,
    readonly themeService: ThemeService,
  ) {
    router.events.pipe(takeUntilDestroyed()).subscribe(e => {
      if (e instanceof NavigationStart) {
        this.isNavigating.set(true);
      } else if (e instanceof NavigationEnd || e instanceof NavigationCancel || e instanceof NavigationError) {
        if (e instanceof NavigationEnd) {
          analytics.trackPageView((e as NavigationEnd).urlAfterRedirects);
        }
        this.isNavigating.set(false);
      }
    });

    if (this.isBrowser) {
      fromEvent(window, 'scroll').pipe(
        takeUntilDestroyed(),
        map(() => window.scrollY > 300),
        distinctUntilChanged(),
      ).subscribe(show => this.showScrollTop.set(show));

      this.scheduleAuthChromeLoad();
    } else {
      this.authReady.set(true);
    }
  }

  get isAdminRoute(): boolean {
    return this.router.url.startsWith('/admin');
  }

  signOut() {
    this.loadAuthChrome().then(() => {
      this.supabase?.signOut().then(() => this.router.navigate(['/']));
    });
  }

  scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private scheduleAuthChromeLoad(): void {
    const loadWhenIdle = () => {
      const win = window as Window & {
        requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      };
      if (win.requestIdleCallback) {
        win.requestIdleCallback(() => void this.loadAuthChrome(), { timeout: 1500 });
      } else {
        void this.loadAuthChrome();
      }
    };

    if (document.readyState === 'complete') {
      loadWhenIdle();
      return;
    }
    window.addEventListener('load', loadWhenIdle, { once: true });
  }

  private loadAuthChrome(): Promise<void> {
    if (!this.isBrowser) return Promise.resolve();
    if (this.authChromePromise) return this.authChromePromise;

    this.authChromePromise = Promise.all([
      import('./core/supabase.service'),
      import('./core/admin-role.service'),
      import('./core/favorites.service'),
    ]).then(([{ SupabaseService }, { AdminRoleService }, { FavoritesService }]) => {
      const supabase = this.injector.get(SupabaseService);
      const adminRole = this.injector.get(AdminRoleService);
      const favorites = this.injector.get(FavoritesService);
      this.supabase = supabase;

      supabase.authState$.pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(session => {
          this.sessionSubject.next(session);
          if (session) {
            favorites.load(session.user.id).catch(() => {});
            this.showLoginPill.set(false);
          } else {
            favorites.reset();
            if (this.authReady()) this.showLoginPill.set(true);
          }
        });
      adminRole.isAdmin$.pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(isAdmin => this.isAdminSubject.next(isAdmin));
      adminRole.isStaff$.pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(isStaff => this.isStaffSubject.next(isStaff));

      return supabase.getSessionOnce()
        .then(session => {
          this.sessionSubject.next(session);
          if (session) {
            favorites.load(session.user.id).catch(() => {});
            this.showLoginPill.set(false);
          } else {
            this.showLoginPill.set(true);
          }
        })
        .catch(() => {
          this.sessionSubject.next(null);
          this.showLoginPill.set(true);
        })
        .finally(() => this.authReady.set(true));
    });

    return this.authChromePromise;
  }
}
