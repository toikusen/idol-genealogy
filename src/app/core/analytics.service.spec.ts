import { TestBed } from '@angular/core/testing';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let gtagSpy: jasmine.Spy;

  beforeEach(() => {
    // Simulate browser environment with gtag
    (window as any).gtag = jasmine.createSpy('gtag');
    gtagSpy = (window as any).gtag;

    TestBed.configureTestingModule({ providers: [AnalyticsService] });
    service = TestBed.inject(AnalyticsService);
  });

  afterEach(() => {
    delete (window as any).gtag;
  });

  it('should be created', () => expect(service).toBeTruthy());

  it('trackPageView() should call gtag with page_view event', () => {
    service.trackPageView('/member/123');
    expect(gtagSpy).toHaveBeenCalledWith('event', 'page_view', {
      page_path: '/member/123'
    });
  });

  it('trackEvent() should call gtag with given event name and params', () => {
    service.trackEvent('view_member', { member_id: 'abc', member_name: '小花' });
    expect(gtagSpy).toHaveBeenCalledWith('event', 'view_member', {
      member_id: 'abc',
      member_name: '小花'
    });
  });

  it('trackPageView() should not throw if gtag is not defined', () => {
    delete (window as any).gtag;
    expect(() => service.trackPageView('/test')).not.toThrow();
  });
});
