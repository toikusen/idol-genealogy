import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { MemberService } from '../../core/member.service';
import { GroupService } from '../../core/group.service';
import { SeoService } from '../../core/seo.service';
import { Member, Group } from '../../models';
import { AdBannerComponent } from '../../shared/ad-banner/ad-banner.component';

const SITE_URL = 'https://idol-genealogy.pages.dev';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AdBannerComponent],
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit {
  query = '';
  recentMembers: Member[] = [];
  memberResults: Member[] = [];
  groupResults: Group[] = [];
  companyResults: string[] = [];
  searching = false;

  allGroups: Group[] = [];
  activeTab: 'members' | 'groups' | 'companies' = 'members';
  activeGroupTab: 'active' | 'disbanded' | 'trainee' = 'active';

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private memberService: MemberService,
    private groupService: GroupService,
    private seo: SeoService,
    private route: ActivatedRoute
  ) {}

  async ngOnInit() {
    // Set page-level SEO
    this.seo.setPage(
      '台灣地下偶像族譜 | 成員・組合完整記錄',
      '台灣地下偶像成員與組合的完整族譜記錄。查詢偶像成員經歷、所屬組合歷史、活動記錄。',
      `${SITE_URL}/`
    );
    this.seo.setJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: '台灣地下偶像族譜',
      url: `${SITE_URL}/`,
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${SITE_URL}/?q={search_term_string}`
        },
        'query-input': 'required name=search_term_string'
      }
    });

    // Read ?q= query param (used by Google SearchAction sitelinks)
    const q = this.route.snapshot.queryParamMap.get('q');
    if (q) {
      this.query = q;
      await this.search();
    }

    try {
      const [recent, groups] = await Promise.all([
        this.memberService.getRecent(10),
        this.groupService.getAll(),
      ]);
      this.recentMembers = recent;
      this.allGroups = groups;
    } catch {
      this.recentMembers = [];
      this.allGroups = [];
    }
  }

  onQueryChange() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.search(), 300);
  }

  async search() {
    if (!this.query.trim()) {
      this.memberResults = [];
      this.groupResults = [];
      this.companyResults = [];
      return;
    }
    this.searching = true;
    try {
      const [members, groups, companies] = await Promise.all([
        this.memberService.search(this.query),
        this.groupService.search(this.query),
        this.groupService.searchCompanies(this.query),
      ]);
      this.memberResults = members;
      this.groupResults = groups;
      this.companyResults = companies;
    } catch {
      this.memberResults = [];
      this.groupResults = [];
      this.companyResults = [];
    } finally {
      this.searching = false;
    }
  }

  getInitial(member: Member): string {
    if (member.name_jp) return member.name_jp.charAt(0);
    return member.name.charAt(0).toUpperCase();
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short' });
    } catch {
      return '—';
    }
  }

  get activeGroups(): Group[] {
    return this.allGroups
      .filter(g => !g.disbanded_at && !g.notes?.includes('類型：研修・見習'))
      .sort((a, b) => (b.founded_at ?? '').localeCompare(a.founded_at ?? ''));
  }

  get disbandedGroups(): Group[] {
    return this.allGroups
      .filter(g => !!g.disbanded_at && !g.notes?.includes('類型：研修・見習'))
      .sort((a, b) => (b.disbanded_at ?? '').localeCompare(a.disbanded_at ?? ''));
  }

  get traineeGroups(): Group[] {
    return this.allGroups
      .filter(g => g.notes?.includes('類型：研修・見習'))
      .sort((a, b) => (b.founded_at ?? '').localeCompare(a.founded_at ?? ''));
  }

  get displayedGroups(): Group[] {
    if (this.activeGroupTab === 'disbanded') return this.disbandedGroups;
    if (this.activeGroupTab === 'trainee') return this.traineeGroups;
    return this.activeGroups;
  }

  get companySections(): { name: string; groups: Group[]; activeCount: number; disbandedCount: number }[] {
    const map = new Map<string, Group[]>();
    for (const g of this.allGroups) {
      const key = g.company || '獨立・其他';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    }
    const entries = [...map.entries()];
    entries.sort(([a, ga], [b, gb]) => {
      if (a === '獨立・其他') return 1;
      if (b === '獨立・其他') return -1;
      return gb.length - ga.length || a.localeCompare(b);
    });
    return entries.map(([name, groups]) => ({
      name,
      groups: groups.sort((a, b) => (!a.disbanded_at ? -1 : !b.disbanded_at ? 1 : 0)),
      activeCount: groups.filter(g => !g.disbanded_at).length,
      disbandedCount: groups.filter(g => !!g.disbanded_at).length,
    }));
  }

  getGroupLabel(group: Group): string | null {
    return group.company ?? null;
  }

  get hasResults(): boolean {
    return this.memberResults.length > 0 || this.groupResults.length > 0 || this.companyResults.length > 0;
  }

  get noResults(): boolean {
    return this.query.trim().length > 0 && !this.searching && !this.hasResults;
  }
}
