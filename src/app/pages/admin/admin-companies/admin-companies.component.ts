// src/app/pages/admin/admin-companies/admin-companies.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { CompanyService } from '../../../core/company.service';
import { ProposalService } from '../../../core/proposal.service';
import { AdminRoleService } from '../../../core/admin-role.service';
import { IgPhotoService } from '../../../core/ig-photo.service';
import { Company } from '../../../models';
import { PhotoUploadComponent } from '../../../shared/photo-upload/photo-upload.component';

@Component({
  selector: 'app-admin-companies',
  standalone: true,
  imports: [CommonModule, FormsModule, PhotoUploadComponent],
  templateUrl: './admin-companies.component.html',
})
export class AdminCompaniesComponent implements OnInit, OnDestroy {
  companies: Company[] = [];
  groupCounts: Record<string, number | undefined> = {};
  loading = true;
  showModal = false;
  editing: Partial<Company> = {};
  private originalData: Record<string, any> = {};
  isEdit = false;
  saving = false;
  error = '';
  isAdmin = false;
  fetchingIg = false;
  igFetchError = '';
  private _sub: Subscription;

  constructor(
    private companyService: CompanyService,
    private proposalService: ProposalService,
    private adminRole: AdminRoleService,
    private igPhoto: IgPhotoService,
    private route: ActivatedRoute,
  ) {
    this._sub = this.adminRole.isAdmin$.subscribe(v => this.isAdmin = v);
  }

  ngOnDestroy() { this._sub.unsubscribe(); }

  async ngOnInit() {
    await this.load();
    const editId = this.route.snapshot.queryParamMap.get('editId');
    if (editId) {
      const c = this.companies.find(c => c.id === editId);
      if (c) this.openEdit(c);
    }
  }

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
    this.originalData = {};
    this.isEdit = false;
    this.error = '';
    this.igFetchError = '';
    this.showModal = true;
  }

  openEdit(c: Company) {
    this.editing = { ...c };
    this.originalData = { ...c } as Record<string, any>;
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
        const id = this.editing.id;
        await this.companyService.update(id, this.editing);
        this.proposalService.recordDirectEdit('companies', id, this.originalData, this.editing as Record<string, any>, 'UPDATE').catch(() => {});
      } else {
        const newId = await this.companyService.create(this.editing);
        this.proposalService.recordDirectEdit('companies', newId, {}, this.editing as Record<string, any>, 'INSERT').catch(() => {});
      }
      this.showModal = false;
      await this.load();
    } catch (e: any) {
      this.error = e.message || '儲存失敗';
    } finally { this.saving = false; }
  }

  async delete(c: Company) {
    if (!confirm(`確定刪除「${c.name}」？刪除後旗下團體的公司關聯將清除。`)) return;
    try {
      await this.companyService.delete(c.id);
      await this.load();
    } catch (e: any) {
      alert(e.message || '刪除失敗');
    }
  }

  async fetchIgPhoto() {
    const igUrl = this.editing.instagram;
    if (!igUrl) return;
    this.fetchingIg = true;
    this.igFetchError = '';
    try {
      const result = await this.igPhoto.fetchPhotoUrl(igUrl);
      if (result.photo_url) {
        this.editing.photo_url = result.photo_url;
      } else {
        this.igFetchError = result.error ?? '抓取失敗';
      }
    } finally { this.fetchingIg = false; }
  }

  getInitial(name: string): string {
    return name.charAt(0).toUpperCase();
  }
}
