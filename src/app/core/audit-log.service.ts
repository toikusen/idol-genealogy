import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AdminRoleService } from './admin-role.service';
import { AuditLog } from '../models';

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
}
