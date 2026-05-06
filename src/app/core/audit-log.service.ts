import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AdminRoleService } from './admin-role.service';
import { AuditLog } from '../models';

type EditableAuditTable =
  | 'members'
  | 'groups'
  | 'history'
  | 'companies'
  | 'member_songs'
  | 'group_songs';

const EDITABLE_FIELDS: Record<EditableAuditTable, Set<string>> = {
  members: new Set([
    'name', 'name_hiragana', 'name_roman', 'emoji', 'nickname', 'birthdate',
    'color', 'color_name', 'instagram', 'facebook', 'x', 'maid_url', 'photo_url',
    'notes', 'company_id', 'no_sns',
  ]),
  groups: new Set([
    'name', 'name_jp', 'color', 'founded_at', 'disbanded_at',
    'instagram', 'facebook', 'x', 'youtube', 'company_id', 'company', 'photo_url',
    'notes', 'is_trainee', 'style',
  ]),
  history: new Set([
    'member_id', 'group_id', 'team_id', 'name_at_time', 'role',
    'status', 'joined_at', 'left_at', 'external_group_name', 'external_country',
    'notes',
  ]),
  companies: new Set([
    'name', 'description', 'founded_at', 'website', 'instagram', 'facebook', 'x',
    'youtube', 'photo_url', 'color',
  ]),
  member_songs: new Set([
    'title', 'release_date', 'youtube_url', 'composer', 'lyricist', 'arranger',
    'notes', 'sort_order',
  ]),
  group_songs: new Set([
    'title', 'release_date', 'youtube_url', 'composer', 'lyricist', 'arranger',
    'notes', 'sort_order',
  ]),
};

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  constructor(
    private supabase: SupabaseService,
    private adminRole: AdminRoleService,
  ) {}

  private get db() { return this.supabase.client; }

  async getAll(filter?: { table_name?: string; operation?: string }): Promise<AuditLog[]> {
    let query = this.db.from('audit_log').select('*');
    if (filter?.table_name) query = (query as any).eq('table_name', filter.table_name);
    if (filter?.operation) query = (query as any).eq('operation', filter.operation);
    const { data, error } = await (query as any)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    return data ?? [];
  }

  async canRevertLog(log: AuditLog): Promise<boolean> {
    const isAdmin = await this.adminRole.isAdmin();
    if (isAdmin) return true;
    const session = await this.supabase.getSessionOnce();
    return log.user_email === session?.user?.email;
  }

  async revert(log: AuditLog): Promise<void> {
    const { error } = await this.db.rpc('revert_audit_log', { p_log_id: log.id });
    if (error) throw new Error(error.message ?? '還原失敗');
  }

  async getRecord(tableName: string, recordId: string): Promise<Record<string, any> | null> {
    const table = this.assertEditableTable(tableName);
    const { data, error } = await this.db
      .from(table)
      .select('*')
      .eq('id', recordId)
      .maybeSingle();
    if (error) throw new Error(error.message ?? '讀取資料失敗');
    return data ?? null;
  }

  async updateRecord(tableName: string, recordId: string, payload: Record<string, any>): Promise<void> {
    const table = this.assertEditableTable(tableName);
    const allowedFields = EDITABLE_FIELDS[table];
    const sanitized = Object.fromEntries(
      Object.entries(payload).filter(([field]) => allowedFields.has(field))
    );
    if (Object.keys(sanitized).length === 0) {
      throw new Error('沒有可儲存的欄位');
    }

    const updatePayload = table === 'member_songs' || table === 'group_songs'
      ? { ...sanitized, updated_at: new Date().toISOString() }
      : sanitized;
    const { error } = await this.db
      .from(table)
      .update(updatePayload)
      .eq('id', recordId);
    if (error) throw new Error(error.message ?? '儲存失敗');
  }

  private assertEditableTable(tableName: string): EditableAuditTable {
    if (Object.prototype.hasOwnProperty.call(EDITABLE_FIELDS, tableName)) {
      return tableName as EditableAuditTable;
    }
    throw new Error('此資料表不支援在變更記錄中編輯');
  }
}
