import { Injectable } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { Group, Team } from '../models';

@Injectable({ providedIn: 'root' })
export class GroupService {
  private db: SupabaseClient;

  constructor(private supabase: SupabaseService) {
    this.db = supabase.client;
  }

  async getAll(): Promise<Group[]> {
    const { data, error } = await this.db
      .from('groups').select('*').order('name', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async search(query: string): Promise<Group[]> {
    const { data, error } = await this.db
      .from('groups').select('*')
      .or(`name.ilike.%${query}%,name_jp.ilike.%${query}%`);
    if (error) throw error;
    return data ?? [];
  }

  async getById(id: string): Promise<Group | null> {
    const { data, error } = await this.db
      .from('groups').select('*').eq('id', id).single();
    if (error) throw error;
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
