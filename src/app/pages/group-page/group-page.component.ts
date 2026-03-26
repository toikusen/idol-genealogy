import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
import { GroupSongService } from '../../core/group-song.service';
import { SupabaseService } from '../../core/supabase.service';
import { AdminRoleService } from '../../core/admin-role.service';
import { GroupSong } from '../../models';

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
  imports: [CommonModule, FormsModule, RouterLink, GroupTreeComponent, GroupConnectionGraphComponent, AdBannerComponent, SafeUrlPipe, ProposalPanelComponent, RecordEditHistoryComponent],
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
  activeTab: 'members' | 'connections' | 'songs' = 'members';
  showGroupProposalPanel = false;
  showDeletePanel = false;
  proposalHistoryEntry: History | null = null;
  showNewHistoryPanel = false;
  lastProposal: Proposal | null = null;
  showEditHistory = false;
  linkCopied = false;
  allMembers: { id: string; name: string }[] = [];

  // Songs tab
  songs: GroupSong[] = [];
  songsLoading = false;
  isLoggedIn = false;
  isAdmin = false;
  currentUserId: string | null = null;
  showAddSongForm = false;
  editingSong: GroupSong | null = null;
  songFormData: Partial<GroupSong> = {};
  songSaving = false;
  songError = '';
  reportingSong: GroupSong | null = null;
  songReportNote = '';
  songReporterName = '';
  songReportSubmitting = false;
  songReportError = '';
  songReportDone = false;

  get lastProposalDiffFields(): DiffField[] {
    return this.lastProposal ? getDiffFields(this.lastProposal) : [];
  }

  formatRelativeTime(date: string | null): string {
    return formatRelativeTime(date);
  }

  ganttRows: GanttRow[] = [];
  ganttYears: { label: string; leftPct: number }[] = [];
  tooltipRow: GanttRow | null = null;
  tooltipX = 0;
  tooltipY = 0;
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
    private groupSongService: GroupSongService,
    private supabaseAuth: SupabaseService,
    private adminRole: AdminRoleService,
  ) {}

  ngOnInit() {
    this.supabaseAuth.authState$.subscribe(s => {
      this.isLoggedIn = !!s?.user;
      this.currentUserId = s?.user?.id ?? null;
    });
    this.adminRole.isAdmin$.subscribe(v => { this.isAdmin = v; });
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
    this.songs = [];
    this.showAddSongForm = false;
    this.editingSong = null;
    this.songError = '';
    try {
      const [group, teams, histories, videos] = await Promise.all([
        this.groupService.getById(id),
        this.groupService.getTeamsByGroup(id),
        this.historyService.getByGroup(id),
        this.groupService.getVideosByGroup(id),
      ]);
      this.group = group;
      if (group?.company_id) {
        try {
          const company = await this.companyService.getById(group.company_id);
          this.companyName = company?.name ?? null;
        } catch { /* ignore */ }
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
      this.groupSongService.getByGroup(id)
        .then(songs => { this.songs = songs; })
        .catch(() => {});

      if (group) {
        const displayName = group.name_jp ?? group.name;

        // Auto-generated description — used for meta only, NOT shown in UI
        const activeCount = histories.filter(h => h.status === 'active').length;
        const parts: string[] = [];
        if (group.founded_at) parts.push(`成立於 ${group.founded_at.slice(0, 4)} 年`);
        if (activeCount > 0) parts.push(`現有 ${activeCount} 名活躍成員`);
        if (this.companyName) parts.push(`隸屬 ${this.companyName}`);
        const description = parts.length > 0
          ? `${displayName}，${parts.join('，')}。`
          : `${displayName}的成員組成與活動記錄。`;

        this.seo.setPage(
          `${displayName} - Idol Maps`,
          description,
          `${SITE_URL}/group/${id}`,
          group.photo_url ?? undefined
        );

        // JSON-LD
        const sameAs: string[] = [
          group.instagram ? `https://instagram.com/${group.instagram}` : null,
          group.facebook ? `https://facebook.com/${group.facebook}` : null,
          group.x ? `https://x.com/${group.x}` : null,
          group.youtube ?? null,
        ].filter((v): v is string => !!v);

        const musicGroupSchema: Record<string, any> = {
          '@type': 'MusicGroup',
          name: displayName,
          url: `${SITE_URL}/group/${id}`,
          ...(group.founded_at && { foundingDate: group.founded_at }),
          ...(group.photo_url && { image: group.photo_url }),
          ...(sameAs.length > 0 && { sameAs }),
        };
        const members = histories
          .filter(h => h.member)
          .map(h => ({ '@type': 'Person', name: h.member!.name ?? h.member!.name_roman }));
        if (members.length > 0) musicGroupSchema['member'] = members;

        const breadcrumb = {
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Idol Maps', item: `${SITE_URL}/` },
            { '@type': 'ListItem', position: 2, name: displayName, item: `${SITE_URL}/group/${id}` },
          ],
        };

        this.seo.setJsonLdGraph([musicGroupSchema, breadcrumb]);
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
      return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
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

  openAddSong() {
    this.editingSong = null;
    const maxOrder = this.songs.reduce((m, s) => Math.max(m, s.sort_order ?? 0), 0);
    this.songFormData = { group_id: this.group!.id, sort_order: maxOrder + 1 };
    this.showAddSongForm = true;
    this.songError = '';
  }

  openEditSong(song: GroupSong) {
    this.editingSong = song;
    this.songFormData = { ...song };
    this.showAddSongForm = true;
    this.songError = '';
  }

  cancelSongForm() {
    this.showAddSongForm = false;
    this.editingSong = null;
    this.songFormData = {};
    this.songError = '';
  }

  async saveSong() {
    if (!this.songFormData.title?.trim()) { this.songError = '請輸入歌曲名稱'; return; }
    if (!this.songFormData.sort_order || this.songFormData.sort_order < 1) { this.songError = '請輸入第幾首單曲（最小為 1）'; return; }
    this.songSaving = true;
    this.songError = '';
    try {
      const id = this.route.snapshot.paramMap.get('id')!;
      if (this.editingSong) {
        const updated = await this.groupSongService.update(this.editingSong.id, {
          title: this.songFormData.title,
          release_date: this.songFormData.release_date || null,
          youtube_url: this.songFormData.youtube_url || null,
          composer: this.songFormData.composer || null,
          lyricist: this.songFormData.lyricist || null,
          arranger: this.songFormData.arranger || null,
          notes: this.songFormData.notes || null,
          sort_order: this.songFormData.sort_order ?? 0,
        });
        this.songs = this.songs.map(s => s.id === updated.id ? updated : s)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      } else {
        const created = await this.groupSongService.create({
          group_id: id,
          title: this.songFormData.title,
          release_date: this.songFormData.release_date || null,
          youtube_url: this.songFormData.youtube_url || null,
          composer: this.songFormData.composer || null,
          lyricist: this.songFormData.lyricist || null,
          arranger: this.songFormData.arranger || null,
          notes: this.songFormData.notes || null,
          sort_order: this.songFormData.sort_order ?? 0,
        });
        this.songs = [...this.songs, created]
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      }
      this.cancelSongForm();
    } catch (e: any) {
      this.songError = e.message ?? '儲存失敗';
    } finally {
      this.songSaving = false;
    }
  }

  async deleteSong(song: GroupSong) {
    if (!confirm(`確定要刪除「${song.title}」嗎？`)) return;
    try {
      await this.groupSongService.delete(song.id);
      this.songs = this.songs.filter(s => s.id !== song.id);
    } catch (e: any) {
      alert(e.message ?? '刪除失敗');
    }
  }

  canEditSong(song: GroupSong): boolean {
    return this.isAdmin || (!!this.currentUserId && song.created_by === this.currentUserId);
  }

  startReportSong(song: GroupSong) {
    this.reportingSong = song;
    this.songReportNote = '';
    this.songReporterName = '';
    this.songReportError = '';
    this.songReportDone = false;
  }

  cancelSongReport() {
    this.reportingSong = null;
  }

  async submitSongReport() {
    if (!this.songReportNote.trim()) { this.songReportError = '請說明問題'; return; }
    this.songReportSubmitting = true;
    this.songReportError = '';
    try {
      const session = await this.supabaseAuth.getSessionOnce();
      await this.proposalService.submit({
        table_name: 'group_songs',
        record_id: this.reportingSong!.id,
        operation: 'UPDATE',
        proposed_data: {},
        original_data: null,
        submitter_id: session?.user?.id ?? null,
        submitter_name: this.songReporterName.trim() || (session?.user?.email ?? '匿名'),
        submitter_email: session?.user?.email ?? null,
        submitter_note: this.songReportNote.trim(),
      });
      this.songReportDone = true;
      setTimeout(() => { this.reportingSong = null; this.songReportDone = false; }, 2000);
    } catch (e: any) {
      this.songReportError = e.message ?? '送出失敗';
    } finally {
      this.songReportSubmitting = false;
    }
  }

  extractYouTubeThumbnail(url: string | null): string | null {
    if (!url) return null;
    const id = this.extractYouTubeId(url);
    return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
  }

  get groupMembersList(): { id: string; name: string }[] {
    return this.allMembers;
  }

  onBarMouseEnter(event: MouseEvent, row: GanttRow) {
    this.tooltipRow = row;
    this.tooltipX = event.clientX;
    this.tooltipY = event.clientY;
  }

  onBarMouseMove(event: MouseEvent) {
    this.tooltipX = event.clientX;
    this.tooltipY = event.clientY;
  }

  onBarMouseLeave() {
    this.tooltipRow = null;
  }

  hexToRgb(hex: string): string {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16) || 232;
    const g = parseInt(clean.substring(2, 4), 16) || 121;
    const b = parseInt(clean.substring(4, 6), 16) || 160;
    return `${r},${g},${b}`;
  }

  /** 若代表色過亮（如白色），改用深色替代，避免文字在淺背景上不可見 */
  safeColor(hex: string, fallback = '#7a5a7a'): string {
    const clean = hex.replace('#', '');
    if (clean.length < 6) return fallback;
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance > 0.75 ? fallback : hex;
  }
}
