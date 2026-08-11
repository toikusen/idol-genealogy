import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, convertToParamMap } from '@angular/router';
import { venuePageResolver, VenuePageData } from './page-data.resolvers';
import { VenueService } from './venue.service';
import { GoogleCalendarService } from './google-calendar.service';
import { Venue } from '../models';

const venue: Venue = {
  id: 'v1',
  name: '杰克音樂 Jack\'s Studio',
  address: '10862臺北市萬華區昆明街76號',
  type: 'Live House',
  region: 'north',
  google_maps_url: null,
  phone: null,
  notes: null,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const route = { paramMap: convertToParamMap({ id: 'v1' }) } as unknown as ActivatedRouteSnapshot;

function setup(
  venueService: Partial<VenueService>,
  calendar: Partial<GoogleCalendarService>,
  platform: 'browser' | 'server' = 'browser',
) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: platform },
      { provide: VenueService, useValue: { getNearbyVenues: () => Promise.resolve([]), ...venueService } },
      { provide: GoogleCalendarService, useValue: calendar },
    ],
  });
  return TestBed.runInInjectionContext(
    () => venuePageResolver(route, {} as any),
  ) as Promise<VenuePageData>;
}

describe('venuePageResolver', () => {
  const events = [{ id: 'e1', title: 'Show', start: '2026-08-15T19:00:00+08:00', end: null, location: null, url: null, isAllDay: false }];

  it('hands the browser the venue now and the schedule later', async () => {
    const data = await setup(
      { getById: () => Promise.resolve(venue), getNearbyVenues: () => Promise.resolve([{ ...venue, id: 'v2' }]) },
      { getUpcomingVenueEventsResult: () => Promise.resolve({ events, status: 'ok' as const }) },
    );

    // The route must not wait on the calendar — that is the tap latency.
    expect(data.venue).toEqual(venue);
    expect(data.nearbyVenues.length).toBe(1);
    expect(data.error).toBeFalse();
    expect(data.events).toEqual([]);
    expect(await data.pendingCalendar).toEqual({ events, status: 'ok' });
  });

  it('gives the server the full schedule, so prerendered HTML carries it', async () => {
    const data = await setup(
      { getById: () => Promise.resolve(venue) },
      { getUpcomingVenueEventsResult: () => Promise.resolve({ events, status: 'ok' as const }) },
      'server',
    );

    expect(data.pendingCalendar).toBeUndefined();
    expect(data.events.length).toBe(1);
    expect(data.calendarStatus).toBe('ok');
  });

  it('marks a genuinely missing venue as not-found, not an error', async () => {
    const data = await setup(
      { getById: () => Promise.resolve(null) },
      { getUpcomingVenueEventsResult: () => Promise.resolve({ events: [], status: 'ok' as const }) },
    );

    expect(data.venue).toBeNull();
    expect(data.error).toBeFalse();
  });

  it('marks a Supabase failure as an error rather than not-found', async () => {
    spyOn(console, 'warn');
    const data = await setup(
      { getById: () => Promise.reject(new Error('network')) },
      { getUpcomingVenueEventsResult: () => Promise.resolve({ events: [], status: 'ok' as const }) },
    );

    expect(data.venue).toBeNull();
    expect(data.error).toBeTrue();
  });

  it('passes through a calendar error without emptying the page', async () => {
    const data = await setup(
      { getById: () => Promise.resolve(venue) },
      { getUpcomingVenueEventsResult: () => Promise.resolve({ events: [], status: 'error' as const }) },
    );

    expect(data.venue).toEqual(venue);
    expect(data.error).toBeFalse();
    expect((await data.pendingCalendar)?.status).toBe('error');
  });

  it('passes through an unconfigured calendar', async () => {
    const data = await setup(
      { getById: () => Promise.resolve(venue) },
      { getUpcomingVenueEventsResult: () => Promise.resolve({ events: [], status: 'unconfigured' as const }) },
    );

    expect((await data.pendingCalendar)?.status).toBe('unconfigured');
  });

  it('does not query the calendar for a closed venue', async () => {
    const calendar = jasmine.createSpyObj<GoogleCalendarService>('GoogleCalendarService', ['getUpcomingVenueEventsResult']);
    const data = await setup({ getById: () => Promise.resolve({ ...venue, is_active: false }) }, calendar);

    expect(calendar.getUpcomingVenueEventsResult).not.toHaveBeenCalled();
    expect(data.venue?.is_active).toBeFalse();
  });

  it('keeps the page usable when the nearby-venue query fails', async () => {
    const data = await setup(
      { getById: () => Promise.resolve(venue), getNearbyVenues: () => Promise.reject(new Error('nope')) },
      { getUpcomingVenueEventsResult: () => Promise.resolve({ events: [], status: 'ok' as const }) },
    );

    expect(data.venue).toEqual(venue);
    expect(data.nearbyVenues).toEqual([]);
  });
});

describe('VenueService.getNearbyVenues ring order', () => {
  function serviceWith(names: string[]) {
    const rows = names.map((name, i) => ({ ...venue, id: `v${i}`, name }));
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({ eq: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }) }),
        }),
      }),
    };
    const service = new VenueService({ client: db } as any);
    return { service, rows };
  }

  it('walks forward from the current venue and wraps around', async () => {
    const { service, rows } = serviceWith(['A', 'B', 'C', 'D', 'E']);
    const nearby = await service.getNearbyVenues(rows[3], 3); // starts at D
    expect(nearby.map(v => v.name)).toEqual(['E', 'A', 'B']);
  });

  it('never includes the venue itself', async () => {
    const { service, rows } = serviceWith(['A', 'B', 'C']);
    const nearby = await service.getNearbyVenues(rows[0], 6);
    expect(nearby.map(v => v.name)).toEqual(['B', 'C']);
  });

  it('gives different venues different neighbour sets', async () => {
    const { service, rows } = serviceWith(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    const first = (await service.getNearbyVenues(rows[0], 3)).map(v => v.name);
    const second = (await service.getNearbyVenues(rows[3], 3)).map(v => v.name);
    expect(first).not.toEqual(second);
  });
});
