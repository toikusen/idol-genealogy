import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VenueMapComponent } from './venue-map.component';
import { PLATFORM_ID } from '@angular/core';

describe('VenueMapComponent', () => {
  let fixture: ComponentFixture<VenueMapComponent>;
  let component: VenueMapComponent;

  beforeEach(async () => {
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
  });
});
