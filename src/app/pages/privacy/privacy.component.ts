import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo.service';
import { siteUrl } from '../../core/public-url.utils';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './privacy.component.html'
})
export class PrivacyComponent implements OnInit {
  today = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });

  constructor(private seo: SeoService) {}

  ngOnInit(): void {
    const pageUrl = siteUrl('/privacy');
    this.seo.setPage(
      '隱私政策 | Idol Maps',
      'Idol Maps 隱私政策，說明本站如何處理 Cookie、廣告與第三方服務相關資料。',
      pageUrl
    );
    this.seo.setJsonLdGraph([
      {
        '@type': 'PrivacyPolicy',
        name: 'Idol Maps 隱私政策',
        url: pageUrl,
      },
      {
        '@type': 'WebPage',
        name: '隱私政策',
        url: pageUrl,
        isPartOf: {
          '@type': 'WebSite',
          name: 'Idol Maps',
          url: siteUrl('/'),
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Idol Maps', item: siteUrl('/') },
          { '@type': 'ListItem', position: 2, name: '隱私政策', item: pageUrl },
        ],
      },
    ]);
  }
}
