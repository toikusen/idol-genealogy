import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo.service';
import { siteUrl } from '../../core/public-url.utils';
import { AdBannerComponent } from '../../shared/ad-banner/ad-banner.component';
import { findKnowledgeArticle, KNOWLEDGE_ARTICLES, KnowledgeArticle } from './knowledge-articles';

@Component({
  selector: 'app-knowledge-article',
  standalone: true,
  imports: [CommonModule, RouterLink, AdBannerComponent],
  templateUrl: './knowledge-article.component.html',
  styleUrl: './knowledge-article.component.css',
})
export class KnowledgeArticleComponent implements OnInit {
  article: KnowledgeArticle | undefined;
  relatedArticles: KnowledgeArticle[] = [];

  constructor(
    private route: ActivatedRoute,
    private seo: SeoService,
  ) {}

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug');
    this.article = findKnowledgeArticle(slug);
    this.relatedArticles = KNOWLEDGE_ARTICLES.filter(article => article.slug !== slug);

    if (!this.article) {
      this.seo.setPage(
        '文章不存在 | Idol Maps',
        '找不到指定的資料閱讀指南文章。',
        siteUrl('/learn')
      );
      this.seo.setRobotsNoIndex(true);
      return;
    }

    const url = siteUrl(`/learn/${this.article.slug}`);
    this.seo.setPage(
      `${this.article.title} | Idol Maps`,
      this.article.description,
      url
    );
    // No FAQPage schema: section headings are not questions, and Google
    // restricted FAQ rich results to authoritative sites in 2023.
    this.seo.setJsonLdGraph([
      {
        '@type': 'Article',
        headline: this.article.title,
        description: this.article.description,
        dateModified: this.article.updatedAt,
        datePublished: this.article.updatedAt,
        author: {
          '@type': 'Organization',
          name: 'Idol Maps 編輯部',
        },
        publisher: {
          '@type': 'Organization',
          name: 'Idol Maps',
          url: siteUrl('/'),
        },
        mainEntityOfPage: url,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Idol Maps', item: siteUrl('/') },
          { '@type': 'ListItem', position: 2, name: '資料閱讀指南', item: siteUrl('/learn') },
          { '@type': 'ListItem', position: 3, name: this.article.title, item: url },
        ],
      },
    ]);
  }
}
