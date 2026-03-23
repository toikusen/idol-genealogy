import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { History } from '../models';

@Injectable({ providedIn: 'root' })
export class HistoryService {
  private get db() { return this.supabase.client; }

  constructor(private supabase: SupabaseService) {}

  async getByMember(memberId: string): Promise<History[]> {
    const { data, error } = await this.db
      .from('history')
      .select('*, group:groups(*), team:teams(*), member:members(name, name_roman)')
      .eq('member_id', memberId)
      .order('joined_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async getByGroup(groupId: string): Promise<History[]> {
    const { data, error } = await this.db
      .from('history')
      .select('*, member:members(*), team:teams(*)')
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async getAll(): Promise<History[]> {
    const { data, error } = await this.db
      .from('history')
      .select('*, member:members(name,name_roman,photo_url), group:groups(name,color), team:teams(name)')
      .order('joined_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  async create(history: Partial<History>): Promise<void> {
    const { member, group, team, ...payload } = history as any;
    const { error } = await this.db.from('history').insert(payload);
    if (error) throw error;
  }

  async update(id: string, history: Partial<History>): Promise<void> {
    const { member, group, team, ...payload } = history as any;
    const { error } = await this.db.from('history').update(payload).eq('id', id);
    if (error) throw error;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('history').delete().eq('id', id);
    if (error) throw error;
  }

  /** Lightweight: only member_id + group_id pairs, for building filter maps */
  async getMemberGroupLinks(): Promise<{ member_id: string; group_id: string }[]> {
    const { data, error } = await this.db
      .from('history').select('member_id, group_id').not('group_id', 'is', null);
    if (error) throw error;
    return (data ?? []) as { member_id: string; group_id: string }[];
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
