import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { GroupService } from '../../core/group.service';
import { HistoryService } from '../../core/history.service';
import { SeoService } from '../../core/seo.service';
import { GroupTreeComponent } from '../../shared/group-tree/group-tree.component';
import { AdBannerComponent } from '../../shared/ad-banner/ad-banner.component';
import { SafeUrlPipe } from '../../shared/safe-url.pipe';
import { Group, GroupVideo, Team, History } from '../../models';

interface GanttRow {
  history: History;
  leftPct: number;
  widthPct: number;
  isActive: boolean;
}

const SITE_URL = 'https://idol-genealogy.pages.dev';

@Component({
  selector: 'app-group-page',
  standalone: true,
  imports: [CommonModule, RouterLink, GroupTreeComponent, AdBannerComponent, SafeUrlPipe],
  templateUrl: './group-page.component.html',
})
export class GroupPageComponent implements OnInit, OnDestroy {
  group: Group | null = null;
  teams: Team[] = [];
  histories: History[] = [];
  videos: GroupVideo[] = [];
  similarGroups: Group[] = [];
  selectedHistory: History | null = null;
  playingVideoId: string | null = null;
  loading = true;
  error = false;

  ganttRows: GanttRow[] = [];
  ganttYears: { label: string; leftPct: number }[] = [];
  private _routeSub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private groupService: GroupService,
    private historyService: HistoryService,
    private seo: SeoService
  ) {}

  ngOnInit() {
    this._routeSub = this.route.paramMap.subscribe(params => {
      this.load(params.get('id')!);
    });
  }

  ngOnDestroy() { this._routeSub?.unsubscribe(); }

  private async load(id: string) {
    this.loading = true;
    this.error = false;
    this.group = null;
    this.selectedHistory = null;
    this.playingVideoId = null;
    this.ganttRows = [];
    this.ganttYears = [];
    this.similarGroups = [];
    try {
      const [group, teams, histories, videos] = await Promise.all([
        this.groupService.getById(id),
        this.groupService.getTeamsByGroup(id),
        this.historyService.getByGroup(id),
        this.groupService.getVideosByGroup(id),
      ]);
      this.group = group;
      this.teams = teams;
      this.histories = histories;
      this.videos = videos;
      this.buildGantt(histories, group);
      if (group?.style) {
        this.similarGroups = await this.groupService.getSimilarByStyle(group.style, id);
      }

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
          .map(h => ({ '@type': 'Person', name: h.member!.name_roman ?? h.member!.name }));
        if (members.length > 0) jsonLd['member'] = members;

        this.seo.setJsonLd(jsonLd);
      }
    } catch {
      this.error = true;
    } finally {
      this.loading = false;
    }
  }

  extractYouTubeId(url: string): string | null {
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  playVideo(videoId: string) {
    this.playingVideoId = this.playingVideoId === videoId ? null : videoId;
  }

  selectMember(h: History) {
    const isDeselect = this.selectedHistory?.id === h.id;
    this.selectedHistory = isDeselect ? null : h;
    if (!isDeselect) {
      setTimeout(() => {
        document.getElementById('member-detail-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 30);
    }
  }

  getInitial(h: History): string {
    const name = h.member?.name_roman || h.member?.name;
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
    const mmdd = dateStr.match(/^(\d{1,2})-(\d{1,2})$/);
    if (mmdd) return `${+mmdd[1]}月${+mmdd[2]}日`;
    const full = dateStr.match(/^\d{4}-(\d{1,2})-(\d{1,2})$/);
    if (full) return `${+full[1]}月${+full[2]}日`;
    return '—';
  }

  private buildGantt(histories: History[], group: Group | null) {
    if (!histories.length) return;

    const now = Date.now();
    const endBound = group?.disbanded_at
      ? Math.max(new Date(group.disbanded_at).getTime(), now)
      : now;

    const minMs = Math.min(...histories.map(h => new Date(h.joined_at).getTime()));
    const maxMs = Math.max(
      ...histories.map(h => h.left_at ? new Date(h.left_at).getTime() : endBound),
      endBound
    );
    const totalMs = maxMs - minMs || 1;

    const sorted = [...histories].sort((a, b) =>
      new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime()
    );

    this.ganttRows = sorted.map(h => {
      const start = new Date(h.joined_at).getTime();
      const end = h.left_at ? new Date(h.left_at).getTime() : maxMs;
      return {
        history: h,
        leftPct: (start - minMs) / totalMs * 100,
        widthPct: Math.max((end - start) / totalMs * 100, 0.5),
        isActive: !h.left_at,
      };
    });

    const minYear = new Date(minMs).getFullYear();
    const maxYear = new Date(maxMs).getFullYear();
    this.ganttYears = [];
    for (let y = minYear; y <= maxYear; y++) {
      const yMs = new Date(y, 0, 1).getTime();
      const pct = (yMs - minMs) / totalMs * 100;
      if (pct >= 0 && pct <= 100) {
        this.ganttYears.push({ label: String(y), leftPct: pct });
      }
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
