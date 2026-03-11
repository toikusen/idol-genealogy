import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminRoleService } from '../../../core/admin-role.service';
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
  saving = false;
  saveError = '';
  currentEmail = '';

  constructor(
    private adminRole: AdminRoleService,
    private supabase: SupabaseService
  ) {}

  async ngOnInit() {
    const session = await this.supabase.getSessionOnce();
    this.currentEmail = session?.user?.email ?? '';
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
      await this.adminRole.add(this.newEmail.trim(), this.newRole);
      this.newEmail = '';
      this.newRole = 'editor';
      await this.load();
    } catch (e: any) {
      this.saveError = e.message || '新增失敗';
    } finally {
      this.saving = false;
    }
  }

  async remove(role: UserRole) {
    if (role.email === this.currentEmail) {
      alert('您不能移除自己的角色');
      return;
    }
    if (!confirm(`確定移除 ${role.email} 的角色？`)) return;
    try {
      await this.adminRole.remove(role.id);
      await this.load();
    } catch (e: any) {
      alert(e.message || '移除失敗');
    }
  }

  roleLabel(role: string): string {
    return role === 'admin' ? '管理員' : '編輯者';
  }

  roleClass(role: string): string {
    return role === 'admin'
      ? 'bg-purple-100 text-purple-700'
      : 'bg-blue-100 text-blue-700';
  }
}
