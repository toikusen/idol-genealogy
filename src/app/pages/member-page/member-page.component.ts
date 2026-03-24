import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MemberService } from '../../core/member.service';
import { HistoryService } from '../../core/history.service';
import { GroupService } from '../../core/group.service';
import { CompanyService } from '../../core/company.service';
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

const SITE_URL = 'https://idolmaps.com';

@Component({
  selector: 'app-member-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MemberTimelineComponent, AdBannerComponent, MemberCareerGraphComponent, ProposalPanelComponent, RecordEditHistoryComponent],
  templateUrl: './member-page.component.html',
})
export class MemberPageComponent implements OnInit {
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

  get lastProposalDiffFields(): DiffField[] {
    return this.lastProposal ? getDiffFields(this.lastProposal) : [];
  }

  formatRelativeTime(date: string | null): string {
    return formatRelativeTime(date);
  }

  constructor(
    private route: ActivatedRoute,
    private memberService: MemberService,
    private historyService: HistoryService,
    private groupService: GroupService,
    private companyService: CompanyService,
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

    const id = this.route.snapshot.paramMap.get('id')!;
    try {
      const [member, histories] = await Promise.all([
        this.memberService.getById(id),
        this.historyService.getByMember(id)
      ]);
      this.member = member;
      this.histories = histories;

      if (member?.company_id) {
        this.companyId = member.company_id;
        this.companyService.getById(member.company_id)
          .then(c => { this.companyName = c?.name ?? null; })
          .catch(() => {});
      }

      this.groupService.getAll().then(groups => {
        this.allGroupsList = groups.map(g => ({ id: g.id, name: g.name }))
          .sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
      }).catch(() => {});

      if (member) {
        const displayName = member.name_roman ?? member.name;
        this.seo.setPage(
          `${displayName} - Idol Maps`,
          `${displayName}的完整活動記錄，包含所屬團體與歷史經歷。`,
          `${SITE_URL}/member/${id}`,
          member.photo_url ?? undefined
        );

        const jsonLd: Record<string, any> = {
          '@context': 'https://schema.org',
          '@type': 'Person',
          name: displayName,
          url: `${SITE_URL}/member/${id}`,
        };
        if (member.birthdate) jsonLd['birthDate'] = member.birthdate;
        if (member.notes) jsonLd['description'] = member.notes;
        if (member.photo_url) jsonLd['image'] = member.photo_url;
        const groups = histories
          .filter(h => h.group)
          .map(h => ({ '@type': 'MusicGroup', name: h.group!.name }));
        if (groups.length > 0) jsonLd['memberOf'] = groups;

        this.seo.setJsonLd(jsonLd);

        this.analytics.trackEvent('view_member', {
          member_id: id,
          member_name: displayName,
        });
        this.viewCount.increment('member', id).catch(() => {});
      }

      // Load last approved proposal (non-blocking — don't let failure affect page load)
      if (member) {
        this.proposalService.getApprovedByRecord('members', id)
          .then(proposals => { this.lastProposal = proposals[0] ?? null; })
          .catch(() => {});
      }

      this.memberSongService.getByMember(id)
        .then(songs => { this.memberSongs = songs; })
        .catch(() => {});
    } catch {
      this.error = true;
    } finally {
      this.loading = false;
    }
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
      const memberId = this.route.snapshot.paramMap.get('id')!;
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
    const id = this.route.snapshot.paramMap.get('id')!;
    const url = `${SITE_URL}/member/${id}`;
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
