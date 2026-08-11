import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo.service';
import { siteUrl } from '../../core/public-url.utils';
import { Venue, VenueCalendarEvent } from '../../models';
import { VenuePageData } from '../../core/page-data.resolvers';
import { CalendarStatus } from '../../core/google-calendar.service';
import { VenueMapComponent } from '../../shared/venue-map/venue-map.component';
import {
  normalizeVenueType,
  parseVenueAddress,
  regionLabel,
  venueMapUrl,
} from '../../core/venue-address.utils';
import { taipeiDateParts, taipeiDayKey, taipeiTime } from '../../core/taipei-date.utils';

/** One rail row: a Taipei calendar day plus every show starting that day. */
export interface ScheduleDay {
  key: string;
  month: string;
  day: string;
  weekday: string;
  shows: { event: VenueCalendarEvent; time: string }[];
}

const SCHEDULE_PREVIEW_DAYS = 3;

@Component({
  selector: 'app-venue-page',
  standalone: true,
  imports: [CommonModule, RouterLink, VenueMapComponent],
  templateUrl: './venue-page.component.html',
  styleUrl: './venue-page.component.css',
})
export class VenuePageComponent implements OnInit {
  venue: Venue | null = null;
  nearbyVenues: Venue[] = [];
  scheduleDays: ScheduleDay[] = [];
  calendarStatus: CalendarStatus = 'unconfigured';
  loadError = false;
  notFound = false;
  addressCopied = false;
  showAllShows = false;

