import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { FloatingPanelStateService } from './core/floating-panel-state.service';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should hide ad side rails when a floating panel is registered', () => {
    const floatingPanelState = TestBed.inject(FloatingPanelStateService);
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;

    expect(app.adBlockingPanelOpen()).toBeFalse();

    const release = floatingPanelState.register();
    expect(app.adBlockingPanelOpen()).toBeTrue();

    release();
    expect(app.adBlockingPanelOpen()).toBeFalse();
  });
});
