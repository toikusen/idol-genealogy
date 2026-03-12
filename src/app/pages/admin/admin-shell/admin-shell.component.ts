import { Component, OnDestroy } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SupabaseService } from '../../../core/supabase.service';
import { AdminRoleService } from '../../../core/admin-role.service';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './admin-shell.component.html',
})
export class AdminShellComponent implements OnDestroy {
  isAdmin = false;
  private _sub: Subscription;

  constructor(
    private supabase: SupabaseService,
    private adminRole: AdminRoleService,
    private router: Router
  ) {
    this._sub = this.adminRole.isAdmin$.subscribe(v => this.isAdmin = v);
  }

  ngOnDestroy(): void {
    this._sub.unsubscribe();
  }

  async signOut() {
    await this.supabase.signOut();
    this.router.navigate(['/']);
  }
}
