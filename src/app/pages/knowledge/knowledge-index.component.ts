import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo.service';
import { siteUrl } from '../../core/public-url.utils';
import { KNOWLEDGE_ARTICLES } from './knowledge-articles';

@Component({
  selector: 'app-knowledge-index',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './knowledge-index.component.html',
  styleUrl: './knowledge-index.component.css',
})
export class KnowledgeIndexComponent implements OnInit {
  readonly articles = KNOWLEDGE_ARTICLES;

  constructor(private seo: SeoService) {}

  ngOnInit(): void {
    const pageUrl = siteUrl('/learn');
    const listItems = this.articles.map((article, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: siteUrl(`/learn/${article.slug}`),
      item: {
        '@type': 'Article',
        headline: article.title,
        description: article.description,
        dateModified: article.updatedAt,
        datePublished: article.updatedAt,
      },
    }));

    this.seo.setPage(
      '地下偶像資料閱讀指南 | Idol Maps',
      '閱讀 Idol Maps 的資料整理方法，了解地下偶像活動歷程、成員團體公司關係與資料修正原則。',
      pageUrl
    );
    this.seo.setJsonLdGraph([
      {
        '@type': 'CollectionPage',
        name: '地下偶像資料閱讀指南',
        url: pageUrl,
        description: 'Idol Maps 的資料閱讀與整理方法文章集。',
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: listItems,
        },
      },
      {
        '@type': 'ItemList',
        name: '資料閱讀指南文章列表',
        numberOfItems: listItems.length,
        itemListElement: listItems,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Idol Maps', item: siteUrl('/') },
          { '@type': 'ListItem', position: 2, name: '資料閱讀指南', item: pageUrl },
        ],
      },
    ]);
  }
}
