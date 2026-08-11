import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { VenuePageComponent, groupByTaipeiDay } from './venue-page.component';
import { VenueMapComponent } from '../../shared/venue-map/venue-map.component';
import { SeoService } from '../../core/seo.service';
import { VenuePageData } from '../../core/page-data.resolvers';
import { Venue, VenueCalendarEvent } from '../../models';

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
  latitude: 25.04,
  longitude: 121.5,
};

function event(overrides: Partial<VenueCalendarEvent> = {}): VenueCalendarEvent {
  return {
    id: 'e1',
    title: '偶像小夜曲 vol.42',
    start: '2026-08-15T19:00:00+08:00',
    end: null,
    location: null,
    url: null,
    isAllDay: false,
    ...overrides,
  };
}

function makeData(overrides: Partial<VenuePageData> = {}): VenuePageData {
  return {
    id: 'v1',
    venue,
    nearbyVenues: [],
    events: [],
    error: false,
    calendarStatus: 'ok',
    ...overrides,
  };
}

let seo: jasmine.SpyObj<SeoService>;
let routeData: BehaviorSubject<{ pageData: VenuePageData }>;

async function render(pageData: VenuePageData) {
  seo = jasmine.createSpyObj<SeoService>('SeoService', [
    'setPage', 'setJsonLdGraph', 'setRobotsNoIndex', 'clearJsonLd',
  ]);
  routeData = new BehaviorSubject({ pageData });
  await TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [VenuePageComponent],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { data: routeData.asObservable(), snapshot: { data: { pageData } } },
      },
      { provide: SeoService, useValue: seo },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(VenuePageComponent);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('VenuePageComponent', () => {
  it('renders the schedule when the calendar returns events', async () => {
    const { el } = await render(makeData({
      events: [event(), event({ id: 'e2', title: '第二場', start: '2026-08-16T14:00:00+08:00' })],
    }));

    expect(el.querySelectorAll('.day').length).toBe(2);
    expect(el.querySelector('.next-date')?.textContent).toContain('08/15');
    expect(el.textContent).toContain('未來 90 天 · 2 場');
    expect(el.textContent).not.toContain('目前沒有登錄的場次');
  });

  it('previews three days and reveals the rest behind the toggle', async () => {
    const events = Array.from({ length: 5 }, (_, i) =>
      event({ id: `e${i}`, start: `2026-08-1${i + 1}T19:00:00+08:00` }));
    const { fixture, el } = await render(makeData({ events }));

    expect(el.querySelectorAll('.day').length).toBe(3);
    const toggle = el.querySelector('.more') as HTMLButtonElement;
    expect(toggle.textContent).toContain('展開全部 5 場');

    toggle.click();
    fixture.detectChanges();

    expect(el.querySelectorAll('.day').length).toBe(5);
    expect(el.querySelector('.more')?.textContent).toContain('收合');
  });

  it('hides the toggle when every day already fits in the preview', async () => {
    const { el } = await render(makeData({ events: [event()] }));

    expect(el.querySelector('.more')).toBeNull();
  });

  it('shows the empty state only when the calendar genuinely returned nothing', async () => {
    const { el } = await render(makeData({ events: [], calendarStatus: 'ok' }));

    expect(el.textContent).toContain('目前沒有登錄的場次');
    expect(el.querySelector('.next')).toBeNull();
    expect(seo.setRobotsNoIndex).toHaveBeenCalledWith(false);
  });

  it('shows a retry message, not an empty schedule, when the calendar failed', async () => {
    const { el } = await render(makeData({ events: [], calendarStatus: 'error' }));

    expect(el.textContent).toContain('場次資訊暫時取得失敗');
    expect(el.textContent).not.toContain('目前沒有登錄的場次');
    // A calendar outage must not deindex the venue.
    expect(seo.setRobotsNoIndex).toHaveBeenCalledWith(false);
  });

  it('hides the whole schedule section when the calendar is not configured', async () => {
    const { el } = await render(makeData({ events: [], calendarStatus: 'unconfigured' }));

    expect(el.querySelector('.schedule')).toBeNull();
    expect(el.textContent).not.toContain('近期演出');
    expect(el.textContent).not.toContain('0 場');
  });

  it('marks a closed venue noindex and drops the schedule', async () => {
    const { el } = await render(makeData({ venue: { ...venue, is_active: false } }));

    expect(seo.setRobotsNoIndex).toHaveBeenCalledWith(true);
    expect(el.textContent).toContain('已停業');
    expect(el.querySelector('.schedule')).toBeNull();
  });

  it('renders not-found for a missing venue', async () => {
    const { el } = await render(makeData({ venue: null }));

    expect(el.textContent).toContain('找不到場地');
    expect(seo.setRobotsNoIndex).toHaveBeenCalledWith(true);
  });

  it('renders a retry message for a backend failure and keeps the page indexable', async () => {
    const { el } = await render(makeData({ venue: null, error: true }));

    expect(el.textContent).toContain('場地資料暫時無法載入');
    expect(el.textContent).not.toContain('找不到場地');
    expect(seo.setRobotsNoIndex).not.toHaveBeenCalled();
  });

  it('does not nest interactive elements', async () => {
    const { el } = await render(makeData({
      events: [event({ url: 'https://example.com' })],
      nearbyVenues: [{ ...venue, id: 'v2', name: 'Other' }],
    }));

    for (const node of Array.from(el.querySelectorAll('a, button'))) {
      expect(node.querySelector('a, button')).withContext(node.outerHTML.slice(0, 80)).toBeNull();
    }
  });

  it('labels the map instead of hiding it from assistive tech', async () => {
    const { el } = await render(makeData({}));
    const map = el.querySelector('app-venue-map .venue-map-container');

    expect(map?.getAttribute('aria-hidden')).toBeNull();
    expect(map?.getAttribute('aria-label')).toContain(venue.name);
    expect(map?.classList).toContain('venue-map-container--compact');
  });


  it('swaps every piece of state when navigating to another venue', async () => {
    const { fixture, el } = await render(makeData({ events: [event()] }));
    expect(el.querySelector('h1')?.textContent).toContain('杰克音樂');

    const other: Venue = {
      ...venue,
      id: 'v9',
      name: '狀態音樂',
      address: '220新北市板橋區中山路二段101號B1',
      type: '展演空間',
    };
    routeData.next({ pageData: makeData({ id: 'v9', venue: other, events: [] }) });
    fixture.detectChanges();

    expect(el.querySelector('h1')?.textContent).toContain('狀態音樂');
    expect(el.textContent).not.toContain('杰克音樂');
    expect(el.querySelector('.next')).toBeNull();
    expect(el.textContent).toContain('目前沒有登錄的場次');

    const [title, , canonical] = seo.setPage.calls.mostRecent().args;
    expect(title).toContain('狀態音樂');
    expect(canonical).toContain('/venue/v9');
  });

  it('clears a previous error state when the next venue loads', async () => {
    const { fixture, el } = await render(makeData({ venue: null, error: true }));
    expect(el.textContent).toContain('場地資料暫時無法載入');

    routeData.next({ pageData: makeData({ events: [event()] }) });
    fixture.detectChanges();

    expect(el.textContent).not.toContain('場地資料暫時無法載入');
    expect(el.querySelector('h1')?.textContent).toContain('杰克音樂');
  });

  it('formats the updated date in Taipei, not the runtime zone', async () => {
    // 16:30Z on the 14th is already 00:30 on the 15th in Taipei.
    const { el } = await render(makeData({
      venue: { ...venue, updated_at: '2026-08-14T16:30:00Z' },
    }));
    expect(el.querySelector('.foot-note')?.textContent).toContain('2026-08-15');
  });

  it('disables marker popups on the single-venue map', async () => {
    const { fixture } = await render(makeData({}));
    // Popup contents are fed by the host via refreshPopup; with no host they
    // would sit on "讀取活動中" forever.
    const map = fixture.debugElement
      .query(By.directive(VenueMapComponent))
      .componentInstance as VenueMapComponent;

    expect(map.markerPopups).toBeFalse();
    expect(map.compact).toBeTrue();
  });

  it('builds a title and description from the parsed address', async () => {
    await render(makeData({ events: [event()] }));

    const [title, description] = seo.setPage.calls.mostRecent().args;
    expect(title).toBe('杰克音樂 Jack\'s Studio｜台北市Live House演出行程 | Idol Maps');
    expect(description).toContain('台北市萬華區');
    expect(description).toContain('下一場 08/15。');
  });

  it('emits MusicVenue and BreadcrumbList but no Event schema', async () => {
    await render(makeData({ events: [event()] }));

    const graph = seo.setJsonLdGraph.calls.mostRecent().args[0] as Record<string, unknown>[];
    expect(graph.map(node => node['@type'])).toEqual(['MusicVenue', 'BreadcrumbList']);
    expect(JSON.stringify(graph)).not.toContain('"Event"');
  });
});

