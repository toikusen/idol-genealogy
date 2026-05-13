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

const makeChainedOrderSpy = (result: unknown) => {
  const finalOrder = jasmine.createSpy('order2').and.returnValue(Promise.resolve(result));
  const firstOrder = jasmine.createSpy('order1').and.returnValue({ order: finalOrder });
  return firstOrder;
};

const makeOrderSpy = (result: unknown) =>
  jasmine.createSpy('order').and.returnValue(Promise.resolve(result));

const makeSelectSpy = (result: unknown) =>
  jasmine.createSpy('select').and.returnValue({
    eq: jasmine.createSpy('eq').and.returnValue({
      order: makeChainedOrderSpy({ data: [mockVenue], error: null }),
    }),
    order: makeOrderSpy(result),
  });

const mockClient = {
  from: jasmine.createSpy('from').and.callFake(() => ({
    select: makeSelectSpy({ data: [mockVenue], error: null }),
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

  it('invalidateCache() clears cache so next getAll() re-fetches', async () => {
    await service.getAll();
    service.invalidateCache();
    await service.getAll();
    expect(mockClient.from).toHaveBeenCalledTimes(2);
  });
});
