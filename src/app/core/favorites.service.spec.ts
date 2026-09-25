import { TestBed } from '@angular/core/testing';
import { FavoritesService } from './favorites.service';
import { SupabaseService } from './supabase.service';

interface MockDb {
  from: jasmine.Spy;
  update: jasmine.Spy;
  updateChain: { eq: jasmine.Spy; in: jasmine.Spy };
}

/** A Supabase query builder stub: chainable and awaitable, like the real one. */
function makeUpdateChain() {
  const p = Promise.resolve({ error: null });
  const chain: any = { then: p.then.bind(p), catch: p.catch.bind(p), finally: p.finally.bind(p) };
  ['eq', 'in'].forEach(m => (chain[m] = jasmine.createSpy(m).and.returnValue(chain)));
  return chain;
}

function makeDb(): MockDb {
  const updateChain = makeUpdateChain();
  const update = jasmine.createSpy('update').and.returnValue(updateChain);
  return {
    update,
    updateChain,
    from: jasmine.createSpy('from').and.callFake((_table: string) => ({
      update,
      select: jasmine.createSpy('select').and.returnValue({
        eq: jasmine.createSpy('eq').and.returnValue(
          Promise.resolve({ data: [], error: null })
        ),
      }),
      insert: jasmine.createSpy('insert').and.returnValue(
        Promise.resolve({ error: null })
      ),
      delete: jasmine.createSpy('delete').and.returnValue({
        eq: jasmine.createSpy('eq').and.callFake(() => ({
          eq: jasmine.createSpy('eq2').and.callFake(() => ({
            eq: jasmine.createSpy('eq3').and.returnValue(
              Promise.resolve({ error: null })
            ),
          })),
        })),
      }),
    })),
  };
}

describe('FavoritesService', () => {
  let service: FavoritesService;
  let mockDb: MockDb;

  beforeEach(async () => {
    mockDb = makeDb();
    TestBed.configureTestingModule({
      providers: [
        FavoritesService,
        {
          provide: SupabaseService,
          useValue: {
            client: mockDb,
            getSessionOnce: () => Promise.resolve({ user: { id: 'u-1' } }),
          },
        },
      ],
    });
    service = TestBed.inject(FavoritesService);
    await service.load('u-1'); // Set _userId so add/remove work
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('isFavorite returns false before loading', () => {
    expect(service.isFavorite('group', 'g-1')).toBeFalse();
  });

  it('isFavorite returns true after add', async () => {
    await service.add('group', 'g-1');
    expect(service.isFavorite('group', 'g-1')).toBeTrue();
  });

  it('isFavorite returns false after remove', async () => {
    await service.add('group', 'g-1');
    await service.remove('group', 'g-1');
    expect(service.isFavorite('group', 'g-1')).toBeFalse();
  });

  it('favoriteIds returns ids for given entity_type', async () => {
    await service.add('group', 'g-1');
    await service.add('group', 'g-2');
    await service.add('member', 'm-1');
    expect(service.favoriteIds('group')).toEqual(['g-1', 'g-2']);
    expect(service.favoriteIds('member')).toEqual(['m-1']);
  });

  it('add is idempotent for an already-favorited entity', async () => {
    await service.add('group', 'g-1');
    await service.add('group', 'g-1');
    expect(service.favoriteIds('group')).toEqual(['g-1']);
  });

  it('isSignedIn is true after load and false after reset', () => {
    expect(service.isSignedIn()).toBeTrue();
    service.reset();
    expect(service.isSignedIn()).toBeFalse();
  });

  it('add seeds read state, so a fresh favorite has no backlog of new activity', async () => {
    await service.add('group', 'g-1');
    const readAt = service.lastReadAt('g-1');
    expect(readAt).toBeDefined();
    expect(new Date(readAt as string).getTime()).toBeCloseTo(Date.now(), -3);
  });

  it('markRead persists the read time for the given entity only', async () => {
    await service.add('group', 'g-1');
    await service.add('group', 'g-2');
    const before = service.lastReadAt('g-2');

    await service.markRead(['g-1']);

    expect(mockDb.update).toHaveBeenCalledWith({ last_read_at: service.lastReadAt('g-1') });
    expect(mockDb.updateChain.in).toHaveBeenCalledWith('entity_id', ['g-1']);
    expect(service.lastReadAt('g-2')).toBe(before);
  });

  it('markRead with no argument marks every favorite and skips the id filter', async () => {
    await service.add('group', 'g-1');
    await service.add('member', 'm-1');

    await service.markRead();

    expect(mockDb.updateChain.in).not.toHaveBeenCalled();
    expect(service.lastReadAt('g-1')).toBe(service.lastReadAt('m-1'));
  });

  it('markRead does nothing when there is nothing favorited', async () => {
    await service.markRead();
    expect(mockDb.update).not.toHaveBeenCalled();
  });
});
