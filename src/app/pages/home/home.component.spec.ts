// src/app/pages/home/home.component.spec.ts
import { TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { HomeComponent } from './home.component';
import { MemberService } from '../../core/member.service';
import { GroupService } from '../../core/group.service';
import { CompanyService } from '../../core/company.service';
import { VenueService } from '../../core/venue.service';
import { SeoService } from '../../core/seo.service';
import { Group, Member, Company, MemberRecentHeatEntry, GroupRecentHeatEntry } from '../../models';
import { HomePageData } from '../../core/page-data.resolvers';

const makeGroup = (overrides: Partial<Group> = {}): Group =>
  ({ id: 'g1', name: 'TestGroup', founded_at: '2020-01-01', disbanded_at: null, color: null, notes: null, company: null, company_id: null, photo_url: null, name_jp: null, updated_at: '2024-01-01' } as unknown as Group, { ...overrides } as Group);

function group(overrides: Partial<Group> = {}): Group {
  return { id: 'g1', name: 'TestGroup', founded_at: '2020-01-01', disbanded_at: null, color: null, notes: null, company: null, company_id: null, photo_url: null, name_jp: null, updated_at: '2024-01-01', ...overrides } as unknown as Group;
}

function member(overrides: Partial<Member> = {}): Member {
  return { id: 'm1', name: 'Alice', name_roman: null, name_hiragana: null, photo_url: null, emoji: null, updated_at: '2024-01-01', color: null, company_id: null, ...overrides } as unknown as Member;
}

function company(overrides: Partial<Company> = {}): Company {
  return { id: 'c1', name: 'TestCo', color: null, photo_url: null, ...overrides } as unknown as Company;
}

describe('HomeComponent', () => {
  let memberSpy: jasmine.SpyObj<MemberService>;
  let groupSpy: jasmine.SpyObj<GroupService>;
  let companySpy: jasmine.SpyObj<CompanyService>;

  const emptyMemberService = () => ({
    getRecent: jasmine.createSpy().and.returnValue(Promise.resolve([])),
    getCount: jasmine.createSpy().and.returnValue(Promise.resolve(0)),
    getRecentPopular: jasmine.createSpy().and.returnValue(Promise.resolve([])),
    getUpcomingBirthdays: jasmine.createSpy().and.returnValue(Promise.resolve([])),
    getSoloMembers: jasmine.createSpy().and.returnValue(Promise.resolve([])),
    search: jasmine.createSpy().and.returnValue(Promise.resolve([])),
    searchByAlias: jasmine.createSpy().and.returnValue(Promise.resolve([])),
  });

  const emptyGroupService = () => ({
    getAll: jasmine.createSpy().and.returnValue(Promise.resolve([])),
    getRecentPopular: jasmine.createSpy().and.returnValue(Promise.resolve([])),
    search: jasmine.createSpy().and.returnValue(Promise.resolve([])),
  });

  const emptyCompanyService = () => ({
    getAll: jasmine.createSpy().and.returnValue(Promise.resolve([])),
    search: jasmine.createSpy().and.returnValue(Promise.resolve([])),
  });

  async function setup(
    memberOverrides = {},
    groupOverrides = {},
    companyOverrides = {},
    pageDataOverrides: Partial<HomePageData> = {},
  ) {
    const pageData: HomePageData = {
      recentMembers: [],
      memberCount: 0,
      groupCount: 0,
      companyCount: 0,
      topMembers: [],
      topGroups: [],
      upcomingBirthdays: [],
      ...pageDataOverrides,
    };
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: MemberService, useValue: { ...emptyMemberService(), ...memberOverrides } },
        { provide: GroupService, useValue: { ...emptyGroupService(), ...groupOverrides } },
        { provide: CompanyService, useValue: { ...emptyCompanyService(), ...companyOverrides } },
        { provide: VenueService, useValue: { getAll: jasmine.createSpy().and.returnValue(Promise.resolve([])) } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: { pageData },
              queryParamMap: { get: () => null },
            },
            queryParamMap: of(convertToParamMap({})),
          },
        },
        { provide: SeoService, useValue: { setPage: jasmine.createSpy(), setJsonLd: jasmine.createSpy(), setJsonLdGraph: jasmine.createSpy() } },
      ],
    }).compileComponents();
  }

  // ── Issue 1: *ngIf → @if ─────────────────────────────────────────────────

  it('toggles venue proposal panels before deferred panel content loads', async () => {
    await setup();
    const fixture = TestBed.createComponent(HomeComponent);
    const component = fixture.componentInstance;

    component.openVenueInsertPanel();
    expect(component.showVenueInsertPanel).toBeTrue();

    component.closeVenueInsertPanel();
    expect(component.showVenueInsertPanel).toBeFalse();

    component.venues = [{
      id: 'v1',
      name: 'Test Venue',
      address: '台北市測試路 1 號',
      region: 'north',
    } as any];
    component.onVenueProposalRequested('v1');
    expect(component.showVenueUpdatePanel).toBeTrue();

    component.closeVenueUpdatePanel();
    expect(component.showVenueUpdatePanel).toBeFalse();
  });

  describe('member name display (Issue 1 — mixed ngIf)', () => {
    it('shows roman name secondary line only when name_roman exists', fakeAsync(async () => {
      const m = member({ id: 'm1', name: 'Alice', name_roman: 'Alice Roman', name_hiragana: null });
      await setup({ search: jasmine.createSpy().and.returnValue(Promise.resolve([m])), searchByAlias: jasmine.createSpy().and.returnValue(Promise.resolve([])) });
      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      tick(3000); // flush scheduleDeferredHomeSections 2500ms timer + idle callback
      fixture.detectChanges();

      fixture.componentInstance.query = 'Alice';
      await fixture.componentInstance.search();
      fixture.detectChanges();

      const compiled: HTMLElement = fixture.nativeElement;
      expect(compiled.textContent).toContain('Alice Roman');
      discardPeriodicTasks();
    }));

    it('shows both hiragana and roman separated by ·', fakeAsync(async () => {
      const m = member({ id: 'm1', name: 'Alice', name_roman: 'Alice Roman', name_hiragana: 'ありす' });
      await setup({ search: jasmine.createSpy().and.returnValue(Promise.resolve([m])), searchByAlias: jasmine.createSpy().and.returnValue(Promise.resolve([])) });
      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      tick(3000); // flush scheduleDeferredHomeSections 2500ms timer + idle callback
      fixture.detectChanges();

      fixture.componentInstance.query = 'Alice';
      await fixture.componentInstance.search();
      fixture.detectChanges();

      const compiled: HTMLElement = fixture.nativeElement;
      expect(compiled.textContent).toContain('·');
      expect(compiled.textContent).toContain('Alice Roman');
      discardPeriodicTasks();
    }));
  });

  // ── Issue 2: computed properties cached after init ───────────────────────

  describe('activeGroups / disbandedGroups / traineeGroups (Issue 2 — getter caching)', () => {
    const activeGroup = group({ id: 'g-active', name: 'Active', disbanded_at: null, notes: null, is_trainee: false });
    const disbandedGroup = group({ id: 'g-dis', name: 'Disbanded', disbanded_at: '2022-06-01', notes: null, is_trainee: false });
    const traineeGroup = group({ id: 'g-trainee', name: 'Trainee', disbanded_at: null, is_trainee: true });

    let fixture: ReturnType<typeof TestBed.createComponent<HomeComponent>>;

    beforeEach(async () => {
      await setup(
        {},
        { getAll: jasmine.createSpy().and.returnValue(Promise.resolve([activeGroup, disbandedGroup, traineeGroup])), getTopByViews: jasmine.createSpy().and.returnValue(Promise.resolve([])), search: jasmine.createSpy().and.returnValue(Promise.resolve([])) },
        {},
        { groupCount: 3 },
      );
      fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      await fixture.whenStable();
      await fixture.componentInstance.setTab('groups');
      fixture.detectChanges();
    });

    it('activeGroups contains only non-disbanded, non-trainee groups', () => {
      expect(fixture.componentInstance.activeGroups.map(g => g.id)).toEqual(['g-active']);
    });

    it('disbandedGroups contains only disbanded non-trainee groups', () => {
      expect(fixture.componentInstance.disbandedGroups.map(g => g.id)).toEqual(['g-dis']);
    });

    it('traineeGroups contains only groups with trainee note', () => {
      expect(fixture.componentInstance.traineeGroups.map(g => g.id)).toEqual(['g-trainee']);
    });
  });

  describe('companySections (Issue 2 — getter caching)', () => {
    it('groups groups by company name', async () => {
      const co = company({ id: 'c1', name: 'TestCo' });
      const g1 = group({ id: 'g1', name: 'G1', company_id: 'c1', company: 'TestCo', disbanded_at: null });
      const g2 = group({ id: 'g2', name: 'G2', company_id: null, company: null, disbanded_at: null });
      await setup(
        {},
        { getAll: jasmine.createSpy().and.returnValue(Promise.resolve([g1, g2])), getTopByViews: jasmine.createSpy().and.returnValue(Promise.resolve([])), search: jasmine.createSpy().and.returnValue(Promise.resolve([])) },
        { getAll: jasmine.createSpy().and.returnValue(Promise.resolve([co])), search: jasmine.createSpy().and.returnValue(Promise.resolve([])) },
        { groupCount: 2, companyCount: 1 },
      );
      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      await fixture.whenStable();
      await fixture.componentInstance.setTab('companies');
      fixture.detectChanges();

      const { companySections } = fixture.componentInstance;
      const testCo = companySections.find(s => s.name === 'TestCo');
      const independent = companySections.find(s => s.name === '獨立・其他');

      expect(testCo).toBeDefined();
      expect(testCo?.groups.map(g => g.id)).toContain('g1');
      expect(independent).toBeDefined();
      expect(independent?.groups.map(g => g.id)).toContain('g2');
    });

    it('puts 獨立・其他 last in the list', async () => {
      const co = company({ id: 'c1', name: 'TestCo' });
      const g1 = group({ id: 'g1', company_id: 'c1', company: 'TestCo', disbanded_at: null });
      const g2 = group({ id: 'g2', company_id: null, company: null, disbanded_at: null });
      await setup(
        {},
        { getAll: jasmine.createSpy().and.returnValue(Promise.resolve([g1, g2])), getTopByViews: jasmine.createSpy().and.returnValue(Promise.resolve([])), search: jasmine.createSpy().and.returnValue(Promise.resolve([])) },
        { getAll: jasmine.createSpy().and.returnValue(Promise.resolve([co])), search: jasmine.createSpy().and.returnValue(Promise.resolve([])) },
        { groupCount: 2, companyCount: 1 },
      );
      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      await fixture.whenStable();
      await fixture.componentInstance.setTab('companies');
      fixture.detectChanges();

      const sections = fixture.componentInstance.companySections;
      expect(sections[sections.length - 1].name).toBe('獨立・其他');
    });
  });

  // ── Issue 3: ngOnDestroy clears the debounce timer ───────────────────────

  describe('ngOnDestroy (Issue 3 — timer leak)', () => {
    it('clears the pending search timer when destroyed', fakeAsync(async () => {
      await setup();
      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      await fixture.whenStable();

      const comp = fixture.componentInstance;
      spyOn(window, 'clearTimeout').and.callThrough();

      // Trigger a debounced search
      comp.query = 'test';
      comp.onQueryChange();

      // Destroy before debounce fires
      fixture.destroy();

      expect(clearTimeout).toHaveBeenCalled();

      // Advance past debounce; no errors should occur
      tick(500);
    }));
  });

  // ── Deferred image loading attributes ────────────────────────────────────
  describe('popular rank image loading', () => {
    function leaderMember(id: string, photoUrl: string): MemberRecentHeatEntry {
      return { id, name: id, name_roman: null, photo_url: photoUrl, color: null, recent_visitors: 1 };
    }

    function leaderGroup(id: string, photoUrl: string): GroupRecentHeatEntry {
      return { id, name: id, photo_url: photoUrl, color: null, recent_visitors: 1 };
    }

    it('keeps topMember images lazy because the section is deferred below the fold', fakeAsync(async () => {
      await setup({}, {}, {}, {
        topMembers: [
          leaderMember('m1', 'https://ziiagdrrytyrmzoeegjk.supabase.co/storage/v1/object/public/members/m1.jpg'),
          leaderMember('m2', 'https://ziiagdrrytyrmzoeegjk.supabase.co/storage/v1/object/public/members/m2.jpg'),
        ],
        topGroups: [],
      });
      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const imgs = el.querySelectorAll<HTMLImageElement>('.popular-rank-img');

      expect(imgs.length).toBeGreaterThanOrEqual(2);
      expect(imgs[0].getAttribute('loading')).toBe('lazy');
      expect(imgs[0].getAttribute('fetchpriority')).toBeNull();
      expect(imgs[1].getAttribute('loading')).toBe('lazy');
      expect(imgs[1].getAttribute('fetchpriority')).toBeNull();

      discardPeriodicTasks();
    }));

    it('keeps topGroup images lazy because the section is deferred below the fold', fakeAsync(async () => {
      await setup({}, {}, {}, {
        topMembers: [],
        topGroups: [
          leaderGroup('g1', 'https://ziiagdrrytyrmzoeegjk.supabase.co/storage/v1/object/public/groups/g1.jpg'),
          leaderGroup('g2', 'https://ziiagdrrytyrmzoeegjk.supabase.co/storage/v1/object/public/groups/g2.jpg'),
        ],
      });
      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      const imgs = el.querySelectorAll<HTMLImageElement>('.popular-rank-img');

      expect(imgs.length).toBeGreaterThanOrEqual(2);
      expect(imgs[0].getAttribute('loading')).toBe('lazy');
      expect(imgs[0].getAttribute('fetchpriority')).toBeNull();
      expect(imgs[1].getAttribute('loading')).toBe('lazy');
      expect(imgs[1].getAttribute('fetchpriority')).toBeNull();

      discardPeriodicTasks();
    }));
  });

  // ── Events tab: schedule rendering, related-group chips, failure states ──

  describe('events tab schedule', () => {
    function scheduleEvent(overrides: any = {}) {
      return {
        id: 'e1', title: 'Test Show', start: '2026-08-12T19:00:00+08:00', end: null,
        location: 'MOONDOG', url: 'https://example.com/e1', isAllDay: false,
        relatedGroups: [], allDayEndDayKey: null, isOngoingAllDay: false,
        ...overrides,
      };
    }

    function scheduleResult(overrides: any = {}) {
      return {
        today: { dayKey: '2026-08-12', carryover: [], allDay: [], timed: [], ...(overrides.today ?? {}) },
        upcoming: overrides.upcoming ?? [],
        status: overrides.status ?? 'ok',
      };
    }

    async function setupEvents(calendarStub: any, groupOverrides = {}) {
      const { GoogleCalendarService } = await import('../../core/google-calendar.service');
      await TestBed.configureTestingModule({
        imports: [HomeComponent],
        providers: [
          provideRouter([]),
          { provide: MemberService, useValue: emptyMemberService() },
          { provide: GroupService, useValue: { ...emptyGroupService(), ...groupOverrides } },
          { provide: CompanyService, useValue: emptyCompanyService() },
          { provide: VenueService, useValue: { getAll: jasmine.createSpy().and.returnValue(Promise.resolve([])) } },
          { provide: GoogleCalendarService, useValue: calendarStub },
          {
            provide: ActivatedRoute,
            useValue: {
              snapshot: {
                data: { pageData: { recentMembers: [], memberCount: 0, groupCount: 0, companyCount: 0, topMembers: [], topGroups: [], upcomingBirthdays: [] } },
                queryParamMap: { get: () => null },
              },
              queryParamMap: of(convertToParamMap({ tab: 'events' })),
            },
          },
          { provide: SeoService, useValue: { setPage: jasmine.createSpy(), setJsonLd: jasmine.createSpy(), setJsonLdGraph: jasmine.createSpy() } },
        ],
      }).compileComponents();
    }

    function calendarStub(results: any[]) {
      let call = 0;
      return {
        getSchedule: jasmine.createSpy('getSchedule').and.callFake(() =>
          Promise.resolve(results[Math.min(call++, results.length - 1)])),
        preloadForVenues: jasmine.createSpy().and.returnValue(Promise.resolve(new Map())),
        getUpcomingVenueEvents: jasmine.createSpy().and.returnValue(Promise.resolve([])),
        isConfigured: () => true,
      };
    }

    it('loads the group catalog when the events tab is opened directly', fakeAsync(async () => {
      const chips = [{ id: 'g1', name: 'TestGroup', color: '#f00' }];
      const stub = calendarStub([
        scheduleResult({ today: { dayKey: '2026-08-12', carryover: [], allDay: [], timed: [scheduleEvent()] } }),
        scheduleResult({ today: { dayKey: '2026-08-12', carryover: [], allDay: [], timed: [scheduleEvent({ relatedGroups: chips })] } }),
      ]);
      const getAll = jasmine.createSpy().and.returnValue(Promise.resolve([group()]));
      await setupEvents(stub, { getAll });

      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      tick();
      fixture.detectChanges();

      // The events tab must pull the catalog itself — nothing else does it.
      expect(getAll).toHaveBeenCalled();
      expect(stub.getSchedule).toHaveBeenCalledTimes(2);
      const chipEls = fixture.nativeElement.querySelectorAll('.related-group-chip');
      expect(chipEls.length).toBe(1);
      expect(chipEls[0].textContent).toContain('TestGroup');
      discardPeriodicTasks();
    }));

    it('still renders events when the group catalog fails, with no chips and no error', fakeAsync(async () => {
      const stub = calendarStub([
        scheduleResult({ today: { dayKey: '2026-08-12', carryover: [], allDay: [], timed: [scheduleEvent()] } }),
      ]);
      await setupEvents(stub, { getAll: jasmine.createSpy().and.returnValue(Promise.reject(new Error('nope'))) });

      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      tick();
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('Test Show');
      expect(text).not.toContain('行程暫時無法載入');
      expect(fixture.nativeElement.querySelectorAll('.related-group-chip').length).toBe(0);
      discardPeriodicTasks();
    }));

    it('shows a retry button on error, and never claims the day is empty', fakeAsync(async () => {
      const stub = calendarStub([scheduleResult({ status: 'error' })]);
      await setupEvents(stub);

      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      tick();
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('行程暫時無法載入');
      expect(text).not.toContain('今日暫無活動行程');
      expect(fixture.nativeElement.querySelector('.schedule-retry')).toBeTruthy();
      discardPeriodicTasks();
    }));

    it('offers no retry when the calendar is unconfigured', fakeAsync(async () => {
      // Retrying without deployed credentials can only fail again.
      const stub = calendarStub([scheduleResult({ status: 'unconfigured' })]);
      await setupEvents(stub);

      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      tick();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('行程暫時無法載入');
      expect(fixture.nativeElement.querySelector('.schedule-retry')).toBeNull();
      discardPeriodicTasks();
    }));

    it('renders the today block on a genuinely empty day', fakeAsync(async () => {
      const stub = calendarStub([scheduleResult()]);
      await setupEvents(stub);

      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      tick();
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('今日暫無活動行程');
      expect(text).toContain('未來 14 天暫無已知活動');
      expect(fixture.componentInstance.scheduleLoaded).toBeTrue();
      discardPeriodicTasks();
    }));

    it('shows related-group chips on today’s all-day events too', fakeAsync(async () => {
      const chips = [{ id: 'g1', name: 'TestGroup', color: '#f00' }];
      const stub = calendarStub([
        scheduleResult({
          today: {
            dayKey: '2026-08-12', carryover: [], timed: [],
            allDay: [scheduleEvent({ id: 'a1', title: 'Festival', isAllDay: true, start: '2026-08-10', allDayEndDayKey: '2026-08-15', isOngoingAllDay: true, relatedGroups: chips })],
          },
        }),
      ]);
      await setupEvents(stub);

      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      tick();
      fixture.detectChanges();

      const text = fixture.nativeElement.textContent;
      expect(text).toContain('Festival');
      expect(text).toContain('持續中');
      expect(text).toContain('全天');
      expect(fixture.nativeElement.querySelectorAll('.related-group-chip').length).toBe(1);
      expect(fixture.nativeElement.querySelectorAll('a a').length).toBe(0);
      discardPeriodicTasks();
    }));

    it('never nests an anchor inside the event card anchor', fakeAsync(async () => {
      const chips = [{ id: 'g1', name: 'TestGroup', color: '#f00' }];
      const stub = calendarStub([
        scheduleResult({
          today: { dayKey: '2026-08-12', carryover: [scheduleEvent({ id: 'c1', title: 'Carry' })], allDay: [], timed: [scheduleEvent({ relatedGroups: chips })] },
          upcoming: [{ dayKey: '2026-08-13', events: [scheduleEvent({ id: 'u1', title: 'Later', relatedGroups: chips })] }],
        }),
      ]);
      await setupEvents(stub);

      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      tick();
      fixture.detectChanges();

      const nested = fixture.nativeElement.querySelectorAll('a a');
      expect(nested.length).toBe(0);
      discardPeriodicTasks();
    }));

    it('drops a late schedule response after the component is destroyed', fakeAsync(async () => {
      let resolve!: (v: unknown) => void;
      const stub = {
        getSchedule: jasmine.createSpy().and.returnValue(new Promise(r => { resolve = r; })),
        preloadForVenues: jasmine.createSpy().and.returnValue(Promise.resolve(new Map())),
        getUpcomingVenueEvents: jasmine.createSpy().and.returnValue(Promise.resolve([])),
        isConfigured: () => true,
      };
      await setupEvents(stub);

      const fixture = TestBed.createComponent(HomeComponent);
      fixture.detectChanges();
      fixture.destroy();
      resolve(scheduleResult({ today: { dayKey: '2026-08-12', carryover: [], allDay: [], timed: [scheduleEvent()] } }));
      tick();

      expect(fixture.componentInstance.schedule).toBeNull();
      discardPeriodicTasks();
    }));
  });
});
