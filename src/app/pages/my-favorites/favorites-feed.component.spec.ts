import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { FavoritesFeedComponent } from './favorites-feed.component';
import { FavoritesService } from '../../core/favorites.service';
import { SupabaseService } from '../../core/supabase.service';
import { FavoriteEntityType } from '../../models';

function makeChain(rows: unknown[] = []) {
  const p = Promise.resolve({ data: rows, error: null });
  const chain: any = {
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  };
  ['select', 'in', 'eq', 'not', 'is', 'order', 'limit'].forEach(m => (chain[m] = () => chain));
  return chain;
}

describe('FavoritesFeedComponent', () => {
  const _favs = signal<{ user_id: string; entity_type: FavoriteEntityType; entity_id: string; created_at: string }[]>([]);

  const mockFavoritesService = {
    favoriteIds: (type: FavoriteEntityType) => _favs().filter(f => f.entity_type === type).map(f => f.entity_id),
    favorites: (type?: FavoriteEntityType) => type ? _favs().filter(f => f.entity_type === type) : _favs(),
  };

  const mockSupabaseService = {
    client: { from: (_: string) => makeChain() },
  };

  let fixture: ComponentFixture<FavoritesFeedComponent>;

  beforeEach(async () => {
    _favs.set([]);
    await TestBed.configureTestingModule({
      imports: [FavoritesFeedComponent],
      providers: [
        provideRouter([]),
        { provide: FavoritesService, useValue: mockFavoritesService },
        { provide: SupabaseService, useValue: mockSupabaseService },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(FavoritesFeedComponent);
  });

  it('completes initial load on effect firing — no _effectReady guard blocking it', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.loading()).toBe(false);
  }));

  it('shows empty state with no favorites on initial load', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.items().length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('還沒有動態');
  }));

  it('reloads feed when favorites signal changes after init', fakeAsync(() => {
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    // Simulate user adding a group favorite — signal update triggers effect re-run
    _favs.set([{ user_id: 'u1', entity_type: 'group', entity_id: 'g1', created_at: '' }]);
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(fixture.componentInstance.loading()).toBe(false);
  }));
});
