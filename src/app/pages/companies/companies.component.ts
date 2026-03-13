import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { GroupService } from '../../core/group.service';
import { SeoService } from '../../core/seo.service';
import { Group } from '../../models';

interface CompanySection {
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
  sections: CompanySection[] = [];
  loading = true;

  constructor(private groupService: GroupService, private seo: SeoService) {}

  async ngOnInit() {
    this.seo.setPage(
      '事務所一覽 | 台灣地下偶像族譜',
      '台灣地下偶像各事務所旗下組合完整列表。',
      'https://idol-genealogy.pages.dev/companies'
    );
    try {
      const all = await this.groupService.getAll();
      this.sections = this.buildSections(all);
    } finally {
      this.loading = false;
    }
  }

  private buildSections(groups: Group[]): CompanySection[] {
    const map = new Map<string, Group[]>();

    for (const g of groups) {
      const key = g.company?.trim() || '獨立・其他';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(g);
    }

    // 排序：有公司名稱的放前面，「獨立・其他」最後
    const entries = [...map.entries()].sort(([a, ga], [b, gb]) => {
      if (a === '獨立・其他') return 1;
      if (b === '獨立・其他') return -1;
      return gb.length - ga.length || a.localeCompare(b, 'zh-Hant');
    });

    return entries.map(([name, gs]) => {
      const sorted = gs.sort((a, b) => {
        // 現役優先，再按成立日期降序
        const aActive = !a.disbanded_at ? 0 : 1;
        const bActive = !b.disbanded_at ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return (b.founded_at ?? '').localeCompare(a.founded_at ?? '');
      });
      return {
        name,
        groups: sorted,
        activeCount: gs.filter(g => !g.disbanded_at).length,
        disbandedCount: gs.filter(g => !!g.disbanded_at).length,
      };
    });
  }
}
