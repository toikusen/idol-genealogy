import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Group, GroupVideo, Team } from '../models';

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

  async searchCompanies(query: string): Promise<string[]> {
    const safe = query.replace(/[%_\\]/g, c => `\\${c}`);
    const { data, error } = await this.db
      .from('groups').select('company')
      .ilike('company', `%${safe}%`)
      .not('company', 'is', null);
    if (error) throw error;
    const unique = [...new Set((data ?? []).map(g => g.company as string))];
    return unique.sort();
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

  async getSimilarByStyle(style: string, excludeId: string): Promise<Group[]> {
    const { data, error } = await this.db
      .from('groups').select('*')
      .eq('style', style)
      .neq('id', excludeId)
      .limit(6);
    if (error) throw error;
    return data ?? [];
  }

  async getVideosByGroup(groupId: string): Promise<GroupVideo[]> {
    const { data, error } = await this.db
      .from('group_videos').select('*').eq('group_id', groupId).order('sort_order');
    if (error) {
      if ((error as any).code === 'PGRST205') return []; // table not yet migrated
      throw error;
    }
    return data ?? [];
  }

  async createVideo(video: Omit<GroupVideo, 'id' | 'created_at'>): Promise<void> {
    const { error } = await this.db.from('group_videos').insert(video);
    if (error) {
      if ((error as any).code === 'PGRST205') throw new Error('請先在 Supabase 執行 015_create_group_videos.sql');
      throw error;
    }
  }

  async deleteVideo(id: string): Promise<void> {
    const { error } = await this.db.from('group_videos').delete().eq('id', id);
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
