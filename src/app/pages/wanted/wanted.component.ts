// src/app/pages/wanted/wanted.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MemberService } from '../../core/member.service';
import { GroupService } from '../../core/group.service';
import { CompanyService } from '../../core/company.service';
import { HistoryService } from '../../core/history.service';
import { SeoService } from '../../core/seo.service';
import { Member, Group, Company } from '../../models';
import {
  getMemberCompleteness,
  getGroupCompleteness,
  getCompanyCompleteness,
  CompletenessResult,
} from '../../core/completeness.utils';
import { siteUrl } from '../../core/public-url.utils';

export interface WantedMember {
  member: Member;
  completeness: CompletenessResult;
}

export interface WantedGroup {
  group: Group;
  completeness: CompletenessResult;
}

export interface WantedCompany {
  company: Company;
  completeness: CompletenessResult;
}

import { SupabaseImgPipe } from '../../shared/supabase-img.pipe';

@Component({
  selector: 'app-wanted',
  standalone: true,
  imports: [CommonModule, RouterLink, SupabaseImgPipe],
  templateUrl: './wanted.component.html',
})
export class WantedComponent implements OnInit {
  loading = true;
  error = false;
  activeTab: 'members' | 'groups' | 'companies' = 'members';

  wantedMembers: WantedMember[] = [];
  wantedGroups: WantedGroup[] = [];
  wantedCompanies: WantedCompany[] = [];

  totalMembers = 0;
  totalGroups = 0;
  totalCompanies = 0;

  constructor(
    private memberService: MemberService,
    private groupService: GroupService,
    private companyService: CompanyService,
    private historyService: HistoryService,
    private seo: SeoService,
  ) {}

  async ngOnInit() {
    this.seo.setPage(
      '資料待補充 - Idol Maps',
      '查看哪些成員、團體、公司缺少資料，並幫助補充完整。',
      siteUrl('/wanted'),
    );

    try {
      const [members, groups, companies, memberIdsWithHistory, links] = await Promise.all([
        this.memberService.getAll(),
        this.groupService.getAll(),
        this.companyService.getAll(),
        this.historyService.getMemberIdsWithHistory(),
        this.historyService.getMemberGroupLinks(),
      ]);

      const groupIdsWithMembers = new Set(links.filter(l => l.group_id).map(l => l.group_id));
      const companyIdsWithGroups = new Set(groups.filter(g => g.company_id).map(g => g.company_id));

      this.totalMembers = members.length;
      this.totalGroups = groups.length;
      this.totalCompanies = companies.length;

      this.wantedMembers = members
        .map(member => ({ member, completeness: getMemberCompleteness(member, memberIdsWithHistory.has(member.id)) }))
        .filter(e => !e.completeness.isComplete)
        .sort((a, b) => a.completeness.score - b.completeness.score);

      this.wantedGroups = groups
        .map(group => ({ group, completeness: getGroupCompleteness(group, groupIdsWithMembers.has(group.id)) }))
        .filter(e => !e.completeness.isComplete)
        .sort((a, b) => a.completeness.score - b.completeness.score);

      this.wantedCompanies = companies
        .map(company => ({ company, completeness: getCompanyCompleteness(company, companyIdsWithGroups.has(company.id)) }))
        .filter(e => !e.completeness.isComplete)
        .sort((a, b) => a.completeness.score - b.completeness.score);
    } catch {
      this.error = true;
    } finally {
      this.loading = false;
    }
  }

  tabStyle(tab: 'members' | 'groups' | 'companies'): Record<string, string> {
    return this.activeTab === tab
      ? { color: 'rgba(124,108,242,1)', borderBottom: '2px solid rgba(124,108,242,0.8)', marginBottom: '-1px' }
      : { color: 'var(--text-secondary)' };
  }

  borderClass(score: number): string {
    return score < 50 ? 'border-red-400' : 'border-yellow-400';
  }

  getInitial(name: string): string {
    return name.charAt(0).toUpperCase();
  }
}
