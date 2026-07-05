import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SupabaseService } from '../../core/supabase.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.supabase.authState$.pipe(takeUntilDestroyed()).subscribe(session => {
      if (session) {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/';
        this.router.navigateByUrl(returnUrl);
      }
    });
  }

  signingIn = false;
  signInError = '';

  async signIn() {
    if (this.signingIn) return;
    this.signingIn = true;
    this.signInError = '';
    try {
      await this.supabase.signInWithGoogle();
    } catch {
      this.signInError = '登入失敗，請稍後再試';
    } finally {
      this.signingIn = false;
    }
  }
}
