import {
  Component, Input, Output, EventEmitter, OnChanges, OnDestroy,
  SimpleChanges, ElementRef, AfterViewInit, PLATFORM_ID, inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Venue, VenueRegionFilter, VenueCalendarEvent } from '../../models';

interface NavigatorFingerprint {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
}

/**
 * Every browser installed on iOS uses WebKit, including an app added to the
 * Home Screen. Keep the check here (instead of in VenuePageComponent) so every
 * compact Leaflet map gets the same safe behaviour.
 */
export function isIosWebKit(navigatorLike: NavigatorFingerprint): boolean {
  const isIosDevice = /iPad|iPhone|iPod/i.test(navigatorLike.userAgent)
    // iPadOS can request a desktop UA and identify itself as a touch Mac.
    || (navigatorLike.platform === 'MacIntel' && navigatorLike.maxTouchPoints > 1);
  return isIosDevice && /AppleWebKit/i.test(navigatorLike.userAgent);
}

@Component({
  selector: 'app-venue-map',
  standalone: true,
  template: `<div
    class="venue-map-frame"
    [class.venue-map-frame--has-fallback]="compact && fallbackHref"
  >
    <div
      class="venue-map-container"
      [class.venue-map-container--compact]="compact"
      role="application"
      [attr.aria-label]="ariaLabel"
    ></div>

    @if (compact && fallbackHref) {
      <a
        class="venue-map-fallback"
        [href]="fallbackHref"
        target="_blank"
        rel="noopener noreferrer"
        data-map-fallback
      >
        <span class="venue-map-fallback__pin" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
            <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </span>
        <span class="venue-map-fallback__copy">
          <strong>在地圖中查看位置</strong>
          <small>{{ venues.length > 0 ? venues[0].address : '' }}</small>
        </span>
        <span class="venue-map-fallback__arrow" aria-hidden="true">&#8599;</span>
      </a>
    }
  </div>`,
  styleUrl: './venue-map.component.css',
})
export class VenueMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() venues: Venue[] = [];
  @Input() activeRegion: VenueRegionFilter = 'all';
  /** Shorter frame for single-venue pages. */
  @Input() compact = false;
  /**
   * Popups are driven by the host (HomeComponent feeds them via refreshPopup).
   * On a single-venue page there is no host to feed them and the page already
   * shows everything a popup would, so the marker becomes a plain pin instead
   * of a focusable button that opens a permanent "loading" bubble.
   */
  @Input() markerPopups = true;
  @Input() ariaLabel = '演出場地地圖';
  /** Link shown while a compact map loads and as the iOS-safe fallback. */
  @Input() fallbackHref = '';

  @Output() regionChange          = new EventEmitter<VenueRegionFilter>();
  @Output() venuePopupOpened      = new EventEmitter<string>();
  @Output() venueProposalRequested = new EventEmitter<string>();

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly el        = inject(ElementRef);

  private map: any;           // L.Map — typed as any to defer leaflet import
  private markers = new Map<string, any>(); // venue.id → L.Marker
  private openPopupVenueId: string | null = null;

  async ngAfterViewInit(): Promise<void> {
    if (!this.isBrowser) return;
    const container = this.el.nativeElement.querySelector('.venue-map-container') as HTMLElement;

    // Leaflet 1.9.4's L.map() can lock iOS WebKit when this compact map is
    // created during Angular hydration or immediately after a routed map is
    // torn down. Safari and installed PWAs share that engine. The venue page
    // already has a precise Maps URL, so prefer the lightweight location card
    // there; the full browsing map and every non-iOS client remain interactive.
    if (this.shouldUseStaticFallback()) {
      container.setAttribute('aria-hidden', 'true');
      container.removeAttribute('role');
      return;
    }

    const mod = await import('leaflet');
    const L = (mod as any).default ?? mod;
    this.map = L.map(container, { zoomControl: true });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 19,
    }).addTo(this.map);
    this.map.setView([25.045, 121.51], 12);
    this.renderMarkers(L);
    this.el.nativeElement
      .querySelector('.venue-map-frame')
      ?.classList.add('venue-map-frame--ready');
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (!this.isBrowser || !this.map) return;
    const mod = await import('leaflet');
    const L = (mod as any).default ?? mod;
    if (changes['venues']) this.renderMarkers(L);
    if (changes['activeRegion']) this.applyRegionFilter();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  private shouldUseStaticFallback(): boolean {
    return this.compact && !!this.fallbackHref && isIosWebKit(window.navigator);
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
      Array.isArray(events) ? events : [],
      false,
      error,
    ));
  }

  /** Called by HomeComponent when a venue is expanded in the list */
  focusVenue(venueId: string): void {
    const marker = this.markers.get(venueId);
    if (!marker || !this.map?.hasLayer(marker)) return;
    this.map.panTo(marker.getLatLng());
    this.openPopupVenueId = venueId;
    marker.openPopup();
    const el = marker.getElement()?.querySelector('.venue-marker') as HTMLElement | null;
    if (!el) return;
    el.classList.remove('venue-marker--focus');
    void el.offsetWidth; // restart CSS animation on repeat clicks
    el.classList.add('venue-marker--focus');
  }

  private readonly MARKER_COLOR = '#4f46e5';

  private injectMarkerStyles(): void {
    if (document.getElementById('idol-marker-styles')) return;
    const style = document.createElement('style');
    style.id = 'idol-marker-styles';
    style.textContent = `
      .venue-marker {
        display:flex; flex-direction:column; align-items:center;
        width:36px; height:44px; cursor:pointer;
      }
      .venue-marker__circle {
        width:36px; height:36px; border-radius:50%;
        background:white; border:2.5px solid ${this.MARKER_COLOR};
        display:flex; align-items:center; justify-content:center;
        box-shadow:0 2px 10px rgba(0,0,0,0.15);
        position:relative; z-index:1;
      }
      .venue-marker__tail {
        width:10px; height:10px; background:${this.MARKER_COLOR};
        transform:rotate(45deg);
        margin-top:-6px; z-index:0;
      }
      .venue-marker--focus .venue-marker__circle {
        animation: venue-marker-pulse 1.2s ease-out 2;
      }
      @keyframes venue-marker-pulse {
        0%   { box-shadow:0 0 0 0 rgba(79,70,229,0.45); }
        100% { box-shadow:0 0 0 14px rgba(79,70,229,0); }
      }
    `;
    document.head.appendChild(style);
  }

  private getVenueIcon(): string {
    const c = this.MARKER_COLOR;
    const sw = `stroke="${c}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
    const inner = `<path ${sw} d="M9 17V6l10-2v11"/><circle cx="7" cy="17" r="2" fill="${c}"/><circle cx="17" cy="15" r="2" fill="${c}"/>`;
    return `<svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  }

  private renderMarkers(L: any): void {
    this.injectMarkerStyles();

    // Remove existing markers
    this.markers.forEach(m => m.remove());
    this.markers.clear();

    const withCoords = this.venues.filter(
      v => v.latitude != null && v.longitude != null,
    );

    for (const venue of withCoords) {
      const icon = L.divIcon({
        className: '',
        html: `<div class="venue-marker" aria-label="${this.escapeHtml(venue.name)} 地圖標記">
          <div class="venue-marker__circle">${this.getVenueIcon()}</div>
          <div class="venue-marker__tail"></div>
        </div>`,
        iconSize: [36, 44],
        iconAnchor: [18, 44],
        popupAnchor: [0, -46],
      });

      const isMobile = window.innerWidth <= 640;
      // Leaflet gives divIcon markers keyboard focus and role="button"; without
      // title/alt a screen reader announces an unlabelled button.
      const marker = L.marker([venue.latitude!, venue.longitude!], {
        icon,
        title: venue.name,
        alt: `${venue.name} 地圖標記`,
        keyboard: this.markerPopups,
      }).addTo(this.map);

      if (this.markerPopups) {
        marker.bindPopup(this.buildPopupContent(venue, [], true, ''), {
          maxWidth: 280,
          ...(isMobile ? { maxHeight: 220 } : {}),
        });
      }

      // Leaflet only forwards `alt` to <img> icons, so a divIcon marker would
      // stay an unlabelled role="button". Set the name on the element itself.
      // Without popups the marker does nothing, so it is decoration, not a control.
      const markerEl = marker.getElement();
      if (this.markerPopups) {
        markerEl?.setAttribute('aria-label', `${venue.name} 地圖標記`);
      } else {
        markerEl?.setAttribute('aria-hidden', 'true');
        markerEl?.removeAttribute('role');
      }

      marker.on('click', () => {
        this.openPopupVenueId = venue.id;
        this.venuePopupOpened.emit(venue.id);
      });

      marker.on('popupopen', () => {
        const popupEl = marker.getPopup()?.getElement();
        const btn = popupEl?.querySelector('[data-propose-venue]') as HTMLElement | null;
        if (btn) {
          btn.addEventListener('click', () => {
            this.map.closePopup();
            this.venueProposalRequested.emit(venue.id);
          });
        }
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
    const mod = L ?? (await import('leaflet'));
    const lib = (mod as any).default ?? mod;
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
      eventsHtml = `<div style="margin-top:4px;max-height:220px;overflow-y:auto;overscroll-behavior:contain;">${rows}</div>`;
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
      <button data-propose-venue style="display:block;width:100%;margin-top:10px;padding:5px 0;font-size:0.68rem;color:#7c6cf2;background:rgba(124,108,242,0.06);border:1px solid rgba(124,108,242,0.18);border-radius:6px;cursor:pointer;text-align:center;">提案修改此場地資訊</button>
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
