import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminRoleService, SUPERADMIN_EMAIL } from '../../../core/admin-role.service';
import { SupabaseService } from '../../../core/supabase.service';
import { UserRole } from '../../../models';

@Component({
  selector: 'app-admin-roles',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-roles.component.html',
})
export class AdminRolesComponent implements OnInit {
  roles: UserRole[] = [];
  loading = true;
  error = '';

  // 新增
  newEmail = '';
  newRole: 'admin' | 'editor' = 'editor';
  newDisplayName = '';
  saving = false;
  saveError = '';

  // 編輯
  showEditModal = false;
  editTarget: UserRole | null = null;
  editDisplayName = '';
  editRole: 'superadmin' | 'admin' | 'editor' = 'editor';
  editSaving = false;
  editError = '';

  currentEmail = '';
  isSuperAdmin = false;
  isAdmin = false;   // admin（不含 superadmin）
  isEditor = false;

  constructor(
    private adminRole: AdminRoleService,
    private supabase: SupabaseService
  ) {}

  async ngOnInit() {
    const session = await this.supabase.getSessionOnce();
    this.currentEmail = session?.user?.email ?? '';
    this.isSuperAdmin = this.currentEmail === SUPERADMIN_EMAIL;
    const adminCheck = await this.adminRole.isAdmin();
    this.isAdmin = adminCheck && !this.isSuperAdmin;
    this.isEditor = !adminCheck;
    await this.load();
  }

  async load() {
    this.loading = true;
    this.error = '';
    try {
      const all = await this.adminRole.getAll();
      // editor 只看自己
      this.roles = this.isEditor
        ? all.filter(r => r.email === this.currentEmail)
        : all;
    } catch (e: any) {
      this.error = e.message || '載入失敗';
    } finally {
      this.loading = false;
    }
  }

  async add() {
    if (!this.newEmail.trim()) { this.saveError = '請輸入 Email'; return; }
    this.saving = true;
    this.saveError = '';
    try {
      await this.adminRole.add(this.newEmail.trim(), this.newRole, this.newDisplayName.trim() || undefined);
      this.newEmail = '';
      this.newRole = 'editor';
      this.newDisplayName = '';
      await this.load();
    } catch (e: any) {
      this.saveError = e.message || '新增失敗';
    } finally {
      this.saving = false;
    }
  }

  // --- 編輯 ---
  canEdit(role: UserRole): boolean {
    if (this.isSuperAdmin) return true;
    if (this.isAdmin) return role.role === 'admin' || role.role === 'editor';
    return role.email === this.currentEmail; // editor 只能編輯自己
  }

  /** 是否可修改 role 欄位（editor 不能改 role） */
  canEditRoleField(role: UserRole): boolean {
    if (this.isSuperAdmin) return true;
    if (this.isAdmin) return role.role === 'admin' || role.role === 'editor';
    return false;
  }

  openEdit(role: UserRole) {
    this.editTarget = role;
    this.editDisplayName = role.display_name ?? '';
    this.editRole = role.role;
    this.editError = '';
    this.showEditModal = true;
  }

  async saveEdit() {
    if (!this.editTarget) return;
    this.editSaving = true;
    this.editError = '';
    try {
      const newRole = this.canEditRoleField(this.editTarget) ? this.editRole : undefined;
      await this.adminRole.update(this.editTarget.id, this.editDisplayName.trim() || null, newRole);
      this.showEditModal = false;
      await this.load();
    } catch (e: any) {
      this.editError = e.message || '儲存失敗';
    } finally {
      this.editSaving = false;
    }
  }

  // --- 刪除 ---
  canDelete(role: UserRole): boolean {
    if (this.isSuperAdmin) return true;
    return role.email === this.currentEmail || role.role === 'editor';
  }

  async remove(role: UserRole) {
    if (!confirm(`確定移除 ${role.email} 的角色？`)) return;
    try {
      await this.adminRole.remove(role.id);
      await this.load();
    } catch (e: any) {
      alert(e.message || '移除失敗');
    }
  }

  roleLabel(role: string): string {
    if (role === 'superadmin') return '系統管理員';
    if (role === 'admin') return '管理員';
    return '編輯者';
  }

  roleClass(role: string): string {
    if (role === 'superadmin') return 'bg-rose-100 text-rose-700';
    if (role === 'admin') return 'bg-purple-100 text-purple-700';
    return 'bg-blue-100 text-blue-700';
  }
}
