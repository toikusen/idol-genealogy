import {
  Component, Input, Output, EventEmitter, OnChanges, OnDestroy,
  SimpleChanges, ElementRef, AfterViewInit, PLATFORM_ID, inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Venue, VenueRegionFilter, VenueCalendarEvent } from '../../models';

@Component({
  selector: 'app-venue-map',
  standalone: true,
  template: `<div class="venue-map-container"></div>`,
  styleUrl: './venue-map.component.css',
})
export class VenueMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() venues: Venue[] = [];
  @Input() activeRegion: VenueRegionFilter = 'all';

  @Output() regionChange     = new EventEmitter<VenueRegionFilter>();
  @Output() venuePopupOpened = new EventEmitter<string>();

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly el        = inject(ElementRef);

  private map: any;           // L.Map — typed as any to defer leaflet import
  private markers = new Map<string, any>(); // venue.id → L.Marker
  private openPopupVenueId: string | null = null;

  async ngAfterViewInit(): Promise<void> {
    if (!this.isBrowser) return;
    const L = await import('leaflet');
    const container = this.el.nativeElement.querySelector('.venue-map-container') as HTMLElement;
    this.map = L.map(container, { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(this.map);
    this.map.setView([25.045, 121.51], 12);
    this.renderMarkers(L);
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (!this.isBrowser || !this.map) return;
    const L = await import('leaflet');
    if (changes['venues']) this.renderMarkers(L);
    if (changes['activeRegion']) this.applyRegionFilter();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  /** Called by HomeComponent via @ViewChild after loadVenueEvents resolves */
  refreshPopup(venueId: string, events: VenueCalendarEvent[], error: string): void {
    if (this.openPopupVenueId !== venueId) return;
    const marker = this.markers.get(venueId);
    if (!marker) return;
    const popup = marker.getPopup();
    if (!popup) return;
    popup.setContent(this.buildPopupContent(
      this.venues.find(v => v.id === venueId)!,
      events,
      false,
      error,
    ));
  }

  private renderMarkers(L: any): void {
    // Remove existing markers
    this.markers.forEach(m => m.remove());
    this.markers.clear();

    const withCoords = this.venues.filter(
      v => v.latitude != null && v.longitude != null,
    );

    for (const venue of withCoords) {
      const color = venue.region === 'north' ? '#e879a0'
        : venue.region === 'central' ? '#7c6cf2'
        : '#f59e0b';

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:28px;height:28px;border-radius:50% 50% 50% 0;
          background:${color};border:2px solid white;
          transform:rotate(-45deg);
          box-shadow:0 2px 6px rgba(0,0,0,0.25);
        "></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -32],
      });

      const marker = L.marker([venue.latitude!, venue.longitude!], { icon })
        .addTo(this.map)
        .bindPopup(this.buildPopupContent(venue, [], true, ''), { maxWidth: 280 });

      marker.on('click', () => {
        this.openPopupVenueId = venue.id;
        this.venuePopupOpened.emit(venue.id);
      });

      marker.on('popupclose', () => {
        if (this.openPopupVenueId === venue.id) this.openPopupVenueId = null;
      });

      this.markers.set(venue.id, marker);
    }

    this.applyRegionFilter(true);
    this.fitBounds(L);
  }

  private applyRegionFilter(skipFitBounds = false): void {
    this.markers.forEach((marker, venueId) => {
      const venue = this.venues.find(v => v.id === venueId);
      if (!venue) return;
      const visible = this.activeRegion === 'all' || venue.region === this.activeRegion;
      if (visible) {
        if (!this.map.hasLayer(marker)) marker.addTo(this.map);
      } else {
        if (this.map.hasLayer(marker)) marker.remove();
      }
    });
    if (!skipFitBounds) this.fitBounds(null);
  }

  private async fitBounds(L: any | null): Promise<void> {
    const visible: [number, number][] = [];
    this.markers.forEach((marker, venueId) => {
      if (!this.map.hasLayer(marker)) return;
      const venue = this.venues.find(v => v.id === venueId);
      if (venue?.latitude != null && venue.longitude != null) {
        visible.push([venue.latitude, venue.longitude]);
      }
    });
    if (visible.length === 0) return;
    const lib = L ?? (await import('leaflet'));
    this.map.fitBounds(lib.latLngBounds(visible), { padding: [40, 40], maxZoom: 15 });
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private buildPopupContent(
    venue: Venue,
    events: VenueCalendarEvent[],
    loading: boolean,
    error: string,
  ): string {
    const name    = this.escapeHtml(venue.name);
    const address = this.escapeHtml(venue.address);
    const type    = venue.type ? `<span style="display:inline-block;font-size:0.6rem;padding:1px 6px;border-radius:20px;background:rgba(122,90,122,0.06);border:1px solid rgba(122,90,122,0.11);color:#555;margin-top:4px;">${this.escapeHtml(venue.type)}</span>` : '';
    const rawMapsUrl = venue.google_maps_url ?? '';
    const safeMapsUrl = /^https?:\/\//i.test(rawMapsUrl) ? rawMapsUrl : '';
    const mapsLink = safeMapsUrl
      ? `<a href="${this.escapeHtml(safeMapsUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:8px;font-size:0.68rem;color:#4285F4;text-decoration:none;">Google Maps →</a>`
      : '';

    let eventsHtml: string;
    if (loading) {
      eventsHtml = `<div style="font-size:0.68rem;color:var(--text-faint,#aaa);padding:4px 0;">讀取活動中…</div>`;
    } else if (error) {
      eventsHtml = `<div style="font-size:0.68rem;color:#dc2626;padding:4px 0;">${this.escapeHtml(error)}</div>`;
    } else if (events.length === 0) {
      eventsHtml = `<div style="font-size:0.68rem;color:var(--text-faint,#aaa);padding:4px 0;">目前沒有近期活動</div>`;
    } else {
      const rows = events.map(e => {
        const title = this.escapeHtml(e.title);
        const date  = this.escapeHtml(this.formatEventDate(e));
        const href  = e.url ? this.escapeHtml(e.url) : '#';
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="display:grid;grid-template-columns:70px 1fr;gap:6px;padding:5px 0;text-decoration:none;border-top:1px solid rgba(0,0,0,0.06);">
          <span style="font-size:0.62rem;color:#7c6cf2;font-weight:600;">${date}</span>
          <span style="font-size:0.7rem;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${title}</span>
        </a>`;
      }).join('');
      eventsHtml = `<div style="margin-top:4px;">${rows}</div>`;
    }

    return `<div style="min-width:200px;max-width:280px;font-family:inherit;">
      <div style="font-weight:700;font-size:0.88rem;color:#222;margin-bottom:4px;">${name}</div>
      <div style="font-size:0.72rem;color:#666;margin-bottom:2px;">${address}</div>
      ${type}
      <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(0,0,0,0.08);">
        <div style="font-size:0.65rem;font-weight:600;color:#888;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px;">近期活動</div>
        ${eventsHtml}
      </div>
      ${mapsLink}
    </div>`;
  }

  private formatEventDate(event: VenueCalendarEvent): string {
    try {
      const d = new Date(event.start);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    } catch {
      return event.start.slice(5, 10).replace('-', '/');
    }
  }
}
