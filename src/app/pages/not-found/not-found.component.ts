import { Component, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo.service';
import { siteUrl } from '../../core/public-url.utils';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './not-found.component.html',
})
export class NotFoundComponent implements OnInit {
  constructor(private seo: SeoService) {}

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  ngOnInit() {
    if (this.isBrowser) recoverStaticPage(window);
    this.seo.setPage(
      '404 找不到頁面 | Idol Maps',
      '很抱歉，您要找的頁面不存在或已被移除。',
      siteUrl('/404')
    );
    this.seo.setRobotsNoIndex(true);
  }
}

/**
 * /view is a static page outside this app. Landing here on it means a service worker from before /view
 * existed served the app shell (seen in in-app browsers that kept an old copy): drop it and reload once.
 */
export function recoverStaticPage(w: Pick<Window, 'location' | 'sessionStorage' | 'navigator'>): boolean {
  if (!/^\/view(\/|$)/.test(w.location.pathname)) return false;
  try {
    if (w.sessionStorage.getItem('swRecover')) return false;
    w.sessionStorage.setItem('swRecover', '1');
  } catch { return false; }
  const sw = w.navigator.serviceWorker;
  const regs = sw ? sw.getRegistrations() : Promise.resolve([] as readonly ServiceWorkerRegistration[]);
  regs.then(rs => Promise.all(rs.map(r => r.unregister()))).finally(() => w.location.reload());
  return true;
}
