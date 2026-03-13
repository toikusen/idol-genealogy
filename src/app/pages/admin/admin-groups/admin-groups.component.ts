import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { GroupService } from '../../../core/group.service';
import { AdminRoleService } from '../../../core/admin-role.service';
import { Group, GroupVideo } from '../../../models';

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

  // Videos
  videos: GroupVideo[] = [];
  newVideoUrl = '';
  newVideoTitle = '';
  videoError = '';
  savingVideo = false;

  constructor(
    private groupService: GroupService,
    private adminRole: AdminRoleService
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

  openCreate() {
    this.editing = { color: '#e879a0' };
    this.isEdit = false;
    this.error = '';
    this.videos = [];
    this.newVideoUrl = '';
    this.newVideoTitle = '';
    this.videoError = '';
    this.showModal = true;
  }

  async openEdit(g: Group) {
    this.editing = { ...g };
    this.isEdit = true;
    this.error = '';
    this.newVideoUrl = '';
    this.newVideoTitle = '';
    this.videoError = '';
    this.showModal = true;
    this.videos = await this.groupService.getVideosByGroup(g.id);
  }

  extractYouTubeId(url: string): string | null {
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  async addVideo() {
    this.videoError = '';
    if (!this.newVideoUrl.trim()) return;
    if (!this.extractYouTubeId(this.newVideoUrl)) {
      this.videoError = '請輸入有效的 YouTube 網址';
      return;
    }
    if (this.videos.length >= 3) {
      this.videoError = '最多只能新增 3 部影片';
      return;
    }
    this.savingVideo = true;
    try {
      await this.groupService.createVideo({
        group_id: this.editing.id!,
        url: this.newVideoUrl.trim(),
        title: this.newVideoTitle.trim() || null,
        sort_order: this.videos.length,
      });
      this.videos = await this.groupService.getVideosByGroup(this.editing.id!);
      this.newVideoUrl = '';
      this.newVideoTitle = '';
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
