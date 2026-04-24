import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TeamMemberService } from '../../core/team-member.service';
import { SeoService } from '../../core/seo.service';
import { TeamMember } from '../../models';
import { siteUrl } from '../../core/public-url.utils';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './about.component.html',
  styles: [`
    @media (prefers-color-scheme: dark) {
      :host .about-page {
        background: linear-gradient(135deg, #160c18 0%, #1a0c20 50%, #160c18 100%) !important;
      }
      :host h1 { color: var(--text-primary) !important; }
      :host h2 { color: var(--text-primary) !important; }
      :host section { color: var(--text-faint-70) !important; }
      :host strong { color: var(--text-secondary) !important; }
      :host .team-member-name { color: var(--text-primary) !important; }
    }
  `],
})
export class AboutComponent implements OnInit {
  members: TeamMember[] = [];

  constructor(
    private teamService: TeamMemberService,
    private seo: SeoService
  ) {}

  async ngOnInit() {
    this.seo.setPage(
      '關於我們 | Idol Maps',
      '了解 Idol Maps 的成立緣起、資料來源說明、編輯方針與資料涵蓋範圍。',
      siteUrl('/about')
    );
    this.seo.setJsonLdGraph([
      {
        '@type': 'AboutPage',
        name: '關於 Idol Maps',
        url: siteUrl('/about'),
      },
      {
        '@type': 'Organization',
        name: 'Idol Maps',
        url: siteUrl('/'),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Idol Maps', item: siteUrl('/') },
          { '@type': 'ListItem', position: 2, name: '關於我們', item: siteUrl('/about') },
        ],
      },
    ]);
    try {
      this.members = await this.teamService.getAll();
    } catch {
      this.members = [];
    }
  }

  getInitial(name: string): string {
    return name.charAt(0).toUpperCase();
  }
}