describe('venue schedule formatting', () => {
  it('groups shows by Taipei day and orders them by start time', () => {
    const days = groupByTaipeiDay([
      event({ id: 'b', start: '2026-08-16T14:00:00+08:00' }),
      event({ id: 'a', start: '2026-08-15T19:00:00+08:00' }),
      event({ id: 'c', start: '2026-08-16T18:30:00+08:00' }),
    ]);

    expect(days.map(d => d.key)).toEqual(['2026-08-15', '2026-08-16']);
    expect(days[1].shows.map(s => s.event.id)).toEqual(['b', 'c']);
    expect(days[0].weekday).toBe('週六');
  });

  it('groups a past-midnight Taipei show under the correct day', () => {
    // 16:30Z is 00:30 on the 16th in Taipei — UTC grouping would say the 15th.
    const days = groupByTaipeiDay([event({ start: '2026-08-15T16:30:00Z' })]);
    expect(days[0].key).toBe('2026-08-16');
  });

  it('renders an end time as a range and never invents a doors-open time', async () => {
    const { fixture } = await render(makeData({
      events: [event({ end: '2026-08-15T21:00:00+08:00' })],
    }));
    const component = fixture.componentInstance;

    expect(component.showTime(event({ end: '2026-08-15T21:00:00+08:00' }))).toBe('19:00–21:00');
    expect(component.showTime(event())).toBe('19:00');
    expect(component.showTime(event({ isAllDay: true }))).toBe('全日');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('開場');
  });
});
