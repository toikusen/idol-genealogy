import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { MemberService } from '../../core/member.service';
import { GroupService } from '../../core/group.service';
import { HistoryService } from '../../core/history.service';
import { SeoService } from '../../core/seo.service';
import { Member, Group } from '../../models';
import { siteUrl } from '../../core/public-url.utils';
import { MembersListPageData } from '../../core/page-data.resolvers';
import { SupabaseImgPipe } from '../../shared/supabase-img.pipe';
const PAGE_SIZE = 36;

/** Order of the member grid, driven by the ?sort= query param. */
export type MemberSortMode = 'name' | 'recent';

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
  loadError = false;

  searchQuery = '';
  selectedGroupId = '';
  /** Raw ?page= value from the URL; use `page` (clamped) for display/slicing */
  currentPage = 1;
  /** Current ?sort= mode; 'name' is the default and carries no query param. */
  sortMode: MemberSortMode = 'name';
  private pageSub?: Subscription;
  private pageInitialized = false;
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
    private router: Router,
  ) {}

  async ngOnInit() {
    const pageUrl = siteUrl('/members');
    this.seo.setPage(
      '全部成員 - Idol Maps',
      '台灣地下偶像所有成員一覽。',
      pageUrl
    );
    this.applySchemas();

    this.pageSub = this.route.queryParamMap.subscribe(params => {
      const page = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1);
      const changed = page !== this.currentPage;
      this.currentPage = page;

      const sort: MemberSortMode = params.get('sort') === 'recent' ? 'recent' : 'name';
      const sortChanged = sort !== this.sortMode;
      this.sortMode = sort;
      if (sortChanged && this.allMembers.length > 0) this.resortMembers();

      if (this.pageInitialized && changed && typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      this.pageInitialized = true;
    });

    const pageData = this.route.snapshot.data['pageData'] as MembersListPageData | undefined;
    if (pageData && !pageData.error) {
      this.applyPageData(pageData.members, pageData.groups, pageData.links);
      this.loading = false;
      void this.loadGroupLinks(pageData.members, pageData.groups);
      return;
    }

    await this.fetchMembers();
  }

  ngOnDestroy() {
    this.isDestroyed = true;
    this.pageSub?.unsubscribe();
  }

  async retryLoad() {
    this.loading = true;
    await this.fetchMembers();
  }

  private async fetchMembers(): Promise<void> {
    this.loadError = false;
    try {
      const [members, groups] = await Promise.all([
        this.memberService.getAll(),
        this.groupService.getAll(),
      ]);
      if (this.isDestroyed) return;
      this.applyPageData(members, groups, []);
      void this.loadGroupLinks(members, groups);
    } catch {
      if (this.isDestroyed) return;
      this.loadError = true;
    } finally {
      this.loading = false;
    }
  }

  private applyPageData(
    members: Member[],
    groups: Group[],
    links: { member_id: string; group_id: string }[],
  ): void {
    this.allMembers = [...members].sort(this.compareMembers);
    this.allGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
    this.groupMemberIds.clear();
    for (const { member_id, group_id } of links) {
      if (!this.groupMemberIds.has(group_id)) this.groupMemberIds.set(group_id, new Set());
      this.groupMemberIds.get(group_id)!.add(member_id);
    }
    this.applySchemas();
    this.recomputeFilteredMembers();
  }

  /** ISO timestamps compare correctly as strings, so 'recent' needs no Date parsing. */
  private compareMembers = (a: Member, b: Member): number =>
    this.sortMode === 'recent'
      ? (b.updated_at ?? '').localeCompare(a.updated_at ?? '')
      : (a.name_roman ?? a.name).localeCompare(b.name_roman ?? b.name, 'zh-TW');

  private resortMembers(): void {
    this.allMembers = [...this.allMembers].sort(this.compareMembers);
    this.recomputeFilteredMembers();
  }

  /** Navigates to the given sort mode, resetting pagination. */
  setSort(mode: MemberSortMode): void {
    if (mode === this.sortMode) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { sort: mode === 'name' ? null : mode, page: null },
      queryParamsHandling: 'merge',
    });
  }

  private async loadGroupLinks(members: Member[], groups: Group[]): Promise<void> {
    this.linksLoaded = false;
    this.linksError = false;
    try {
      const links = await this.historyService.getMemberGroupLinks();
      if (this.isDestroyed) return;
      this.applyPageData(members, groups, links);
      this.linksLoaded = true;
      this.recomputeFilteredMembers();
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

  /** Cached result of the member/search/group filter; recomputed only when an input changes (see `onFilterChange`/`applyPageData`) instead of on every CD cycle. */
  private _filteredMembers: Member[] = [];

  private recomputeFilteredMembers(): void {
    const q = this.searchQuery.trim().toLowerCase();
    const groupSet = this.selectedGroupId ? this.groupMemberIds.get(this.selectedGroupId) : null;
    this._filteredMembers = this.allMembers.filter(m => {
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

  get filteredMembers(): Member[] {
    return this._filteredMembers;
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredMembers.length / PAGE_SIZE));
  }

  /** currentPage clamped to the valid range (URL can carry an out-of-range value) */
  get page(): number {
    return Math.min(this.currentPage, this.totalPages);
  }

  get pagedMembers(): Member[] {
    const start = (this.page - 1) * PAGE_SIZE;
    return this.filteredMembers.slice(start, start + PAGE_SIZE);
  }

  get pageNumbers(): number[] {
    const total = this.totalPages;
    const window = 5;
    let start = Math.max(1, this.page - Math.floor(window / 2));
    let end = start + window - 1;
    if (end > total) { end = total; start = Math.max(1, end - window + 1); }
    const pages: number[] = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  onFilterChange() {
    this.recomputeFilteredMembers();
    if (this.currentPage !== 1) this.setPage(1);
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

  retryLinks(): void {
    if (!this.linksError) return;
    void this.loadGroupLinks(this.allMembers, this.allGroups);
  }

  selectGroup(id: string) {
    this.selectedGroupId = id;
    this.groupDropdownOpen = false;
    this.groupSearch = '';
    this.onFilterChange();
  }

  setPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    // URL-driven pagination: the queryParamMap subscription updates currentPage and scrolls
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: page === 1 ? null : page },
      queryParamsHandling: 'merge',
    });
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
