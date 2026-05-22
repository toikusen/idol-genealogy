import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FavoritesAvatarRowComponent } from './favorites-avatar-row.component';
import { FavoritesService } from '../../core/favorites.service';
import { GroupService } from '../../core/group.service';
import { MemberService } from '../../core/member.service';

const mockFavoritesService = { favorites: () => [], favoriteIds: () => [] };
const mockGroupService = { getAll: async () => [] };
const mockMemberService = { getAll: async () => [] };

describe('FavoritesAvatarRowComponent', () => {
  let fixture: ComponentFixture<FavoritesAvatarRowComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FavoritesAvatarRowComponent],
      providers: [
        provideRouter([]),
        { provide: FavoritesService, useValue: mockFavoritesService },
        { provide: GroupService, useValue: mockGroupService },
        { provide: MemberService, useValue: mockMemberService },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FavoritesAvatarRowComponent);
  });

  it('defaults to row layout (overflow-x: auto)', () => {
    fixture.detectChanges();
    const container: HTMLElement = fixture.nativeElement.querySelector('[data-avatar-container]');
    expect(container.style.overflowX).toBe('auto');
    expect(container.style.flexWrap).toBe('nowrap');
  });

  it('applies wrap layout when layout input is grid', () => {
    fixture.componentRef.setInput('layout', 'grid');
    fixture.detectChanges();
    const container: HTMLElement = fixture.nativeElement.querySelector('[data-avatar-container]');
    expect(container.style.flexWrap).toBe('wrap');
    expect(container.style.overflowX).toBe('hidden');
  });
});
