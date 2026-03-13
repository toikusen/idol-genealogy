import { Component, Input, AfterViewInit, OnDestroy, PLATFORM_ID, Inject, ElementRef } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-ad-banner',
  standalone: true,
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
  visible = false;
  private observer: MutationObserver | null = null;

  constructor(
    @Inject(PLATFORM_ID) private platformId: object,
    private el: ElementRef
  ) {}

  ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) return;

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

  ngOnDestroy() {
    this.observer?.disconnect();
  }
}
