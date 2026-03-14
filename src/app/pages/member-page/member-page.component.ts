import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MemberService } from '../../core/member.service';
import { HistoryService } from '../../core/history.service';
import { SeoService } from '../../core/seo.service';
import { MemberTimelineComponent } from '../../shared/member-timeline/member-timeline.component';
import { AdBannerComponent } from '../../shared/ad-banner/ad-banner.component';
import { Member, History } from '../../models';

const SITE_URL = 'https://idol-genealogy.pages.dev';

@Component({
  selector: 'app-member-page',
  standalone: true,
  imports: [CommonModule, RouterLink, MemberTimelineComponent, AdBannerComponent],
  templateUrl: './member-page.component.html',
})
export class MemberPageComponent implements OnInit {
  member: Member | null = null;
  histories: History[] = [];
  loading = true;
  error = false;

  constructor(
    private route: ActivatedRoute,
    private memberService: MemberService,
    private historyService: HistoryService,
    private seo: SeoService
  ) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    try {
      const [member, histories] = await Promise.all([
        this.memberService.getById(id),
        this.historyService.getByMember(id)
      ]);
      this.member = member;
      this.histories = histories;

      if (member) {
        const displayName = member.name_roman ?? member.name;
        this.seo.setPage(
          `${displayName} - 台灣地下偶像族譜`,
          `${displayName}的完整活動記錄，包含所屬組合與歷史經歷。`,
          `${SITE_URL}/member/${id}`,
          member.photo_url ?? undefined
        );

        const jsonLd: Record<string, any> = {
          '@context': 'https://schema.org',
          '@type': 'Person',
          name: displayName,
          url: `${SITE_URL}/member/${id}`,
        };
        if (member.birthdate) jsonLd['birthDate'] = member.birthdate;
        if (member.notes) jsonLd['description'] = member.notes;
        if (member.photo_url) jsonLd['image'] = member.photo_url;
        const groups = histories
          .filter(h => h.group)
          .map(h => ({ '@type': 'MusicGroup', name: h.group!.name }));
        if (groups.length > 0) jsonLd['memberOf'] = groups;

        this.seo.setJsonLd(jsonLd);
      }
    } catch {
      this.error = true;
    } finally {
      this.loading = false;
    }
  }

  getInitial(member: Member): string {
    if (member.name_roman) return member.name_roman.charAt(0);
    return member.name.charAt(0).toUpperCase();
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return '—';
    }
  }
}
