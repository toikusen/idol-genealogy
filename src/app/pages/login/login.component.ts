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
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') || '/admin';
        this.router.navigateByUrl(returnUrl);
      }
    });
  }

  async signIn() {
    await this.supabase.signInWithGoogle();
  }
}
