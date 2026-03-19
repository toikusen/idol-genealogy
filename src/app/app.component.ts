import { Component } from '@angular/core';
import { RouterOutlet, RouterLink, Router } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { SupabaseService } from './core/supabase.service';
import { AdminRoleService } from './core/admin-role.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, AsyncPipe],
  templateUrl: './app.component.html',
})
export class AppComponent {
  readonly session$;
  readonly isAdmin$;

  constructor(private supabase: SupabaseService, readonly router: Router, adminRole: AdminRoleService) {
    this.session$ = supabase.authState$;
    this.isAdmin$ = adminRole.isAdmin$;
  }

  get isAdminRoute(): boolean {
    return this.router.url.startsWith('/admin');
  }

  signOut() {
    this.supabase.signOut().then(() => this.router.navigate(['/']));
  }
}
