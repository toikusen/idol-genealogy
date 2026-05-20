import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MemberService } from '../../core/member.service';
import { GroupService } from '../../core/group.service';
import { HistoryService } from '../../core/history.service';
import { SeoService } from '../../core/seo.service';
import { Member, Group } from '../../models';
import { siteUrl } from '../../core/public-url.utils';
import { MembersListPageData } from '../../core/page-data.resolvers';
import { SupabaseImgPipe } from '../../shared/supabase-img.pipe';
const PAGE_SIZE = 36;

@Component({
  selector: 'app-members-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SupabaseImgPipe],
  templateUrl: './members-list.component.html',
  styleUrl: './members-list.component.css',
})
export class MembersListComponent implements OnInit, OnDestroy {
  allMembers: Member[] = [];
  allGroups: Group[] = [];
  /** group_id → Set of member_ids */
  private groupMemberIds = new Map<string, Set<string>>();
  private isDestroyed = false;
  loading = true;

  searchQuery = '';
  selectedGroupId = '';
  currentPage = 1;
  groupDropdownOpen = false;
  groupSearch = '';
  linksLoaded = false;
  linksError = false;

  constructor(
    private memberService: MemberService,
    private groupService: GroupService,
    private historyService: HistoryService,
    private seo: SeoService,
    private route: ActivatedRoute,
  ) {}

  async ngOnInit() {
    const pageUrl = siteUrl('/members');
    this.seo.setPage(
      '全部成員 - Idol Maps',
      '台灣地下偶像所有成員一覽。',
      pageUrl
    );
    this.applySchemas();

    const pageData = this.route.snapshot.data['pageData'] as MembersListPageData | undefined;
    if (pageData && !pageData.error) {
      this.applyPageData(pageData.members, pageData.groups, pageData.links);
      this.loading = false;
      void this.loadGroupLinks(pageData.members, pageData.groups);
      return;
    }

    try {
      const [members, groups] = await Promise.all([
        this.memberService.getAll(),
        this.groupService.getAll(),
      ]);
      if (this.isDestroyed) return;
      this.applyPageData(members, groups, []);
      void this.loadGroupLinks(members, groups);
    } finally {
      this.loading = false;
    }
  }

  ngOnDestroy() {
    this.isDestroyed = true;
  }

  private applyPageData(
    members: Member[],
    groups: Group[],
    links: { member_id: string; group_id: string }[],
  ): void {
    this.allMembers = [...members].sort((a, b) =>
      (a.name_roman ?? a.name).localeCompare(b.name_roman ?? b.name, 'zh-TW')
    );
    this.allGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
    this.groupMemberIds.clear();
    for (const { member_id, group_id } of links) {
      if (!this.groupMemberIds.has(group_id)) this.groupMemberIds.set(group_id, new Set());
      this.groupMemberIds.get(group_id)!.add(member_id);
    }
    this.applySchemas();
  }

  private async loadGroupLinks(members: Member[], groups: Group[]): Promise<void> {
    this.linksLoaded = false;
    this.linksError = false;
    try {
      const links = await this.historyService.getMemberGroupLinks();
      if (this.isDestroyed) return;
      this.applyPageData(members, groups, links);
      this.linksLoaded = true;
    } catch {
      if (this.isDestroyed) return;
      this.linksLoaded = false;
      this.linksError = true;
      this.groupDropdownOpen = false;
      this.selectedGroupId = '';
      this.groupSearch = '';
      this.onFilterChange();
    }
  }

  get filteredMembers(): Member[] {
    const q = this.searchQuery.trim().toLowerCase();
    const groupSet = this.selectedGroupId ? this.groupMemberIds.get(this.selectedGroupId) : null;
    return this.allMembers.filter(m => {
      const matchSearch = !q ||
        m.name.toLowerCase().includes(q) ||
        (m.name_hiragana ?? '').toLowerCase().includes(q) ||
        (m.name_roman ?? '').toLowerCase().includes(q) ||
        (m.nickname ?? '').toLowerCase().includes(q) ||
        (m.emoji ?? '').includes(q);
      const matchGroup = !this.selectedGroupId || (this.linksLoaded && !!groupSet && groupSet.has(m.id));
      return matchSearch && matchGroup;
    });
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredMembers.length / PAGE_SIZE));
  }

  get pagedMembers(): Member[] {
    const start = (this.currentPage - 1) * PAGE_SIZE;
    return this.filteredMembers.slice(start, start + PAGE_SIZE);
  }

  get pageNumbers(): number[] {
    const total = this.totalPages;
    const window = 5;
    let start = Math.max(1, this.currentPage - Math.floor(window / 2));
    let end = start + window - 1;
    if (end > total) { end = total; start = Math.max(1, end - window + 1); }
    const pages: number[] = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  onFilterChange() {
    this.currentPage = 1;
  }

  get filteredGroupOptions(): Group[] {
    const q = this.groupSearch.trim().toLowerCase();
    if (!q) return this.allGroups;
    return this.allGroups.filter(g =>
      g.name.toLowerCase().includes(q) ||
      (g.name_jp ?? '').toLowerCase().includes(q)
    );
  }

  get selectedGroupName(): string {
    if (!this.selectedGroupId) return '全部團體';
    return this.allGroups.find(g => g.id === this.selectedGroupId)?.name ?? '全部團體';
  }

  get groupFilterLabel(): string {
    if (this.linksError) return '團體篩選暫不可用';
    if (!this.linksLoaded) return '載入中…';
    return this.selectedGroupName;
  }

  selectGroup(id: string) {
    this.selectedGroupId = id;
    this.groupDropdownOpen = false;
    this.groupSearch = '';
    this.onFilterChange();
  }

  setPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  getInitial(m: Member): string {
    return (m.name_roman ?? m.name).charAt(0).toUpperCase();
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

  private applySchemas(): void {
    const pageUrl = siteUrl('/members');
    const itemListElement = this.allMembers.slice(0, 60).map((member, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: siteUrl(`/member/${member.id}`),
      item: {
        '@type': 'Person',
        name: member.name,
      },
    }));

    this.seo.setJsonLdGraph([
      {
        '@type': 'CollectionPage',
        name: '全部成員',
        url: pageUrl,
        description: '台灣地下偶像所有成員一覽',
      },
      ...(itemListElement.length > 0 ? [{
        '@type': 'ItemList',
        name: '成員列表',
        numberOfItems: this.allMembers.length,
        itemListElement,
      }] : []),
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Idol Maps', item: siteUrl('/') },
          { '@type': 'ListItem', position: 2, name: '全部成員', item: pageUrl },
        ],
      },
    ]);
  }
}
