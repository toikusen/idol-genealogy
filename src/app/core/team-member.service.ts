import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { TeamMember } from '../models';

@Injectable({ providedIn: 'root' })
export class TeamMemberService {
  private get db() { return this.supabase.client; }

  constructor(private supabase: SupabaseService) {}

  async getAll(): Promise<TeamMember[]> {
    const { data, error } = await this.db
      .from('team_members')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async create(member: Partial<TeamMember>): Promise<void> {
    const { error } = await this.db.from('team_members').insert(member);
    if (error) throw error;
  }

  async update(id: string, member: Partial<TeamMember>): Promise<void> {
    const { error } = await this.db.from('team_members').update(member).eq('id', id);
    if (error) throw error;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('team_members').delete().eq('id', id);
    if (error) throw error;
  }
}
