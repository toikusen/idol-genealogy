import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GroupService } from '../../../core/group.service';
import { Group } from '../../../models';

@Component({
  selector: 'app-admin-groups',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-groups.component.html',
})
export class AdminGroupsComponent implements OnInit {
  groups: Group[] = [];
  loading = true;
  showModal = false;
  editing: Partial<Group> = {};
  isEdit = false;
  saving = false;
  error = '';

  constructor(private groupService: GroupService) {}

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading = true;
    try {
      this.groups = await this.groupService.getAll();
    } finally {
      this.loading = false;
    }
  }

  openCreate() { this.editing = { color: '#e879a0' }; this.isEdit = false; this.error = ''; this.showModal = true; }
  openEdit(g: Group) { this.editing = { ...g }; this.isEdit = true; this.error = ''; this.showModal = true; }

  async save() {
    if (!this.editing.name?.trim()) { this.error = '組合名稱為必填'; return; }
    this.saving = true;
    try {
      if (this.isEdit && this.editing.id) {
        await this.groupService.update(this.editing.id, this.editing);
      } else {
        await this.groupService.create(this.editing);
      }
      this.showModal = false;
      await this.load();
    } catch (e: any) {
      this.error = e.message || '儲存失敗';
    } finally { this.saving = false; }
  }

  async delete(g: Group) {
    if (!confirm(`確定刪除「${g.name}」？`)) return;
    try {
      await this.groupService.delete(g.id);
      await this.load();
    } catch (e: any) { alert(e.message || '刪除失敗，請先刪除相關記錄。'); }
  }
}
