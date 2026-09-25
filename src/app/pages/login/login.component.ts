import { Component, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SupabaseService } from '../../core/supabase.service';

const RETURN_URL_KEY = 'login_return_url';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.supabase.authState$.pipe(takeUntilDestroyed()).subscribe(session => {
      if (session) {
        this.router.navigateByUrl(this.takeReturnUrl());
      }
    });
  }

  signingIn = false;
  signInError = '';

  async signIn() {
    if (this.signingIn) return;
    this.signingIn = true;
    this.signInError = '';
    // Google's OAuth redirect lands back on a bare /login, so where to return to has to
    // be parked somewhere that survives the round-trip. Parked here rather than on load,
    // so an abandoned prompt cannot hijack a later login from somewhere else.
    if (this.isBrowser) {
      const requested = this.route.snapshot.queryParamMap.get('returnUrl');
      if (requested) sessionStorage.setItem(RETURN_URL_KEY, requested);
    }
    try {
      await this.supabase.signInWithGoogle();
    } catch {
      this.signInError = '登入失敗，請稍後再試';
    } finally {
      this.signingIn = false;
    }
  }

  /**
   * Where to go now that a session exists: the URL still on the address bar if there is
   * one (already logged in), otherwise the one parked before the OAuth round-trip.
   * Only same-site paths — never an attacker's host.
   */
  private takeReturnUrl(): string {
    let parked: string | null = null;
    if (this.isBrowser) {
      parked = sessionStorage.getItem(RETURN_URL_KEY);
      sessionStorage.removeItem(RETURN_URL_KEY);
    }
    const target = this.route.snapshot.queryParamMap.get('returnUrl') ?? parked;
    return target && /^\/(?!\/)/.test(target) ? target : '/';
  }
}
