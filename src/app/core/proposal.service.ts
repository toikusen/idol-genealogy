import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { MemberService } from './member.service';
import { GroupService } from './group.service';
import { CompanyService } from './company.service';
import { Proposal } from '../models';
import { PROPOSAL_ALLOWED_FIELDS } from './proposal-fields.config';

export interface ContributorEntry {
  submitter_id: string;
  submitter_name: string;
  total: number;
  by_table: Record<string, number>;
}

@Injectable({ providedIn: 'root' })
export class ProposalService {
  private get db() { return this.supabase.client; }

  constructor(
    private supabase: SupabaseService,
    private memberService: MemberService,
    private groupService: GroupService,
    private companyService: CompanyService,
  ) {}

  /** Submit a proposal (works for anonymous and logged-in users) */
  async submit(proposal: Omit<Proposal, 'id' | 'status' | 'created_at' | 'reviewed_at' | 'reviewed_by' | 'reviewer_note' | 'reviewed_data'>): Promise<void> {
    // Client-side rate limit: anonymous users, max 5 proposals per 10 min
    if (!proposal.submitter_id) {
      const { count, error: rateLimitError } = await this.db
        .from('proposals')
        .select('*', { count: 'exact', head: true })
        .eq('submitter_name', proposal.submitter_name)
        .is('submitter_id', null)
        .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString());
      // Fail closed: if we can't verify the rate limit, don't let the submission through.
      if (rateLimitError) {
        throw new Error('目前無法送出，請稍後再試');
      }
      if ((count ?? 0) >= 5) {
        throw new Error('送出過於頻繁，請稍後再試');
      }
    }
    const { error } = await this.db.from('proposals').insert(proposal);
    if (error) throw error;
  }

  /** Get all proposals, optionally filtered by status. Admin only. */
  async getAll(status?: 'pending' | 'approved' | 'rejected'): Promise<Proposal[]> {
    const ascending = status === 'pending' || !status;
    const orderCol = (status === 'approved' || status === 'rejected') ? 'reviewed_at' : 'created_at';
    let query = this.db.from('proposals').select('*').order(orderCol, { ascending });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
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
    // INSERT proposals carry no record_id (the row doesn't exist yet). Capture the
    // new row's id so the record's edit-history panel can find this proposal.
    let insertedId: string | null = null;

    if (proposal.operation === 'INSERT') {
      const { data, error } = await this.db
        .from(proposal.table_name)
        .insert(dataToApply)
        .select('id')
        .single();
      applyError = error;
      insertedId = (data as { id?: string } | null)?.id ?? null;
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
    // Approve writes bypass the entity services, so their getAll() caches
    // would keep serving pre-approval data (e.g. audit log showing raw ids).
    this.invalidateTableCache(proposal.table_name);

    const session = await this.supabase.getSessionOnce();
    const { error } = await this.db
      .from('proposals')
      .update({
        status: 'approved',
        record_id: insertedId ?? proposal.record_id,
        reviewed_data: reviewedData ?? null,
        reviewer_note: note ?? null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: session?.user?.id ?? null,
      })
      .eq('id', proposal.id);
    if (error) throw error;
  }

  private invalidateTableCache(tableName: string): void {
    if (tableName === 'members') this.memberService.invalidateCache();
    if (tableName === 'groups') this.groupService.invalidateCache();
    if (tableName === 'companies') this.companyService.invalidateCache();
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

  async getApprovedHistoryByField(field: 'member_id' | 'group_id', value: string): Promise<Proposal[]> {
    const { data, error } = await this.db.rpc('get_approved_history_by_field', {
      p_field: field,
      p_value: value,
    });
    if (error) throw error;
    return (data ?? []) as Proposal[];
  }

  async getApprovedSongsByField(
    tableName: 'member_songs' | 'group_songs',
    field: 'member_id' | 'group_id',
    value: string,
  ): Promise<Proposal[]> {
    const { data, error } = await this.db.rpc('get_approved_songs_by_field', {
      p_table_name: tableName,
      p_field: field,
      p_value: value,
    });
    if (error) throw error;
    return (data ?? []) as Proposal[];
  }

  /**
   * Records an admin direct edit as an already-approved proposal.
   * Only fields present in PROPOSAL_ALLOWED_FIELDS are captured; skips if nothing changed.
   */
  async recordDirectEdit(
    tableName: string,
    recordId: string,
    originalData: Record<string, any>,
    newData: Record<string, any>,
    operation: 'UPDATE' | 'INSERT' | 'DELETE' = 'UPDATE',
  ): Promise<void> {
    const allowedFields = PROPOSAL_ALLOWED_FIELDS[tableName];
    if (!allowedFields) return;

    const proposedData: Record<string, any> = {};
    const originalDataToStore: Record<string, any> = {};

    if (operation === 'INSERT') {
      for (const key of allowedFields) {
        if (newData[key] != null && newData[key] !== '') {
          proposedData[key] = newData[key];
        }
      }
      if (Object.keys(proposedData).length === 0) return;
    } else if (operation === 'DELETE') {
      for (const key of allowedFields) {
        if (originalData[key] != null && originalData[key] !== '') {
          originalDataToStore[key] = originalData[key];
        }
      }
      if (Object.keys(originalDataToStore).length === 0) return;
    } else {
      for (const key of allowedFields) {
        const oldStr = (originalData[key] != null && originalData[key] !== '') ? String(originalData[key]) : '';
        const newStr = (newData[key] != null && newData[key] !== '') ? String(newData[key]) : '';
        if (oldStr !== newStr) {
          proposedData[key] = newData[key] ?? null;
          originalDataToStore[key] = originalData[key] ?? null;
        }
      }
      if (Object.keys(proposedData).length === 0) return;

      // history proposals are looked up by member_id / group_id inside the JSON,
      // so always include these anchor fields regardless of whether they changed.
      if (tableName === 'history') {
        for (const anchor of ['member_id', 'group_id'] as const) {
          const val = newData[anchor] ?? originalData[anchor] ?? null;
          if (val != null) {
            proposedData[anchor] = val;
            originalDataToStore[anchor] = originalData[anchor] ?? val;
          }
        }
      }
    }

    const songAnchor = tableName === 'member_songs'
      ? 'member_id'
      : tableName === 'group_songs'
        ? 'group_id'
        : null;
    if (songAnchor) {
      const val = newData[songAnchor] ?? originalData[songAnchor] ?? null;
      if (val != null) {
        proposedData[songAnchor] = val;
        if (operation !== 'INSERT') {
          originalDataToStore[songAnchor] = originalData[songAnchor] ?? val;
        }
      }
    }

    const { error } = await this.db.rpc('insert_approved_proposal', {
      p_table_name: tableName,
      p_record_id: recordId,
      p_operation: operation,
      p_proposed_data: proposedData,
      p_original_data: originalDataToStore,
    });
    if (error) throw error;
  }

  async getLeaderboard(): Promise<ContributorEntry[]> {
    const { data, error } = await this.db.rpc('get_leaderboard');
    if (error) throw error;
    return (data ?? []) as ContributorEntry[];
  }

  /** Get the calling user's own proposals (pending + approved), newest first. */
  async getMyProposals(userId: string): Promise<Proposal[]> {
    const { data, error } = await this.db
      .from('proposals')
      .select('*')
      .eq('submitter_id', userId)
      .in('status', ['pending', 'approved'])
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as Proposal[];
  }
}
