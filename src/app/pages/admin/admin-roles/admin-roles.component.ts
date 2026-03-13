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
  newEmail = '';
  newRole: 'admin' | 'editor' = 'editor';
  newDisplayName = '';
  saving = false;
  saveError = '';
  currentEmail = '';
  isSuperAdmin = false;

  constructor(
    private adminRole: AdminRoleService,
    private supabase: SupabaseService
  ) {}

  async ngOnInit() {
    const session = await this.supabase.getSessionOnce();
    this.currentEmail = session?.user?.email ?? '';
    this.isSuperAdmin = this.currentEmail === SUPERADMIN_EMAIL;
    await this.load();
  }

  async load() {
    this.loading = true;
    this.error = '';
    try {
      this.roles = await this.adminRole.getAll();
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

  /** 判斷目前登入者是否可刪除某筆角色 */
  canDelete(role: UserRole): boolean {
    // 系統管理員可刪任何人
    if (this.isSuperAdmin) return true;
    // admin 只能刪自己或 editor
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
