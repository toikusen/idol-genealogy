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
      .select('*, group:groups(*), team:teams(*)')
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
      .select('*, member:members(name,name_jp), group:groups(name,color), team:teams(name)')
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
}
