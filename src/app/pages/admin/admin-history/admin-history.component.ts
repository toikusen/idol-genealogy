import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { HistoryService } from '../../../core/history.service';
import { MemberService } from '../../../core/member.service';
import { GroupService } from '../../../core/group.service';
import { AdminRoleService } from '../../../core/admin-role.service';
import { History, Member, Group, Team } from '../../../models';

@Component({
  selector: 'app-admin-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-history.component.html',
})
export class AdminHistoryComponent implements OnInit, OnDestroy {
  histories: History[] = [];
  members: Member[] = [];
  groups: Group[] = [];
  teams: Team[] = [];
  searchQuery = '';
  loading = true;
  showModal = false;
  editing: Partial<History> = {};
  isEdit = false;
  saving = false;
  error = '';
  isAdmin = false;
  private _sub: Subscription;

  statusOptions = [
    { value: 'active', label: '正常在籍' },
    { value: 'concurrent', label: '兼任' },
    { value: 'transferred', label: '移籍' },
    { value: 'graduated', label: '畢業' },
  ];

  constructor(
    private historyService: HistoryService,
    private memberService: MemberService,
    private groupService: GroupService,
    private adminRole: AdminRoleService
  ) {
    this._sub = this.adminRole.isAdmin$.subscribe(v => this.isAdmin = v);
  }

  ngOnDestroy(): void { this._sub.unsubscribe(); }

  async ngOnInit() {
    try {
      const [histories, members, groups] = await Promise.all([
        this.historyService.getAll(),
        this.memberService.getRecent(500),
        this.groupService.getAll()
      ]);
      this.histories = histories;
      this.members = members;
      this.groups = groups;
    } catch (e: any) {
      this.error = e.message || '載入失敗';
    } finally {
      this.loading = false;
    }
  }

  get groupedHistories(): { memberId: string; memberName: string; photo_url: string | null; records: History[] }[] {
    const q = this.searchQuery.trim().toLowerCase();
    const filtered = q
      ? this.histories.filter(h =>
          (h.member?.name ?? '').toLowerCase().includes(q) ||
          (h.member?.name_jp ?? '').toLowerCase().includes(q) ||
          (h.group?.name ?? '').toLowerCase().includes(q)
        )
      : this.histories;

    const map = new Map<string, { memberId: string; memberName: string; photo_url: string | null; records: History[] }>();
    for (const h of filtered) {
      const key = h.member_id;
      if (!map.has(key)) {
        map.set(key, {
          memberId: key,
          memberName: h.member?.name_jp || h.member?.name || h.member_id,
          photo_url: (h.member as any)?.photo_url ?? null,
          records: [],
        });
      }
      map.get(key)!.records.push(h);
    }
    return [...map.values()];
  }

  async onGroupChange() {
    if (this.editing.group_id) {
      this.teams = await this.groupService.getTeamsByGroup(this.editing.group_id);
    } else {
      this.teams = [];
    }
    this.editing.team_id = undefined;
  }

  openCreate() { this.editing = {}; this.teams = []; this.isEdit = false; this.error = ''; this.showModal = true; }
  openEdit(h: History) { this.editing = { ...h }; this.isEdit = true; this.error = ''; this.showModal = true; void this.onGroupChange(); }

  async save() {
    if (!this.editing.member_id) { this.error = '請選擇成員'; return; }
    if (!this.editing.group_id) { this.error = '請選擇組合'; return; }
    if (!this.editing.joined_at) { this.error = '加入日期為必填'; return; }
    this.saving = true;
    try {
      if (this.isEdit && this.editing.id) {
        await this.historyService.update(this.editing.id, this.editing);
      } else {
        await this.historyService.create(this.editing);
      }
      this.showModal = false;
      this.histories = await this.historyService.getAll();
    } catch (e: any) {
      this.error = e.message || '儲存失敗';
    } finally { this.saving = false; }
  }

  async delete(h: History) {
    if (!confirm('確定刪除此記錄？')) return;
    try {
      await this.historyService.delete(h.id);
      this.histories = await this.historyService.getAll();
    } catch (e: any) {
      alert(e.message || '刪除失敗');
    }
  }
}
