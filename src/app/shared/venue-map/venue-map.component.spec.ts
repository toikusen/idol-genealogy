import { ComponentFixture, TestBed } from '@angular/core/testing';
import { isIosWebKit, VenueMapComponent } from './venue-map.component';
import { PLATFORM_ID } from '@angular/core';

describe('isIosWebKit', () => {
  it('recognizes iPhone Safari and Home Screen web apps', () => {
    expect(isIosWebKit({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      platform: 'iPhone',
      maxTouchPoints: 5,
    })).toBeTrue();
  });

  it('recognizes an iPad using its desktop user agent', () => {
    expect(isIosWebKit({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    })).toBeTrue();
  });

  it('does not treat Android or a non-touch Mac as iOS', () => {
    expect(isIosWebKit({
      userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36',
      platform: 'Linux armv8l',
      maxTouchPoints: 5,
    })).toBeFalse();
    expect(isIosWebKit({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    })).toBeFalse();
  });
});

describe('VenueMapComponent', () => {
  let fixture: ComponentFixture<VenueMapComponent>;
  let component: VenueMapComponent;

  beforeEach(async () => {
    // The component lazy-loads leaflet; zone.js does not track the module
    // fetch, so whenStable() would return before the map exists on a cold
    // cache. Warm it here and the import resolves in a tracked microtask.
    await import('leaflet');

    await TestBed.configureTestingModule({
      imports: [VenueMapComponent],
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    }).compileComponents();

    fixture = TestBed.createComponent(VenueMapComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should not initialize map on server platform', async () => {
    await TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [VenueMapComponent],
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
    }).compileComponents();
    const f = TestBed.createComponent(VenueMapComponent);
    f.detectChanges();
    expect((f.componentInstance as any).map).toBeUndefined();
  });

  describe('escapeHtml', () => {
    it('escapes angle brackets and ampersands', () => {
      const esc = (component as any).escapeHtml.bind(component);
      expect(esc('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
      expect(esc('A & B')).toBe('A &amp; B');
    });
  });

  describe('refreshPopup', () => {
    it('does nothing when no popup is open for that venue', () => {
      (component as any).openPopupVenueId = null;
      expect(() => component.refreshPopup('v1', [], '')).not.toThrow();
    });
  });

  describe('focusVenue', () => {
    it('does nothing when the venue has no marker', () => {
      expect(() => component.focusVenue('unknown')).not.toThrow();
    });

    it('pans to the marker, opens its popup, and adds the focus class', () => {
      const markerEl = document.createElement('div');
      markerEl.innerHTML = '<div class="venue-marker"></div>';
      const marker = {
        getLatLng: () => ({ lat: 25.04, lng: 121.51 }),
        getElement: () => markerEl,
        openPopup: jasmine.createSpy('openPopup'),
      };
      const map = {
        hasLayer: () => true,
        panTo: jasmine.createSpy('panTo'),
        remove: () => {},
      };
      (component as any).map = map;
      (component as any).markers.set('v1', marker);

      component.focusVenue('v1');

      expect(map.panTo).toHaveBeenCalledWith({ lat: 25.04, lng: 121.51 });
      expect(marker.openPopup).toHaveBeenCalled();
      expect((component as any).openPopupVenueId).toBe('v1');
      expect(markerEl.querySelector('.venue-marker')!.classList).toContain('venue-marker--focus');
    });
  });

  describe('renderMarkers', () => {
    it('excludes venues without coordinates', async () => {
      component.venues = [
        { id: 'v1', name: 'No Coords', address: 'addr', region: 'north', is_active: true, created_at: '', updated_at: '', google_maps_url: null, phone: null, notes: null, type: null },
      ];
      fixture.detectChanges();
      await fixture.whenStable();
      expect((component as any).markers.size).toBe(0);
    });

    it('creates a marker for venues with coordinates', async () => {
      component.venues = [
        { id: 'v2', name: 'Has Coords', address: 'addr', region: 'north', is_active: true, created_at: '', updated_at: '', google_maps_url: null, phone: null, notes: null, type: null, latitude: 25.04, longitude: 121.51 },
      ];
      fixture.detectChanges();
      await fixture.whenStable();
      expect((component as any).markers.size).toBe(1);
    });

    it('gives each marker an accessible name and keyboard focus', async () => {
      component.venues = [
        { id: 'v3', name: '杰克音樂', address: 'addr', region: 'north', is_active: true, created_at: '', updated_at: '', google_maps_url: null, phone: null, notes: null, type: null, latitude: 25.04, longitude: 121.51 },
      ];
      fixture.detectChanges();
      await fixture.whenStable();

      const el = (component as any).markers.get('v3').getElement() as HTMLElement;
      expect(el.getAttribute('aria-label')).toContain('杰克音樂');
      expect(el.getAttribute('title')).toBe('杰克音樂');
      expect(el.tabIndex).toBe(0);
    });
  });

  describe('markerPopups = false', () => {
    it('creates a non-focusable pin with no popup', async () => {
      component.markerPopups = false;
      component.venues = [
        { id: 'v4', name: '杰克音樂', address: 'addr', region: 'north', is_active: true, created_at: '', updated_at: '', google_maps_url: null, phone: null, notes: null, type: null, latitude: 25.04, longitude: 121.51 },
      ];
      fixture.detectChanges();
      await fixture.whenStable();

      const marker = (component as any).markers.get('v4');
      expect(marker.getPopup()).toBeUndefined();
      const el = marker.getElement() as HTMLElement;
      expect(el.getAttribute('aria-hidden')).toBe('true');
      expect(el.getAttribute('role')).toBeNull();
    });
  });

  describe('compact mode', () => {
    it('is off by default and does not hide the map from assistive tech', () => {
      fixture.detectChanges();
      const container = (fixture.nativeElement as HTMLElement).querySelector('.venue-map-container')!;
      expect(container.classList).not.toContain('venue-map-container--compact');
      expect(container.getAttribute('aria-hidden')).toBeNull();
      expect(container.getAttribute('role')).toBe('application');
    });

    it('applies the compact class and the supplied label', () => {
      component.compact = true;
      component.ariaLabel = '杰克音樂 位置地圖';
      fixture.detectChanges();
      const container = (fixture.nativeElement as HTMLElement).querySelector('.venue-map-container')!;
      expect(container.classList).toContain('venue-map-container--compact');
      expect(container.getAttribute('aria-label')).toBe('杰克音樂 位置地圖');
    });

    it('uses the location link without initializing Leaflet on iOS', async () => {
      component.compact = true;
      component.fallbackHref = 'https://maps.google.com/?q=test';
      component.venues = [
        { id: 'v5', name: '杰克音樂', address: '台北市萬華區昆明街76號', region: 'north', is_active: true, created_at: '', updated_at: '', google_maps_url: null, phone: null, notes: null, type: null, latitude: 25.04, longitude: 121.51 },
      ];
      spyOn<any>(component, 'shouldUseStaticFallback').and.returnValue(true);

      fixture.detectChanges();
      await fixture.whenStable();

      const host = fixture.nativeElement as HTMLElement;
      const container = host.querySelector('.venue-map-container')!;
      const fallback = host.querySelector<HTMLAnchorElement>('[data-map-fallback]')!;
      expect((component as any).map).toBeUndefined();
      expect(container.getAttribute('aria-hidden')).toBe('true');
      expect(container.getAttribute('role')).toBeNull();
      expect(fallback.href).toBe('https://maps.google.com/?q=test');
      expect(fallback.textContent).toContain('台北市萬華區昆明街76號');
      expect(host.querySelector('.venue-map-frame')!.classList).not.toContain('venue-map-frame--ready');
    });
  });
});
