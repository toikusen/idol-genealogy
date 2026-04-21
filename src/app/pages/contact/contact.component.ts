import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo.service';
import { siteUrl } from '../../core/public-url.utils';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './contact.component.html',
})
export class ContactComponent implements OnInit {
  constructor(private seo: SeoService) {}

  ngOnInit() {
    this.seo.setPage(
      '聯絡我們 | Idol Maps',
      '聯絡 Idol Maps 編輯團隊。可用於資料更正、補充建議、權利申訴與合作洽詢。',
      siteUrl('/contact')
    );
    this.seo.setJsonLdGraph([
      {
        '@type': 'ContactPage',
        name: '聯絡 Idol Maps',
        url: siteUrl('/contact'),
      },
      {
        '@type': 'Organization',
        name: 'Idol Maps',
        url: siteUrl('/'),
        email: 'idolgenealogy@gmail.com',
        contactPoint: [
          {
            '@type': 'ContactPoint',
            contactType: 'editorial',
            email: 'idolgenealogy@gmail.com',
            availableLanguage: ['zh-TW', 'ja', 'en'],
          },
        ],
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Idol Maps', item: siteUrl('/') },
          { '@type': 'ListItem', position: 2, name: '聯絡我們', item: siteUrl('/contact') },
        ],
      },
    ]);
  }
}
