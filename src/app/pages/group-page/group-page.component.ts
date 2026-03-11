import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { GroupService } from '../../core/group.service';
import { HistoryService } from '../../core/history.service';
import { GroupTreeComponent } from '../../shared/group-tree/group-tree.component';
import { Group, Team, History } from '../../models';

@Component({
  selector: 'app-group-page',
  standalone: true,
  imports: [CommonModule, RouterLink, GroupTreeComponent],
  templateUrl: './group-page.component.html',
})
export class GroupPageComponent implements OnInit {
  group: Group | null = null;
  teams: Team[] = [];
  histories: History[] = [];
  selectedHistory: History | null = null;
  loading = true;
  error = false;

  constructor(
    private route: ActivatedRoute,
    private groupService: GroupService,
    private historyService: HistoryService
  ) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    try {
      const [group, teams, histories] = await Promise.all([
        this.groupService.getById(id),
        this.groupService.getTeamsByGroup(id),
        this.historyService.getByGroup(id)
      ]);
      this.group = group;
      this.teams = teams;
      this.histories = histories;
    } catch {
      this.error = true;
    } finally {
      this.loading = false;
    }
  }

  selectMember(h: History) {
    this.selectedHistory = this.selectedHistory?.id === h.id ? null : h;
  }

  getInitial(h: History): string {
    const name = h.member?.name_jp || h.member?.name;
    if (name) return name.charAt(0);
    return '?';
  }

  formatDateShort(dateStr: string | null): string {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short' });
    } catch {
      return '—';
    }
  }

  formatDateLong(dateStr: string | null): string {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '—';
      return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return '—';
    }
  }

  hexToRgb(hex: string): string {
    // Returns "r,g,b" for use in rgba()
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16) || 232;
    const g = parseInt(clean.substring(2, 4), 16) || 121;
    const b = parseInt(clean.substring(4, 6), 16) || 160;
    return `${r},${g},${b}`;
  }
}
