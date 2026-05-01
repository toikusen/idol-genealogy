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
  filterMemberId = '';
  filterGroupId = '';
  memberSearch = '';
  groupSearch = '';
  isExternalRecord = false;
  loading = true;
  showModal = false;
  editing: Partial<History> = {};
  isEdit = false;
  saving = false;
  error = '';
  isAdmin = false;
  private _sub: Subscription;

  readonly ROLE_OPTIONS = ['隊長', '副隊長', '隊員'];

  statusOptions = [
    { value: 'active', label: '正常在籍' },
    { value: 'concurrent', label: '兼任' },
    { value: 'support', label: '支援' },
    { value: 'transferred', label: '移籍' },
    { value: 'graduated', label: '畢業' },
  ];

  selectRole(r: string): void {
    this.editing.role = this.editing.role === r ? null : r;
  }

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
        this.memberService.getAll(),
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
    let filtered = this.histories;
    if (q) {
      filtered = filtered.filter(h =>
        (h.member?.name ?? '').toLowerCase().includes(q) ||
        (h.member?.name_roman ?? '').toLowerCase().includes(q) ||
        (h.group?.name ?? '').toLowerCase().includes(q)
      );
    }
    if (this.filterMemberId) {
      filtered = filtered.filter(h => h.member_id === this.filterMemberId);
    }
    if (this.filterGroupId) {
      filtered = filtered.filter(h => h.group_id === this.filterGroupId);
    }

    const map = new Map<string, { memberId: string; memberName: string; photo_url: string | null; records: History[] }>();
    for (const h of filtered) {
      const key = h.member_id;
      if (!map.has(key)) {
        map.set(key, {
          memberId: key,
          memberName: h.member?.name || h.member?.name_roman || h.member_id || '（未連結成員）',
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

  get filteredMembers(): Member[] {
    const q = this.memberSearch.trim().toLowerCase();
    if (!q) return this.members;
    return this.members.filter(m =>
      (m.name ?? '').toLowerCase().includes(q) ||
      (m.name_roman ?? '').toLowerCase().includes(q)
    );
  }

  get filteredGroups(): Group[] {
    const q = this.groupSearch.trim().toLowerCase();
    if (!q) return this.groups;
    return this.groups.filter(g => g.name.toLowerCase().includes(q));
  }

  openCreate() {
    this.editing = {}; this.teams = []; this.isEdit = false; this.error = '';
    this.memberSearch = ''; this.groupSearch = ''; this.isExternalRecord = false;
    this.showModal = true;
  }
  openEdit(h: History) {
    this.editing = { ...h }; this.isEdit = true; this.error = '';
    this.memberSearch = ''; this.groupSearch = '';
    this.isExternalRecord = !h.group_id && !!h.external_group_name;
    this.showModal = true;
    if (!this.isExternalRecord) void this.onGroupChange();
  }

  async save() {
    if (!this.editing.member_id) { this.error = '請選擇成員'; return; }
    if (this.isExternalRecord) {
      if (!this.editing.external_group_name?.trim()) { this.error = '請填寫海外團體/solo名稱'; return; }
      this.editing.group_id = null;
    } else {
      if (!this.editing.group_id) { this.error = '請選擇團體'; return; }
      this.editing.external_group_name = null;
      this.editing.external_country = null;
    }
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
