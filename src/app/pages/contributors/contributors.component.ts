import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProposalService, ContributorEntry } from '../../core/proposal.service';
import { SupabaseService } from '../../core/supabase.service';
import { SeoService } from '../../core/seo.service';
import { getBadge, TABLE_LABELS, Badge } from '../../core/badge.utils';

@Component({
  selector: 'app-contributors',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './contributors.component.html',
})
export class ContributorsComponent implements OnInit {
  leaderboard: ContributorEntry[] = [];
  loading = true;
  error = false;
  currentUserId: string | null = null;

  constructor(
    private proposalService: ProposalService,
    private supabase: SupabaseService,
    private seo: SeoService,
  ) {}

  async ngOnInit() {
    this.seo.setRobotsNoIndex(true);
    const session = await this.supabase.getSessionOnce();
    this.currentUserId = session?.user?.id ?? null;

    try {
      this.leaderboard = await this.proposalService.getLeaderboard();
    } catch {
      this.error = true;
    } finally {
      this.loading = false;
    }
  }

  get top3(): ContributorEntry[] { return this.leaderboard.slice(0, 3); }
  get rest(): ContributorEntry[]  { return this.leaderboard.slice(3); }
  get maxTotal(): number           { return this.leaderboard[0]?.total ?? 1; }

  getInitial(name: string): string { return name.charAt(0); }

  getByTableLabel(byTable: Record<string, number>): string {
    return Object.entries(byTable)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${TABLE_LABELS[k] ?? k} ${n}`)
      .join('・');
  }

  getBadgeForEntry(entry: ContributorEntry): Badge | null {
    return getBadge(entry.total);
  }
}
