// src/app/pages/guide/guide.component.ts
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo.service';

const SITE_URL = 'https://idolmaps.com';

@Component({
  selector: 'app-guide',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './guide.component.html',
})
export class GuideComponent implements OnInit {
  constructor(private seo: SeoService) {}

  ngOnInit(): void {
    this.seo.setPage(
      '貢獻者手冊 | IdolMaps',
      '了解如何透過提案機制補充台灣地下偶像的資料，包含完整流程說明與資料來源建議。',
      `${SITE_URL}/guide`,
    );
  }
}
