import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { SeoService } from '../../core/seo.service';
import { AnalyticsService } from '../../core/analytics.service';
import { ViewCountService } from '../../core/view-count.service';
import { MemberTimelineComponent } from '../../shared/member-timeline/member-timeline.component';
import { AdBannerComponent } from '../../shared/ad-banner/ad-banner.component';
import { MemberCareerGraphComponent } from '../../shared/member-career-graph/member-career-graph.component';
import { ProposalPanelComponent } from '../../shared/proposal-panel/proposal-panel.component';
import { Member, History, Proposal, MemberSong } from '../../models';
import { ProposalService } from '../../core/proposal.service';
import { getDiffFields, DiffField } from '../../core/proposal-diff.utils';
import { formatRelativeTime } from '../../core/time.utils';
import { RecordEditHistoryComponent } from '../../shared/record-edit-history/record-edit-history.component';
import { MemberSongService } from '../../core/member-song.service';
import { SupabaseService } from '../../core/supabase.service';
import { AdminRoleService } from '../../core/admin-role.service';
import { FormsModule } from '@angular/forms';
import { memberPath, siteUrl } from '../../core/public-url.utils';
import { MemberPageData } from '../../core/page-data.resolvers';
import { memberIndexabilitySignals, isIndexable, isAdEligible } from '../../core/indexability.utils';
import { normalizeSnsUrl } from '../../core/sns-url.utils';

@Component({
  selector: 'app-member-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MemberTimelineComponent, AdBannerComponent, MemberCareerGraphComponent, ProposalPanelComponent, RecordEditHistoryComponent],
  templateUrl: './member-page.component.html',
  styleUrl: './member-page.component.css',
})
export class MemberPageComponent implements OnInit, OnDestroy {
  member: Member | null = null;
  histories: History[] = [];
  loading = true;
  error = false;
  historyView: 'timeline' | 'career' = 'timeline';
  showProposalPanel = false;
  showDeletePanel = false;
  showOverseasPanel = false;
  historyToDelete: History | null = null;
  allGroupsList: { id: string; name: string }[] = [];
  lastProposal: Proposal | null = null;
  showEditHistory = false;
  linkCopied = false;
  companyName: string | null = null;
  companyId: string | null = null;
  adEligible = false;
  snsUrls: { instagram: string | null; facebook: string | null; x: string | null; maid: string | null } = {
    instagram: null, facebook: null, x: null, maid: null,
  };

