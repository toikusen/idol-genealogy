import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AdminGroupSong, GroupSongService } from '../../../core/group-song.service';
import { AdminMemberSong, MemberSongService } from '../../../core/member-song.service';
import { GroupService } from '../../../core/group.service';
import { MemberService } from '../../../core/member.service';
import { ProposalService } from '../../../core/proposal.service';
import { Group, Member } from '../../../models';

type SongKind = 'member' | 'group';

interface AdminSongRow {
  kind: SongKind;
  id: string;
  trackId: string;
  ownerId: string;
  ownerName: string;
  ownerSubname: string | null;
  ownerPhotoUrl: string | null;
  ownerColor: string | null;
  ownerInitial: string;
  ownerLink: string[];
  title: string;
  release_date: string | null;
  releaseDateLabel: string;
  youtube_url: string | null;
  composer: string | null;
  lyricist: string | null;
  arranger: string | null;
  choreographer: string | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  updatedAtLabel: string;
}

interface SongDraft {
  ownerId: string;
  title: string;
  release_date: string | null;
  youtube_url: string | null;
  composer: string | null;
  lyricist: string | null;
  arranger: string | null;
  choreographer: string | null;
  notes: string | null;
  sort_order: number | null;
}

interface OwnerOption {
  id: string;
  name: string;
  subname: string | null;
  photo_url: string | null;
  color: string | null;
  searchText: string;
}

@Component({
  selector: 'app-admin-songs',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-songs.component.html',
})
export class AdminSongsComponent implements OnInit {
  activeTab: SongKind = 'member';
  memberSongs: AdminMemberSong[] = [];
  groupSongs: AdminGroupSong[] = [];
  members: Member[] = [];
  groups: Group[] = [];
  memberRows: AdminSongRow[] = [];
  groupRows: AdminSongRow[] = [];
  displayedRows: AdminSongRow[] = [];
  memberOwnerOptions: OwnerOption[] = [];
  groupOwnerOptions: OwnerOption[] = [];
  displayedOwnerOptions: OwnerOption[] = [];
  displayedFormOwnerOptions: OwnerOption[] = [];
  activeCount = 0;

  loading = true;
  error = '';
  showModal = false;
  saving = false;
  formError = '';
  editingRow: AdminSongRow | null = null;
  draft: SongDraft = this.emptyDraft();

  private readonly collator = new Intl.Collator('zh-Hant');
  private memberMap = new Map<string, Member>();
  private groupMap = new Map<string, Group>();
  private _searchQuery = '';
  private _ownerFilterId = '';
  private _ownerOptionQuery = '';
  private _formOwnerOptionQuery = '';

  get searchQuery(): string { return this._searchQuery; }
  set searchQuery(value: string) {
    this._searchQuery = value;
    this.applyFilters();
  }

  get ownerFilterId(): string { return this._ownerFilterId; }
  set ownerFilterId(value: string) {
    this._ownerFilterId = value;
    this.applyFilters();
    this.updateDisplayedOwnerOptions();
    this.updateDisplayedFormOwnerOptions();
  }

  get ownerOptionQuery(): string { return this._ownerOptionQuery; }
  set ownerOptionQuery(value: string) {
    this._ownerOptionQuery = value;
    this.updateDisplayedOwnerOptions();
  }

  get formOwnerOptionQuery(): string { return this._formOwnerOptionQuery; }
  set formOwnerOptionQuery(value: string) {
    this._formOwnerOptionQuery = value;
    this.updateDisplayedFormOwnerOptions();
  }

  constructor(
    private memberSongService: MemberSongService,
    private groupSongService: GroupSongService,
    private memberService: MemberService,
    private groupService: GroupService,
    private proposalService: ProposalService,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadAll();
  }

  get tabTitle(): string {
    return this.activeTab === 'member' ? '成員原創曲' : '團體原創曲';
  }

  async loadAll(): Promise<void> {
    this.loading = true;
    this.error = '';
    try {
      const [memberSongs, groupSongs, members, groups] = await Promise.all([
        this.memberSongService.getAllForAdmin(),
        this.groupSongService.getAllForAdmin(),
        this.memberService.getAll(),
        this.groupService.getAll(),
      ]);
      this.memberSongs = memberSongs;
      this.groupSongs = groupSongs;
      this.members = members;
      this.groups = groups;
      this.rebuildReferenceCaches();
      this.rebuildSongRows();
      this.syncActiveTabState();
    } catch (e: any) {
      this.error = e.message ?? '載入原創曲資料失敗';
    } finally {
      this.loading = false;
    }
  }

