import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
import { groupPath, siteUrl } from '../../core/public-url.utils';
import { GroupPageData } from '../../core/page-data.resolvers';
import { groupIndexabilitySignals, isIndexable, isAdEligible } from '../../core/indexability.utils';
import { normalizeSnsUrl } from '../../core/sns-url.utils';

interface GanttRow {
  history: History;
  leftPct: number;
  widthPct: number;
  isActive: boolean;
}

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
  carouselIndex = 0;
  carouselVisibleCount = 2;
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
  adEligible = false;
  snsUrls: { instagram: string | null; facebook: string | null; x: string | null; youtube: string | null } = {
    instagram: null, facebook: null, x: null, youtube: null,
  };

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

  get latestEditSummary(): string {
    if (!this.lastProposal) return '';
    const submitter = this.lastProposal.submitter_name || '貢獻者';
    const relative = this.formatRelativeTime(this.lastProposal.reviewed_at);
    if (this.lastProposal.operation === 'UPDATE' && this.lastProposalDiffFields.length > 0) {
      return `${relative} · ${submitter} 更新了「${this.lastProposalDiffFields[0].label}」`;
    }
    return `${relative} · ${submitter}${this.lastProposal.operation === 'INSERT' ? ' 建立頁面' : ' 補充'}`;
  }

  get editorialSuggestions(): string[] {
    if (!this.group) return [];
    const suggestions: string[] = [];
    const hasSocial = !!(this.group.instagram || this.group.facebook || this.group.x || this.group.youtube);
    if (!this.group.photo_url) suggestions.push('可補上團體照片或官方主視覺');
    if (!this.group.founded_at) suggestions.push('可補上成立日期或活動開始時間');
    if (!hasSocial) suggestions.push('可補上官方社群或影音連結');
    if (!this.histories.length) suggestions.push('可補上現役與畢業成員歷程');
    return suggestions.slice(0, 3);
  }

  ganttRows: GanttRow[] = [];
  ganttYears: { label: string; leftPct: number }[] = [];
  tooltipRow: GanttRow | null = null;
  tooltipX = 0;
  tooltipY = 0;
  private _routeSub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private seo: SeoService,
    private proposalService: ProposalService,
    private analytics: AnalyticsService,
    private viewCount: ViewCountService,
    private groupSongService: GroupSongService,
    private supabaseAuth: SupabaseService,
    private adminRole: AdminRoleService,
  ) {}

  @HostListener('window:resize')
  onWindowResize() {
    const newCount = window.innerWidth >= 768 ? 5 : 2;
    if (newCount !== this.carouselVisibleCount) {
      this.carouselVisibleCount = newCount;
      this.carouselIndex = 0;
    }
  }

  get carouselCanPrev(): boolean { return this.carouselIndex > 0; }
  get carouselCanNext(): boolean {
    return this.carouselIndex < this.similarGroups.length - this.carouselVisibleCount;
  }
  carouselPrev() { if (this.carouselCanPrev) this.carouselIndex--; }
  carouselNext() { if (this.carouselCanNext) this.carouselIndex++; }

  ngOnInit() {
    this.carouselVisibleCount = window.innerWidth >= 768 ? 5 : 2;
    this.supabaseAuth.authState$.subscribe(s => {
      this.isLoggedIn = !!s?.user;
      this.currentUserId = s?.user?.id ?? null;
    });
    this.adminRole.isAdmin$.subscribe(v => { this.isAdmin = v; });
    this._routeSub = this.route.data.subscribe(({ pageData }) => {
      this.applyPageData(pageData as GroupPageData);
    });
    this.route.queryParams.subscribe(params => {
      if (params['propose'] === 'true') {
        this.showGroupProposalPanel = true;
      }
    });
  }

  ngOnDestroy() { this._routeSub?.unsubscribe(); }

  private applyPageData(pageData: GroupPageData) {
    this.loading = false;
    this.error = pageData.error;
    this.group = pageData.group;
    this.companyName = pageData.companyName;
    this.teams = pageData.teams;
    this.histories = pageData.histories;
    this.allMemberHistories = pageData.allMemberHistories;
    this.videos = pageData.videos;
    this.similarGroups = pageData.similarGroups;
    this.carouselIndex = 0;
    this.lastProposal = pageData.lastProposal;
    this.allMembers = pageData.allMembers;
    this.songs = pageData.songs;
    this.selectedHistory = null;
    this.playingVideoId = null;
    this.ganttRows = [];
    this.ganttYears = [];
    this.activeTab = 'members';
    this.showAddSongForm = false;
    this.editingSong = null;
    this.songError = '';
    this.buildGantt(pageData.histories, pageData.group);

    if (!pageData.group || pageData.error) {
      this.error = pageData.error;
      this.seo.setPage(
        '找不到團體 | Idol Maps',
        '很抱歉，您要查詢的團體不存在或已被移除。',
        siteUrl('/')
      );
      this.seo.setRobotsNoIndex(true);
      this.seo.clearJsonLd();
      this.adEligible = false;
      this.snsUrls = { instagram: null, facebook: null, x: null, youtube: null };
      return;
    }

    const displayName = pageData.group.name_jp ?? pageData.group.name;
    const activeCount = pageData.histories.filter(h => h.status === 'active').length;
    const parts: string[] = [];
    if (pageData.group.founded_at) parts.push(`成立於 ${pageData.group.founded_at.slice(0, 4)} 年`);
    if (activeCount > 0) parts.push(`現有 ${activeCount} 名活躍成員`);
    if (pageData.companyName) parts.push(`隸屬 ${pageData.companyName}`);
    const description = parts.length > 0
      ? `${displayName}，${parts.join('，')}。`
      : `${displayName}的成員組成與活動記錄。`;

    this.seo.setPage(
      `${displayName} - Idol Maps`,
      description,
      siteUrl(groupPath(pageData.id)),
      pageData.group.photo_url ?? undefined
    );

    const signals = groupIndexabilitySignals(pageData.group, pageData.histories.length);
    this.seo.setRobotsNoIndex(!isIndexable(signals));
    this.adEligible = isAdEligible(signals);

    this.snsUrls = {
      instagram: normalizeSnsUrl(pageData.group.instagram, 'instagram'),
      facebook: normalizeSnsUrl(pageData.group.facebook, 'facebook'),
      x: normalizeSnsUrl(pageData.group.x, 'x'),
      youtube: normalizeSnsUrl(pageData.group.youtube, 'youtube'),
    };
    const sameAs: string[] = [
      this.snsUrls.instagram,
      this.snsUrls.facebook,
      this.snsUrls.x,
      this.snsUrls.youtube,
    ].filter((v): v is string => !!v);

    const musicGroupSchema: Record<string, any> = {
      '@type': 'MusicGroup',
      name: displayName,
      url: siteUrl(groupPath(pageData.id)),
      ...(pageData.group.founded_at && { foundingDate: pageData.group.founded_at }),
      ...(pageData.group.photo_url && { image: pageData.group.photo_url }),
      ...(sameAs.length > 0 && { sameAs }),
    };
    const members = pageData.histories
      .filter(h => h.member)
      .map(h => ({ '@type': 'Person', name: h.member!.name ?? h.member!.name_roman }));
    if (members.length > 0) musicGroupSchema['member'] = members;

    const breadcrumb = {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Idol Maps', item: siteUrl('/') },
        { '@type': 'ListItem', position: 2, name: displayName, item: siteUrl(groupPath(pageData.id)) },
      ],
    };

    this.seo.setJsonLdGraph([musicGroupSchema, breadcrumb]);
    this.analytics.trackEvent('view_group', {
      group_id: pageData.id,
      group_name: displayName,
    });
    this.viewCount.increment('group', pageData.id).catch(() => {});
  }

  copyLink() {
    const id = this.route.snapshot.paramMap.get('id')!;
    const url = siteUrl(groupPath(id));
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
