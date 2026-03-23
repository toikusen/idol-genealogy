// src/app/pages/company-page/company-page.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CompanyService } from '../../core/company.service';
import { SeoService } from '../../core/seo.service';
import { Company, Group, Member, Proposal } from '../../models';
import { ProposalPanelComponent } from '../../shared/proposal-panel/proposal-panel.component';
import { ProposalService } from '../../core/proposal.service';
import { getDiffFields, DiffField } from '../../core/proposal-diff.utils';
import { formatRelativeTime } from '../../core/time.utils';
import { RecordEditHistoryComponent } from '../../shared/record-edit-history/record-edit-history.component';

const SITE_URL = 'https://idolmaps.com';

@Component({
  selector: 'app-company-page',
  standalone: true,
  imports: [CommonModule, RouterLink, ProposalPanelComponent, RecordEditHistoryComponent],
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

  get lastProposalDiffFields(): DiffField[] {
    return this.lastProposal ? getDiffFields(this.lastProposal) : [];
  }

  formatRelativeTime(date: string | null): string {
    return formatRelativeTime(date);
  }

  constructor(
    private route: ActivatedRoute,
    private companyService: CompanyService,
    private seo: SeoService,
    private proposalService: ProposalService,
  ) {}

  ngOnDestroy() {
    this.seo.clearJsonLd?.();
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    try {
      const [company, groups, soloMembers] = await Promise.all([
        this.companyService.getById(id),
        this.companyService.getGroupsByCompany(id),
        this.companyService.getMembersByCompany(id),
      ]);
      this.company = company;
      this.activeGroups = groups.filter(g => !g.disbanded_at);
      this.disbandedGroups = groups.filter(g => !!g.disbanded_at);
      this.soloMembers = soloMembers;

      if (company) {
        this.proposalService.getApprovedByRecord('companies', id)
          .then(proposals => { this.lastProposal = proposals[0] ?? null; })
          .catch(() => {});
      }

      if (company) {
        this.seo.setPage(
          `${company.name} | Idol Maps`,
          company.description ?? `${company.name}旗下團體與成員記錄。`,
          `${SITE_URL}/company/${id}`,
          company.photo_url ?? undefined
        );
        this.seo.setJsonLd({
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: company.name,
          url: `${SITE_URL}/company/${id}`,
          ...(company.photo_url ? { logo: company.photo_url } : {}),
        });
      }
    } catch {
      this.error = true;
    } finally {
      this.loading = false;
    }
  }

  copyLink() {
    const id = this.route.snapshot.paramMap.get('id')!;
    const url = `${SITE_URL}/company/${id}`;
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
}
