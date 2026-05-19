import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { VenueCalendarEvent } from '../models';

@Injectable({ providedIn: 'root' })
export class TimeTreeService {
  private readonly cache = new Map<string, Promise<VenueCalendarEvent[]>>();
  private readonly isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) platformId: object) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  getUpcomingEvents(alias: string, daysAhead = 90): Promise<VenueCalendarEvent[]> {
    if (!this.isBrowser) return Promise.resolve([]);
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
