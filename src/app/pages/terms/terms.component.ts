import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo.service';
import { siteUrl } from '../../core/public-url.utils';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './terms.component.html'
})
export class TermsComponent implements OnInit {
  today = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });

  constructor(private seo: SeoService) {}

  ngOnInit(): void {
    const pageUrl = siteUrl('/terms');
    this.seo.setPage(
      '使用條款 | Idol Maps',
      'Idol Maps 服務使用條款，包含使用規範、投稿授權、廣告聲明與免責聲明。',
      pageUrl
    );
    this.seo.setJsonLdGraph([
      {
        '@type': 'TermsOfService',
        name: 'Idol Maps 使用條款',
        url: pageUrl,
      },
      {
        '@type': 'WebPage',
        name: '使用條款',
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
          { '@type': 'ListItem', position: 2, name: '使用條款', item: pageUrl },
        ],
      },
    ]);
  }
}
