import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProposalService, ContributorEntry } from '../../core/proposal.service';
import { SupabaseService } from '../../core/supabase.service';
import { SeoService } from '../../core/seo.service';
import { getBadge, TABLE_LABELS, Badge } from '../../core/badge.utils';
import { siteUrl } from '../../core/public-url.utils';

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
    const pageUrl = siteUrl('/contributors');
    this.seo.setPage(
      '貢獻者排行榜 | Idol Maps',
      '查看 Idol Maps 社群貢獻者排行榜與徽章進度。',
      pageUrl,
    );
    this.applySchemas();
    const session = await this.supabase.getSessionOnce();
    this.currentUserId = session?.user?.id ?? null;

    try {
      this.leaderboard = await this.proposalService.getLeaderboard();
      this.applySchemas();
    } catch {
      this.error = true;
      this.applySchemas();
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

  private applySchemas(): void {
    const pageUrl = siteUrl('/contributors');
    const itemListElement = this.leaderboard.slice(0, 30).map((entry, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Person',
        name: entry.submitter_name,
        description: `已通過提案 ${entry.total} 筆`,
      },
    }));

    this.seo.setJsonLdGraph([
      {
        '@type': 'CollectionPage',
        name: '貢獻者排行榜',
        url: pageUrl,
        description: 'Idol Maps 社群資料貢獻者排行榜。',
      },
      ...(itemListElement.length > 0 ? [{
        '@type': 'ItemList',
        name: 'Idol Maps 貢獻者排名',
        numberOfItems: itemListElement.length,
        itemListOrder: 'https://schema.org/ItemListOrderDescending',
        itemListElement,
      }] : []),
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Idol Maps', item: siteUrl('/') },
          { '@type': 'ListItem', position: 2, name: '貢獻者排行榜', item: pageUrl },
        ],
      },
    ]);
  }
}
