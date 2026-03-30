import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo.service';
import { siteUrl } from '../../core/public-url.utils';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './terms.component.html'
})
export class TermsComponent {
  today = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });

  constructor(private seo: SeoService) {
    seo.setPage(
      '使用條款 | Idol Maps',
      'Idol Maps 服務使用條款，包含使用規範、投稿授權、廣告聲明與免責聲明。',
      siteUrl('/terms')
    );
  }
}
