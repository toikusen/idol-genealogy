import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuditLog } from '../models';

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  constructor(private supabase: SupabaseService) {}

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

  async revert(log: AuditLog): Promise<void> {
    let result: { error: any };
    if (log.operation === 'INSERT') {
      result = await this.db.from(log.table_name).delete().eq('id', log.record_id);
    } else if (log.operation === 'UPDATE') {
      result = await this.db.from(log.table_name).update(log.old_data!).eq('id', log.record_id);
    } else {
      // DELETE → re-insert old_data
      result = await this.db.from(log.table_name).insert(log.old_data!);
    }
    if (result.error) throw new Error(result.error.message ?? '還原失敗');
  }
}
