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
import { companyIndexabilitySignals, isIndexable, isAdEligible } from '../../core/indexability.utils';
import { normalizeSnsUrl, normalizeWebsiteUrl } from '../../core/sns-url.utils';

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
  adEligible = false;
  snsUrls: {
    instagram: string | null;
    facebook: string | null;
    x: string | null;
    youtube: string | null;
    website: string | null;
  } = { instagram: null, facebook: null, x: null, youtube: null, website: null };
  private routeDataSub?: Subscription;

  get lastProposalDiffFields(): DiffField[] {
    return this.lastProposal ? getDiffFields(this.lastProposal) : [];
  }

  formatRelativeTime(date: string | null): string {
    return formatRelativeTime(date);
  }

  get latestEditSummary(): string {
    if (!this.lastProposal) return '';
    const submitter = this.lastProposal.submitter_name || '貢獻者';
    const relative = this.formatRelativeTime(this.lastProposal.reviewed_at);
    if (this.lastProposal.operation === 'UPDATE' && this.lastProposalDiffFields.length > 0) {
      return `${relative} · ${submitter} 更新了「${this.lastProposalDiffFields[0].label}」`;
    }
    return `${relative} · ${submitter}${this.lastProposal.operation === 'INSERT' ? ' 建立頁面' : ' 補充'}`;
  }

  get editorialSuggestions(): string[] {
    if (!this.company) return [];
    const suggestions: string[] = [];
    const affiliatedCount = this.activeGroups.length + this.disbandedGroups.length + this.soloMembers.length;
    const hasOfficialLink = !!(this.company.instagram || this.company.facebook || this.company.x || this.company.youtube || this.company.website);
    if (!this.company.photo_url) suggestions.push('可補上公司標誌或對外識別圖');
    if (!this.company.description) suggestions.push('可補上公司簡介與經營方向');
    if (!hasOfficialLink) suggestions.push('可補上官網或官方社群連結');
    if (!affiliatedCount) suggestions.push('可補上旗下團體或相關成員');
    return suggestions.slice(0, 3);
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

    if (!pageData.company || pageData.error) {
      this.seo.setPage(
        '找不到公司 | Idol Maps',
        '很抱歉，您要查詢的公司不存在或已被移除。',
        siteUrl('/')
      );
      this.seo.setRobotsNoIndex(true);
      this.seo.clearJsonLd?.();
      this.adEligible = false;
      this.snsUrls = { instagram: null, facebook: null, x: null, youtube: null, website: null };
      return;
    }

    this.snsUrls = {
      instagram: normalizeSnsUrl(pageData.company.instagram, 'instagram'),
      facebook: normalizeSnsUrl(pageData.company.facebook, 'facebook'),
      x: normalizeSnsUrl(pageData.company.x, 'x'),
      youtube: normalizeSnsUrl(pageData.company.youtube, 'youtube'),
      website: normalizeWebsiteUrl(pageData.company.website),
    };

    const affiliatedCount =
      pageData.activeGroups.length + pageData.disbandedGroups.length + pageData.soloMembers.length;
    const signals = companyIndexabilitySignals(pageData.company, affiliatedCount);
    this.seo.setPage(
      `${pageData.company.name} | Idol Maps`,
      pageData.company.description ?? `${pageData.company.name}旗下團體與成員記錄。`,
      siteUrl(companyPath(pageData.id)),
      pageData.company.photo_url ?? undefined
    );
    this.seo.setRobotsNoIndex(!isIndexable(signals));
    this.adEligible = isAdEligible(signals);

    const sameAs: string[] = [
      this.snsUrls.instagram,
      this.snsUrls.facebook,
      this.snsUrls.x,
      this.snsUrls.youtube,
      this.snsUrls.website,
    ].filter((v): v is string => !!v);

    const orgSchema: Record<string, any> = {
      '@type': 'Organization',
      name: pageData.company.name,
      url: siteUrl(companyPath(pageData.id)),
      ...(pageData.company.photo_url ? { logo: pageData.company.photo_url } : {}),
      ...(sameAs.length ? { sameAs } : {}),
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
