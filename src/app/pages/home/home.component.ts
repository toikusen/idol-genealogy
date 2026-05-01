import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { MemberService } from '../../core/member.service';
import { GroupService } from '../../core/group.service';
import { CompanyService } from '../../core/company.service';
import { SeoService } from '../../core/seo.service';
import { Member, Group, Company, MemberLeaderboardEntry, GroupLeaderboardEntry } from '../../models';
import { ProposalPanelComponent } from '../../shared/proposal-panel/proposal-panel.component';
import { SafeUrlPipe } from '../../shared/safe-url.pipe';
import { SITE_URL, siteUrl } from '../../core/public-url.utils';
import { HomePageData } from '../../core/page-data.resolvers';
import {
  isPublicCompanyRecord,
  isPublicGroupRecord,
  isPublicMemberRecord,
  sanitizePublicCompanyRecord,
  sanitizePublicGroupRecord,
  sanitizePublicMemberRecord,
} from '../../core/public-record.utils';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ProposalPanelComponent, SafeUrlPipe],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent implements OnInit, OnDestroy {
  showMemberInsertPanel = false;
  showGroupInsertPanel = false;
  showCompanyInsertPanel = false;
  query = '';
  recentMembers: Member[] = [];
  memberResults: Member[] = [];
  aliasResults: { member: Member; alias: string }[] = [];
  groupResults: Group[] = [];
  companyResults: Company[] = [];
  searching = false;

  memberCount = 0;
  upcomingBirthdays: { member: Member; daysUntil: number }[] = [];
  allGroups: Group[] = [];
  allCompanies: Company[] = [];
  allSoloMembers: Member[] = [];
  topMembers: MemberLeaderboardEntry[] = [];
  topGroups: GroupLeaderboardEntry[] = [];
  activeTab: 'members' | 'groups' | 'companies' | 'events' = 'members';
  activeGroupTab: 'active' | 'disbanded' | 'trainee' = 'active';

  activeGroups: Group[] = [];
  disbandedGroups: Group[] = [];
  traineeGroups: Group[] = [];
  companySections: { name: string; companyId: string | null; groups: Group[]; soloMembers: Member[]; activeCount: number; disbandedCount: number }[] = [];

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private memberService: MemberService,
    private groupService: GroupService,
    private companyService: CompanyService,
    private seo: SeoService,
    private route: ActivatedRoute
  ) {}

  async ngOnInit() {
    // Set page-level SEO
    this.seo.setPage(
      'Idol Maps | 台灣地下偶像資料庫',
      '台灣地下偶像成員與團體的完整資料庫。查詢偶像成員經歷、所屬團體歷史、活動記錄。',
      siteUrl('/')
    );
    this.seo.setJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'Idol Maps',
      url: siteUrl('/'),
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${SITE_URL}/?q={search_term_string}`
        },
        'query-input': 'required name=search_term_string'
      }
    });

    // Read resolver data (populated by homePageResolver during SSR & navigation)
    const data = this.route.snapshot.data['pageData'] as HomePageData | undefined;
    if (data) {
      this.recentMembers = data.recentMembers;
      this.memberCount = data.memberCount;
      this.allGroups = data.allGroups;
      this.allCompanies = data.allCompanies;
      this.topMembers = data.topMembers;
      this.topGroups = data.topGroups;
      this.upcomingBirthdays = data.upcomingBirthdays;
      this.allSoloMembers = data.allSoloMembers;

      // Cache computed group/company views — only recomputed when source data changes
      this.activeGroups = this.allGroups
        .filter(g => !g.disbanded_at && !g.notes?.includes('類型：研修・見習'))
        .sort((a, b) => (b.founded_at ?? '').localeCompare(a.founded_at ?? ''));
      this.disbandedGroups = this.allGroups
        .filter(g => !!g.disbanded_at && !g.notes?.includes('類型：研修・見習'))
        .sort((a, b) => (b.disbanded_at ?? '').localeCompare(a.disbanded_at ?? ''));
      this.traineeGroups = this.allGroups
        .filter(g => g.notes?.includes('類型：研修・見習'))
        .sort((a, b) => (b.founded_at ?? '').localeCompare(a.founded_at ?? ''));
      this.companySections = this.buildCompanySections();
    }

    // Read ?q= query param (used by Google SearchAction sitelinks)
    const q = this.route.snapshot.queryParamMap.get('q');
    if (q) {
      this.query = q;
      await this.search();
    }
  }

  onQueryChange() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.search(), 300);
  }

  async search() {
    if (!this.query.trim()) {
      this.memberResults = [];
      this.aliasResults = [];
      this.groupResults = [];
      this.companyResults = [];
      return;
    }
    this.searching = true;
    try {
      const [members, aliasHits, groups, companies] = await Promise.all([
        this.memberService.search(this.query),
        this.memberService.searchByAlias(this.query),
        this.groupService.search(this.query),
        this.companyService.search(this.query),
      ]);
      this.memberResults = members.filter(isPublicMemberRecord).map(sanitizePublicMemberRecord);
      // Exclude alias hits whose member already appears in direct results
      const directIds = new Set(this.memberResults.map(m => m.id));
      this.aliasResults = aliasHits
        .filter(r => isPublicMemberRecord(r.member) && !directIds.has(r.member.id))
        .map(r => ({ ...r, member: sanitizePublicMemberRecord(r.member) }));
      this.groupResults = groups.filter(isPublicGroupRecord).map(sanitizePublicGroupRecord);
      this.companyResults = companies.filter(isPublicCompanyRecord).map(sanitizePublicCompanyRecord);
    } catch {
      this.memberResults = [];
      this.aliasResults = [];
      this.groupResults = [];
      this.companyResults = [];
    } finally {
      this.searching = false;
    }
  }

  getInitial(member: Member): string {
    const displayName = member.name || member.name_roman || '';
    return displayName.charAt(0).toUpperCase() || '?';
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return '—';
    }
  }

  ngOnDestroy() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
  }

  get displayedGroups(): Group[] {
    if (this.activeGroupTab === 'disbanded') return this.disbandedGroups;
    if (this.activeGroupTab === 'trainee') return this.traineeGroups;
    return this.activeGroups;
  }

  private buildCompanySections(): { name: string; companyId: string | null; groups: Group[]; soloMembers: Member[]; activeCount: number; disbandedCount: number }[] {
    const companyNameById = new Map(this.allCompanies.map(c => [c.id, c.name]));
    const companyIdByName = new Map(this.allCompanies.map(c => [c.name, c.id]));
    const map = new Map<string, Group[]>();
    for (const g of this.allGroups) {
      const key = (g.company_id ? companyNameById.get(g.company_id) : null) ?? g.company ?? '獨立・其他';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    }
    // Ensure companies with only solo members also appear
    for (const m of this.allSoloMembers) {
      if (!m.company_id) continue;
      const name = companyNameById.get(m.company_id);
      if (name && !map.has(name)) map.set(name, []);
    }
    const entries = [...map.entries()];
    entries.sort(([a, ga], [b, gb]) => {
      if (a === '獨立・其他') return 1;
      if (b === '獨立・其他') return -1;
      return gb.length - ga.length || a.localeCompare(b);
    });
    return entries.map(([name, groups]) => {
      const companyId = companyIdByName.get(name) ?? null;
      const soloMembers = companyId
        ? this.allSoloMembers.filter(m => m.company_id === companyId)
        : [];
      return {
        name,
        companyId,
        groups: groups.sort((a, b) => (!a.disbanded_at ? -1 : !b.disbanded_at ? 1 : 0)),
        soloMembers,
        activeCount: groups.filter(g => !g.disbanded_at).length,
        disbandedCount: groups.filter(g => !!g.disbanded_at).length,
      };
    });
  }

  getCompanyId(name: string): string | null {
    return this.allCompanies.find(c => c.name === name)?.id ?? null;
  }

  getGroupLabel(group: Group): string | null {
    return group.company ?? null;
  }

  readonly calendarUrl = 'https://calendar.google.com/calendar/u/0/embed?src=mr7kibfjcm3gu52v6t64lreras@group.calendar.google.com&ctz=Asia/Taipei&showTitle=0&showNav=1&showPrint=0&showTabs=0&showCalendars=0&bgcolor=%23FDF8FF';

  get hasResults(): boolean {
    return this.memberResults.length > 0 || this.aliasResults.length > 0 || this.groupResults.length > 0 || this.companyResults.length > 0;
  }

  get noResults(): boolean {
    return this.query.trim().length > 0 && !this.searching && !this.hasResults;
  }

  safeColor(hex: string | null | undefined, fallback = '#e879a0'): string {
    if (!hex) return fallback;
    const clean = hex.replace('#', '');
    if (clean.length < 6) return fallback;
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance > 0.75 ? fallback : hex;
  }
}
