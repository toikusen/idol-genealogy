import { TestBed } from '@angular/core/testing';
import { VenueService } from './venue.service';
import { SupabaseService } from './supabase.service';
import { Venue } from '../models';

const mockVenue: Venue = {
  id: 'v-1',
  name: 'Jack\'s Studio',
  address: '10862臺北市萬華區昆明街76號',
  type: 'Live House',
  region: 'north',
  google_maps_url: 'https://maps.app.goo.gl/test',
  phone: null,
  notes: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

/** A thenable query builder: every filter returns itself, so any chain the
 *  service builds resolves to `queryResult`. */
const makeQuery = () => {
  const q: Record<string, unknown> = {};
  for (const method of ['eq', 'order', 'limit', 'in']) {
    q[method] = jasmine.createSpy(method).and.returnValue(q);
  }
  q['maybeSingle'] = jasmine.createSpy('maybeSingle').and.callFake(() => Promise.resolve(queryResult));
  q['then'] = (onOk: unknown, onErr: unknown) =>
    Promise.resolve(queryResult).then(onOk as never, onErr as never);
  return q;
};

/** What the next query resolves to. Tests that assert "no query happened" rely
 *  on `from` never being called, not on this value. */
let queryResult: { data: unknown; error: unknown } = { data: [mockVenue], error: null };

const mockClient = {
  from: jasmine.createSpy('from').and.callFake(() => ({
    select: jasmine.createSpy('select').and.callFake(makeQuery),
    insert: jasmine.createSpy('insert').and.returnValue(Promise.resolve({ error: null })),
    update: jasmine.createSpy('update').and.returnValue({
      eq: jasmine.createSpy('eq').and.returnValue(Promise.resolve({ error: null })),
    }),
  })),
};

describe('VenueService', () => {
  let service: VenueService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        VenueService,
        { provide: SupabaseService, useValue: { client: mockClient } },
      ],
    });
    service = TestBed.inject(VenueService);
    queryResult = { data: [mockVenue], error: null };
    mockClient.from.calls.reset();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('getAll() queries venues table', async () => {
    const venues = await service.getAll();
    expect(mockClient.from).toHaveBeenCalledWith('venues');
    expect(venues.length).toBeGreaterThan(0);
  });

  it('getAll() returns cached result on second call', async () => {
    await service.getAll();
    await service.getAll();
    expect(mockClient.from).toHaveBeenCalledTimes(1);
  });

  it('getCount() returns number of active venues', async () => {
    const count = await service.getCount();
    expect(typeof count).toBe('number');
  });

  it('getById() answers from the list cache instead of a second round trip', async () => {
    await service.getAll();
    mockClient.from.calls.reset();

    expect(await service.getById('v-1')).toBe(mockVenue);
    expect(mockClient.from).not.toHaveBeenCalled();
  });

  it('getById() still queries for a venue the list cache cannot hold', async () => {
    // getAll() filters on is_active, so a closed venue is never in the cache.
    await service.getAll();
    const closed: Venue = { ...mockVenue, id: 'v-closed', is_active: false };
    queryResult = { data: closed, error: null };
    mockClient.from.calls.reset();

    expect(await service.getById('v-closed')).toEqual(closed);
    expect(mockClient.from).toHaveBeenCalledWith('venues');
  });

  it('getNearbyVenues() walks the cached region ring without querying', async () => {
    const ring: Venue[] = ['a', 'b', 'c'].map(n => ({ ...mockVenue, id: n, name: n }));
    queryResult = { data: [...ring, { ...mockVenue, id: 's', name: 's', region: 'south' }], error: null };
    await service.getAll();
    mockClient.from.calls.reset();

    const nearby = await service.getNearbyVenues(ring[1]);

    expect(nearby.map(v => v.id)).toEqual(['c', 'a']);
    expect(mockClient.from).not.toHaveBeenCalled();
  });

  it('invalidateCache() clears cache so next getAll() re-fetches', async () => {
    await service.getAll();
    service.invalidateCache();
    await service.getAll();
    expect(mockClient.from).toHaveBeenCalledTimes(2);
  });
});
