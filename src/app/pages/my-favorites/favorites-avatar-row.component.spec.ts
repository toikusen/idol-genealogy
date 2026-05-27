import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FavoritesAvatarRowComponent } from './favorites-avatar-row.component';
import { FavoritesService } from '../../core/favorites.service';
import { SupabaseService } from '../../core/supabase.service';

const mockFavoritesService = { favorites: () => [], favoriteIds: () => [] };

describe('FavoritesAvatarRowComponent', () => {
  let fixture: ComponentFixture<FavoritesAvatarRowComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FavoritesAvatarRowComponent],
      providers: [
        provideRouter([]),
        { provide: FavoritesService, useValue: mockFavoritesService },
        { provide: SupabaseService, useValue: { client: { from: () => ({ select: () => ({ in: () => Promise.resolve({ data: [] }) }) }) } } },
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

describe('FavoritesAvatarRowComponent — loadDetails fetches only needed IDs', () => {
  it('calls supabase .in() with the favorited group ids, not getAll()', async () => {
    const groupIds = ['g-1', 'g-2'];
    const inSpy = jasmine.createSpy('in').and.returnValue(
      Promise.resolve({ data: [{ id: 'g-1', name: 'Group One', photo_url: null }, { id: 'g-2', name: 'Group Two', photo_url: null }] })
    );
    const selectSpy = jasmine.createSpy('select').and.returnValue({ in: inSpy });
    const fromSpy = jasmine.createSpy('from').and.returnValue({ select: selectSpy });
    const mockSupa = { client: { from: fromSpy } };
    const mockFavs = {
      favorites: () => groupIds.map(id => ({ entity_id: id, entity_type: 'group' as const, user_id: 'u1', created_at: '' })),
      favoriteIds: () => groupIds,
    };

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [FavoritesAvatarRowComponent],
      providers: [
        provideRouter([]),
        { provide: FavoritesService, useValue: mockFavs },
        { provide: SupabaseService, useValue: mockSupa },
      ],
    }).compileComponents();

    const fixture2 = TestBed.createComponent(FavoritesAvatarRowComponent);
    fixture2.detectChanges();
    await fixture2.whenStable();

    expect(fromSpy).toHaveBeenCalledWith('groups');
    expect(inSpy).toHaveBeenCalledWith('id', groupIds);
  });
});
