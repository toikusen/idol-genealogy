import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { History } from '../models';
import { TtlCache } from './ttl-cache';

@Injectable({ providedIn: 'root' })
export class HistoryService {
  private get db() { return this.supabase.client; }
  // Per-member / per-group relational reads that block member/group page
  // navigation. Cleared on any history write; the TTL also bounds staleness
  // from embedded member/group/team edits made through other services.
  private readonly _byMemberCache = new TtlCache<History[]>(120_000);
  private readonly _byGroupCache = new TtlCache<History[]>(120_000);

  constructor(private supabase: SupabaseService) {}

  /** Call after any history write to drop the per-member / per-group read caches. */
  private invalidateReadCaches() {
    this._byMemberCache.invalidate();
    this._byGroupCache.invalidate();
  }

  async getByMember(memberId: string): Promise<History[]> {
    return this._byMemberCache.get(memberId, async () => {
      const { data, error } = await this.db
        .from('history')
        .select('*, group:groups(*), team:teams(*), member:members(name, name_roman)')
        .eq('member_id', memberId)
        .order('joined_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    });
  }

  async getByGroup(groupId: string): Promise<History[]> {
    return this._byGroupCache.get(groupId, async () => {
      const { data, error } = await this.db
        .from('history')
        .select('*, member:members(*), team:teams(*)')
        .eq('group_id', groupId)
        .order('joined_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    });
  }

  async getAll(): Promise<History[]> {
    const { data, error } = await this.db
      .from('history')
      .select('*, member:members(name,name_roman,photo_url), group:groups(name,color), team:teams(name)')
      .order('joined_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async create(history: Partial<History>): Promise<string> {
    const { member, group, team, ...payload } = history as any;
    const { data, error } = await this.db.from('history').insert(payload).select('id').single();
    if (error) throw error;
    this.invalidateReadCaches();
    return data.id as string;
  }

  async update(id: string, history: Partial<History>): Promise<void> {
    const { member, group, team, ...payload } = history as any;
    const { error } = await this.db.from('history').update(payload).eq('id', id);
    if (error) throw error;
    this.invalidateReadCaches();
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('history').delete().eq('id', id);
    if (error) throw error;
    this.invalidateReadCaches();
  }

  /** Lightweight: only member_id + group_id pairs (group history only), for building group filter maps */
  async getMemberGroupLinks(): Promise<{ member_id: string; group_id: string }[]> {
    const { data, error } = await this.db
      .from('history').select('member_id, group_id').not('group_id', 'is', null);
    if (error) throw error;
    return (data ?? []) as { member_id: string; group_id: string }[];
  }

  /** Lightweight: distinct member IDs that have any history record (including solo) */
  async getMemberIdsWithHistory(): Promise<Set<string>> {
    const { data, error } = await this.db.from('history').select('member_id');
    if (error) throw error;
    return new Set((data ?? []).map((r: { member_id: string }) => r.member_id));
  }

  /** Get all history records for a list of member IDs (cross-group lookup) */
  async getByMembers(memberIds: string[]): Promise<History[]> {
    if (memberIds.length === 0) return [];
    const { data, error } = await this.db
      .from('history')
      .select('*, group:groups(id,name,color), member:members(name,name_roman)')
      .in('member_id', memberIds)
      .order('joined_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }
}
