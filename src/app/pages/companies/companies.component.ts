import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { GroupService } from '../../core/group.service';
import { CompanyService } from '../../core/company.service';
import { SeoService } from '../../core/seo.service';
import { Company, Group } from '../../models';

interface LegacySection {
  name: string;
  groups: Group[];
  activeCount: number;
  disbandedCount: number;
}

@Component({
  selector: 'app-companies',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './companies.component.html',
})
export class CompaniesComponent implements OnInit {
  companies: Company[] = [];
  legacySections: LegacySection[] = [];
  loading = true;

  constructor(
    private groupService: GroupService,
    private companyService: CompanyService,
    private seo: SeoService
  ) {}

  async ngOnInit() {
    this.seo.setPage(
      '事務所一覽 | 台灣地下偶像族譜',
      '台灣地下偶像各事務所旗下組合完整列表。',
      'https://idol-genealogy.pages.dev/companies'
    );
    try {
      const [companies, allGroups] = await Promise.all([
        this.companyService.getAll(),
        this.groupService.getAll(),
      ]);
      this.companies = companies;

      // FK-linked company names (for de-duplication)
      const linkedNames = new Set(companies.map(c => c.name.trim().toLowerCase()));

      // Legacy: groups with no company_id
      // De-duplicate: suppress legacy section if company name matches a linked company
      // Also collect independent groups (no company_id and no company string)
      const legacyMap = new Map<string, Group[]>();
      for (const g of allGroups) {
        if (g.company_id) continue; // already linked — skip
        const key = g.company?.trim() || '獨立・其他';
        if (key !== '獨立・其他' && linkedNames.has(key.toLowerCase())) continue; // suppressed
        if (!legacyMap.has(key)) legacyMap.set(key, []);
        legacyMap.get(key)!.push(g);
      }

      const entries = [...legacyMap.entries()].sort(([a, ga], [b, gb]) => {
        if (a === '獨立・其他') return 1;
        if (b === '獨立・其他') return -1;
        return gb.length - ga.length || a.localeCompare(b, 'zh-Hant');
      });

      this.legacySections = entries.map(([name, gs]) => {
        const sorted = gs.sort((a, b) => {
          const aA = !a.disbanded_at ? 0 : 1;
          const bA = !b.disbanded_at ? 0 : 1;
          if (aA !== bA) return aA - bA;
          return (b.founded_at ?? '').localeCompare(a.founded_at ?? '');
        });
        return {
          name,
          groups: sorted,
          activeCount: gs.filter(g => !g.disbanded_at).length,
          disbandedCount: gs.filter(g => !!g.disbanded_at).length,
        };
      });
    } finally {
      this.loading = false;
    }
  }

  getInitial(name: string): string {
    return name.charAt(0).toUpperCase();
  }
}
