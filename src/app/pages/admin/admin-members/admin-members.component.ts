import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MemberService } from '../../../core/member.service';
import { Member } from '../../../models';

@Component({
  selector: 'app-admin-members',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-members.component.html',
})
export class AdminMembersComponent implements OnInit {
  members: Member[] = [];
  loading = true;
  showModal = false;
  editing: Partial<Member> = {};
  isEdit = false;
  saving = false;
  error = '';

  constructor(private memberService: MemberService) {}

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading = true;
    try {
      this.members = await this.memberService.getRecent(200);
    } finally {
      this.loading = false;
    }
  }

  openCreate() { this.editing = {}; this.isEdit = false; this.error = ''; this.showModal = true; }
  openEdit(m: Member) { this.editing = { ...m }; this.isEdit = true; this.error = ''; this.showModal = true; }

  async save() {
    if (!this.editing.name?.trim()) { this.error = '姓名為必填'; return; }
    this.saving = true;
    try {
      if (this.isEdit && this.editing.id) {
        await this.memberService.update(this.editing.id, this.editing);
      } else {
        await this.memberService.create(this.editing);
      }
      this.showModal = false;
      await this.load();
    } catch (e: any) {
      this.error = e.message || '儲存失敗';
    } finally { this.saving = false; }
  }

  async delete(m: Member) {
    if (!confirm(`確定刪除「${m.name}」？若此成員有歷史記錄，刪除將失敗。`)) return;
    try {
      await this.memberService.delete(m.id);
      await this.load();
    } catch (e: any) {
      alert(e.message || '刪除失敗，請先刪除相關歷史記錄。');
    }
  }
}
