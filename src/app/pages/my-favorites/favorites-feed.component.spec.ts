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

describe('FavoritesFeedComponent — pagination and race guard', () => {
  const _favs2 = signal<{ user_id: string; entity_type: FavoriteEntityType; entity_id: string; created_at: string }[]>([
    { user_id: 'u1', entity_type: 'group', entity_id: 'g1', created_at: '' },
  ]);

  function makeChainFixed(rows: unknown[]) {
    const p = Promise.resolve({ data: rows, error: null });
    const chain: any = { then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p) };
    ['select', 'in', 'eq', 'not', 'is', 'order', 'lt', 'limit'].forEach(m => (chain[m] = () => chain));
    return chain;
  }

  const mockFavs2 = {
    favoriteIds: (type: FavoriteEntityType) => _favs2().filter(f => f.entity_type === type).map(f => f.entity_id),
    favorites: (type?: FavoriteEntityType) => type ? _favs2().filter(f => f.entity_type === type) : _favs2(),
  };

  beforeEach(() => TestBed.resetTestingModule());

  it('hasMore is false when all tables return fewer than PAGE_LIMIT (20) rows', fakeAsync(() => {
    const rows = [{
      id: '1', title: 'T', created_at: '2024-01-01', updated_at: '2024-01-01', first_seen_at: '2024-01-01',
      status: 'graduated',
      group_id: 'g1', group: { id: 'g1', name: 'G', photo_url: null },
      groups: { id: 'g1', name: 'G', photo_url: null },
      disbanded_at: '2024-01-01', disbanded_announced_at: null, name: 'Group 1', photo_url: null,
    }];
    const channelMock2: any = { on: () => channelMock2, subscribe: () => channelMock2 };
    const mockSupa2 = { client: { from: (_: string) => makeChainFixed(rows), channel: () => channelMock2, removeChannel: () => {} } };

    TestBed.configureTestingModule({
      imports: [FavoritesFeedComponent],
      providers: [
        provideRouter([]),
        { provide: FavoritesService, useValue: mockFavs2 },
        { provide: SupabaseService, useValue: mockSupa2 },
      ],
    }).compileComponents();

    const f2 = TestBed.createComponent(FavoritesFeedComponent);
    f2.detectChanges();
    tick();
    f2.detectChanges();

    expect(f2.componentInstance.hasMore()).toBeFalse();
  }));

  it('hasMore is true when a table returns exactly 20 rows', fakeAsync(() => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      title: `Song ${i}`,
      created_at: `2024-01-${String(i % 28 + 1).padStart(2, '0')}`,
      updated_at: `2024-01-${String(i % 28 + 1).padStart(2, '0')}`,
      status: 'graduated',
      first_seen_at: `2024-01-${String(i % 28 + 1).padStart(2, '0')}`,
      group_id: 'g1',
      group: { id: 'g1', name: 'G', photo_url: null },
      groups: { id: 'g1', name: 'G', photo_url: null },
      disbanded_at: `2024-01-${String(i % 28 + 1).padStart(2, '0')}`,
      disbanded_announced_at: null,
      name: `Group ${i}`,
      photo_url: null,
    }));
    const channelMock: any = { on: () => channelMock, subscribe: () => channelMock };
    const mockSupa3 = { client: { from: (_: string) => makeChainFixed(rows), channel: () => channelMock, removeChannel: () => {} } };

    TestBed.configureTestingModule({
      imports: [FavoritesFeedComponent],
      providers: [
        provideRouter([]),
        { provide: FavoritesService, useValue: mockFavs2 },
        { provide: SupabaseService, useValue: mockSupa3 },
      ],
    }).compileComponents();

    const f3 = TestBed.createComponent(FavoritesFeedComponent);
    f3.detectChanges();
    tick();
    f3.detectChanges();

    expect(f3.componentInstance.hasMore()).toBeTrue();
  }));

  it('loadingMore resets to false and stale appendPage is discarded when concurrent loadFeed fires', fakeAsync(() => {
    const singleRow = [{
      id: '1', title: 'T', created_at: '2024-01-01', updated_at: '2024-01-01', first_seen_at: '2024-01-01',
      status: 'graduated',
      group_id: 'g1', group: { id: 'g1', name: 'G', photo_url: null },
      groups: { id: 'g1', name: 'G', photo_url: null },
      disbanded_at: '2024-01-01', disbanded_announced_at: null, name: 'Group 1', photo_url: null,
    }];
    const channelMock4: any = { on: () => channelMock4, subscribe: () => channelMock4 };
    const mockSupa4 = { client: { from: (_: string) => makeChainFixed(singleRow), channel: () => channelMock4, removeChannel: () => {} } };

    TestBed.configureTestingModule({
      imports: [FavoritesFeedComponent],
      providers: [
        provideRouter([]),
        { provide: FavoritesService, useValue: mockFavs2 },
        { provide: SupabaseService, useValue: mockSupa4 },
      ],
    }).compileComponents();

    const f4 = TestBed.createComponent(FavoritesFeedComponent);
    f4.detectChanges();
    tick(); // settle initial loadFeed
    f4.detectChanges();

    // Simulate: user enables hasMore so loadMore() can run
    f4.componentInstance.hasMore.set(true);

    // appendPage fires first, then loadFeed fires before appendPage resolves
    // Both are queued as microtasks; loadFeed increments _loadSeq synchronously
    f4.componentInstance.loadMore();   // appendPage start — captures seq N
    f4.componentInstance.retryLoad();  // loadFeed start — _loadSeq becomes N+1 immediately

    tick(); // flush both Promise chains
    f4.detectChanges();

    // appendPage's finally must have run (no exception swallowed)
    expect(f4.componentInstance.loadingMore()).toBeFalse();
    // loadFeed completed cleanly
    expect(f4.componentInstance.loading()).toBeFalse();
    // items reflects fresh loadFeed result, not a mix with stale appendPage
    expect(f4.componentInstance.hasMore()).toBeFalse();
  }));
});
