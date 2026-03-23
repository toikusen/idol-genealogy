import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MemberService } from '../../../core/member.service';
import { CompanyService } from '../../../core/company.service';
import { AdminRoleService } from '../../../core/admin-role.service';
import { SupabaseService } from '../../../core/supabase.service';
import { IgPhotoService } from '../../../core/ig-photo.service';
import { Member, Company } from '../../../models';
import { PhotoUploadComponent } from '../../../shared/photo-upload/photo-upload.component';

@Component({
  selector: 'app-admin-members',
  standalone: true,
  imports: [CommonModule, FormsModule, PhotoUploadComponent],
  templateUrl: './admin-members.component.html',
})
export class AdminMembersComponent implements OnInit, OnDestroy {
  members: Member[] = [];
  private _searchQuery = '';
  get searchQuery() { return this._searchQuery; }
  set searchQuery(v: string) { this._searchQuery = v; this.currentPage = 1; }

  currentPage = 1;
  readonly pageSize = 50;

  get totalPages() { return Math.ceil(this.filteredMembers.length / this.pageSize); }

  get paginatedMembers(): Member[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredMembers.slice(start, start + this.pageSize);
  }

  get pageNumbers(): number[] {
    const total = this.totalPages;
    const cur = this.currentPage;
    const pages: number[] = [];
    for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++) {
      pages.push(i);
    }
    return pages;
  }

  setPage(page: number) {
    if (page < 1 || page > this.totalPages) return;
    this.currentPage = page;
  }

  loading = true;
  showModal = false;
  editing: Partial<Member> = {};
  isEdit = false;
  saving = false;
  fetchingIg = false;
  igFetchError = '';
  error = '';

  batchFetching = false;
  batchProgress = '';
  batchResult = '';
  isAdmin = false;
  allCompanies: Company[] = [];
  private _sub: Subscription;

  birthdateMonth = 0;
  birthdateDay = 0;

  readonly months = Array.from({ length: 12 }, (_, i) => i + 1);
  get days(): number[] {
    const m = this.birthdateMonth;
    const max = m === 2 ? 29 : [4,6,9,11].includes(m) ? 30 : 31;
    return Array.from({ length: max }, (_, i) => i + 1);
  }

  constructor(
    private memberService: MemberService,
    private companyService: CompanyService,
    private adminRole: AdminRoleService,
    private supabase: SupabaseService,
    private igPhoto: IgPhotoService
  ) {
    this._sub = this.adminRole.isAdmin$.subscribe(v => this.isAdmin = v);
  }

  ngOnDestroy(): void { this._sub.unsubscribe(); }

  async ngOnInit() {
    await this.load();
    this.companyService.getAll().then(c => { this.allCompanies = c; }).catch(() => {});
  }

  get filteredMembers(): Member[] {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return this.members;
    return this.members.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.name_roman ?? '').toLowerCase().includes(q)
    );
  }

  async load() {
    this.loading = true;
    try {
      this.members = await this.memberService.getAll();
    } finally {
      this.loading = false;
    }
  }

  openCreate() {
    this.editing = {};
    this.birthdateMonth = 0;
    this.birthdateDay = 0;
    this.isEdit = false;
    this.error = '';
    this.igFetchError = '';
    this.showModal = true;
  }

  openEdit(m: Member) {
    this.editing = { ...m };
    this.isEdit = true;
    this.error = '';
    this.igFetchError = '';
    this.parseBirthdate(m.birthdate);
    this.showModal = true;
  }

  private parseBirthdate(value: string | null | undefined) {
    if (!value) { this.birthdateMonth = 0; this.birthdateDay = 0; return; }
    // MM-DD
    const mmdd = value.match(/^(\d{1,2})-(\d{1,2})$/);
    if (mmdd) { this.birthdateMonth = +mmdd[1]; this.birthdateDay = +mmdd[2]; return; }
    // YYYY-MM-DD (old data)
    const full = value.match(/^\d{4}-(\d{1,2})-(\d{1,2})$/);
    if (full) { this.birthdateMonth = +full[1]; this.birthdateDay = +full[2]; return; }
    this.birthdateMonth = 0; this.birthdateDay = 0;
  }

  async save() {
    if (!this.editing.name?.trim()) { this.error = '姓名為必填'; return; }
    // Combine month/day into MM-DD, or null if incomplete
    if (this.birthdateMonth && this.birthdateDay) {
      this.editing.birthdate = String(this.birthdateMonth).padStart(2, '0') + '-' + String(this.birthdateDay).padStart(2, '0');
    } else {
      this.editing.birthdate = null;
    }
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

  formatBirthdate(value: string | null | undefined): string {
    if (!value) return '—';
    const mmdd = value.match(/^(\d{1,2})-(\d{1,2})$/);
    if (mmdd) return `${+mmdd[1]}月${+mmdd[2]}日`;
    const full = value.match(/^\d{4}-(\d{1,2})-(\d{1,2})$/);
    if (full) return `${+full[1]}月${+full[2]}日`;
    return value;
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
    } finally {
      this.fetchingIg = false;
    }
  }

  async batchFetchIgPhotos() {
    const targets = this.members.filter(m => !m.photo_url && m.instagram);
    if (targets.length === 0) { this.batchResult = '所有有 IG 帳號的成員都已有圖片。'; return; }
    if (!confirm(`找到 ${targets.length} 位成員沒有大頭貼，開始批量抓取？`)) return;

    this.batchFetching = true;
    this.batchResult = '';
    let ok = 0, fail = 0;

    for (let i = 0; i < targets.length; i++) {
      const m = targets[i];
      this.batchProgress = `(${i + 1}/${targets.length})`;
      try {
        const result = await this.igPhoto.fetchPhotoUrl(m.instagram!);
        if (result.photo_url) {
          await this.memberService.update(m.id, { photo_url: result.photo_url });
          ok++;
        } else {
          fail++;
        }
      } catch {
        fail++;
      }
      // 避免太快被 IG 擋，每次間隔 1.5 秒
      if (i < targets.length - 1) await new Promise(r => setTimeout(r, 1500));
    }

    this.batchFetching = false;
    this.batchProgress = '';
    this.batchResult = `完成：成功 ${ok} 位，失敗 ${fail} 位。`;
    await this.load();
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