  venueType: string | null = null;
  cityLabel = '';
  regionText = '';
  mapUrl = '';
  eventCount = 0;
  updatedYmd = '';

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private route: ActivatedRoute,
    private seo: SeoService,
  ) {}

  ngOnInit(): void {
    // Angular reuses this component when navigating between two /venue/:id
    // routes, so reading the snapshot once would leave the previous venue's
    // name, schedule and canonical URL on screen.
    this.route.data
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(data => this.apply(data['pageData'] as VenuePageData | undefined));
  }

  private reset(): void {
    this.venue = null;
    this.nearbyVenues = [];
    this.scheduleDays = [];
    this.calendarStatus = 'unconfigured';
    this.loadError = false;
    this.notFound = false;
    this.addressCopied = false;
    this.showAllShows = false;
    this.venueType = null;
    this.cityLabel = '';
    this.regionText = '';
    this.mapUrl = '';
    this.eventCount = 0;
    this.updatedYmd = '';
  }

  private apply(data: VenuePageData | undefined): void {
    this.reset();
    if (!data || data.error) {
      this.loadError = true;
      // A transient backend failure must not deindex a page that exists.
      this.seo.setPage(
        '場地資料暫時無法載入 | Idol Maps',
        '場地資料暫時無法載入,請重新整理頁面再試。',
        siteUrl(`/venue/${data?.id ?? ''}`),
      );
      return;
    }

    if (!data.venue) {
      this.notFound = true;
      this.seo.setPage(
        '找不到場地 | Idol Maps',
        '很抱歉,您要查詢的場地不存在或已被移除。',
        siteUrl('/'),
      );
      this.seo.setRobotsNoIndex(true);
      this.seo.clearJsonLd();
      return;
    }

    const venue = data.venue;
    this.venue = venue;
    this.nearbyVenues = data.nearbyVenues;
    this.calendarStatus = data.calendarStatus;
    this.venueType = normalizeVenueType(venue.type);
    this.mapUrl = venueMapUrl(venue);
    this.regionText = regionLabel(venue.region);
    this.scheduleDays = groupByTaipeiDay(data.events);
    this.eventCount = data.events.length;
    // DatePipe would format in the visitor's zone; SSR (UTC) and a Taipei
    // browser can then disagree on the date for a late-evening update.
    this.updatedYmd = taipeiDayKey(venue.updated_at);

    const { city, district } = parseVenueAddress(venue.address);
    this.cityLabel = [city, district].filter(Boolean).join(' · ');

    this.applySeo(venue, city, district);
  }

  private applySeo(venue: Venue, city: string | null, district: string | null): void {
    const typeText = this.venueType ?? '演出場地';
    const title = city
      ? `${venue.name}｜${city}${typeText}演出行程 | Idol Maps`
      : `${venue.name}演出行程 | Idol Maps`;

    const place = [city, district].filter(Boolean).join('');
    const next = this.scheduleDays[0];
    const description = [
      place ? `${venue.name}(${place})的地址、地圖與近期演出行程。` : `${venue.name}的地址、地圖與近期演出行程。`,
      next ? `下一場 ${next.month}/${next.day}。` : '',
    ].join('');

    this.seo.setPage(title, description, siteUrl(`/venue/${venue.id}`));
    this.seo.setRobotsNoIndex(!venue.is_active);

    const address: Record<string, unknown> = {
      '@type': 'PostalAddress',
      streetAddress: venue.address,
      addressCountry: 'TW',
    };
    const postalCode = /^\s*(\d{3}(?:\d{2,3})?)/.exec(venue.address)?.[1];
    if (postalCode) address['postalCode'] = postalCode;
    if (city) address['addressLocality'] = city;

    const musicVenue: Record<string, unknown> = {
      '@type': 'MusicVenue',
      name: venue.name,
      url: siteUrl(`/venue/${venue.id}`),
      address,
    };
    if (venue.latitude != null && venue.longitude != null) {
      musicVenue['geo'] = { '@type': 'GeoCoordinates', latitude: venue.latitude, longitude: venue.longitude };
    }
    if (venue.phone) musicVenue['telephone'] = venue.phone;
    if (venue.google_maps_url) musicVenue['sameAs'] = [venue.google_maps_url];

    // No Event schema: calendar entries carry no performer, offers or event
    // status, and partial Event markup earns nothing while risking noise.
    this.seo.setJsonLdGraph([
      musicVenue,
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Idol Maps', item: siteUrl('/') },
          { '@type': 'ListItem', position: 2, name: '場地', item: siteUrl(`/?tab=venues&region=${venue.region}`) },
          { '@type': 'ListItem', position: 3, name: venue.name, item: siteUrl(`/venue/${venue.id}`) },
        ],
      },
    ]);
  }

  /** The rail opens on the next three days; the rest sits behind the toggle. */
  get visibleScheduleDays(): ScheduleDay[] {
    return this.showAllShows ? this.scheduleDays : this.scheduleDays.slice(0, SCHEDULE_PREVIEW_DAYS);
  }

  get hasHiddenDays(): boolean {
    return this.scheduleDays.length > SCHEDULE_PREVIEW_DAYS;
  }

  get venuesForMap(): Venue[] {
    return this.venue && this.venue.latitude != null && this.venue.longitude != null ? [this.venue] : [];
  }

  get regionQueryParams(): Record<string, string> {
    return { tab: 'venues', region: this.venue?.region ?? 'all' };
  }

  /** `19:00–21:00` when the calendar has an end time, `19:00` when it does not. */
  showTime(event: VenueCalendarEvent): string {
    if (event.isAllDay) return '全日';
    const start = taipeiTime(event.start);
    return event.end ? `${start}–${taipeiTime(event.end)}` : start;
  }

  async copyAddress(): Promise<void> {
    if (!this.venue) return;
    try {
      await navigator.clipboard.writeText(this.venue.address);
      this.addressCopied = true;
      setTimeout(() => (this.addressCopied = false), 2000);
    } catch {
      // Clipboard denied: leave the button label unchanged rather than claim success.
    }
  }
}

export function groupByTaipeiDay(events: VenueCalendarEvent[]): ScheduleDay[] {
  const byDay = new Map<string, ScheduleDay>();

  for (const event of [...events].sort((a, b) => a.start.localeCompare(b.start))) {
    if (!event.start) continue;
    const key = taipeiDayKey(event.start);
    if (!byDay.has(key)) {
      const { month, day, weekday } = taipeiDateParts(event.start);
      byDay.set(key, { key, month, day, weekday, shows: [] });
    }
    byDay.get(key)!.shows.push({
      event,
      time: event.isAllDay ? '全日' : taipeiTime(event.start),
    });
  }

  return [...byDay.values()].sort((a, b) => a.key.localeCompare(b.key));
}
