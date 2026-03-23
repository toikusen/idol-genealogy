import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo.service';

const SITE_URL = 'https://idolmaps.com';

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
      '聯絡我們 | 台灣地下偶像族譜',
      '有任何資料錯誤或補充建議，歡迎與我們聯絡。',
      `${SITE_URL}/contact`
    );
  }
}
