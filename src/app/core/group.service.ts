import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Group, GroupVideo, Team, GroupLeaderboardEntry } from '../models';
import { kanaVariants } from './japanese.utils';
import { isNotFoundError } from './supabase.utils';

@Injectable({ providedIn: 'root' })
export class GroupService {
  private get db() { return this.supabase.client; }
  private _allCache: Group[] | null = null;
  private _allPromise: Promise<Group[]> | null = null;


  constructor(private supabase: SupabaseService) {}

  async getAll(): Promise<Group[]> {
    if (this._allCache) return this._allCache;
    if (this._allPromise) return this._allPromise;
    this._allPromise = Promise.resolve(
      this.db.from('groups').select('*').order('name', { ascending: true })
    ).then(({ data, error }) => {
      this._allPromise = null;
      if (error) throw error;
      this._allCache = data ?? [];
      return this._allCache!;
    });
    return this._allPromise;
  }

  invalidateCache() { this._allCache = null; }

  async search(query: string): Promise<Group[]> {
    const safe = query.replace(/[%_\\]/g, c => `\\${c}`);
    const variants = kanaVariants(safe);
    const nameFilters = variants.map(v => `name.ilike.%${v}%`).join(',');
    const nameJpFilters = variants.map(v => `name_jp.ilike.%${v}%`).join(',');
    const { data, error } = await this.db
      .from('groups').select('*')
      .or(`${nameFilters},${nameJpFilters}`);
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
      if (isNotFoundError(error)) return null;
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
    this.invalidateCache();
  }

  async update(id: string, group: Partial<Group>): Promise<void> {
    const { error } = await this.db.from('groups').update(group).eq('id', id);
    if (error) throw error;
    this.invalidateCache();
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('groups').delete().eq('id', id);
    if (error) throw error;
    this.invalidateCache();
  }

  async getSimilarByStyle(styles: string[], excludeId: string): Promise<Group[]> {
    const orFilter = styles.map(s => `style.like.%${s}%`).join(',');
    const { data, error } = await this.db
      .from('groups').select('*')
      .or(orFilter)
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

  async getTopByViews(limit: number): Promise<GroupLeaderboardEntry[]> {
    const { data, error } = await this.supabase.client.rpc(
      'get_top_groups_by_views', { p_limit: limit }
    );
    if (error) throw error;
    return (data ?? []) as GroupLeaderboardEntry[];
  }
}
