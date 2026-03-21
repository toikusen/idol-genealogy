import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

declare function gtag(...args: any[]): void;

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  trackPageView(url: string): void {
    if (!this.isBrowser || typeof gtag === 'undefined') return;
    gtag('event', 'page_view', { page_path: url });
  }

  trackEvent(eventName: string, params?: Record<string, string>): void {
    if (!this.isBrowser || typeof gtag === 'undefined') return;
    gtag('event', eventName, params ?? {});
  }
}
