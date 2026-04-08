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
