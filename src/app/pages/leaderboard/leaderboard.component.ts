import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SupabaseImgPipe } from '../../shared/supabase-img.pipe';
import { SeoService } from '../../core/seo.service';
import { siteUrl } from '../../core/public-url.utils';
import { LeaderboardPageData } from '../../core/page-data.resolvers';
import { MemberRecentHeatEntry, MemberTrendingEntry, GroupRecentHeatEntry, GroupTrendingEntry } from '../../models';

@Component({
  selector: 'app-leaderboard',
  standalone: true,
  imports: [CommonModule, RouterLink, SupabaseImgPipe],
  templateUrl: './leaderboard.component.html',
  styleUrl: './leaderboard.component.css',
})
export class LeaderboardComponent implements OnInit {
  activeTab: 'members' | 'groups' = 'members';

  recentMembers: MemberRecentHeatEntry[] = [];
  trendingMembers: MemberTrendingEntry[] = [];
  recentGroups: GroupRecentHeatEntry[] = [];
  trendingGroups: GroupTrendingEntry[] = [];

  constructor(
    private route: ActivatedRoute,
    private seo: SeoService,
  ) {}

  ngOnInit(): void {
    const data = this.route.snapshot.data['pageData'] as LeaderboardPageData | undefined;
    if (data) {
      this.recentMembers = data.recentMembers;
      this.trendingMembers = data.trendingMembers;
      this.recentGroups = data.recentGroups;
      this.trendingGroups = data.trendingGroups;
    }
    this.seo.setPage(
      '排行榜 | Idol Maps',
      '查看近期熱度與上升最快的台灣地下偶像成員與團體排行。',
      siteUrl('/leaderboard'),
    );
  }

  setTab(tab: 'members' | 'groups'): void {
    this.activeTab = tab;
  }
}
