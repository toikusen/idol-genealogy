import {
  Component, Input, Output, EventEmitter, OnChanges, OnDestroy,
  SimpleChanges, ElementRef, AfterViewInit, PLATFORM_ID, inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Venue, VenueRegionFilter, VenueCalendarEvent } from '../../models';

@Component({
  selector: 'app-venue-map',
  standalone: true,
  template: `<div class="venue-map-container" #mapEl></div>`,
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

      this.markers.set(venue.id, marker);
    }

    this.applyRegionFilter();
    this.fitBounds(L);
  }

  private applyRegionFilter(): void {
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
    this.fitBounds(null);
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

  private buildPopupContent(
    _venue: Venue,
    _events: VenueCalendarEvent[],
    _loading: boolean,
    _error: string,
  ): string {
    // implemented in Task 6
    return '';
  }
}
