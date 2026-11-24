import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

type AnalyticsWindow = Window & {
  gtag?: (...args: unknown[]) => void;
};

export type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  trackPageView(url: string): void {
    if (!this.isBrowser) return;
    // Staff-only pages would otherwise inflate page views
    if (url.startsWith('/admin')) return;
    const gtag = (window as AnalyticsWindow).gtag;
    if (!gtag) return;
    // page_location, not page_path: GA4 derives the path from the location, and a
    // page_path that already carries a query string gets the query appended twice.
    gtag('event', 'page_view', { page_location: window.location.origin + url });
  }

  trackEvent(eventName: string, params?: AnalyticsParams): void {
    if (!this.isBrowser) return;
    const gtag = (window as AnalyticsWindow).gtag;
    if (!gtag) return;
    gtag('event', eventName, params ?? {});
  }
}
