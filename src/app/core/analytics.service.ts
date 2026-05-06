import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

type GtagCommand = [string, ...unknown[]];
type AnalyticsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: GtagCommand) => void;
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
};

const GA_ID = 'G-MHSKDZ2NZF';

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private initialized = false;
  private loading = false;
  private readonly queuedCommands: GtagCommand[] = [];

  trackPageView(url: string): void {
    if (!this.isBrowser) return;
    this.pushCommand(['event', 'page_view', { page_path: url }]);
  }

  trackEvent(eventName: string, params?: Record<string, string>): void {
    if (!this.isBrowser) return;
    this.pushCommand(['event', eventName, params ?? {}]);
  }

  private pushCommand(command: GtagCommand): void {
    const win = window as AnalyticsWindow;
    if (this.initialized && win.gtag) {
      win.gtag(...command);
      return;
    }
    this.queuedCommands.push(command);
    this.scheduleLoad();
  }

  private scheduleLoad(): void {
    if (this.loading || this.initialized) return;
    this.loading = true;
    const win = window as AnalyticsWindow;
    const load = () => {
      window.setTimeout(() => {
        const start = () => this.loadScript();
        if (win.requestIdleCallback) {
          win.requestIdleCallback(start, { timeout: 5000 });
        } else {
          start();
        }
      }, 3500);
    };
    if (document.readyState === 'complete') {
      load();
    } else {
      window.addEventListener('load', load, { once: true });
    }
  }

  private loadScript(): void {
    const win = window as AnalyticsWindow;
    win.dataLayer = win.dataLayer || [];
    win.gtag = (...args: GtagCommand) => {
      win.dataLayer!.push(args);
    };

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    script.onload = () => {
      this.initialized = true;
      win.gtag?.('js', new Date());
      win.gtag?.('config', GA_ID, { send_page_view: false });
      for (const command of this.queuedCommands.splice(0)) {
        win.gtag?.(...command);
      }
    };
    document.head.appendChild(script);
  }
}
