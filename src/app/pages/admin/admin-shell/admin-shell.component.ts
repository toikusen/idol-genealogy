import { Component, OnDestroy } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SupabaseService } from '../../../core/supabase.service';
import { AdminRoleService } from '../../../core/admin-role.service';
import { ProposalService } from '../../../core/proposal.service';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './admin-shell.component.html',
})
export class AdminShellComponent implements OnDestroy {
  isAdmin = false;
  pendingProposalCount = 0;
  private _sub: Subscription;

  constructor(
    private supabase: SupabaseService,
    private adminRole: AdminRoleService,
    private router: Router,
    private proposalService: ProposalService,
  ) {
    this._sub = this.adminRole.isAdmin$.subscribe(async v => {
      this.isAdmin = v;
      if (v) {
        this.pendingProposalCount = await this.proposalService.getPendingCount().catch(() => 0);
      }
    });
  }

  ngOnDestroy(): void {
    this._sub.unsubscribe();
  }

  async signOut() {
    await this.supabase.signOut();
    this.router.navigate(['/']);
  }
}
