import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Group, Team } from '../models';

@Injectable({ providedIn: 'root' })
export class GroupService {
  private get db() { return this.supabase.client; }

  constructor(private supabase: SupabaseService) {}

  async getAll(): Promise<Group[]> {
    const { data, error } = await this.db
      .from('groups').select('*').order('name', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async search(query: string): Promise<Group[]> {
    const safe = query.replace(/[%_\\]/g, c => `\\${c}`);
    const { data, error } = await this.db
      .from('groups').select('*')
      .or(`name.ilike.%${safe}%,name_jp.ilike.%${safe}%`);
    if (error) throw error;
    return data ?? [];
  }

  async getById(id: string): Promise<Group | null> {
    const { data, error } = await this.db
      .from('groups').select('*').eq('id', id).single();
    if (error) {
      if ((error as any).code === 'PGRST116') return null;
      throw error;
    }
    return data;
  }

  async getTeamsByGroup(groupId: string): Promise<Team[]> {
    const { data, error } = await this.db
      .from('teams').select('*').eq('group_id', groupId);
    if (error) throw error;
    return data ?? [];
  }

  async create(group: Partial<Group>): Promise<void> {
    const { error } = await this.db.from('groups').insert(group);
    if (error) throw error;
  }

  async update(id: string, group: Partial<Group>): Promise<void> {
    const { error } = await this.db.from('groups').update(group).eq('id', id);
    if (error) throw error;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('groups').delete().eq('id', id);
    if (error) throw error;
  }

  async createTeam(team: Partial<Team>): Promise<void> {
    const { error } = await this.db.from('teams').insert(team);
    if (error) throw error;
  }

  async updateTeam(id: string, team: Partial<Team>): Promise<void> {
    const { error } = await this.db.from('teams').update(team).eq('id', id);
    if (error) throw error;
  }

  async deleteTeam(id: string): Promise<void> {
    const { error } = await this.db.from('teams').delete().eq('id', id);
    if (error) throw error;
  }
}
