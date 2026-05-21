import { TestBed } from '@angular/core/testing';
import { FavoritesService } from './favorites.service';
import { SupabaseService } from './supabase.service';

interface MockDb {
  from: jasmine.Spy;
}

function makeDb(): MockDb {
  return {
    from: jasmine.createSpy('from').and.callFake((_table: string) => ({
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
});
