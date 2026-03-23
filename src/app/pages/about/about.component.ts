import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TeamMemberService } from '../../core/team-member.service';
import { SeoService } from '../../core/seo.service';
import { TeamMember } from '../../models';

const SITE_URL = 'https://idolmaps.com';

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
      '關於我們 | IdolMaps',
      '了解 IdolMaps 的成立緣起與編輯團隊。',
      `${SITE_URL}/about`
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
