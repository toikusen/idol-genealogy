import { Injectable } from '@angular/core';
import { VenueCalendarEvent } from '../models';

@Injectable({ providedIn: 'root' })
export class TimeTreeService {
  private readonly cache = new Map<string, Promise<VenueCalendarEvent[]>>();

  getUpcomingEvents(alias: string, daysAhead = 90): Promise<VenueCalendarEvent[]> {
    const key = `timetree:${alias}:${daysAhead}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const promise = fetch(`/api/timetree-events?alias=${encodeURIComponent(alias)}&days=${daysAhead}`)
      .then(res => {
        if (!res.ok) throw new Error(`TimeTree ${res.status}`);
        return res.json() as Promise<VenueCalendarEvent[]>;
      });
    this.cache.set(key, promise);
    promise.catch(() => this.cache.delete(key));
    return promise;
  }
}
