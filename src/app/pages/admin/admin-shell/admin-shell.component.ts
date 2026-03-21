import { Component, OnDestroy } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Router, NavigationEnd } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
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
  drawerOpen = false;
  private _sub: Subscription;
  private _navSub: Subscription;

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

    this._navSub = this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
    ).subscribe(() => {
      this.closeDrawer();
      if (this.isAdmin) {
        this.proposalService.getPendingCount().then(n => this.pendingProposalCount = n).catch(() => {});
      }
    });
  }

  ngOnDestroy(): void {
    this.closeDrawer();
    this._sub.unsubscribe();
    this._navSub.unsubscribe();
  }

  toggleDrawer(): void {
    this.drawerOpen = !this.drawerOpen;
    if (this.drawerOpen) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
  }

  closeDrawer(): void {
    this.drawerOpen = false;
    document.body.classList.remove('overflow-hidden');
  }

  async signOut() {
    await this.supabase.signOut();
    this.router.navigate(['/']);
  }
}
