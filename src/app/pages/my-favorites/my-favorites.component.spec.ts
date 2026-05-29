import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MyFavoritesComponent } from './my-favorites.component';
import { FavoritesService } from '../../core/favorites.service';
import { SupabaseService } from '../../core/supabase.service';
import { GroupService } from '../../core/group.service';
import { MemberService } from '../../core/member.service';

const mockFavoritesService = {
  favorites: () => [],
  favoriteIds: () => [],
  load: async () => {},
};
const mockSupabaseService = { getSessionOnce: async () => null };
const mockGroupService = { getAll: async () => [] };
const mockMemberService = { getAll: async () => [] };

describe('MyFavoritesComponent desktop structure', () => {
  let fixture: ComponentFixture<MyFavoritesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyFavoritesComponent],
      providers: [
        provideRouter([]),
        { provide: FavoritesService, useValue: mockFavoritesService },
        { provide: SupabaseService, useValue: mockSupabaseService },
        { provide: GroupService, useValue: mockGroupService },
        { provide: MemberService, useValue: mockMemberService },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MyFavoritesComponent);
    fixture.detectChanges();
  });

  it('renders desktop sidebar element in DOM', () => {
    const sidebar = fixture.nativeElement.querySelector('.mf-sidebar');
    expect(sidebar).toBeTruthy();
  });

  it('renders mobile header element in DOM', () => {
    const mobileHeader = fixture.nativeElement.querySelector('.mf-mobile-header');
    expect(mobileHeader).toBeTruthy();
  });

  it('sidebar filter nav has all four tabs', () => {
    const buttons = fixture.nativeElement.querySelectorAll('.mf-filter-nav .mf-filter-btn');
    expect(buttons.length).toBe(4);
  });
});

describe('MyFavoritesComponent — ARIA tab semantics', () => {
  let fixture2: ComponentFixture<MyFavoritesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyFavoritesComponent],
      providers: [
        provideRouter([]),
        { provide: FavoritesService, useValue: { favorites: () => [], favoriteIds: () => [], load: async () => {} } },
        { provide: SupabaseService, useValue: { getSessionOnce: async () => null, client: { from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [] }) }) }) } } },
        { provide: GroupService, useValue: { getAll: async () => [] } },
        { provide: MemberService, useValue: { getAll: async () => [] } },
      ],
    }).compileComponents();
    fixture2 = TestBed.createComponent(MyFavoritesComponent);
    fixture2.detectChanges();
  });

  it('mobile tab container has role="tablist"', () => {
    const tablist = fixture2.nativeElement.querySelector('[role="tablist"]');
    expect(tablist).toBeTruthy();
  });

  it('mobile tabs have role="tab" and first tab has aria-selected="true"', () => {
    const tabs = fixture2.nativeElement.querySelectorAll('[role="tab"]');
    expect(tabs.length).toBe(4);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(tabs[1].getAttribute('aria-selected')).toBe('false');
  });

  it('main content has role="tabpanel"', () => {
    const panel = fixture2.nativeElement.querySelector('[role="tabpanel"]');
    expect(panel).toBeTruthy();
  });

  it('desktop active filter button has aria-current="true"', () => {
    const activeBtn = fixture2.nativeElement.querySelector('.mf-filter-btn.mf-filter-active');
    expect(activeBtn?.getAttribute('aria-current')).toBe('true');
  });

  it('inactive desktop filter buttons have no aria-current attribute', () => {
    const inactiveBtns = fixture2.nativeElement.querySelectorAll('.mf-filter-btn:not(.mf-filter-active)');
    for (const btn of Array.from(inactiveBtns)) {
      expect((btn as HTMLElement).getAttribute('aria-current')).toBeNull();
    }
  });
});