  async reloadSongs(): Promise<void> {
    const [memberSongs, groupSongs] = await Promise.all([
      this.memberSongService.getAllForAdmin(),
      this.groupSongService.getAllForAdmin(),
    ]);
    this.memberSongs = memberSongs;
    this.groupSongs = groupSongs;
    this.rebuildSongRows();
    this.syncActiveTabState();
  }

  switchTab(tab: SongKind): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this._ownerFilterId = '';
    this._searchQuery = '';
    this._ownerOptionQuery = '';
    this._formOwnerOptionQuery = '';
    this.formError = '';
    this.syncActiveTabState();
  }

  async openCreate(): Promise<void> {
    this.editingRow = null;
    this.draft = this.emptyDraft();
    this.draft.ownerId = this.ownerFilterId;
    this.showModal = true;
    this.formError = '';
    this._formOwnerOptionQuery = '';
    this.updateDisplayedFormOwnerOptions();
    if (this.draft.ownerId) {
      await this.fillNextSortOrder(this.draft.ownerId);
    }
  }

  openEdit(row: AdminSongRow): void {
    this.editingRow = row;
    this.draft = {
      ownerId: row.ownerId,
      title: row.title,
      release_date: row.release_date,
      youtube_url: row.youtube_url,
      composer: row.composer,
      lyricist: row.lyricist,
      arranger: row.arranger,
      choreographer: row.choreographer,
      notes: row.notes,
      sort_order: row.sort_order,
    };
    this.showModal = true;
    this.formError = '';
    this._formOwnerOptionQuery = '';
    this.updateDisplayedFormOwnerOptions();
  }

  closeModal(): void {
    this.showModal = false;
    this.editingRow = null;
    this.draft = this.emptyDraft();
    this.formError = '';
    this._formOwnerOptionQuery = '';
    this.updateDisplayedFormOwnerOptions();
  }

  async onOwnerChange(ownerId: string): Promise<void> {
    this.updateDisplayedFormOwnerOptions();
    if (!ownerId || this.editingRow) return;
    await this.fillNextSortOrder(ownerId);
  }

  async save(): Promise<void> {
    const title = this.draft.title.trim();
    if (!this.draft.ownerId) { this.formError = `請選擇${this.activeTab === 'member' ? '成員' : '團體'}`; return; }
    if (!title) { this.formError = '歌曲名稱為必填'; return; }
    if (!this.draft.sort_order || this.draft.sort_order < 1) { this.formError = '第幾首單曲最小為 1'; return; }

    const youtubeUrl = this.clean(this.draft.youtube_url);
    if (youtubeUrl && !this.extractYouTubeId(youtubeUrl)) {
      this.formError = '請輸入有效的 YouTube 網址';
      return;
    }

    this.saving = true;
    this.formError = '';
    const payload = {
      title,
      release_date: this.draft.release_date || null,
      youtube_url: youtubeUrl,
      composer: this.clean(this.draft.composer),
      lyricist: this.clean(this.draft.lyricist),
      arranger: this.clean(this.draft.arranger),
      choreographer: this.clean(this.draft.choreographer),
      notes: this.clean(this.draft.notes),
      sort_order: Number(this.draft.sort_order),
    };

    try {
      const kind = this.editingRow?.kind ?? this.activeTab;
      if (this.editingRow) {
        const originalRow = this.editingRow;
        if (kind === 'member') {
          const updated = await this.memberSongService.update(originalRow.id, payload);
          this.memberSongs = this.memberSongs.map(song => song.id === updated.id ? updated : song);
          const original = { ...originalRow, member_id: originalRow.ownerId };
          await this.proposalService.recordDirectEdit('member_songs', originalRow.id, original, { ...original, ...payload }).catch(e => console.error('[EditHistory] recordDirectEdit failed:', e));
        } else {
          const updated = await this.groupSongService.update(originalRow.id, payload);
          this.groupSongs = this.groupSongs.map(song => song.id === updated.id ? updated : song);
          const original = { ...originalRow, group_id: originalRow.ownerId };
          await this.proposalService.recordDirectEdit('group_songs', originalRow.id, original, { ...original, ...payload }).catch(e => console.error('[EditHistory] recordDirectEdit failed:', e));
        }
      } else if (kind === 'member') {
        const created = await this.memberSongService.create({
          member_id: this.draft.ownerId,
          ...payload,
        });
        this.memberSongs = [created, ...this.memberSongs];
        await this.proposalService.recordDirectEdit('member_songs', created.id, {}, created, 'INSERT').catch(e => console.error('[EditHistory] recordDirectEdit failed:', e));
      } else {
        const created = await this.groupSongService.create({
          group_id: this.draft.ownerId,
          ...payload,
        });
        this.groupSongs = [created, ...this.groupSongs];
        await this.proposalService.recordDirectEdit('group_songs', created.id, {}, created, 'INSERT').catch(e => console.error('[EditHistory] recordDirectEdit failed:', e));
      }
      this.rebuildSongRows(kind);
      this.syncActiveTabState();
      this.closeModal();
    } catch (e: any) {
      this.formError = e.message ?? '儲存失敗';
    } finally {
      this.saving = false;
    }
  }

  async delete(row: AdminSongRow): Promise<void> {
    if (!confirm(`確定要刪除「${row.title}」嗎？`)) return;
    try {
      if (row.kind === 'member') {
        await this.memberSongService.delete(row.id);
        await this.proposalService.recordDirectEdit('member_songs', row.id, { ...row, member_id: row.ownerId }, {}, 'DELETE').catch(e => console.error('[EditHistory] recordDirectEdit failed:', e));
        this.memberSongs = this.memberSongs.filter(song => song.id !== row.id);
        this.rebuildSongRows('member');
      } else {
        await this.groupSongService.delete(row.id);
        await this.proposalService.recordDirectEdit('group_songs', row.id, { ...row, group_id: row.ownerId }, {}, 'DELETE').catch(e => console.error('[EditHistory] recordDirectEdit failed:', e));
        this.groupSongs = this.groupSongs.filter(song => song.id !== row.id);
        this.rebuildSongRows('group');
      }
      this.syncActiveTabState();
    } catch (e: any) {
      alert(e.message ?? '刪除失敗');
    }
  }

  extractYouTubeId(url: string | null): string | null {
    if (!url) return null;
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  trackRow(_index: number, row: AdminSongRow): string {
    return row.trackId;
  }

  trackOwner(_index: number, owner: OwnerOption): string {
    return owner.id;
  }

  private applyFilters(): void {
    const rows = this.activeTab === 'member' ? this.memberRows : this.groupRows;
    const q = this._searchQuery.trim().toLowerCase();
    this.displayedRows = rows.filter(row => {
      if (this._ownerFilterId && row.ownerId !== this._ownerFilterId) return false;
      if (!q) return true;
      return [
        row.title,
        row.ownerName,
        row.ownerSubname,
        row.composer,
        row.lyricist,
        row.arranger,
        row.choreographer,
        row.notes,
      ].some(value => (value ?? '').toLowerCase().includes(q));
    });
  }

  private syncActiveTabState(): void {
    this.activeCount = this.activeTab === 'member'
      ? this.memberRows.length
      : this.groupRows.length;
    this.updateDisplayedOwnerOptions();
    this.updateDisplayedFormOwnerOptions();
    this.applyFilters();
  }

  private updateDisplayedOwnerOptions(): void {
    this.displayedOwnerOptions = this.filterOwnerOptions(
      this.currentOwnerOptions(),
      this._ownerOptionQuery,
      this._ownerFilterId,
    );
  }

  private updateDisplayedFormOwnerOptions(): void {
    this.displayedFormOwnerOptions = this.filterOwnerOptions(
      this.currentOwnerOptions(),
      this._formOwnerOptionQuery,
      this.draft.ownerId,
    );
  }

  private rebuildReferenceCaches(): void {
    this.memberMap = new Map(this.members.map(member => [member.id, member]));
    this.groupMap = new Map(this.groups.map(group => [group.id, group]));
    this.memberOwnerOptions = this.members
      .map(member => ({
        id: member.id,
        name: member.name,
        subname: member.name_roman,
        photo_url: member.photo_url,
        color: member.color,
        searchText: this.ownerSearchText(member.name, member.name_roman),
      }))
      .sort((a, b) => this.collator.compare(a.name, b.name));
    this.groupOwnerOptions = this.groups
      .map(group => ({
        id: group.id,
        name: group.name,
        subname: group.name_jp,
        photo_url: group.photo_url,
        color: group.color,
        searchText: this.ownerSearchText(group.name, group.name_jp),
      }))
      .sort((a, b) => this.collator.compare(a.name, b.name));
  }

  private rebuildSongRows(kind?: SongKind): void {
    if (!kind || kind === 'member') {
      this.memberRows = this.memberSongs
        .map(song => this.toMemberRow(song))
        .sort((a, b) => this.compareRowsByOwner(a, b));
    }
    if (!kind || kind === 'group') {
      this.groupRows = this.groupSongs
        .map(song => this.toGroupRow(song))
        .sort((a, b) => this.compareRowsByOwner(a, b));
    }
  }

  private async fillNextSortOrder(ownerId: string): Promise<void> {
    try {
      this.draft.sort_order = this.activeTab === 'member'
        ? await this.memberSongService.getNextSortOrder(ownerId)
        : await this.groupSongService.getNextSortOrder(ownerId);
    } catch {
      this.draft.sort_order = 1;
    }
  }

  private toMemberRow(song: AdminMemberSong): AdminSongRow {
    const member = song.member ?? this.memberMap.get(song.member_id) ?? null;
    const ownerName = member?.name ?? '未連結成員';
    return {
      kind: 'member',
      id: song.id,
      trackId: `member:${song.id}`,
      ownerId: song.member_id,
      ownerName,
      ownerSubname: member?.name_roman ?? null,
      ownerPhotoUrl: member?.photo_url ?? null,
      ownerColor: null,
      ownerInitial: ownerName.charAt(0).toUpperCase(),
      ownerLink: ['/member', song.member_id],
      title: song.title,
      release_date: song.release_date,
      releaseDateLabel: this.formatDate(song.release_date),
      youtube_url: song.youtube_url,
      composer: song.composer,
      lyricist: song.lyricist,
      arranger: song.arranger,
      choreographer: song.choreographer,
      notes: song.notes,
      sort_order: song.sort_order,
      created_at: song.created_at,
      updated_at: song.updated_at,
      updatedAtLabel: this.formatUpdatedAt(song.updated_at),
    };
  }

  private toGroupRow(song: AdminGroupSong): AdminSongRow {
    const group = song.group ?? this.groupMap.get(song.group_id) ?? null;
    const ownerName = group?.name ?? '未連結團體';
    return {
      kind: 'group',
      id: song.id,
      trackId: `group:${song.id}`,
      ownerId: song.group_id,
      ownerName,
      ownerSubname: null,
      ownerPhotoUrl: group?.photo_url ?? null,
      ownerColor: group?.color ?? null,
      ownerInitial: ownerName.charAt(0).toUpperCase(),
      ownerLink: ['/group', song.group_id],
      title: song.title,
      release_date: song.release_date,
      releaseDateLabel: this.formatDate(song.release_date),
      youtube_url: song.youtube_url,
      composer: song.composer,
      lyricist: song.lyricist,
      arranger: song.arranger,
      choreographer: song.choreographer,
      notes: song.notes,
      sort_order: song.sort_order,
      created_at: song.created_at,
      updated_at: song.updated_at,
      updatedAtLabel: this.formatUpdatedAt(song.updated_at),
    };
  }

  private formatDate(date: string | null): string {
    if (!date) return '—';
    return date.slice(0, 10).replaceAll('-', '.');
  }

  private formatUpdatedAt(date: string): string {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  private compareRowsByOwner(a: AdminSongRow, b: AdminSongRow): number {
    const owner = this.collator.compare(a.ownerName, b.ownerName);
    if (owner !== 0) return owner;

    const order = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (order !== 0) return order;

    const release = (a.release_date ?? '').localeCompare(b.release_date ?? '');
    if (release !== 0) return release;

    return this.collator.compare(a.title, b.title);
  }

  private currentOwnerOptions(): OwnerOption[] {
    return this.activeTab === 'member' ? this.memberOwnerOptions : this.groupOwnerOptions;
  }

  private filterOwnerOptions(options: OwnerOption[], query: string, selectedId: string): OwnerOption[] {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? options.filter(owner => owner.searchText.includes(q))
      : options;
    if (!selectedId || filtered.some(owner => owner.id === selectedId)) {
      return filtered;
    }
    const selected = options.find(owner => owner.id === selectedId);
    return selected ? [selected, ...filtered] : filtered;
  }

  private ownerSearchText(name: string | null | undefined, subname: string | null | undefined): string {
    return [name, subname].filter(Boolean).join(' ').toLowerCase();
  }

  private clean(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private emptyDraft(): SongDraft {
    return {
      ownerId: '',
      title: '',
      release_date: null,
      youtube_url: null,
      composer: null,
      lyricist: null,
      arranger: null,
      choreographer: null,
      notes: null,
      sort_order: 1,
    };
  }
}
