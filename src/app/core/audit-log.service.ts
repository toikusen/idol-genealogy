import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AdminRoleService } from './admin-role.service';
import { AuditLog } from '../models';

export interface AuditLogCursor {
  created_at: string;
  id: string;
}

export interface AuditLogFilter {
  table_name?: string;
  operation?: string;
  member_id?: string;
  group_id?: string;
  date_from?: string;
  date_to?: string;
  cursor?: AuditLogCursor;
  limit?: number;
}

type EditableAuditTable =
  | 'members'
  | 'groups'
  | 'history'
  | 'companies'
  | 'member_songs'
  | 'group_songs'
  | 'venues';

const EDITABLE_FIELDS: Record<EditableAuditTable, Set<string>> = {
  members: new Set([
    'name', 'name_hiragana', 'name_roman', 'emoji', 'nickname', 'birthdate',
    'color', 'color_name', 'instagram', 'facebook', 'x', 'maid_url', 'photo_url',
    'notes', 'company_id', 'no_sns',
    'photo_status', 'photo_notes', 'video_status', 'video_notes', 'photography_source',
  ]),
  groups: new Set([
    'name', 'name_jp', 'color', 'founded_at', 'disbanded_at',
    'instagram', 'facebook', 'x', 'youtube', 'company_id', 'company', 'photo_url',
    'notes', 'is_trainee',
    'photo_status', 'photo_notes', 'video_status', 'video_notes', 'photography_source',
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
    'choreographer', 'notes', 'sort_order',
  ]),
  group_songs: new Set([
    'title', 'release_date', 'youtube_url', 'composer', 'lyricist', 'arranger',
    'choreographer', 'notes', 'sort_order',
  ]),
  venues: new Set([
    'name', 'address', 'type', 'region', 'google_maps_url', 'phone', 'notes',
    'is_active', 'latitude', 'longitude',
  ]),
};

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  constructor(
    private supabase: SupabaseService,
    private adminRole: AdminRoleService,
  ) {}

  private get db() { return this.supabase.client; }

  async getAll(filter?: AuditLogFilter): Promise<{ data: AuditLog[]; hasMore: boolean }> {
    const limit = Math.max(1, Math.min(filter?.limit ?? 50, 100));
    const { data, error } = await this.db.rpc('get_audit_logs_paginated', {
      p_table_name:          filter?.table_name          ?? null,
      p_operation:           filter?.operation           ?? null,
      p_member_id:           filter?.member_id           ?? null,
      p_group_id:            filter?.group_id            ?? null,
      p_date_from:           filter?.date_from           ?? null,
      p_date_to:             filter?.date_to             ?? null,
      p_cursor_created_at:   filter?.cursor?.created_at  ?? null,
      p_cursor_id:           filter?.cursor?.id          ?? null,
      p_limit:               limit + 1,
    });
    if (error) throw error;
    const rows = (data ?? []) as AuditLog[];
    const hasMore = rows.length > limit;
    return { data: hasMore ? rows.slice(0, limit) : rows, hasMore };
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
