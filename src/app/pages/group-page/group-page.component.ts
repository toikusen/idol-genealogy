import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { GroupService } from '../../core/group.service';
import { HistoryService } from '../../core/history.service';
import { SeoService } from '../../core/seo.service';
import { GroupTreeComponent } from '../../shared/group-tree/group-tree.component';
import { AdBannerComponent } from '../../shared/ad-banner/ad-banner.component';
import { Group, Team, History } from '../../models';

const SITE_URL = 'https://idol-genealogy.pages.dev';

@Component({
  selector: 'app-group-page',
  standalone: true,
  imports: [CommonModule, RouterLink, GroupTreeComponent, AdBannerComponent],
  templateUrl: './group-page.component.html',
})
export class GroupPageComponent implements OnInit {
  group: Group | null = null;
  teams: Team[] = [];
  histories: History[] = [];
  selectedHistory: History | null = null;
  loading = true;
  error = false;

  constructor(
    private route: ActivatedRoute,
    private groupService: GroupService,
    private historyService: HistoryService,
    private seo: SeoService
  ) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    try {
      const [group, teams, histories] = await Promise.all([
        this.groupService.getById(id),
        this.groupService.getTeamsByGroup(id),
        this.historyService.getByGroup(id)
      ]);
      this.group = group;
      this.teams = teams;
      this.histories = histories;

      if (group) {
        const displayName = group.name_jp ?? group.name;
        this.seo.setPage(
          `${displayName} - 台灣地下偶像族譜`,
          `${displayName}的成員組成與活動記錄。`,
          `${SITE_URL}/group/${id}`
          // no image — groups have no photo_url; falls back to og-default.png
        );

        const jsonLd: Record<string, any> = {
          '@context': 'https://schema.org',
          '@type': 'MusicGroup',
          name: displayName,
          url: `${SITE_URL}/group/${id}`,
        };
        if (group.founded_at) jsonLd['foundingDate'] = group.founded_at;
        const members = histories
          .filter(h => h.member)
          .map(h => ({ '@type': 'Person', name: h.member!.name_jp ?? h.member!.name }));
        if (members.length > 0) jsonLd['member'] = members;

        this.seo.setJsonLd(jsonLd);
      }
    } catch {
      this.error = true;
    } finally {
      this.loading = false;
    }
  }

  selectMember(h: History) {
    this.selectedHistory = this.selectedHistory?.id === h.id ? null : h;
  }

  getInitial(h: History): string {
    const name = h.member?.name_jp || h.member?.name;
    if (name) return name.charAt(0);
    return '?';
  }

  formatDateShort(dateStr: string | null): string {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short' });
    } catch {
      return '—';
    }
  }

  formatDateLong(dateStr: string | null): string {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return '—';
    }
  }

  hexToRgb(hex: string): string {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16) || 232;
    const g = parseInt(clean.substring(2, 4), 16) || 121;
    const b = parseInt(clean.substring(4, 6), 16) || 160;
    return `${r},${g},${b}`;
  }
}
