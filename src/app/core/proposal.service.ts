import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Proposal } from '../models';

export interface ContributorEntry {
  submitter_id: string;
  submitter_name: string;
  total: number;
  by_table: Record<string, number>;
}

@Injectable({ providedIn: 'root' })
export class ProposalService {
  private get db() { return this.supabase.client; }

  constructor(private supabase: SupabaseService) {}

  /** Submit a proposal (works for anonymous and logged-in users) */
  async submit(proposal: Omit<Proposal, 'id' | 'status' | 'created_at' | 'reviewed_at' | 'reviewed_by' | 'reviewer_note' | 'reviewed_data'>): Promise<void> {
    const { error } = await this.db.from('proposals').insert(proposal);
    if (error) throw error;
  }

  /** Get all proposals, optionally filtered by status. Admin only. */
  async getAll(status?: 'pending' | 'approved' | 'rejected'): Promise<Proposal[]> {
    let query = this.db.from('proposals').select('*');
    if (status) {
      query = (query as any).eq('status', status);
    }
    const ascending = status === 'pending' || !status;
    const orderCol = (status === 'approved' || status === 'rejected') ? 'reviewed_at' : 'created_at';
    const { data, error } = await (query as any).order(orderCol, { ascending });
    if (error) throw error;
    return data ?? [];
  }

  /** Count of pending proposals. Admin only. */
  async getPendingCount(): Promise<number> {
    const { count, error } = await this.db
      .from('proposals')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    if (error) throw error;
    return count ?? 0;
  }

  /** Get a single proposal by ID. Admin only. */
  async getById(id: string): Promise<Proposal | null> {
    const { data, error } = await this.db
      .from('proposals')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  }

  /** Approve a proposal: apply data to target table, update status. Admin only. */
  async approve(proposal: Proposal, reviewedData?: Record<string, any>, note?: string): Promise<void> {
    const dataToApply = reviewedData ?? proposal.proposed_data;
    let applyError: any;

    if (proposal.operation === 'INSERT') {
      const { error } = await this.db.from(proposal.table_name).insert(dataToApply);
      applyError = error;
    } else if (proposal.operation === 'DELETE') {
      const { error } = await this.db
        .from(proposal.table_name)
        .delete()
        .eq('id', proposal.record_id!);
      applyError = error;
    } else {
      const { error } = await this.db
        .from(proposal.table_name)
        .update(dataToApply)
        .eq('id', proposal.record_id!);
      applyError = error;
    }
    if (applyError) throw applyError;

    const session = await this.supabase.getSessionOnce();
    const { error } = await this.db
      .from('proposals')
      .update({
        status: 'approved',
        reviewed_data: reviewedData ?? null,
        reviewer_note: note ?? null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: session?.user?.id ?? null,
      })
      .eq('id', proposal.id);
    if (error) throw error;
  }

  /** Reject a proposal. Admin only. */
  async reject(id: string, note?: string): Promise<void> {
    const session = await this.supabase.getSessionOnce();
    const { error } = await this.db
      .from('proposals')
      .update({
        status: 'rejected',
        reviewer_note: note ?? null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: session?.user?.id ?? null,
      })
      .eq('id', id);
    if (error) throw error;
  }

  async getApprovedByRecord(tableName: string, recordId: string): Promise<Proposal[]> {
    const { data, error } = await this.db.rpc('get_approved_by_record', {
      p_table_name: tableName,
      p_record_id: recordId,
    });
    if (error) throw error;
    return (data ?? []) as Proposal[];
  }

  async getLeaderboard(): Promise<ContributorEntry[]> {
    const { data, error } = await this.db.rpc('get_leaderboard');
    if (error) throw error;
    return (data ?? []) as ContributorEntry[];
  }
}
