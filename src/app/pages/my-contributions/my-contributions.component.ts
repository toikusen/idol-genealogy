import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
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
export class MyContributionsComponent implements OnInit, OnDestroy {
  loading = true;
  error = false;
  displayName = '';
  proposals: Proposal[] = [];

  readonly PAGE_SIZE = 50;
  /** Raw ?page= value from the URL; use `page` (clamped) for display/slicing */
  currentPage = 1;
  private pageSub?: Subscription;
  private pageInitialized = false;

  readonly BADGES = BADGES;
  readonly TABLE_LABELS = TABLE_LABELS;

  constructor(
    private supabase: SupabaseService,
    private proposalService: ProposalService,
    private router: Router,
    private route: ActivatedRoute,
  ) {}

  async ngOnInit() {
    this.pageSub = this.route.queryParamMap.subscribe(params => {
      const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1);
      const changed = page !== this.currentPage;
      this.currentPage = page;
      if (this.pageInitialized && changed && typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      this.pageInitialized = true;
    });

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

  ngOnDestroy() {
    this.pageSub?.unsubscribe();
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
    if (p.table_name === 'history') {
      const memberName = p.original_data?.['member']?.['name']
        ?? p.original_data?.['member']?.['name_roman'];
      const groupName = p.original_data?.['group']?.['name']
        ?? p.original_data?.['external_group_name']
        ?? p.proposed_data?.['external_group_name'];
      const nameAtTime = p.original_data?.['name_at_time']
        ?? p.proposed_data?.['name_at_time'];
      const displayName = nameAtTime ?? memberName;
      if (displayName && groupName) return `${displayName}（${groupName}）`;
      if (displayName) return displayName;
      if (groupName) return groupName;
      return '歷程記錄';
    }
    return p.proposed_data?.['name']
      ?? p.original_data?.['name']
      ?? p.record_id
      ?? '—';
  }

  getOperationLabel(op: string): string {
    return op === 'INSERT' ? '新增' : op === 'UPDATE' ? '修改' : '刪除';
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.proposals.length / this.PAGE_SIZE));
  }

  /** currentPage clamped to the valid range (URL can carry an out-of-range value) */
  get page(): number {
    return Math.min(this.currentPage, this.totalPages);
  }

  get pagedProposals(): Proposal[] {
    const start = (this.page - 1) * this.PAGE_SIZE;
    return this.proposals.slice(start, start + this.PAGE_SIZE);
  }

  goToPage(p: number) {
    if (p < 1 || p > this.totalPages) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: p === 1 ? null : p },
      queryParamsHandling: 'merge',
    });
  }

  formatDate(iso: string): string {
    return iso.slice(0, 10).replaceAll('-', '.');
  }
}
