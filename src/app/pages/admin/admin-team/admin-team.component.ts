import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TeamMemberService } from '../../../core/team-member.service';
import { AdminRoleService } from '../../../core/admin-role.service';
import { SupabaseService } from '../../../core/supabase.service';
import { TeamMember, UserRole } from '../../../models';
import { PhotoUploadComponent } from '../../../shared/photo-upload/photo-upload.component';

@Component({
  selector: 'app-admin-team',
  standalone: true,
  imports: [CommonModule, FormsModule, PhotoUploadComponent],
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

  currentUserId: string | null = null;
  isSuperAdmin = false;
  isEditor = false;

  userRoles: UserRole[] = [];
  selectedRoleId = '';

  constructor(
    private teamService: TeamMemberService,
    private adminRole: AdminRoleService,
    private supabase: SupabaseService,
  ) {}

  async ngOnInit() {
    const session = await this.supabase.getSessionOnce();
    this.currentUserId = session?.user?.id ?? null;
    this.isSuperAdmin = await this.adminRole.isSuperAdmin();
    const isAdmin = await this.adminRole.isAdmin();
    this.isEditor = !isAdmin;
    if (!this.isEditor) {
      this.userRoles = await this.adminRole.getAll();
    }
    await this.load();
  }

  async load() {
    this.loading = true;
    try {
      this.members = await this.teamService.getAll();
    } finally {
      this.loading = false;
    }
  }

  canEdit(m: TeamMember): boolean {
    return this.isSuperAdmin || m.user_id === this.currentUserId;
  }

  get availableRoles(): UserRole[] {
    const usedNames = new Set(this.members.map(m => m.name));
    return this.userRoles.filter(r => !usedNames.has(r.display_name ?? r.email));
  }

  onRoleSelect() {
    const role = this.userRoles.find(r => r.id === this.selectedRoleId);
    if (role) this.editing.name = role.display_name ?? role.email;
  }

  openCreate() {
    this.editing = { sort_order: 0, user_id: this.currentUserId };
    this.selectedRoleId = '';
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
    const payload = { ...this.editing };
    if (this.isEditor) delete payload.sort_order;
    try {
      if (this.isEdit && this.editing.id) {
        await this.teamService.update(this.editing.id, payload);
      } else {
        await this.teamService.create(payload);
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
