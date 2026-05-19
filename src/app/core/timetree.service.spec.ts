import { TestBed } from '@angular/core/testing';
import { TimeTreeService } from './timetree.service';
import { VenueCalendarEvent } from '../models';

function mockEvent(id: string): VenueCalendarEvent {
  return { id, title: `Event ${id}`, start: '2026-06-01T00:00:00.000Z', end: null, location: null, url: null, isAllDay: true };
}

describe('TimeTreeService', () => {
  let service: TimeTreeService;
  let fetchSpy: jasmine.Spy;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TimeTreeService);
    fetchSpy = spyOn(window, 'fetch');
  });

  it('returns events on success', async () => {
    const events = [mockEvent('1')];
    fetchSpy.and.returnValue(Promise.resolve(new Response(JSON.stringify(events), { status: 200 })));
    const result = await service.getUpcomingEvents('pure_maker');
    expect(result).toEqual(events);
    expect(fetchSpy).toHaveBeenCalledWith('/api/timetree-events?alias=pure_maker&days=90');
  });

  it('throws on non-OK response', async () => {
    fetchSpy.and.returnValue(Promise.resolve(new Response('error', { status: 503 })));
    await expectAsync(service.getUpcomingEvents('pure_maker')).toBeRejectedWithError(/503/);
  });

  it('returns cached promise on repeated call', async () => {
    const events = [mockEvent('2')];
    fetchSpy.and.returnValue(Promise.resolve(new Response(JSON.stringify(events), { status: 200 })));
    const p1 = service.getUpcomingEvents('ore_idol');
    const p2 = service.getUpcomingEvents('ore_idol');
    expect(p1).toBe(p2);
    await p1;
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('uses different cache keys for different aliases', async () => {
    const events: VenueCalendarEvent[] = [];
    fetchSpy.and.returnValue(Promise.resolve(new Response(JSON.stringify(events), { status: 200 })));
    const p1 = service.getUpcomingEvents('alias_a');
    const p2 = service.getUpcomingEvents('alias_b');
    expect(p1).not.toBe(p2);
  });

  it('does not fetch during server rendering', async () => {
    const serverService = new TimeTreeService('server' as any);
    const result = await serverService.getUpcomingEvents('pure_maker');
    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
