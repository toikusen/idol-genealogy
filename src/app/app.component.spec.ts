import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AD_INTENT_ROUTES, AppComponent } from './app.component';

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
});

describe('AD_INTENT_ROUTES', () => {
  it('allows ad intents only on long-form prose routes', () => {
    for (const url of ['/guide', '/guide?ref=x', '/learn/how-to-read-idol-history']) {
      expect(AD_INTENT_ROUTES.test(url)).withContext(url).toBe(true);
    }
    for (const url of ['/', '/learn', '/members', '/member/abc', '/group/abc', '/privacy', '/admin/members']) {
      expect(AD_INTENT_ROUTES.test(url)).withContext(url).toBe(false);
    }
  });
});
