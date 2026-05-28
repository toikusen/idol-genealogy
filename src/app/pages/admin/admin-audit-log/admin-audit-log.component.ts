import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuditLogService, AuditLogFilter, AuditLogCursor } from '../../../core/audit-log.service';
import { AdminRoleService } from '../../../core/admin-role.service';
import { MemberService } from '../../../core/member.service';
import { GroupService } from '../../../core/group.service';
import { CompanyService } from '../../../core/company.service';
import { FIELD_LABELS } from '../../../core/proposal-fields.config';
import { AuditLog, Company, Group, Member, Team } from '../../../models';
import { PhotoUploadComponent } from '../../../shared/photo-upload/photo-upload.component';
import { SupabaseImgPipe } from '../../../shared/supabase-img.pipe';

export interface AutocompleteItem {
  type: 'member' | 'group';
  id: string;
  name: string;
  photo_url?: string | null;
}

export function toUtcRangeStart(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toISOString();
}

export function toUtcRangeEnd(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

type AuditEditFieldType = 'text' | 'textarea' | 'date' | 'url' | 'number' | 'select' | 'checkbox';

interface AuditEditField {
  key: string;
  type: AuditEditFieldType;
  required?: boolean;
  placeholder?: string;
}

interface AuditEditOption {
  value: any;
  label: string;
}

interface AuditDiff {
  field: string;
  label: string;
  before: string;
  after: string;
  beforeValue: any;
  afterValue: any;
}

@Component({
  selector: 'app-admin-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule, PhotoUploadComponent, SupabaseImgPipe],
  templateUrl: './admin-audit-log.component.html',
})
export class AdminAuditLogComponent implements OnInit {
  logs: AuditLog[] = [];
  hasMore = false;
  loading = true;
  error = '';
  filterTable = '';
  filterOperation = '';

  // Autocomplete
  autocompleteQuery = '';
  autocompleteResults: AutocompleteItem[] = [];
  showAutocomplete = false;
  selectedMemberId: string | null = null;
  selectedGroupId: string | null = null;

  // Date filter (local date strings)
  dateFrom = '';
  dateTo = '';

  // Pagination
  currentCursor: AuditLogCursor | null = null;
  cursorStack: (AuditLogCursor | null)[] = [];
  currentUserEmail = '';
  isEditorOnly = false;
  expandedId: string | null = null;
  revertError: { [id: string]: string } = {};
  revertSuccess: { [id: string]: boolean } = {};
  reverting: { [id: string]: boolean } = {};
  showConfirm: string | null = null;
  editLog: AuditLog | null = null;
  editForm: Record<string, any> = {};
  private editOriginal: Record<string, any> = {};
  editLoading = false;
  editSaving = false;
  editError = '';
  editSuccess: { [id: string]: boolean } = {};
  showAllEditFields = false;
  editTeams: Team[] = [];

  tableOptions = ['members', 'groups', 'history', 'companies', 'member_songs', 'group_songs', 'venues'];
  operationOptions = ['INSERT', 'UPDATE', 'DELETE'];

  members: Member[] = [];
  groups: Group[] = [];
  companies: Company[] = [];

  private userNameMap = new Map<string, string>();
  private memberMap = new Map<string, string>();
  private groupMap = new Map<string, string>();
  private companyMap = new Map<string, string>();

  private readonly editFields: Record<string, AuditEditField[]> = {
    members: [
      { key: 'name', type: 'text', required: true },
      { key: 'name_hiragana', type: 'text' },
      { key: 'name_roman', type: 'text' },
      { key: 'emoji', type: 'text' },
      { key: 'nickname', type: 'text' },
      { key: 'birthdate', type: 'text', placeholder: 'MM-DD' },
      { key: 'color', type: 'text', placeholder: '#e879a0' },
      { key: 'color_name', type: 'text' },
      { key: 'photo_url', type: 'url' },
      { key: 'instagram', type: 'url' },
      { key: 'facebook', type: 'url' },
      { key: 'x', type: 'url' },
      { key: 'maid_url', type: 'url' },
      { key: 'company_id', type: 'select' },
      { key: 'no_sns', type: 'checkbox' },
      { key: 'notes', type: 'textarea' },
    ],
    groups: [
      { key: 'name', type: 'text', required: true },
      { key: 'name_jp', type: 'text' },
      { key: 'photo_url', type: 'url' },
      { key: 'company_id', type: 'select' },
      { key: 'company', type: 'text' },
      { key: 'color', type: 'text', placeholder: '#7c6cf2' },
      { key: 'founded_at', type: 'date' },
      { key: 'disbanded_at', type: 'date' },
      { key: 'instagram', type: 'url' },
      { key: 'facebook', type: 'url' },
      { key: 'x', type: 'url' },
      { key: 'youtube', type: 'url' },
      { key: 'is_trainee', type: 'checkbox' },
      { key: 'style', type: 'text' },
      { key: 'notes', type: 'textarea' },
    ],
    history: [
      { key: 'member_id', type: 'select', required: true },
      { key: 'group_id', type: 'select' },
      { key: 'team_id', type: 'select' },
      { key: 'external_group_name', type: 'text' },
      { key: 'external_country', type: 'text' },
      { key: 'name_at_time', type: 'text' },
      { key: 'role', type: 'text' },
      { key: 'status', type: 'select', required: true },
      { key: 'joined_at', type: 'date', required: true },
      { key: 'left_at', type: 'date' },
      { key: 'notes', type: 'textarea' },
    ],
    companies: [
      { key: 'name', type: 'text', required: true },
      { key: 'photo_url', type: 'url' },
      { key: 'color', type: 'text', placeholder: '#7c6cf2' },
      { key: 'description', type: 'textarea' },
      { key: 'website', type: 'url' },
      { key: 'instagram', type: 'url' },
      { key: 'facebook', type: 'url' },
      { key: 'x', type: 'url' },
      { key: 'youtube', type: 'url' },
      { key: 'founded_at', type: 'date' },
    ],
    member_songs: [
      { key: 'title', type: 'text', required: true },
      { key: 'release_date', type: 'date' },
      { key: 'youtube_url', type: 'url' },
      { key: 'composer', type: 'text' },
      { key: 'lyricist', type: 'text' },
      { key: 'arranger', type: 'text' },
      { key: 'sort_order', type: 'number' },
      { key: 'notes', type: 'textarea' },
    ],
    group_songs: [
      { key: 'title', type: 'text', required: true },
      { key: 'release_date', type: 'date' },
      { key: 'youtube_url', type: 'url' },
      { key: 'composer', type: 'text' },
      { key: 'lyricist', type: 'text' },
      { key: 'arranger', type: 'text' },
      { key: 'sort_order', type: 'number' },
      { key: 'notes', type: 'textarea' },
    ],
    venues: [
      { key: 'name', type: 'text', required: true },
      { key: 'address', type: 'text' },
      { key: 'type', type: 'text' },
      { key: 'region', type: 'select', required: true },
      { key: 'google_maps_url', type: 'url' },
      { key: 'phone', type: 'text' },
      { key: 'latitude', type: 'number' },
      { key: 'longitude', type: 'number' },
      { key: 'is_active', type: 'checkbox' },
      { key: 'notes', type: 'textarea' },
    ],
  };

  private readonly extraFieldLabels: Record<string, Record<string, string>> = {
    members: {
      company_id: '所屬公司',
      no_sns: '確認無社群帳號',
      notes: '備注',
    },
    groups: {
      company: '自定義公司名稱',
      is_trainee: '研修・見習',
      style: '風格',
      notes: '備注',
    },
    history: {
      team_id: '隊伍',
      role: '角色 / 職位',
      notes: '備注',
    },
    member_songs: {
      title: '曲名',
      release_date: '發行日期',
      youtube_url: 'YouTube',
      composer: '作曲',
      lyricist: '作詞',
      arranger: '編曲',
      sort_order: '排序',
      notes: '備注',
    },
    group_songs: {
      title: '曲名',
      release_date: '發行日期',
      youtube_url: 'YouTube',
      composer: '作曲',
      lyricist: '作詞',
      arranger: '編曲',
      sort_order: '排序',
      notes: '備注',
    },
    venues: {
      name: '場地名稱',
      address: '地址',
      type: '類型',
      region: '區域',
      google_maps_url: 'Google Maps',
      phone: '電話',
      latitude: '緯度',
      longitude: '經度',
      is_active: '啟用',
      notes: '備注',
    },
  };

  readonly historyStatusOptions: AuditEditOption[] = [
    { value: 'active', label: '正常在籍' },
    { value: 'concurrent', label: '兼任' },
    { value: 'support', label: '支援' },
    { value: 'hiatus', label: '活休' },
    { value: 'transferred', label: '移籍' },
    { value: 'graduated', label: '畢業' },
  ];

  constructor(
    private auditLog: AuditLogService,
    private adminRole: AdminRoleService,
    private memberService: MemberService,
    private groupService: GroupService,
    private companyService: CompanyService,
  ) {}

  async ngOnInit() {
    const role = await this.adminRole.getCurrentRole();
    this.currentUserEmail = role?.email ?? '';
    this.isEditorOnly = role?.role === 'editor';

    await this.loadLookupData();
    await this.load();
  }

  private async loadLookupData() {
    const [roles, members, groups, companies] = await Promise.all([
      this.adminRole.getAll().catch(() => []),
      this.memberService.getAll().catch(() => []),
      this.groupService.getAll().catch(() => []),
      this.companyService.getAll().catch(() => []),
    ]);
    this.members = members;
    this.groups = groups;
    this.companies = companies;
    this.userNameMap.clear();
    this.memberMap.clear();
    this.groupMap.clear();
    this.companyMap.clear();
    for (const r of roles) {
      if (r.display_name) this.userNameMap.set(r.email, r.display_name);
    }
    for (const m of members) {
      this.memberMap.set(m.id, m.name ?? m.name_roman ?? m.id);
    }
    for (const g of groups) {
      this.groupMap.set(g.id, g.name_jp ?? g.name ?? g.id);
    }
    for (const c of companies) {
      this.companyMap.set(c.id, c.name ?? c.id);
    }
  }

  get canGoNewer(): boolean {
    return this.cursorStack.length > 0;
  }

  get displayCount(): string {
    const n = this.displayLogs.length;
    return this.hasMore ? `顯示 ${n} 筆（還有更多）` : `顯示 ${n} 筆`;
  }

  async goOlder(): Promise<void> {
    const last = this.logs[this.logs.length - 1];
    if (!last) return;
    this.cursorStack.push(this.currentCursor);
    this.currentCursor = { created_at: last.created_at, id: last.id };
    await this.load();
  }

  async goNewer(): Promise<void> {
    this.currentCursor = this.cursorStack.pop() ?? null;
    await this.load();
  }

  resetPagination(): void {
    this.cursorStack = [];
    this.currentCursor = null;
  }

  computeAutocompleteResults(): AutocompleteItem[] {
    const q = this.autocompleteQuery.trim().toLowerCase();
    if (!q) return [];
    const memberResults: AutocompleteItem[] = this.members
      .filter(m =>
        (m.name ?? '').toLowerCase().includes(q) ||
        (m.name_roman ?? '').toLowerCase().includes(q)
      )
      .slice(0, 5)
      .map(m => ({ type: 'member' as const, id: m.id, name: m.name ?? m.name_roman ?? m.id, photo_url: m.photo_url }));

    const groupResults: AutocompleteItem[] = this.groups
      .filter(g =>
        g.name.toLowerCase().includes(q) ||
        (g.name_jp ?? '').toLowerCase().includes(q)
      )
      .slice(0, 5)
      .map(g => ({ type: 'group' as const, id: g.id, name: g.name_jp ?? g.name, photo_url: g.photo_url }));

    return [...memberResults, ...groupResults];
  }

  onAutocompleteInput(): void {
    this.autocompleteResults = this.computeAutocompleteResults();
    this.showAutocomplete = this.autocompleteResults.length > 0;
  }

  onAutocompleteBlur(): void {
    setTimeout(() => { this.showAutocomplete = false; }, 150);
  }

  async selectAutocomplete(item: AutocompleteItem): Promise<void> {
    this.autocompleteQuery = item.name;
    this.showAutocomplete = false;
    this.selectedMemberId = item.type === 'member' ? item.id : null;
    this.selectedGroupId  = item.type === 'group'  ? item.id : null;
    this.resetPagination();
    await this.load();
  }

  async clearAutocomplete(): Promise<void> {
    this.autocompleteQuery = '';
    this.autocompleteResults = [];
    this.showAutocomplete = false;
    this.selectedMemberId = null;
    this.selectedGroupId  = null;
    this.resetPagination();
    await this.load();
  }

  async onFilterChange(): Promise<void> {
    this.resetPagination();
    await this.load();
  }

  async clearDateFilter(): Promise<void> {
    if (!this.dateFrom && !this.dateTo) return;
    this.dateFrom = '';
    this.dateTo   = '';
    this.resetPagination();
    await this.load();
  }

  get autocompleteMembers(): AutocompleteItem[] {
    return this.autocompleteResults.filter(r => r.type === 'member');
  }

  get autocompleteGroups(): AutocompleteItem[] {
    return this.autocompleteResults.filter(r => r.type === 'group');
  }

  async load() {
    this.loading = true;
    this.error = '';
    try {
      const filter: AuditLogFilter = {};
      if (this.filterTable)       filter.table_name = this.filterTable;
      if (this.filterOperation)   filter.operation  = this.filterOperation;
      if (this.selectedMemberId)  filter.member_id  = this.selectedMemberId;
      if (this.selectedGroupId)   filter.group_id   = this.selectedGroupId;
      if (this.dateFrom)          filter.date_from  = toUtcRangeStart(this.dateFrom);
      if (this.dateTo)            filter.date_to    = toUtcRangeEnd(this.dateTo);
      if (this.currentCursor)     filter.cursor     = this.currentCursor;

      const { data, hasMore } = await this.auditLog.getAll(filter);
      this.logs = data;
      this.hasMore = hasMore;
    } catch (e: any) {
      this.error = e.message || '載入失敗';
    } finally {
      this.loading = false;
    }
  }

  toggleExpand(id: string) {
    this.expandedId = this.expandedId === id ? null : id;
  }

  private readonly systemFieldLabels: Record<string, string> = {
    updated_at: '更新時間',
    created_at: '建立時間',
    is_approved: '已審核',
  };

  private getFieldLabel(tableName: string, field: string): string {
    return FIELD_LABELS[tableName]?.[field]
      ?? this.extraFieldLabels[tableName]?.[field]
      ?? this.systemFieldLabels[field]
      ?? field;
  }

  getHistoryGroupLabel(log: AuditLog): string | null {
    if (log.table_name !== 'history') return null;
    const src = log.new_data ?? log.old_data ?? {};
    if (src['group_id']) return this.groupMap.get(src['group_id']) ?? src['group_id'];
    if (src['external_group_name']) return src['external_group_name'];
    return null;
  }

  private static readonly SYSTEM_FIELDS = new Set(['updated_at', 'created_at']);

  /** Returns true for UPDATE entries where only auto-managed timestamps differ.
   *  These come from touch_member_updated_at() and carry no content change. */
  private isTimestampOnlyChange(log: AuditLog): boolean {
    if (log.operation !== 'UPDATE') return false;
    const diffs = this.getDiff(log);
    return diffs.length === 0 || diffs.every(d => AdminAuditLogComponent.SYSTEM_FIELDS.has(d.field));
  }

  get displayLogs(): AuditLog[] {
    return this.logs.filter(log => !this.isTimestampOnlyChange(log));
  }

  getDiff(log: AuditLog): AuditDiff[] {
    if (!log.old_data && !log.new_data) return [];
    const fields = new Set([
      ...Object.keys(log.old_data ?? {}),
      ...Object.keys(log.new_data ?? {})
    ]);
    const diffs: AuditDiff[] = [];
    for (const f of fields) {
      const before = log.old_data?.[f] ?? null;
      const after = log.new_data?.[f] ?? null;
      if (JSON.stringify(before) !== JSON.stringify(after)) {
        diffs.push({
          field: f,
          label: this.getFieldLabel(log.table_name, f),
          before: this.resolveValue(f, before),
          after: this.resolveValue(f, after),
          beforeValue: before,
          afterValue: after,
        });
      }
    }
    diffs.sort((a, b) => {
      const aSystem = AdminAuditLogComponent.SYSTEM_FIELDS.has(a.field) ? 1 : 0;
      const bSystem = AdminAuditLogComponent.SYSTEM_FIELDS.has(b.field) ? 1 : 0;
      return aSystem - bSystem;
    });
    return diffs;
  }

  getRecordLabel(log: AuditLog): string {
    const src = log.new_data ?? log.old_data ?? {};
    switch (log.table_name) {
      case 'members':
        return this.memberMap.get(log.record_id)
          ?? src['name'] ?? src['name_roman'] ?? '—';
      case 'groups':
        return this.groupMap.get(log.record_id)
          ?? src['name_jp'] ?? src['name'] ?? '—';
      case 'companies':
        return this.companyMap.get(log.record_id)
          ?? src['name'] ?? '—';
      case 'history': {
        const member = src['member_id']
          ? (this.memberMap.get(src['member_id']) ?? src['name_at_time'] ?? src['member_id'])
          : null;
        const group = src['group_id']
          ? (this.groupMap.get(src['group_id']) ?? src['group_id'])
          : (src['external_group_name'] ?? null);
        if (member && group) return `${group} · ${member}`;
        return member ?? group ?? '—';
      }
      case 'member_songs': {
        const title = src['title'] ?? null;
        const owner = src['member_id'] ? (this.memberMap.get(src['member_id']) ?? null) : null;
        if (title && owner) return `${title}（${owner}）`;
        return title ?? owner ?? '—';
      }
      case 'group_songs': {
        const title = src['title'] ?? null;
        const owner = src['group_id'] ? (this.groupMap.get(src['group_id']) ?? null) : null;
        if (title && owner) return `${title}（${owner}）`;
        return title ?? owner ?? '—';
      }
      case 'venues':
        return src['name'] ?? '—';
      default:
        return '—';
    }
  }

  resolveValue(field: string, value: any): string {
    if (value == null) return '—';
    if (field === 'member_id') return this.memberMap.get(value) ?? value;
    if (field === 'group_id') return this.groupMap.get(value) ?? value;
    if (field === 'company_id') return this.companyMap.get(value) ?? value;
    if (field === 'region') return ({ north: '北部', central: '中部', south: '南部' } as any)[value] ?? value;
    if (field.endsWith('_at') && typeof value === 'string') return this.formatLocalTime(value);
    return String(value);
  }

  private formatLocalTime(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  tableLabel(t: string): string {
    return {
      members: '成員', groups: '團體', history: '歷程', companies: '公司',
      member_songs: '成員原創曲', group_songs: '團體原創曲', venues: '場地',
    }[t] ?? t;
  }

  confirmRevert(id: string) {
    this.showConfirm = id;
  }

  cancelRevert() {
    this.showConfirm = null;
  }

  async executeRevert(log: AuditLog) {
    this.showConfirm = null;
    this.reverting[log.id] = true;
    this.revertError[log.id] = '';
    this.revertSuccess[log.id] = false;
    try {
      await this.auditLog.revert(log);
      this.revertSuccess[log.id] = true;
      setTimeout(() => { this.revertSuccess[log.id] = false; }, 3000);
      await this.load();
    } catch (e: any) {
      this.revertError[log.id] = e.message || '還原失敗';
    } finally {
      this.reverting[log.id] = false;
    }
  }

  getOperatorName(log: AuditLog): string {
    if (!log.user_email) return '—';
    return this.userNameMap.get(log.user_email) ?? log.user_email;
  }

  operationLabel(op: string): string {
    return { INSERT: '新增', UPDATE: '編輯', DELETE: '刪除' }[op] ?? op;
  }

  operationClass(op: string): string {
    return {
      INSERT: 'bg-green-100 text-green-700',
      UPDATE: 'bg-blue-100 text-blue-700',
      DELETE: 'bg-red-100 text-red-700'
    }[op] ?? 'bg-gray-100 text-gray-600';
  }

  canEditRecord(log: AuditLog): boolean {
    return log.operation !== 'DELETE' && !!this.editFields[log.table_name];
  }

  isPhotoField(field: string): boolean {
    return field === 'photo_url';
  }

  photoUploadFolder(tableName: string): 'members' | 'groups' | 'companies' {
    if (tableName === 'groups') return 'groups';
    if (tableName === 'companies') return 'companies';
    return 'members';
  }

  async openEditRecord(log: AuditLog): Promise<void> {
    this.editLog = log;
    this.editForm = {};
    this.editOriginal = {};
    this.editError = '';
    this.editLoading = true;
    this.editSaving = false;
    this.showAllEditFields = false;
    this.editTeams = [];
    try {
      const currentRecord = await this.auditLog.getRecord(log.table_name, log.record_id);
      if (!currentRecord) {
        throw new Error('找不到目前資料，可能已被刪除或還原');
      }
      const prepared = this.prepareEditForm(log.table_name, currentRecord);
      this.editOriginal = { ...prepared };
      this.editForm = { ...prepared };
      if (log.table_name === 'history') {
        await this.loadEditTeams(this.editForm['group_id']);
      }
    } catch (e: any) {
      this.editError = e.message || '讀取資料失敗';
    } finally {
      this.editLoading = false;
    }
  }

  closeEditRecord(force = false): void {
    if (this.editSaving && !force) return;
    this.editLog = null;
    this.editForm = {};
    this.editOriginal = {};
    this.editError = '';
    this.editTeams = [];
  }

  get visibleEditFields(): AuditEditField[] {
    if (!this.editLog) return [];
    const fields = this.getEditFields(this.editLog.table_name);
    if (this.showAllEditFields) return fields;
    const changed = this.getChangedFieldSet(this.editLog);
    const changedFields = fields.filter(f => changed.has(f.key));
    return changedFields.length > 0 ? changedFields : fields;
  }

  get hasHiddenEditFields(): boolean {
    if (!this.editLog || this.showAllEditFields) return false;
    return this.visibleEditFields.length < this.getEditFields(this.editLog.table_name).length;
  }

  editFieldLabel(field: AuditEditField): string {
    return this.editLog ? this.getFieldLabel(this.editLog.table_name, field.key) : field.key;
  }

  editFieldOptions(field: AuditEditField): AuditEditOption[] {
    switch (field.key) {
      case 'member_id':
        return this.members.map(m => ({ value: m.id, label: m.name || m.name_roman || m.id }));
      case 'group_id':
        return [
          { value: null, label: '— 無 —' },
          ...this.groups.map(g => ({ value: g.id, label: g.name_jp || g.name || g.id })),
        ];
      case 'team_id':
        return [
          { value: null, label: '— 不指定 —' },
          ...this.editTeams.map(t => ({ value: t.id, label: t.name })),
        ];
      case 'company_id':
        return [
          { value: null, label: '— 無 —' },
          ...this.companies.map(c => ({ value: c.id, label: c.name || c.id })),
        ];
      case 'status':
        return this.historyStatusOptions;
      case 'region':
        return [
          { value: 'north', label: '北部' },
          { value: 'central', label: '中部' },
          { value: 'south', label: '南部' },
        ];
      default:
        return [];
    }
  }

  async onEditFieldChange(fieldKey: string): Promise<void> {
    if (this.editLog?.table_name !== 'history' || fieldKey !== 'group_id') return;
    await this.loadEditTeams(this.editForm['group_id']);
    if (!this.editTeams.some(t => t.id === this.editForm['team_id'])) {
      this.editForm['team_id'] = null;
    }
  }

  async saveEditRecord(): Promise<void> {
    if (!this.editLog) return;
    this.editError = '';
    const validationError = this.validateEditForm();
    if (validationError) {
      this.editError = validationError;
      return;
    }
    const payload = this.buildEditPayload();
    if (Object.keys(payload).length === 0) {
      this.editError = '沒有變更內容';
      return;
    }

    this.editSaving = true;
    try {
      const logId = this.editLog.id;
      await this.auditLog.updateRecord(this.editLog.table_name, this.editLog.record_id, payload);
      this.invalidateLookupCache(this.editLog.table_name);
      this.editSuccess[logId] = true;
      setTimeout(() => { this.editSuccess[logId] = false; }, 3000);
      this.closeEditRecord(true);
      await this.loadLookupData();
      await this.load();
    } catch (e: any) {
      this.editError = e.message || '儲存失敗';
    } finally {
      this.editSaving = false;
    }
  }

  private getEditFields(tableName: string): AuditEditField[] {
    return this.editFields[tableName] ?? [];
  }

  private prepareEditForm(tableName: string, record: Record<string, any>): Record<string, any> {
    const form: Record<string, any> = {};
    for (const field of this.getEditFields(tableName)) {
      const value = record[field.key];
      form[field.key] = field.type === 'checkbox' ? !!value : (value ?? '');
    }
    return form;
  }

  private getChangedFieldSet(log: AuditLog): Set<string> {
    const fields = new Set([
      ...Object.keys(log.old_data ?? {}),
      ...Object.keys(log.new_data ?? {}),
    ]);
    for (const field of [...fields]) {
      const before = log.old_data?.[field] ?? null;
      const after = log.new_data?.[field] ?? null;
      if (JSON.stringify(before) === JSON.stringify(after)) fields.delete(field);
    }
    return fields;
  }

  private buildEditPayload(): Record<string, any> {
    if (!this.editLog) return {};
    const payload: Record<string, any> = {};
    for (const field of this.getEditFields(this.editLog.table_name)) {
      const next = this.normalizeEditValue(field, this.editForm[field.key]);
      const prev = this.normalizeEditValue(field, this.editOriginal[field.key]);
      if (JSON.stringify(next) !== JSON.stringify(prev)) {
        payload[field.key] = next;
      }
    }
    if (this.editLog.table_name === 'history') {
      this.applyHistoryGroupConsistency(payload);
    }
    return payload;
  }

  private validateEditForm(): string {
    if (!this.editLog) return '';
    for (const field of this.getEditFields(this.editLog.table_name)) {
      if (!field.required) continue;
      const value = this.normalizeEditValue(field, this.editForm[field.key]);
      if (value == null || value === '') {
        return `${this.getFieldLabel(this.editLog.table_name, field.key)}為必填`;
      }
    }
    if (this.editLog.table_name === 'history') {
      const groupId = this.normalizeEditValue({ key: 'group_id', type: 'select' }, this.editForm['group_id']);
      const externalGroupName = this.normalizeEditValue(
        { key: 'external_group_name', type: 'text' },
        this.editForm['external_group_name']
      );
      if (!groupId && !externalGroupName) {
        return '請選擇團體，或填寫海外團體/solo名稱';
      }
    }
    return '';
  }

  private normalizeEditValue(field: AuditEditField, value: any): any {
    if (field.type === 'checkbox') return !!value;
    if (field.type === 'number') {
      if (value == null || value === '') return null;
      const n = Number(value);
      return Number.isFinite(n) ? n : value;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed === '' ? null : trimmed;
    }
    return value ?? null;
  }

  private applyHistoryGroupConsistency(payload: Record<string, any>): void {
    const groupId = this.normalizeEditValue({ key: 'group_id', type: 'select' }, this.editForm['group_id']);
    const externalGroupName = this.normalizeEditValue(
      { key: 'external_group_name', type: 'text' },
      this.editForm['external_group_name']
    );
    if (groupId) {
      this.addPayloadIfChanged(payload, 'external_group_name', null);
      this.addPayloadIfChanged(payload, 'external_country', null);
    } else if (externalGroupName) {
      this.addPayloadIfChanged(payload, 'group_id', null);
      this.addPayloadIfChanged(payload, 'team_id', null);
    }
  }

  private addPayloadIfChanged(payload: Record<string, any>, fieldKey: string, next: any): void {
    const field = this.editLog
      ? this.getEditFields(this.editLog.table_name).find(f => f.key === fieldKey)
      : null;
    if (!field) return;
    const prev = this.normalizeEditValue(field, this.editOriginal[fieldKey]);
    if (JSON.stringify(next) !== JSON.stringify(prev)) {
      payload[fieldKey] = next;
    }
  }

  private async loadEditTeams(groupId: string | null): Promise<void> {
    if (!groupId) {
      this.editTeams = [];
      return;
    }
    this.editTeams = await this.groupService.getTeamsByGroup(groupId).catch(() => []);
  }

  private invalidateLookupCache(tableName: string): void {
    if (tableName === 'members') this.memberService.invalidateCache();
    if (tableName === 'groups') this.groupService.invalidateCache();
    if (tableName === 'companies') this.companyService.invalidateCache();
  }

  revertActionLabel(op: string): string {
    return {
      INSERT: '刪除此新增的資料',
      UPDATE: '將資料還原為編輯前的狀態',
      DELETE: '重新插入被刪除的資料'
    }[op] ?? '還原';
  }
}
