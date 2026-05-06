import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { GroupService } from '../../../core/group.service';
import { AdminRoleService } from '../../../core/admin-role.service';
import { CompanyService } from '../../../core/company.service';
import { IgPhotoService } from '../../../core/ig-photo.service';
import { Group, GroupVideo, Company } from '../../../models';
import { PhotoUploadComponent } from '../../../shared/photo-upload/photo-upload.component';

@Component({
  selector: 'app-admin-groups',
  standalone: true,
  imports: [CommonModule, FormsModule, PhotoUploadComponent],
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
  isEditor = false;
  private _sub: Subscription;

  fetchingIg = false;
  igFetchError = '';

  companies: Company[] = [];

  // Style multi-select
  readonly STYLE_OPTIONS = ['王道系', '樂曲派', '搖滾系', '金屬系', '可愛系 / 電波系', 'EDM / 電音系', '情緒系（エモ）'];
  editingStyles: string[] = [];

  // Videos
  videos: GroupVideo[] = [];
  newVideoUrl = '';
  videoError = '';
  savingVideo = false;

  constructor(
    private groupService: GroupService,
    private adminRole: AdminRoleService,
    private companyService: CompanyService,
    private igPhoto: IgPhotoService,
    private route: ActivatedRoute,
  ) {
    this._sub = this.adminRole.isAdmin$.subscribe(v => {
      this.isAdmin = v;
      this.isEditor = !v;
    });
  }

  ngOnDestroy(): void { this._sub.unsubscribe(); }

  async ngOnInit() {
    await this.load();
    const editId = this.route.snapshot.queryParamMap.get('editId');
    if (editId) {
      const g = this.groups.find(g => g.id === editId);
      if (g) await this.openEdit(g);
    }
  }

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
    this.editing = { color: '#e879a0', is_trainee: false };
    this.editingStyles = [];
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
    this.editingStyles = g.style ? g.style.split(',') : [];
    this.isEdit = true;
    this.error = '';
    this.igFetchError = '';
    this.newVideoUrl = '';
    this.videoError = '';
    this.showModal = true;
    this.videos = await this.groupService.getVideosByGroup(g.id);
    this.loadCompanies();
  }

  toggleStyle(s: string) {
    const idx = this.editingStyles.indexOf(s);
    if (idx === -1) this.editingStyles = [...this.editingStyles, s];
    else this.editingStyles = this.editingStyles.filter(x => x !== s);
  }

  isStyleSelected(s: string): boolean {
    return this.editingStyles.includes(s);
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
    if (!this.editing.name?.trim()) { this.error = '團體名稱為必填'; return; }
    if (!this.isEditor) {
      this.editing.style = this.editingStyles.length > 0 ? this.editingStyles.join(',') : null;
    }
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
