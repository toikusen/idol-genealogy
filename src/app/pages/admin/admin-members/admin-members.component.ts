import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { MemberService } from '../../../core/member.service';
import { AdminRoleService } from '../../../core/admin-role.service';
import { SupabaseService } from '../../../core/supabase.service';
import { Member } from '../../../models';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-admin-members',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-members.component.html',
})
export class AdminMembersComponent implements OnInit, OnDestroy {
  members: Member[] = [];
  searchQuery = '';
  loading = true;
  showModal = false;
  editing: Partial<Member> = {};
  isEdit = false;
  saving = false;
  fetchingIg = false;
  igFetchError = '';
  error = '';
  isAdmin = false;
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
    private adminRole: AdminRoleService,
    private supabase: SupabaseService
  ) {
    this._sub = this.adminRole.isAdmin$.subscribe(v => this.isAdmin = v);
  }

  ngOnDestroy(): void { this._sub.unsubscribe(); }

  async ngOnInit() { await this.load(); }

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
      this.members = await this.memberService.getRecent(200);
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
    } finally {
      this.fetchingIg = false;
    }
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
