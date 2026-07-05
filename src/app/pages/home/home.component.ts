import { Component, OnInit, OnDestroy, PLATFORM_ID, inject, ViewChild, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { MemberService } from '../../core/member.service';
import { GroupService } from '../../core/group.service';
import { CompanyService } from '../../core/company.service';
import { VenueService } from '../../core/venue.service';
import { GoogleCalendarService } from '../../core/google-calendar.service';
import { SeoService } from '../../core/seo.service';
import { AnalyticsService } from '../../core/analytics.service';
import { Member, Group, Company, MemberRecentHeatEntry, GroupRecentHeatEntry, Venue, VenueCalendarEvent, VenueRegionFilter } from '../../models';
import { ProposalPanelComponent } from '../../shared/proposal-panel/proposal-panel.component';
import { SafeUrlPipe } from '../../shared/safe-url.pipe';
import { SupabaseImgPipe } from '../../shared/supabase-img.pipe';
import { VenueMapComponent } from '../../shared/venue-map/venue-map.component';
import { AdBannerComponent } from '../../shared/ad-banner/ad-banner.component';
import { SITE_URL, siteUrl } from '../../core/public-url.utils';
import type { HomePageData } from '../../core/page-data.resolvers';
import {
  isPublicCompanyRecord,
  isPublicGroupRecord,
  isPublicMemberRecord,
  sanitizePublicCompanyRecord,
  sanitizePublicGroupRecord,
  sanitizePublicMemberRecord,
} from '../../core/public-record.utils';

type HomeTab = 'members' | 'groups' | 'companies' | 'events' | 'venues';
const HOME_TABS: readonly HomeTab[] = ['members', 'groups', 'companies', 'events', 'venues'];
const VENUE_REGION_FILTERS: readonly VenueRegionFilter[] = ['all', 'north', 'central', 'south'];

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, ProposalPanelComponent, SafeUrlPipe, SupabaseImgPipe, VenueMapComponent, AdBannerComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css',
})
export class HomeComponent implements OnInit, OnDestroy {
  showMemberInsertPanel = false;
  showGroupInsertPanel = false;
  showCompanyInsertPanel = false;
  showVenueInsertPanel = false;
  showVenueUpdatePanel = false;
  venueForProposal: Venue | null = null;
  query = '';
  recentMembers: Member[] = [];
  memberResults: Member[] = [];
  aliasResults: { member: Member; alias: string }[] = [];
  groupResults: Group[] = [];
  companyResults: Company[] = [];
  searching = false;

  memberCount = 0;
  groupCount = 0;
  companyCount = 0;
  venues: Venue[] = [];
  venuesLoaded = false;
  venuesLoading = false;
  expandedVenueIds = new Set<string>();
  @ViewChild(VenueMapComponent) venueMapRef?: VenueMapComponent;
  venueEventCounts = new Map<string, number>();
  calendarLoaded = false;
  venueEvents = new Map<string, VenueCalendarEvent[]>();
  venueEventsLoaded = new Set<string>();
  venueEventsLoading = new Set<string>();
  venueEventsError = new Map<string, string>();
  upcomingBirthdays: { member: Member; daysUntil: number }[] = [];
  allGroups: Group[] = [];
  allCompanies: Company[] = [];
  allSoloMembers: Member[] = [];
  topMembers: MemberRecentHeatEntry[] = [];
  topGroups: GroupRecentHeatEntry[] = [];
  activeTab: HomeTab = 'members';
  private soloMembersLoaded = false;
  activeGroupTab: 'active' | 'disbanded' | 'trainee' = 'active';
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly venueService = inject(VenueService);
  private readonly destroyRef = inject(DestroyRef);
  private destroyed = false;

