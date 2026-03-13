import { Component, Input, AfterViewInit, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

@Component({
  selector: 'app-ad-banner',
  standalone: true,
  template: `
    <div [style.margin]="'24px 0'" [style.text-align]="'center'">
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
export class AdBannerComponent implements AfterViewInit {
  @Input() adSlot = '4061570176';

  constructor(@Inject(PLATFORM_ID) private platformId: object) {}

  ngAfterViewInit() {
    if (isPlatformBrowser(this.platformId)) {
      try {
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      } catch (e) {
        // AdSense not loaded yet
      }
    }
  }
}