  // Songs section
  memberSongs: MemberSong[] = [];
  isLoggedIn = false;
  isAdmin = false;
  currentUserId: string | null = null;
  showAddSongForm = false;
  editingSong: MemberSong | null = null;
  songFormData: Partial<MemberSong> = {};
  songSaving = false;
  songError = '';
  reportingSong: MemberSong | null = null;
  songReportNote = '';
  songReporterName = '';
  songReportSubmitting = false;
  songReportError = '';
  songReportDone = false;
  private routeDataSub?: Subscription;

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
    if (!this.member) return [];
    const suggestions: string[] = [];
    const hasSocial = !!(this.member.instagram || this.member.facebook || this.member.x || this.member.maid_url) || this.member.no_sns === true;
    if (!this.member.photo_url) suggestions.push('可補上成員照片或公開宣材照');
    if (!hasSocial) suggestions.push('可補上官方社群或公開個人頁面');
    if (!this.histories.length) suggestions.push('可補上加入、卒業或移籍等活動歷程');
    if (!this.member.birthdate) suggestions.push('可補上公開生日資訊');
    return suggestions.slice(0, 3);
  }

  constructor(
    private route: ActivatedRoute,
    private seo: SeoService,
    private proposalService: ProposalService,
    private analytics: AnalyticsService,
    private viewCount: ViewCountService,
    private memberSongService: MemberSongService,
    private supabaseAuth: SupabaseService,
    private adminRole: AdminRoleService,
  ) {}

  async ngOnInit() {
    this.supabaseAuth.authState$.subscribe(s => {
      this.isLoggedIn = !!s?.user;
      this.currentUserId = s?.user?.id ?? null;
    });
    this.adminRole.isAdmin$.subscribe(v => { this.isAdmin = v; });
    this.routeDataSub = this.route.data.subscribe(({ pageData }) => {
      this.applyPageData(pageData as MemberPageData);
    });
    this.route.queryParams.subscribe(params => {
      if (params['propose'] === 'true') {
        this.showProposalPanel = true;
      }
    });
  }

  ngOnDestroy() {
    this.routeDataSub?.unsubscribe();
  }

  private applyPageData(pageData: MemberPageData) {
    this.loading = false;
    this.error = pageData.error;
    this.member = pageData.member;
    this.histories = pageData.histories;
    this.companyName = pageData.companyName;
    this.companyId = pageData.companyId;
    this.allGroupsList = pageData.allGroupsList;
    this.lastProposal = pageData.lastProposal;
    this.memberSongs = pageData.memberSongs;

    if (!pageData.member || pageData.error) {
      this.seo.setPage(
        '找不到成員 | Idol Maps',
        '很抱歉，您要查詢的成員不存在或已被移除。',
        siteUrl('/members')
      );
      this.seo.setRobotsNoIndex(true);
      this.seo.clearJsonLd();
      this.adEligible = false;
      this.snsUrls = { instagram: null, facebook: null, x: null, maid: null };
      return;
    }

    const member = pageData.member;
    const id = member.id;
    const displayName = member.name ?? member.name_roman ?? '';
    const hiraganaName = member.name_hiragana;
    const romanName = member.name_roman;

    const groupParts = pageData.histories
      .filter(h => h.group || h.external_group_name)
      .sort((a, b) => (a.joined_at ?? '').localeCompare(b.joined_at ?? ''))
      .map(h => {
        const gName = h.group?.name_jp ?? h.group?.name ?? h.external_group_name ?? '';
        const from = h.joined_at ? h.joined_at.slice(0, 4) : null;
        const to = h.left_at ? h.left_at.slice(0, 4) : (h.status === 'active' ? '至今' : null);
        const range = from ? (to ? `${from}–${to}` : from) : '';
        return range ? `${gName}（${range}）` : gName;
      });
    const altNames = [hiraganaName, romanName].filter((v): v is string => !!v);
    const nameStr = altNames.length > 0 ? `${displayName}（${altNames.join(' / ')}）` : displayName;
    const description = groupParts.length > 0
      ? `${nameStr}是台灣地下偶像，曾隸屬${groupParts.join('、')}。`
      : `${displayName}的完整資料，包含所屬團體與活動記錄。`;

    this.seo.setPage(
      `${displayName} - Idol Maps`,
      description,
      siteUrl(memberPath(id)),
      member.photo_url ?? undefined
    );

    const signals = memberIndexabilitySignals(member, pageData.histories.length);
    this.seo.setRobotsNoIndex(!isIndexable(signals));
    this.adEligible = isAdEligible(signals);

    this.snsUrls = {
      instagram: normalizeSnsUrl(member.instagram, 'instagram'),
      facebook: normalizeSnsUrl(member.facebook, 'facebook'),
      x: normalizeSnsUrl(member.x, 'x'),
      maid: member.maid_url?.trim() || null,
    };
    const sameAs: string[] = [
      this.snsUrls.instagram,
      this.snsUrls.facebook,
      this.snsUrls.x,
      this.snsUrls.maid,
    ].filter((v): v is string => !!v);

    const personSchema: Record<string, any> = {
      '@type': 'Person',
      name: displayName,
      url: siteUrl(memberPath(id)),
      ...((() => {
        const alternateNames = [hiraganaName, romanName, member.nickname].filter((v): v is string => !!v);
        return alternateNames.length > 0
          ? { alternateName: alternateNames.length === 1 ? alternateNames[0] : alternateNames }
          : {};
      })()),
      ...(member.birthdate && { birthDate: member.birthdate }),
      ...(member.photo_url && { image: member.photo_url }),
      ...(sameAs.length > 0 && { sameAs }),
    };
    const groupsForSchema = pageData.histories
      .filter(h => h.group)
      .map(h => ({ '@type': 'MusicGroup', name: h.group!.name_jp ?? h.group!.name }));
    if (groupsForSchema.length > 0) personSchema['memberOf'] = groupsForSchema;

    const breadcrumb = {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Idol Maps', item: siteUrl('/') },
        { '@type': 'ListItem', position: 2, name: '全部成員', item: siteUrl('/members') },
        { '@type': 'ListItem', position: 3, name: displayName, item: siteUrl(memberPath(id)) },
      ],
    };

    this.seo.setJsonLdGraph([personSchema, breadcrumb]);
    this.analytics.trackEvent('view_member', {
      member_id: id,
      member_name: displayName,
    });
    this.viewCount.increment('member', id).catch(() => {});
  }

  canEditSong(song: MemberSong): boolean {
    return this.isAdmin || (!!this.currentUserId && song.created_by === this.currentUserId);
  }

  openAddSong() {
    this.editingSong = null;
    const maxOrder = this.memberSongs.reduce((m, s) => Math.max(m, s.sort_order ?? 0), 0);
    this.songFormData = { member_id: this.member!.id, sort_order: maxOrder + 1 };
    this.showAddSongForm = true;
    this.songError = '';
  }

  openEditSong(song: MemberSong) {
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
      const memberId = this.member?.id ?? this.route.snapshot.paramMap.get('id')!;
      if (this.editingSong) {
        const updated = await this.memberSongService.update(this.editingSong.id, {
          title: this.songFormData.title,
          release_date: this.songFormData.release_date || null,
          youtube_url: this.songFormData.youtube_url || null,
          composer: this.songFormData.composer || null,
          lyricist: this.songFormData.lyricist || null,
          arranger: this.songFormData.arranger || null,
          notes: this.songFormData.notes || null,
          sort_order: this.songFormData.sort_order ?? 1,
        });
        this.memberSongs = this.memberSongs.map(s => s.id === updated.id ? updated : s)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      } else {
        const created = await this.memberSongService.create({
          member_id: memberId,
          title: this.songFormData.title,
          release_date: this.songFormData.release_date || null,
          youtube_url: this.songFormData.youtube_url || null,
          composer: this.songFormData.composer || null,
          lyricist: this.songFormData.lyricist || null,
          arranger: this.songFormData.arranger || null,
          notes: this.songFormData.notes || null,
          sort_order: this.songFormData.sort_order ?? 1,
        });
        this.memberSongs = [...this.memberSongs, created]
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      }
      this.cancelSongForm();
    } catch (e: any) {
      this.songError = e.message ?? '儲存失敗';
    } finally {
      this.songSaving = false;
    }
  }

  async deleteSong(song: MemberSong) {
    if (!confirm(`確定要刪除「${song.title}」嗎？`)) return;
    try {
      await this.memberSongService.delete(song.id);
      this.memberSongs = this.memberSongs.filter(s => s.id !== song.id);
    } catch (e: any) {
      alert(e.message ?? '刪除失敗');
    }
  }

  startReportSong(song: MemberSong) {
    this.reportingSong = song;
    this.songReportNote = '';
    this.songReporterName = '';
    this.songReportError = '';
    this.songReportDone = false;
  }

  cancelSongReport() { this.reportingSong = null; }

  async submitSongReport() {
    if (!this.songReportNote.trim()) { this.songReportError = '請說明問題'; return; }
    this.songReportSubmitting = true;
    this.songReportError = '';
    try {
      const session = await this.supabaseAuth.getSessionOnce();
      await this.proposalService.submit({
        table_name: 'member_songs',
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

  extractYouTubeId(url: string): string | null {
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  extractYouTubeThumbnail(url: string | null): string | null {
    if (!url) return null;
    const id = this.extractYouTubeId(url);
    return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
  }

  getInitial(member: Member): string {
    if (member.name_roman) return member.name_roman.charAt(0);
    return member.name.charAt(0).toUpperCase();
  }

  copyLink() {
    const id = this.member?.id ?? this.route.snapshot.paramMap.get('id')!;
    const url = siteUrl(memberPath(id));
    navigator.clipboard.writeText(url).then(() => {
      this.linkCopied = true;
      setTimeout(() => { this.linkCopied = false; }, 2000);
    });
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    const mmdd = dateStr.match(/^(\d{1,2})-(\d{1,2})$/);
    if (mmdd) return `${+mmdd[1]}月${+mmdd[2]}日`;
    // fallback for old YYYY-MM-DD data
    const full = dateStr.match(/^\d{4}-(\d{1,2})-(\d{1,2})$/);
    if (full) return `${+full[1]}月${+full[2]}日`;
    return '—';
  }

  hexToRgb(hex: string): string {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16) || 232;
    const g = parseInt(clean.substring(2, 4), 16) || 121;
    const b = parseInt(clean.substring(4, 6), 16) || 160;
    return `${r},${g},${b}`;
  }

  fallbackPortraitStyle(color: string | null): Record<string, string> {
    const rgb = this.hexToRgb(color || '#e879a0');
    return {
      'background': `linear-gradient(135deg, rgba(${rgb}, 0.15) 0%, rgba(124,108,242,0.1) 100%)`,
      'color': `rgba(${rgb}, 0.6)`,
      'box-shadow': `0 0 0 1px rgba(${rgb}, 0.2), 0 12px 40px rgba(${rgb}, 0.15)`
    };
  }

  nicknameChipStyle(color: string | null): Record<string, string> {
    const rgb = this.hexToRgb(color || '#e879a0');
    return {
      'color': '#2d1b2e',
      'background': `rgba(${rgb}, 0.1)`,
      'border': `1px solid rgba(${rgb}, 0.3)`,
    };
  }
}
