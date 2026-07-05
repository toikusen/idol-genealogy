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
});
