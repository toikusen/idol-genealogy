import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CompanyService } from '../../core/company.service';
import { SeoService } from '../../core/seo.service';
import { Company } from '../../models';
import { siteUrl } from '../../core/public-url.utils';
import { CompaniesListPageData } from '../../core/page-data.resolvers';
import { SupabaseImgPipe } from '../../shared/supabase-img.pipe';

@Component({
  selector: 'app-companies-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SupabaseImgPipe],
  templateUrl: './companies-list.component.html',
  styleUrl: './entity-list.component.css',
})
export class CompaniesListComponent implements OnInit, OnDestroy {
  allCompanies: Company[] = [];
  loading = true;
  searchQuery = '';
  private isDestroyed = false;

  constructor(
    private companyService: CompanyService,
    private seo: SeoService,
    private route: ActivatedRoute,
  ) {}

  async ngOnInit() {
    this.seo.setPage('全部經紀公司 - Idol Maps', '台灣地下偶像所有經紀公司一覽。', siteUrl('/companies'));

    const pageData = this.route.snapshot.data['pageData'] as CompaniesListPageData | undefined;
    if (pageData && !pageData.error) {
      this.apply(pageData.companies);
      this.loading = false;
      return;
    }

    try {
      const companies = await this.companyService.getAll();
      if (this.isDestroyed) return;
      this.apply(companies);
    } finally {
      this.loading = false;
    }
  }

  ngOnDestroy() {
    this.isDestroyed = true;
  }

  private apply(companies: Company[]): void {
    this.allCompanies = [...companies].sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
    this.applySchemas();
  }

  get filteredCompanies(): Company[] {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return this.allCompanies;
    return this.allCompanies.filter(c => c.name.toLowerCase().includes(q));
  }

  getInitial(c: Company): string {
    return c.name.charAt(0).toUpperCase();
  }

  safeColor(hex: string | null | undefined, fallback = '#e879a0'): string {
    if (!hex) return fallback;
    const clean = hex.replace('#', '');
    if (clean.length < 6) return fallback;
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance > 0.75 ? fallback : hex;
  }

  private applySchemas(): void {
    const pageUrl = siteUrl('/companies');
    const itemListElement = this.allCompanies.slice(0, 60).map((company, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: siteUrl(`/company/${company.id}`),
      item: { '@type': 'Organization', name: company.name },
    }));

    this.seo.setJsonLdGraph([
      {
        '@type': 'CollectionPage',
        name: '全部經紀公司',
        url: pageUrl,
        description: '台灣地下偶像所有經紀公司一覽',
      },
      ...(itemListElement.length > 0 ? [{
        '@type': 'ItemList',
        name: '經紀公司列表',
        numberOfItems: this.allCompanies.length,
        itemListElement,
      }] : []),
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Idol Maps', item: siteUrl('/') },
          { '@type': 'ListItem', position: 2, name: '全部經紀公司', item: pageUrl },
        ],
      },
    ]);
  }
}
