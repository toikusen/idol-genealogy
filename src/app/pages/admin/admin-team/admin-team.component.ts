import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TeamMemberService } from '../../../core/team-member.service';
import { TeamMember } from '../../../models';

@Component({
  selector: 'app-admin-team',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-team.component.html',
})
export class AdminTeamComponent implements OnInit {
  members: TeamMember[] = [];
  loading = true;
  showModal = false;
  editing: Partial<TeamMember> = {};
  isEdit = false;
  saving = false;
  error = '';

  constructor(private teamService: TeamMemberService) {}

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading = true;
    try {
      this.members = await this.teamService.getAll();
    } finally {
      this.loading = false;
    }
  }

  openCreate() {
    this.editing = { sort_order: 0 };
    this.isEdit = false;
    this.error = '';
    this.showModal = true;
  }

  openEdit(m: TeamMember) {
    this.editing = { ...m };
    this.isEdit = true;
    this.error = '';
    this.showModal = true;
  }

  async save() {
    if (!this.editing.name?.trim()) { this.error = '名稱為必填'; return; }
    this.saving = true;
    try {
      if (this.isEdit && this.editing.id) {
        await this.teamService.update(this.editing.id, this.editing);
      } else {
        await this.teamService.create(this.editing);
      }
      this.showModal = false;
      await this.load();
    } catch (e: any) {
      this.error = e.message || '儲存失敗';
    } finally { this.saving = false; }
  }

  async delete(m: TeamMember) {
    if (!confirm(`確定刪除「${m.name}」？`)) return;
    try {
      await this.teamService.delete(m.id);
      await this.load();
    } catch (e: any) {
      alert(e.message || '刪除失敗');
    }
  }

  getInitial(name: string): string {
    return name.charAt(0).toUpperCase();
  }
}
