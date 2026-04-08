// src/app/pages/company-page/company-page.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { SeoService } from '../../core/seo.service';
import { Company, Group, Member, Proposal } from '../../models';
import { ProposalPanelComponent } from '../../shared/proposal-panel/proposal-panel.component';
import { getDiffFields, DiffField } from '../../core/proposal-diff.utils';
import { formatRelativeTime } from '../../core/time.utils';
import { RecordEditHistoryComponent } from '../../shared/record-edit-history/record-edit-history.component';
import { AdBannerComponent } from '../../shared/ad-banner/ad-banner.component';
import { companyPath, siteUrl } from '../../core/public-url.utils';
import { CompanyPageData } from '../../core/page-data.resolvers';

@Component({
  selector: 'app-company-page',
  standalone: true,
  imports: [CommonModule, RouterLink, ProposalPanelComponent, RecordEditHistoryComponent, AdBannerComponent],
  templateUrl: './company-page.component.html',
})
export class CompanyPageComponent implements OnInit, OnDestroy {
  company: Company | null = null;
  showProposalPanel = false;
  showDeletePanel = false;
  activeGroups: Group[] = [];
  disbandedGroups: Group[] = [];
  soloMembers: Member[] = [];
  loading = true;
  error = false;
  lastProposal: Proposal | null = null;
  showEditHistory = false;
  linkCopied = false;
  private routeDataSub?: Subscription;

  get lastProposalDiffFields(): DiffField[] {
    return this.lastProposal ? getDiffFields(this.lastProposal) : [];
  }

  formatRelativeTime(date: string | null): string {
    return formatRelativeTime(date);
  }

  constructor(
    private route: ActivatedRoute,
    private seo: SeoService,
  ) {}

  ngOnDestroy() {
    this.routeDataSub?.unsubscribe();
    this.seo.clearJsonLd?.();
  }

  ngOnInit() {
    this.routeDataSub = this.route.data.subscribe(({ pageData }) => {
      this.applyPageData(pageData as CompanyPageData);
    });
    this.route.queryParams.subscribe(params => {
      if (params['propose'] === 'true') {
        this.showProposalPanel = true;
      }
    });
  }

  private applyPageData(pageData: CompanyPageData) {
    this.loading = false;
    this.error = pageData.error;
    this.company = pageData.company;
    this.activeGroups = pageData.activeGroups;
    this.disbandedGroups = pageData.disbandedGroups;
    this.soloMembers = pageData.soloMembers;
    this.lastProposal = pageData.lastProposal;

    if (!pageData.company || pageData.error) return;

    this.seo.setPage(
      `${pageData.company.name} | Idol Maps`,
      pageData.company.description ?? `${pageData.company.name}旗下團體與成員記錄。`,
      siteUrl(companyPath(pageData.id)),
      pageData.company.photo_url ?? undefined
    );

    const orgSchema: Record<string, any> = {
      '@type': 'Organization',
      name: pageData.company.name,
      url: siteUrl(companyPath(pageData.id)),
      ...(pageData.company.photo_url ? { logo: pageData.company.photo_url } : {}),
    };

    const breadcrumb = {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Idol Maps', item: siteUrl('/') },
        { '@type': 'ListItem', position: 2, name: pageData.company.name, item: siteUrl(companyPath(pageData.id)) },
      ],
    };

    this.seo.setJsonLdGraph([orgSchema, breadcrumb]);
  }

  copyLink() {
    const id = this.route.snapshot.paramMap.get('id')!;
    const url = siteUrl(companyPath(id));
    navigator.clipboard.writeText(url).then(() => {
      this.linkCopied = true;
      setTimeout(() => { this.linkCopied = false; }, 2000);
    });
  }

  getInitial(name: string): string {
    return name.charAt(0).toUpperCase();
  }

  getBannerStyle(company: Company): string {
    if (company.color) {
      return `background: ${company.color};`;
    }
    return 'background: linear-gradient(135deg, #1a1a2e 0%, #2d1b4e 100%);';
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
}
