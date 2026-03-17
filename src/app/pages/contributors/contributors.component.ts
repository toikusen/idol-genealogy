import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProposalService, ContributorEntry } from '../../core/proposal.service';

const TABLE_LABELS: Record<string, string> = {
  members: '成員',
  groups: '組合',
  companies: '公司',
  history: '歷程',
};

@Component({
  selector: 'app-contributors',
  standalone: true,
  imports: [RouterLink], // No CommonModule needed — template uses Angular 19 @if/@for control flow
  templateUrl: './contributors.component.html',
})
export class ContributorsComponent implements OnInit {
  leaderboard: ContributorEntry[] = [];
  loading = true;
  error = false;

  constructor(private proposalService: ProposalService) {}

  async ngOnInit() {
    try {
      this.leaderboard = await this.proposalService.getLeaderboard();
    } catch {
      this.error = true;
    } finally {
      this.loading = false;
    }
  }

  get top3(): ContributorEntry[] {
    return this.leaderboard.slice(0, 3);
  }

  get rest(): ContributorEntry[] {
    return this.leaderboard.slice(3);
  }

  get maxTotal(): number {
    return this.leaderboard[0]?.total ?? 1;
  }

  getInitial(name: string): string {
    return name.charAt(0);
  }

  getByTableLabel(byTable: Record<string, number>): string {
    return Object.entries(byTable)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${TABLE_LABELS[k] ?? k} ${n}`)
      .join('・');
  }
}
