import { Component, Input, AfterViewInit, OnDestroy, PLATFORM_ID, Inject, ElementRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-ad-banner',
  standalone: true,
  // Host defaults to display:inline with no intrinsic size. Inside a flex
  // container (the side rails) that collapses the ad slot to zero width
  // before it has content, so AdSense can never measure or fill it.
  styles: `:host { display: block; width: 100%; }`,
  template: `
    <div [style.display]="visible ? 'block' : 'none'" style="margin: 24px 0; text-align: center;">
      <ins class="adsbygoogle"
           style="display:block"
           data-ad-client="ca-pub-8862517332076590"
           [attr.data-ad-slot]="adSlot"
           data-ad-format="auto"
           data-full-width-responsive="true">
      </ins>
    </div>
  `
})
export class AdBannerComponent implements AfterViewInit, OnDestroy {
  @Input() adSlot = '4061570176';
  // Must stay visible (non-zero width) before the ad request fires — AdSense
  // can't size or fill a full-width-responsive slot that's display:none, and
  // silently abandons it forever without ever writing data-ad-status. Only
  // collapse it once we know for sure the slot came back unfilled.
  visible = true;
  private observer: MutationObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private adRequested = false;

  constructor(
    @Inject(PLATFORM_ID) private platformId: object,
    private el: ElementRef
  ) {}

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;

    const loadAd = () => this.loadAd();
    if ('IntersectionObserver' in window) {
      this.intersectionObserver = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          this.intersectionObserver?.disconnect();
          this.intersectionObserver = null;
          loadAd();
        }
      }, { rootMargin: '600px 0px' });
      this.intersectionObserver.observe(this.el.nativeElement);
      return;
    }

    globalThis.setTimeout(loadAd, 6000);
  }

  ngOnDestroy() {
    this.intersectionObserver?.disconnect();
    this.observer?.disconnect();
  }

  private loadAd(): void {
    if (this.adRequested) return;
    this.adRequested = true;

    // Inject the AdSense loader the first time an ad banner mounts. This keeps
    // the script off pages without ad-eligible content (login, errors, thin
    // pages) so reviewers don't see ads on low-value surfaces.
    if (!document.querySelector('script[data-adsbygoogle-loader]')) {
      const s = document.createElement('script');
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8862517332076590';
      s.setAttribute('data-adsbygoogle-loader', '');
      document.head.appendChild(s);
    }

    try {
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    } catch (_) {}

    const ins: HTMLElement | null = this.el.nativeElement.querySelector('ins');
    if (!ins) return;

    this.observer = new MutationObserver(() => {
      const status = ins.getAttribute('data-ad-status');
      if (status === 'filled') {
        this.visible = true;
        this.observer?.disconnect();
      } else if (status === 'unfilled') {
        this.visible = false;
        this.observer?.disconnect();
      }
    });

    this.observer.observe(ins, { attributes: true, attributeFilter: ['data-ad-status'] });
  }
}
