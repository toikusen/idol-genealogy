import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MemberService } from '../../core/member.service';
import { GroupService } from '../../core/group.service';
import { Member, Group } from '../../models';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit {
  query = '';
  recentMembers: Member[] = [];
  memberResults: Member[] = [];
  groupResults: Group[] = [];
  searching = false;

  constructor(
    private memberService: MemberService,
    private groupService: GroupService
  ) {}

  async ngOnInit() {
    this.recentMembers = await this.memberService.getRecent(10);
  }

  async search() {
    if (!this.query.trim()) {
      this.memberResults = [];
      this.groupResults = [];
      return;
    }
    this.searching = true;
    const [members, groups] = await Promise.all([
      this.memberService.search(this.query),
      this.groupService.search(this.query)
    ]);
    this.memberResults = members;
    this.groupResults = groups;
    this.searching = false;
  }

  getInitial(member: Member): string {
    if (member.name_jp) return member.name_jp.charAt(0);
    return member.name.charAt(0).toUpperCase();
  }

  formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  get hasResults(): boolean {
    return this.memberResults.length > 0 || this.groupResults.length > 0;
  }

  get noResults(): boolean {
    return this.query.trim().length > 0 && !this.searching && !this.hasResults;
  }
}
