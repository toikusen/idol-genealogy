// src/app/pages/admin/admin-companies/admin-companies.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { CompanyService } from '../../../core/company.service';
import { AdminRoleService } from '../../../core/admin-role.service';
import { Company } from '../../../models';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-admin-companies',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-companies.component.html',
})
export class AdminCompaniesComponent implements OnInit, OnDestroy {
  companies: Company[] = [];
  groupCounts: Record<string, number> = {};
  loading = true;
  showModal = false;
  editing: Partial<Company> = {};
  isEdit = false;
  saving = false;
  error = '';
  isAdmin = false;
  fetchingIg = false;
  igFetchError = '';
  private _sub: Subscription;

  constructor(
    private companyService: CompanyService,
    private adminRole: AdminRoleService
  ) {
    this._sub = this.adminRole.isAdmin$.subscribe(v => this.isAdmin = v);
  }

  ngOnDestroy() { this._sub.unsubscribe(); }

  async ngOnInit() { await this.load(); }

  async load() {
    this.loading = true;
    try {
      [this.companies, this.groupCounts] = await Promise.all([
        this.companyService.getAll(),
        this.companyService.getGroupCounts(),
      ]);
    } finally {
      this.loading = false;
    }
  }

  openCreate() {
    this.editing = {};
    this.isEdit = false;
    this.error = '';
    this.igFetchError = '';
    this.showModal = true;
  }

  openEdit(c: Company) {
    this.editing = { ...c };
    this.isEdit = true;
    this.error = '';
    this.igFetchError = '';
    this.showModal = true;
  }

  async save() {
    if (!this.editing.name?.trim()) { this.error = '公司名稱為必填'; return; }
    this.saving = true;
    try {
      if (this.isEdit && this.editing.id) {
        await this.companyService.update(this.editing.id, this.editing);
      } else {
        await this.companyService.create(this.editing);
      }
      this.showModal = false;
      await this.load();
    } catch (e: any) {
      this.error = e.message || '儲存失敗';
    } finally { this.saving = false; }
  }

  async delete(c: Company) {
    if (!confirm(`確定刪除「${c.name}」？刪除後旗下組合的公司關聯將清除。`)) return;
    try {
      await this.companyService.delete(c.id);
      await this.load();
    } catch (e: any) {
      alert(e.message || '刪除失敗');
    }
  }

  extractIgUsername(igUrl: string): string | null {
    const match = igUrl.match(/instagram\.com\/([^/?#\s]+)/);
    return match?.[1] ?? null;
  }

  async fetchIgPhoto() {
    const igUrl = this.editing.instagram;
    if (!igUrl) return;
    const username = this.extractIgUsername(igUrl);
    if (!username) { this.igFetchError = '無法解析 Instagram 帳號'; return; }
    this.fetchingIg = true;
    this.igFetchError = '';
    try {
      const res = await fetch(
        `${environment.supabaseUrl}/functions/v1/ig-photo?username=${encodeURIComponent(username)}`
      );
      const json = await res.json();
      if (json.photo_url) {
        this.editing.photo_url = json.photo_url;
      } else {
        this.igFetchError = json.hint ?? json.error ?? '抓取失敗';
      }
    } catch (e: any) {
      this.igFetchError = e.message || '網路錯誤';
    } finally { this.fetchingIg = false; }
  }

  getInitial(name: string): string {
    return name.charAt(0).toUpperCase();
  }
}
