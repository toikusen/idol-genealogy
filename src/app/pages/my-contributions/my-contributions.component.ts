import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../core/supabase.service';
import { ProposalService } from '../../core/proposal.service';
import { Proposal } from '../../models';
import { BADGES, TABLE_LABELS, getBadge, getNextBadge, Badge } from '../../core/badge.utils';

@Component({
  selector: 'app-my-contributions',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './my-contributions.component.html',
})
export class MyContributionsComponent implements OnInit {
  loading = true;
  error = false;
  displayName = '';
  proposals: Proposal[] = [];

  readonly PAGE_SIZE = 50;
  page = 1;

  readonly BADGES = BADGES;
  readonly TABLE_LABELS = TABLE_LABELS;

  constructor(
    private supabase: SupabaseService,
    private proposalService: ProposalService,
    private router: Router,
  ) {}

  async ngOnInit() {
    const session = await this.supabase.getSessionOnce();
    if (!session) { this.router.navigate(['/']); return; }
    this.displayName = session.user.user_metadata?.['display_name'] || '';
    try {
      this.proposals = await this.proposalService.getMyProposals(session.user.id);
    } catch {
      this.error = true;
    } finally {
      this.loading = false;
    }
  }

  get approvedCount(): number {
    return this.proposals.filter(p => p.status === 'approved').length;
  }

  get pendingCount(): number {
    return this.proposals.filter(p => p.status === 'pending').length;
  }

  get currentBadge(): Badge | null {
    return getBadge(this.approvedCount);
  }

  get nextBadgeInfo(): { badge: Badge; remaining: number } | null {
    return getNextBadge(this.approvedCount);
  }

  isBadgeUnlocked(badge: Badge): boolean {
    return this.approvedCount >= badge.threshold;
  }

  isCurrentBadge(badge: Badge): boolean {
    return this.currentBadge?.threshold === badge.threshold;
  }

  getSubject(p: Proposal): string {
    return p.proposed_data?.['name']
      ?? p.proposed_data?.['external_group_name']
      ?? p.original_data?.['name']
      ?? p.record_id
      ?? '—';
  }

  getOperationLabel(op: string): string {
    return op === 'INSERT' ? '新增' : op === 'UPDATE' ? '修改' : '刪除';
  }

  get totalPages(): number {
    return Math.ceil(this.proposals.length / this.PAGE_SIZE);
  }

  get pagedProposals(): Proposal[] {
    const start = (this.page - 1) * this.PAGE_SIZE;
    return this.proposals.slice(start, start + this.PAGE_SIZE);
  }

  goToPage(p: number) {
    this.page = Math.max(1, Math.min(p, this.totalPages));
  }

  formatDate(iso: string): string {
    return iso.slice(0, 10).replaceAll('-', '.');
  }
}
