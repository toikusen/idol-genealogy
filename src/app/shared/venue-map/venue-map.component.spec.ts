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
});
