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
    const buttons = fixture.nativeElement.querySelectorAll('.mf-filter-btn');
    expect(buttons.length).toBe(4);
  });
});
