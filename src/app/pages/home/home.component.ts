import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { MemberService } from '../../core/member.service';
import { GroupService } from '../../core/group.service';
import { SeoService } from '../../core/seo.service';
import { Member, Group } from '../../models';

const SITE_URL = 'https://idol-genealogy.pages.dev';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit {
  query = '';
  recentMembers: Member[] = [];
  memberResults: Member[] = [];
  groupResults: Group[] = [];
  searching = false;

  allGroups: Group[] = [];
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
      return;
    }
    this.searching = true;
    try {
      const [members, groups] = await Promise.all([
        this.memberService.search(this.query),
        this.groupService.search(this.query)
      ]);
      this.memberResults = members;
      this.groupResults = groups;
    } catch {
      this.memberResults = [];
      this.groupResults = [];
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

  getGroupLabel(group: Group): string | null {
    const match = group.notes?.match(/所屬：([^|]+)/);
    return match ? match[1].trim() : null;
  }

  get hasResults(): boolean {
    return this.memberResults.length > 0 || this.groupResults.length > 0;
  }

  get noResults(): boolean {
    return this.query.trim().length > 0 && !this.searching && !this.hasResults;
  }
}
