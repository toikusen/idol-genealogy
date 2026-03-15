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
    const mmdd = dateStr.match(/^(\d{1,2})-(\d{1,2})$/);
    if (mmdd) return `${+mmdd[1]}月${+mmdd[2]}日`;
    // fallback for old YYYY-MM-DD data
    const full = dateStr.match(/^\d{4}-(\d{1,2})-(\d{1,2})$/);
    if (full) return `${+full[1]}月${+full[2]}日`;
    return '—';
  }

  hexToRgb(hex: string): string {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16) || 232;
    const g = parseInt(clean.substring(2, 4), 16) || 121;
    const b = parseInt(clean.substring(4, 6), 16) || 160;
    return `${r},${g},${b}`;
  }

  fallbackPortraitStyle(color: string | null): Record<string, string> {
    const rgb = this.hexToRgb(color || '#e879a0');
    return {
      'background': `linear-gradient(135deg, rgba(${rgb}, 0.15) 0%, rgba(124,108,242,0.1) 100%)`,
      'color': `rgba(${rgb}, 0.6)`,
      'box-shadow': `0 0 0 1px rgba(${rgb}, 0.2), 0 12px 40px rgba(${rgb}, 0.15)`
    };
  }

  nicknameStyle(color: string | null): Record<string, string> {
    const rgb = this.hexToRgb(color || '#e879a0');
    return {
      'font-family': "'Shippori Mincho', serif",
      'font-size': '0.76rem',
      'letter-spacing': '0.2em',
      'color': `rgba(${rgb}, 0.7)`,
      'margin': '0 0 14px'
    };
  }
}
