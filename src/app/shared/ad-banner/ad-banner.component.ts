import { Component, Input, AfterViewInit, OnDestroy, PLATFORM_ID, Inject, ElementRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-ad-banner',
  standalone: true,
  template: `
    <div [style.maxHeight]="visible ? '' : '0'"
         style="margin: 24px 0; text-align: center; overflow: hidden;">
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
  visible = false;
  private observer: MutationObserver | null = null;

  constructor(
    @Inject(PLATFORM_ID) private platformId: object,
    private el: ElementRef
  ) {}

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;

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

    const ins: HTMLElement | null = this.el.nativeElement.querySelector('ins');
    if (!ins) return;

    // Observer must be set up before push() so it catches the status change.
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

    // Defer push to next frame. The outer div uses max-height:0/overflow:hidden
    // instead of display:none, so <ins> retains its block width — AdSense can
    // calculate availableWidth without the TagError console error.
    requestAnimationFrame(() => {
      try {
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      } catch (_) {}
    });
  }

  ngOnDestroy() {
    this.observer?.disconnect();
  }
}