  activeGroups: Group[] = [];
  disbandedGroups: Group[] = [];
  traineeGroups: Group[] = [];
  companySections: { name: string; companyId: string | null; groups: Group[]; soloMembers: Member[]; activeCount: number; disbandedCount: number }[] = [];

  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private searchAnalyticsTimer: ReturnType<typeof setTimeout> | null = null;
  private searchRequestId = 0;
  private lastTrackedSearchTerm = '';
  private browseCatalogLoaded = false;
  private browseCatalogPromise: Promise<void> | null = null;
  browseCatalogLoading = false;
  constructor(
    private memberService: MemberService,
    private groupService: GroupService,
    private companyService: CompanyService,
    private googleCalendarService: GoogleCalendarService,
    private seo: SeoService,
    private analytics: AnalyticsService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  async ngOnInit() {
    // Set page-level SEO
    this.seo.setPage(
      'Idol Maps | 台灣地下偶像資料庫',
      '台灣地下偶像成員與團體的完整資料庫。查詢成員履歷、團體歷史、場地資訊與近期活動行程。',
      siteUrl('/')
    );
    this.seo.setJsonLdGraph([
      {
        '@type': 'WebSite',
        name: 'Idol Maps',
        url: siteUrl('/'),
        description: '台灣地下偶像成員、團體、公司、演出場地與近期活動行程的公開資料庫。',
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${SITE_URL}/?q={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'Organization',
        name: 'Idol Maps',
        url: siteUrl('/'),
        logo: {
          '@type': 'ImageObject',
          url: `${SITE_URL}/favicon-192.png`,
        },
        description: '台灣地下偶像成員與團體的完整公開資料庫，整理成員活動歷程、所屬團體、公司關係、演出場地與近期活動行程。',
        foundingDate: '2024',
        areaServed: '台灣',
        knowsAbout: ['台灣地下偶像', '偶像團體', '偶像成員歷程', '偶像演出場地', '地下偶像活動行程'],
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: '什麼是台灣地下偶像？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: '台灣地下偶像（台灣地偶）是指以台灣為主要活動地區的獨立偶像藝人，通常在Live House等近距離活動中演出，與主流娛樂圈有所區別。多為多人女子偶像組合，也有個人歌手。',
            },
          },
          {
            '@type': 'Question',
            name: 'Idol Maps 提供哪些偶像資料？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Idol Maps 收錄台灣地下偶像的成員個人資料、所屬團體歷史、公司關係、活動歷程時間軸、成員間的團體關聯圖，以及北中南演出場地資訊與近期活動行程。資料來源為公開宣傳資料與官方公告，並由社群貢獻者協助維護。',
            },
          },
          {
            '@type': 'Question',
            name: '如何在 Idol Maps 查看近期活動行程？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: '在首頁切換到「場地」分頁，可以瀏覽台灣北中南各 Live House 與演出場地，並查看近期活動行程。在成員或團體個人頁面也可直接查看該對象的近期演出資訊。',
            },
          },
          {
            '@type': 'Question',
            name: '如何在 Idol Maps 搜尋偶像成員？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: '在 Idol Maps 首頁的搜尋框輸入成員姓名或暱稱，即可快速找到對應的成員頁面。也可以透過成員列表頁依字母或加入日期瀏覽全部成員。',
            },
          },
          {
            '@type': 'Question',
            name: 'Idol Maps 的資料如何更新？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Idol Maps 的資料由社群貢獻者共同維護，並由編輯審核後上線。若發現資料有誤或缺漏，可透過各個頁面的「提議修改」功能回報，或在聯絡頁面提供補充資料。',
            },
          },
        ],
      },
    ]);

    // Read resolver data (populated by homePageResolver during SSR & navigation)
    const data = this.route.snapshot.data['pageData'] as HomePageData | undefined;
    if (data) {
      this.recentMembers = data.recentMembers;
      this.memberCount = data.memberCount;
      this.groupCount = data.groupCount;
      this.companyCount = data.companyCount;
      this.topMembers = data.topMembers;
      this.topGroups = data.topGroups;
      this.upcomingBirthdays = data.upcomingBirthdays;
    }

    // Read ?q= query param (used by Google SearchAction sitelinks)
    const q = this.route.snapshot.queryParamMap.get('q');
    if (q) {
      this.query = q;
      await this.search();
    }

    // ?tab=/?region= are the single source of truth for the active tab and venue
    // filter; subscribing (not snapshot) keeps the view in sync on back/forward.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      const tabParam = params.get('tab');
      const tab: HomeTab = tabParam && (HOME_TABS as readonly string[]).includes(tabParam)
        ? (tabParam as HomeTab)
        : 'members';
      if (tab !== this.activeTab) {
        this.activeTab = tab;
        void this.loadTabData(tab);
      }
      const regionParam = params.get('region');
      this.activeVenueRegionFilter = regionParam && (VENUE_REGION_FILTERS as readonly string[]).includes(regionParam)
        ? (regionParam as VenueRegionFilter)
        : 'all';
    });
  }

  async setTab(tab: HomeTab) {
    if (tab === this.activeTab) return;
    // Apply optimistically for instant feedback; the queryParamMap subscription
    // only kicks in when the URL changes underneath us (back/forward).
    this.activeTab = tab;
    this.analytics.trackEvent('home_tab_switch', { tab });
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: tab === 'members' ? null : tab },
      queryParamsHandling: 'merge',
    });
    await this.loadTabData(tab);
  }

  private async loadTabData(tab: HomeTab): Promise<void> {
    if (tab === 'groups' || tab === 'companies') {
      await this.ensureBrowseCatalog();
    }
    if (tab === 'companies' && !this.soloMembersLoaded) {
      this.soloMembersLoaded = true;
      const raw = await this.memberService.getSoloMembers().catch(() => [] as Member[]);
      this.allSoloMembers = raw.filter(isPublicMemberRecord).map(sanitizePublicMemberRecord);
      this.companySections = this.buildCompanySections();
    }
    if (tab === 'events') {
      void this.loadTodayEvents();
    }
    if (tab === 'venues' && !this.venuesLoaded) {
      this.venuesLoading = true;
      try {
        this.venues = await this.venueService.getAll();
        this.venuesLoaded = true;
        this.venuesNorth = this.venues.filter(v => v.region === 'north');
        this.venuesCentral = this.venues.filter(v => v.region === 'central');
        this.venuesSouth = this.venues.filter(v => v.region === 'south');
        this.googleCalendarService
          .preloadForVenues(this.venues)
          .then(counts => {
            if (!this.destroyed) {
              this.venueEventCounts = counts;
              this.calendarLoaded = true;
            }
          })
          .catch(() => {
            if (!this.destroyed) this.calendarLoaded = true;
          });
      } finally {
        this.venuesLoading = false;
      }
    }
  }

  private async ensureBrowseCatalog(): Promise<void> {
    if (this.browseCatalogLoaded) return;
    if (this.browseCatalogPromise) return this.browseCatalogPromise;
    this.browseCatalogLoading = true;
    this.browseCatalogPromise = (async () => {
      try {
        const [groups, companies] = await Promise.all([
          this.groupService.getAll().catch(() => [] as Group[]),
          this.companyService.getAll().catch(() => [] as Company[]),
        ]);
        this.allGroups = groups.filter(isPublicGroupRecord).map(sanitizePublicGroupRecord);
        this.allCompanies = companies.filter(isPublicCompanyRecord).map(sanitizePublicCompanyRecord);
        this.groupCount = this.allGroups.length || this.groupCount;
        this.companyCount = this.allCompanies.length || this.companyCount;
        this.cacheBrowseViews();
        this.browseCatalogLoaded = true;
      } finally {
        this.browseCatalogLoading = false;
        this.browseCatalogPromise = null;
      }
    })();
    return this.browseCatalogPromise;
  }

  private cacheBrowseViews(): void {
    const today = new Date().toISOString().slice(0, 10);
    this.activeGroups = this.allGroups
      .filter(g => (!g.disbanded_at || g.disbanded_at > today) && !g.is_trainee)
      .sort((a, b) => (b.founded_at ?? '').localeCompare(a.founded_at ?? ''));
    this.disbandedGroups = this.allGroups
      .filter(g => !!g.disbanded_at && g.disbanded_at <= today && !g.is_trainee)
      .sort((a, b) => (b.disbanded_at ?? '').localeCompare(a.disbanded_at ?? ''));
    this.traineeGroups = this.allGroups
      .filter(g => g.is_trainee)
      .sort((a, b) => (b.founded_at ?? '').localeCompare(a.founded_at ?? ''));
    this.companySections = this.buildCompanySections();
  }

  onQueryChange() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.search(), 300);
  }

  async search() {
    const searchTerm = this.query.trim();
    const requestId = ++this.searchRequestId;
    if (!searchTerm) {
      this.memberResults = [];
      this.aliasResults = [];
      this.groupResults = [];
      this.companyResults = [];
      this.clearSearchAnalyticsTimer();
      return;
    }
    this.searching = true;
    try {
      const [members, aliasHits, groups, companies] = await Promise.all([
        this.memberService.search(searchTerm),
        this.memberService.searchByAlias(searchTerm),
        this.groupService.search(searchTerm),
        this.companyService.search(searchTerm),
      ]);
      if (requestId !== this.searchRequestId || this.query.trim() !== searchTerm) return;
      this.memberResults = members.filter(isPublicMemberRecord).map(sanitizePublicMemberRecord);
      // Exclude alias hits whose member already appears in direct results
      const directIds = new Set(this.memberResults.map(m => m.id));
      this.aliasResults = aliasHits
        .filter(r => isPublicMemberRecord(r.member) && !directIds.has(r.member.id))
        .map(r => ({ ...r, member: sanitizePublicMemberRecord(r.member) }));
      this.groupResults = groups.filter(isPublicGroupRecord).map(sanitizePublicGroupRecord);
      this.companyResults = companies.filter(isPublicCompanyRecord).map(sanitizePublicCompanyRecord);
      const totalResults = this.memberResults.length + this.aliasResults.length + this.groupResults.length + this.companyResults.length;
      this.queueSearchAnalytics(searchTerm, totalResults);
    } catch {
      if (requestId !== this.searchRequestId) return;
      this.memberResults = [];
      this.aliasResults = [];
      this.groupResults = [];
      this.companyResults = [];
    } finally {
      if (requestId === this.searchRequestId) this.searching = false;
    }
  }

  private queueSearchAnalytics(searchTerm: string, totalResults: number): void {
    this.clearSearchAnalyticsTimer();
    if (searchTerm.length < 2 || searchTerm === this.lastTrackedSearchTerm) return;
    this.searchAnalyticsTimer = setTimeout(() => {
      if (this.query.trim() !== searchTerm) return;
      this.lastTrackedSearchTerm = searchTerm;
      this.analytics.trackEvent('search', {
        search_term: searchTerm,
        result_count: totalResults,
        has_results: totalResults > 0,
      });
    }, 800);
  }

  private clearSearchAnalyticsTimer(): void {
    if (!this.searchAnalyticsTimer) return;
    clearTimeout(this.searchAnalyticsTimer);
    this.searchAnalyticsTimer = null;
  }

  trackSearchResultClick(resultType: 'member' | 'group' | 'company', resultId: string, position: number, source: 'direct' | 'alias' | 'search'): void {
    const searchTerm = this.query.trim();
    if (!searchTerm) return;
    this.analytics.trackEvent('search_result_click', {
      search_term: searchTerm,
      result_type: resultType,
      result_id: resultId,
      position,
      source,
    });
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

  venuesNorth: Venue[] = [];
  venuesCentral: Venue[] = [];
  venuesSouth: Venue[] = [];
  activeVenueRegionFilter: VenueRegionFilter = 'all';
  readonly venueRegionFilters: { key: VenueRegionFilter; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'north', label: '北部' },
    { key: 'central', label: '中部' },
    { key: 'south', label: '南部' },
  ];

  setVenueRegionFilter(filter: VenueRegionFilter) {
    this.activeVenueRegionFilter = filter;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { region: filter === 'all' ? null : filter },
      queryParamsHandling: 'merge',
    });
  }

  async onVenuePopupOpened(venueId: string): Promise<void> {
    const venue = this.venues.find(v => v.id === venueId);
    if (!venue) return;
    this.trackVenueView(venue, 'map_popup');
    await this.refreshVenuePopup(venue);
  }

  private async refreshVenuePopup(venue: Venue): Promise<void> {
    await this.loadVenueEvents(venue);
    const events = this.venueEvents.get(venue.id) ?? [];
    const error  = this.venueEventsError.get(venue.id) ?? '';
    this.venueMapRef?.refreshPopup(venue.id, events, error);
  }

  onVenueProposalRequested(venueId: string): void {
    const venue = this.venues.find(v => v.id === venueId);
    if (!venue) return;
    this.openVenueUpdatePanel(venue);
  }

  openVenueInsertPanel(): void {
    this.showVenueInsertPanel = true;
  }

  closeVenueInsertPanel(): void {
    this.showVenueInsertPanel = false;
  }

  openVenueUpdatePanel(venue: Venue): void {
    this.venueForProposal = venue;
    this.showVenueUpdatePanel = true;
  }

  closeVenueUpdatePanel(): void {
    this.showVenueUpdatePanel = false;
    this.venueForProposal = null;
  }

  toggleVenue(venue: Venue) {
    if (this.expandedVenueIds.has(venue.id)) {
      this.expandedVenueIds.delete(venue.id);
    } else {
      this.expandedVenueIds.add(venue.id);
      this.venueMapRef?.focusVenue(venue.id);
      this.trackVenueView(venue, 'list_expand');
      void this.refreshVenuePopup(venue);
    }
  }

  private trackVenueView(venue: Venue, source: 'map_popup' | 'list_expand'): void {
    this.analytics.trackEvent('venue_view', {
      venue_id: venue.id,
      venue_name: venue.name,
      source,
    });
  }

  trackVenueEventClick(venue: Venue, event: VenueCalendarEvent, domEvent: Event): void {
    domEvent.stopPropagation();
    this.analytics.trackEvent('venue_event_click', {
      venue_id: venue.id,
      venue_name: venue.name,
      event_id: event.id,
      event_title: event.title,
    });
  }

  venueMapUrl(address: string): string {
    return `https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
  }

  async loadVenueEvents(venue: Venue) {
    if (this.venueEventsLoaded.has(venue.id) || this.venueEventsLoading.has(venue.id)) return;
    if (!this.googleCalendarService.isConfigured()) {
      this.venueEventsLoaded.add(venue.id);
      this.venueEvents.set(venue.id, []);
      return;
    }
    this.venueEventsLoading.add(venue.id);
    this.venueEventsError.delete(venue.id);
    try {
      const events = await this.googleCalendarService.getUpcomingVenueEvents(venue);
      if (this.destroyed) return;
      this.venueEvents.set(venue.id, events);
      this.venueEventsLoaded.add(venue.id);
    } catch {
      if (!this.destroyed) this.venueEventsError.set(venue.id, '近期活動載入失敗');
    } finally {
      this.venueEventsLoading.delete(venue.id);
    }
  }

  getVenueEvents(venueId: string): VenueCalendarEvent[] {
    return this.venueEvents.get(venueId) ?? [];
  }

  isVenueEventsLoading(venueId: string): boolean {
    return this.venueEventsLoading.has(venueId);
  }

  venueEventsLoadError(venueId: string): string {
    return this.venueEventsError.get(venueId) ?? '';
  }

  hasVenueEventsLoaded(venueId: string): boolean {
    return this.venueEventsLoaded.has(venueId);
  }

  isVenueCalendarConfigured(): boolean {
    return this.googleCalendarService.isConfigured();
  }

  formatVenueEventDate(event: VenueCalendarEvent): string {
    if (!event.start) return '';
    const date = new Date(event.start);
    if (isNaN(date.getTime())) return event.start;
    const options: Intl.DateTimeFormatOptions = event.isAllDay
      ? { month: 'numeric', day: 'numeric', weekday: 'short' }
      : { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' };
    return date.toLocaleString('zh-TW', options);
  }

  copyAddress(address: string, event: Event) {
    event.stopPropagation();
    if (this.isBrowser) navigator.clipboard.writeText(address);
  }

  ngOnDestroy() {
    this.destroyed = true;
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.clearSearchAnalyticsTimer();
  }

  get displayedGroups(): Group[] {
    if (this.activeGroupTab === 'disbanded') return this.disbandedGroups;
    if (this.activeGroupTab === 'trainee') return this.traineeGroups;
    return this.activeGroups;
  }

  private buildCompanySections(): { name: string; companyId: string | null; groups: Group[]; soloMembers: Member[]; activeCount: number; disbandedCount: number }[] {
    const today = new Date().toISOString().slice(0, 10);
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
        groups: groups.sort((a, b) => (!a.disbanded_at || a.disbanded_at > today ? -1 : !b.disbanded_at || b.disbanded_at > today ? 1 : 0)),
        soloMembers,
        activeCount: groups.filter(g => !g.disbanded_at || g.disbanded_at > today).length,
        disbandedCount: groups.filter(g => !!g.disbanded_at && g.disbanded_at <= today).length,
      };
    });
  }

  getCompanyId(name: string): string | null {
    return this.allCompanies.find(c => c.name === name)?.id ?? null;
  }

  getGroupLabel(group: Group): string | null {
    if (group.company_id) {
      return this.allCompanies.find(c => c.id === group.company_id)?.name ?? null;
    }
    return group.company ?? null;
  }

  readonly calendarUrl = 'https://calendar.google.com/calendar/u/0/embed?src=mr7kibfjcm3gu52v6t64lreras@group.calendar.google.com&ctz=Asia/Taipei&showTitle=0&showNav=1&showPrint=0&showTabs=0&showCalendars=0&bgcolor=%23FDF8FF';

  todayDisplayDate = '';
  todayEvents: VenueCalendarEvent[] = [];
  todayEventsLoading = false;
  private todayTargetDate: Date | null = null;

  private async loadTodayEvents(): Promise<void> {
    if (this.todayEventsLoading || this.todayEvents.length > 0) return;
    this.todayEventsLoading = true;
    try {
      const now = new Date();
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      this.todayTargetDate = target;
      const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
      this.todayDisplayDate = `${target.getFullYear()}年${target.getMonth() + 1}月${target.getDate()}日（週${weekdays[target.getDay()]}）`;
      this.todayEvents = await this.googleCalendarService.getEventsForDate(target);
    } catch (err) {
      console.warn('[今日活動] 載入失敗，顯示空狀態', err);
      this.todayEvents = [];
    } finally {
      this.todayEventsLoading = false;
    }
  }

  get todayAllDayEvents(): VenueCalendarEvent[] {
    return this.todayEvents.filter(e => e.isAllDay);
  }

  /** 昨夜延續：start 在目標日期之前（昨天開始、今天結束的跨夜活動） */
  get todayCarryoverEvents(): VenueCalendarEvent[] {
    return this.todayEvents.filter(e => !e.isAllDay && this.isCarryoverEvent(e));
  }

  /** 主時間軸：今天開始的活動 */
  get todayTimedEvents(): VenueCalendarEvent[] {
    return this.todayEvents.filter(e => !e.isAllDay && !this.isCarryoverEvent(e));
  }

  /** 活動開始日期早於今日（從昨天延伸進今天的跨夜場） */
  isCarryoverEvent(event: VenueCalendarEvent): boolean {
    if (!this.todayTargetDate) return false;
    const start = new Date(event.start);
    const t = this.todayTargetDate;
    return (
      start.getFullYear() < t.getFullYear() ||
      (start.getFullYear() === t.getFullYear() && start.getMonth() < t.getMonth()) ||
      (start.getFullYear() === t.getFullYear() && start.getMonth() === t.getMonth() && start.getDate() < t.getDate())
    );
  }

  /** 今天開始、明天結束的跨夜活動 */
  isOvernightEvent(event: VenueCalendarEvent): boolean {
    if (!event.end || event.isAllDay) return false;
    const start = new Date(event.start);
    const end = new Date(event.end);
    return start.getDate() !== end.getDate() ||
           start.getMonth() !== end.getMonth() ||
           start.getFullYear() !== end.getFullYear();
  }

  formatTodayEventTime(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  get hasResults(): boolean {
    return this.memberResults.length > 0 || this.aliasResults.length > 0 || this.groupResults.length > 0 || this.companyResults.length > 0;
  }

  get noResults(): boolean {
    return this.query.trim().length > 0 && !this.searching && !this.hasResults;
  }

}
