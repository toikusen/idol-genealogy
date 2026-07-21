import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { GroupService } from '../../../core/group.service';
import { AdminRoleService } from '../../../core/admin-role.service';
import { CompanyService } from '../../../core/company.service';
import { IgPhotoService } from '../../../core/ig-photo.service';
import { ProposalService } from '../../../core/proposal.service';
import { Group, Company } from '../../../models';
import { PhotoUploadComponent } from '../../../shared/photo-upload/photo-upload.component';
import { normalizeSnsUrl } from '../../../core/sns-url.utils';

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
  private originalData: Record<string, any> = {};
  saveWarning = '';

  fetchingIg = false;
  igFetchError = '';

  companies: Company[] = [];

  // Style multi-select

  private readonly TIMETREE_URL_PREFIXES = [
    'https://timetreeapp.com/public_calendars/',
    'https://www.timetreeapp.com/public_calendars/',
    'https://timetr.ee/p/',
  ];

  constructor(
    private groupService: GroupService,
    private adminRole: AdminRoleService,
    private companyService: CompanyService,
    private igPhoto: IgPhotoService,
    private route: ActivatedRoute,
    private proposalService: ProposalService,
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
    this.originalData = {};
    this.isEdit = false;
    this.error = '';
    this.igFetchError = '';
    this.saveWarning = '';
    this.showModal = true;
    this.loadCompanies();
  }

  openEdit(g: Group) {
    this.editing = { ...g };
    this.originalData = { ...g };
    this.saveWarning = '';
    this.isEdit = true;
    this.error = '';
    this.igFetchError = '';
    this.showModal = true;
    this.loadCompanies();
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

  /**
   * Keeps `youtube_channel_id` in step with `youtube`, mutating `this.editing`
   * so both are written by the same update and can never disagree.
   *
   * Only calls the resolver when it has to — editing an unrelated field must not
   * trigger a YouTube fetch. Comparing normalized values means a cosmetic change
   * like `@Foo` → `youtube.com/@Foo` does not count as a channel change either.
   *
   * @returns false when the save must be abandoned.
   */
  private async syncYouTubeChannelId(): Promise<boolean> {
    const normalized = normalizeSnsUrl(this.editing.youtube, 'youtube');
    const previous = normalizeSnsUrl(this.originalData['youtube'], 'youtube');

    if (!normalized) {
      this.editing.youtube = null;
      this.editing.youtube_channel_id = null;
      return true;
    }

    const channelChanged = normalized !== previous;
    if (!channelChanged && this.editing.youtube_channel_id) {
      this.editing.youtube = normalized;
      return true;
    }

    try {
      const channelId = await this.groupService.resolveYouTubeChannelId(normalized);
      this.editing.youtube = normalized;
      this.editing.youtube_channel_id = channelId;
      return true;
    } catch {
      // Upstream is down. What that means depends on whether the channel moved.
      if (channelChanged) {
        // Writing the new URL beside the old ID would make the group page show
        // the *previous* channel's videos. Abandon the save instead.
        this.error = 'YouTube 暫時無法連線，頻道網址已變更但無法驗證,請稍後再試';
        return false;
      }
      // Same channel, we were only filling a missing ID. Saving the other fields
      // is safe; the null ID means a later save retries the resolution.
      this.editing.youtube = normalized;
      this.editing.youtube_channel_id = this.originalData['youtube_channel_id'] ?? null;
      this.saveWarning = 'YouTube 暫時無法連線，頻道 ID 未更新，下次儲存會再試';
      setTimeout(() => { this.saveWarning = ''; }, 6000);
      return true;
    }
  }

  async save() {
    if (!this.editing.name?.trim()) { this.error = '團體名稱為必填'; return; }
    if (this.editing.timetree_url?.trim()) {
      const timetreeUrl = this.editing.timetree_url.trim();
      if (!this.TIMETREE_URL_PREFIXES.some(prefix => timetreeUrl.startsWith(prefix))) {
        this.error = 'TimeTree 必須是 https://timetreeapp.com/public_calendars/ 或 https://timetr.ee/p/ 開頭的網址';
        return;
      }
      this.editing.timetree_url = timetreeUrl;
    } else if (this.editing.timetree_url === '') {
      this.editing.timetree_url = null;
    }
    if (this.editing.founded_at === '') this.editing.founded_at = null;
    if (this.editing.disbanded_at === '') this.editing.disbanded_at = null;
    if (this.editing.disbanded_announced_at === '') this.editing.disbanded_announced_at = null;
    if (this.editing.photo_status === ('' as any)) this.editing.photo_status = null;
    if (this.editing.video_status === ('' as any)) this.editing.video_status = null;
    if (this.editing.photo_notes === '') this.editing.photo_notes = null;
    if (this.editing.video_notes === '') this.editing.video_notes = null;
    if (this.editing.photography_source === '') this.editing.photography_source = null;
    this.saving = true;
    try {
      if (!await this.syncYouTubeChannelId()) return;
      if (this.isEdit && this.editing.id) {
        await this.groupService.update(this.editing.id, this.editing);
        await this.proposalService.recordDirectEdit('groups', this.editing.id, this.originalData, this.editing)
          .catch(e => { console.error('[EditHistory] Failed to record group edit:', e); this.saveWarning = '資料已儲存，但編輯紀錄寫入失敗'; setTimeout(() => { this.saveWarning = ''; }, 6000); });
      } else {
        const newId = await this.groupService.create(this.editing);
        await this.proposalService.recordDirectEdit('groups', newId, {}, this.editing, 'INSERT')
          .catch(e => { console.error('[EditHistory] Failed to record group create:', e); this.saveWarning = '資料已儲存，但編輯紀錄寫入失敗'; setTimeout(() => { this.saveWarning = ''; }, 6000); });
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

  trackById(_index: number, item: { id: string }): string {
    return item.id;
  }
}
