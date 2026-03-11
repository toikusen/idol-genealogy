import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MemberService } from '../../core/member.service';
import { HistoryService } from '../../core/history.service';
import { MemberTimelineComponent } from '../../shared/member-timeline/member-timeline.component';
import { Member, History } from '../../models';

@Component({
  selector: 'app-member-page',
  standalone: true,
  imports: [CommonModule, RouterLink, MemberTimelineComponent],
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
    private historyService: HistoryService
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
    } catch {
      this.error = true;
    } finally {
      this.loading = false;
    }
  }

  getInitial(member: Member): string {
    if (member.name_jp) return member.name_jp.charAt(0);
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
