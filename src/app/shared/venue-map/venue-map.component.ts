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

  private renderMarkers(_L: any): void {
    // implemented in Task 5
  }

  private applyRegionFilter(): void {
    // implemented in Task 5
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
