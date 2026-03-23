import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { GroupService } from '../../core/group.service';
import { HistoryService } from '../../core/history.service';
import { MemberService } from '../../core/member.service';
import { CompanyService } from '../../core/company.service';
import { SeoService } from '../../core/seo.service';
import { AnalyticsService } from '../../core/analytics.service';
import { ViewCountService } from '../../core/view-count.service';
import { GroupTreeComponent } from '../../shared/group-tree/group-tree.component';
import { GroupConnectionGraphComponent } from '../../shared/group-connection-graph/group-connection-graph.component';
import { AdBannerComponent } from '../../shared/ad-banner/ad-banner.component';
import { SafeUrlPipe } from '../../shared/safe-url.pipe';
import { Group, GroupVideo, Team, History, Proposal } from '../../models';
import { ProposalPanelComponent } from '../../shared/proposal-panel/proposal-panel.component';
import { ProposalService } from '../../core/proposal.service';
import { getDiffFields, DiffField } from '../../core/proposal-diff.utils';
import { formatRelativeTime } from '../../core/time.utils';
import { RecordEditHistoryComponent } from '../../shared/record-edit-history/record-edit-history.component';

interface GanttRow {
  history: History;
  leftPct: number;
  widthPct: number;
  isActive: boolean;
}

const SITE_URL = 'https://idolmaps.com';

@Component({
  selector: 'app-group-page',
  standalone: true,
  imports: [CommonModule, RouterLink, GroupTreeComponent, GroupConnectionGraphComponent, AdBannerComponent, SafeUrlPipe, ProposalPanelComponent, RecordEditHistoryComponent],
  templateUrl: './group-page.component.html',
})
export class GroupPageComponent implements OnInit, OnDestroy {
  group: Group | null = null;
  companyName: string | null = null;
  teams: Team[] = [];
  histories: History[] = [];
  allMemberHistories: History[] = [];
  videos: GroupVideo[] = [];
  similarGroups: Group[] = [];
  selectedHistory: History | null = null;
  playingVideoId: string | null = null;
  loading = true;
  error = false;
  activeTab: 'members' | 'connections' = 'members';
  showGroupProposalPanel = false;
  showDeletePanel = false;
  proposalHistoryEntry: History | null = null;
  showNewHistoryPanel = false;
  lastProposal: Proposal | null = null;
  showEditHistory = false;
  linkCopied = false;
  allMembers: { id: string; name: string }[] = [];

  get lastProposalDiffFields(): DiffField[] {
    return this.lastProposal ? getDiffFields(this.lastProposal) : [];
  }

  formatRelativeTime(date: string | null): string {
    return formatRelativeTime(date);
  }

  ganttRows: GanttRow[] = [];
  ganttYears: { label: string; leftPct: number }[] = [];
  private _routeSub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private groupService: GroupService,
    private historyService: HistoryService,
    private memberService: MemberService,
    private companyService: CompanyService,
    private seo: SeoService,
    private proposalService: ProposalService,
    private analytics: AnalyticsService,
    private viewCount: ViewCountService,
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
    this.companyName = null;
    this.selectedHistory = null;
    this.playingVideoId = null;
    this.ganttRows = [];
    this.ganttYears = [];
    this.similarGroups = [];
    this.allMemberHistories = [];
    this.activeTab = 'members';
    try {
      const [group, teams, histories, videos] = await Promise.all([
        this.groupService.getById(id),
        this.groupService.getTeamsByGroup(id),
        this.historyService.getByGroup(id),
        this.groupService.getVideosByGroup(id),
      ]);
      this.group = group;
      if (group?.company_id) {
        this.companyService.getById(group.company_id)
          .then(c => { this.companyName = c?.name ?? null; })
          .catch(() => {});
      }
      this.teams = teams;
      this.histories = histories;
      this.videos = videos;
      this.buildGantt(histories, group);
      if (group) {
        this.proposalService.getApprovedByRecord('groups', id)
          .then(proposals => { this.lastProposal = proposals[0] ?? null; })
          .catch(() => {});
      }
      const memberIds = [...new Set(histories.map(h => h.member_id).filter((id): id is string => !!id))];
      this.allMemberHistories = await this.historyService.getByMembers(memberIds);
      this.memberService.getAll().then(members => {
        this.allMembers = members
          .map(m => ({ id: m.id, name: m.name ?? m.name_roman ?? m.id }))
          .sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
      }).catch(() => {});
      if (group?.style) {
        this.similarGroups = await this.groupService.getSimilarByStyle(group.style, id);
      }

      if (group) {
        const displayName = group.name_jp ?? group.name;
        this.seo.setPage(
          `${displayName} - Idol Maps`,
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
          .map(h => ({ '@type': 'Person', name: h.member!.name ?? h.member!.name_roman }));
        if (members.length > 0) jsonLd['member'] = members;

        this.seo.setJsonLd(jsonLd);
        this.analytics.trackEvent('view_group', {
          group_id: id,
          group_name: displayName,
        });
        this.viewCount.increment('group', id).catch(() => {});
      }
    } catch {
      this.error = true;
    } finally {
      this.loading = false;
    }
  }

  copyLink() {
    const id = this.route.snapshot.paramMap.get('id')!;
    const url = `${SITE_URL}/group/${id}`;
    navigator.clipboard.writeText(url).then(() => {
      this.linkCopied = true;
      setTimeout(() => { this.linkCopied = false; }, 2000);
    });
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
    const name = h.member?.name || h.member?.name_roman;
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
        isActive: !h.left_at || new Date(h.left_at).getTime() > Date.now(),
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

  get groupMembersList(): { id: string; name: string }[] {
    return this.allMembers;
  }

  hexToRgb(hex: string): string {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16) || 232;
    const g = parseInt(clean.substring(2, 4), 16) || 121;
    const b = parseInt(clean.substring(4, 6), 16) || 160;
    return `${r},${g},${b}`;
  }
}
