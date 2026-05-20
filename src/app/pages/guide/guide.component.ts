// src/app/pages/guide/guide.component.ts
import { Component, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo.service';
import { siteUrl } from '../../core/public-url.utils';

@Component({
  selector: 'app-guide',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './guide.component.html',
  styleUrl: './guide.component.css',
})
export class GuideComponent implements OnInit {
  constructor(private seo: SeoService) {}

  ngOnInit(): void {
    const guideUrl = siteUrl('/guide');
    const howToSteps = [
      {
        '@type': 'HowToStep',
        position: 1,
        name: '找到想補充的頁面',
        text: '從首頁搜尋或瀏覽，進入成員、團體、公司或場地資料；若不存在則先提案新增。',
      },
      {
        '@type': 'HowToStep',
        position: 2,
        name: '點擊提案按鈕',
        text: '在頁面標題旁點擊「提案修改」或「提案新增」。',
      },
      {
        '@type': 'HowToStep',
        position: 3,
        name: '填寫並送出提案',
        text: '填寫可確認欄位並送出提案，不確定資料可先留空。',
      },
      {
        '@type': 'HowToStep',
        position: 4,
        name: '等待審核完成',
        text: '提案進入審核佇列，通過後資料會更新到網站。',
      },
    ];

    this.seo.setPage(
      '貢獻者手冊 | Idol Maps',
      '了解如何透過提案機制補充台灣地下偶像資料，包含成員、團體、公司與場地來源建議。',
      guideUrl,
    );
    this.seo.setJsonLdGraph([
      {
        '@type': 'HowTo',
        name: '如何補充偶像資料',
        description: 'Idol Maps 成員、團體、公司、場地資料的貢獻者提案流程與審核方式。',
        totalTime: 'PT5M',
        step: howToSteps,
        mainEntityOfPage: guideUrl,
      },
      {
        '@type': 'WebPage',
        name: '貢獻者手冊',
        url: guideUrl,
        description: '了解如何透過提案機制補充台灣地下偶像的成員、團體、公司與場地來源資料。',
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: '提案送出後會立即上線嗎？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: '不會，提案會先進入管理員審核佇列，通過後才會更新。',
            },
          },
          {
            '@type': 'Question',
            name: '新增成員在籍歷程前需要先做什麼？',
            acceptedAnswer: {
              '@type': 'Answer',
              text: '先確認成員頁與團體頁都已存在，之後再提案新增歷程。',
            },
          },
        ],
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Idol Maps', item: siteUrl('/') },
          { '@type': 'ListItem', position: 2, name: '貢獻者手冊', item: guideUrl },
        ],
      },
    ]);
  }
}
