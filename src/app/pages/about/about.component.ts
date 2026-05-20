import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TeamMemberService } from '../../core/team-member.service';
import { SeoService } from '../../core/seo.service';
import { TeamMember } from '../../models';
import { SITE_URL, siteUrl } from '../../core/public-url.utils';
import { SupabaseImgPipe } from '../../shared/supabase-img.pipe';
import { AdBannerComponent } from '../../shared/ad-banner/ad-banner.component';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, RouterLink, SupabaseImgPipe, AdBannerComponent],
  templateUrl: './about.component.html',
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
      '了解 Idol Maps 的成立緣起、資料來源、編輯方針，以及成員、團體、場地與近期活動行程的收錄範圍。',
      siteUrl('/about')
    );
    this.seo.setJsonLdGraph([
      {
        '@type': 'AboutPage',
        name: '關於 Idol Maps',
        url: siteUrl('/about'),
        description: '了解 Idol Maps 的成立緣起、資料來源、編輯方針，以及成員、團體、場地與近期活動行程的收錄範圍。',
      },
      {
        '@type': 'Organization',
        name: 'Idol Maps',
        url: siteUrl('/'),
        logo: {
          '@type': 'ImageObject',
          url: `${SITE_URL}/favicon-192.png`,
        },
        description: '台灣地下偶像成員與團體的完整公開資料庫，整理成員活動歷程、所屬團體、公司關係、演出場地與近期活動行程。',
        foundingDate: '2024',
        areaServed: '台灣',
        knowsAbout: ['台灣地下偶像', '偶像團體', '偶像成員歷程', '偶像演出場地', '地下偶像活動行程'],
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer support',
          url: siteUrl('/contact'),
          availableLanguage: ['Chinese', 'zh-TW'],
        },
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
