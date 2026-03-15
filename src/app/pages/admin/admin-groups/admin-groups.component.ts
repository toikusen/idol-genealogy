import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { GroupService } from '../../../core/group.service';
import { AdminRoleService } from '../../../core/admin-role.service';
import { CompanyService } from '../../../core/company.service';
import { Group, GroupVideo, Company } from '../../../models';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-admin-groups',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-groups.component.html',
})
export class AdminGroupsComponent implements OnInit, OnDestroy {
  groups: Group[] = [];
  searchQuery = '';
  loading = true;
  showModal = false;
  editing: Partial<Group> = {};
  isEdit = false;
  saving = false;
  error = '';
  isAdmin = false;
  private _sub: Subscription;

  fetchingIg = false;
  igFetchError = '';

  companies: Company[] = [];

  // Videos
  videos: GroupVideo[] = [];
  newVideoUrl = '';
  videoError = '';
  savingVideo = false;

  constructor(
    private groupService: GroupService,
    private adminRole: AdminRoleService,
    private companyService: CompanyService
  ) {
    this._sub = this.adminRole.isAdmin$.subscribe(v => this.isAdmin = v);
  }

  ngOnDestroy(): void { this._sub.unsubscribe(); }

  async ngOnInit() { await this.load(); }

  get filteredGroups(): Group[] {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return this.groups;
    return this.groups.filter(g =>
      g.name.toLowerCase().includes(q) ||
      (g.name_jp ?? '').toLowerCase().includes(q) ||
      (g.company ?? '').toLowerCase().includes(q)
    );
  }

  async load() {
    this.loading = true;
    try {
      this.groups = await this.groupService.getAll();
    } finally {
      this.loading = false;
    }
  }

  private async loadCompanies() {
    try {
      this.companies = await this.companyService.getAll();
    } catch { this.companies = []; }
  }

  openCreate() {
    this.editing = { color: '#e879a0' };
    this.isEdit = false;
    this.error = '';
    this.igFetchError = '';
    this.videos = [];
    this.newVideoUrl = '';
    this.videoError = '';
    this.showModal = true;
    this.loadCompanies();
  }

  async openEdit(g: Group) {
    this.editing = { ...g };
    this.isEdit = true;
    this.error = '';
    this.igFetchError = '';
    this.newVideoUrl = '';
    this.videoError = '';
    this.showModal = true;
    this.videos = await this.groupService.getVideosByGroup(g.id);
    this.loadCompanies();
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

  extractYouTubeId(url: string): string | null {
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  async addVideo() {
    this.videoError = '';
    const url = this.newVideoUrl.trim();
    if (!url) return;
    if (!this.extractYouTubeId(url)) {
      this.videoError = '請輸入有效的 YouTube 網址';
      return;
    }
    if (this.videos.length >= 3) {
      this.videoError = '最多只能新增 3 部影片';
      return;
    }
    this.savingVideo = true;
    try {
      // Fetch title from YouTube oEmbed (no API key needed)
      let title: string | null = null;
      try {
        const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        if (res.ok) {
          const json = await res.json();
          title = json.title ?? null;
        }
      } catch { /* ignore, save without title */ }

      await this.groupService.createVideo({
        group_id: this.editing.id!,
        url,
        title,
        sort_order: this.videos.length,
      });
      this.videos = await this.groupService.getVideosByGroup(this.editing.id!);
      this.newVideoUrl = '';
    } catch (e: any) {
      this.videoError = e.message || '新增失敗';
    } finally {
      this.savingVideo = false;
    }
  }

  async removeVideo(v: GroupVideo) {
    try {
      await this.groupService.deleteVideo(v.id);
      this.videos = this.videos.filter(x => x.id !== v.id);
    } catch (e: any) {
      this.videoError = e.message || '刪除失敗';
    }
  }

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
