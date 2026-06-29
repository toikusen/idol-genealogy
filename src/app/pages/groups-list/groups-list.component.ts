import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { GroupService } from '../../core/group.service';
import { SeoService } from '../../core/seo.service';
import { Group } from '../../models';
import { siteUrl } from '../../core/public-url.utils';
import { GroupsListPageData } from '../../core/page-data.resolvers';
import { SupabaseImgPipe } from '../../shared/supabase-img.pipe';

@Component({
  selector: 'app-groups-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SupabaseImgPipe],
  templateUrl: './groups-list.component.html',
  styleUrl: './entity-list.component.css',
})
export class GroupsListComponent implements OnInit, OnDestroy {
  allGroups: Group[] = [];
  loading = true;
  searchQuery = '';
  private isDestroyed = false;

  constructor(
    private groupService: GroupService,
    private seo: SeoService,
    private route: ActivatedRoute,
  ) {}

  async ngOnInit() {
    this.seo.setPage('全部團體 - Idol Maps', '台灣地下偶像所有團體一覽。', siteUrl('/groups'));

    const pageData = this.route.snapshot.data['pageData'] as GroupsListPageData | undefined;
    if (pageData && !pageData.error) {
      this.apply(pageData.groups);
      this.loading = false;
      return;
    }

    try {
      const groups = await this.groupService.getAll();
      if (this.isDestroyed) return;
      this.apply(groups);
    } finally {
      this.loading = false;
    }
  }

  ngOnDestroy() {
    this.isDestroyed = true;
  }

  private apply(groups: Group[]): void {
    this.allGroups = [...groups].sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
    this.applySchemas();
  }

  get filteredGroups(): Group[] {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return this.allGroups;
    return this.allGroups.filter(g =>
      g.name.toLowerCase().includes(q) || (g.name_jp ?? '').toLowerCase().includes(q)
    );
  }

  getInitial(g: Group): string {
    return g.name.charAt(0).toUpperCase();
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
    const pageUrl = siteUrl('/groups');
    const itemListElement = this.allGroups.slice(0, 60).map((group, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: siteUrl(`/group/${group.id}`),
      item: { '@type': 'MusicGroup', name: group.name },
    }));

    this.seo.setJsonLdGraph([
      {
        '@type': 'CollectionPage',
        name: '全部團體',
        url: pageUrl,
        description: '台灣地下偶像所有團體一覽',
      },
      ...(itemListElement.length > 0 ? [{
        '@type': 'ItemList',
        name: '團體列表',
        numberOfItems: this.allGroups.length,
        itemListElement,
      }] : []),
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Idol Maps', item: siteUrl('/') },
          { '@type': 'ListItem', position: 2, name: '全部團體', item: pageUrl },
        ],
      },
    ]);
  }
}
