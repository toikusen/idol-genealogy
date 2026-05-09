import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Group, GroupSong } from '../models';

export interface AdminGroupSong extends GroupSong {
  group?: Pick<Group, 'id' | 'name' | 'photo_url' | 'color'> | null;
}

@Injectable({ providedIn: 'root' })
export class GroupSongService {
  constructor(private supabase: SupabaseService) {}

  async getByGroup(groupId: string): Promise<GroupSong[]> {
    const { data, error } = await this.supabase.client
      .from('group_songs')
      .select('*')
      .eq('group_id', groupId)
      .eq('is_deleted', false)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    // 確保數字排序（防止前端 JS 字串比較）
    return (data ?? []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  async getAllForAdmin(): Promise<AdminGroupSong[]> {
    const { data, error } = await this.supabase.client
      .from('group_songs')
      .select('*')
      .eq('is_deleted', false)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as AdminGroupSong[];
  }

  async getNextSortOrder(groupId: string): Promise<number> {
    const { data, error } = await this.supabase.client
      .from('group_songs')
      .select('sort_order')
      .eq('group_id', groupId)
      .eq('is_deleted', false)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return ((data as { sort_order?: number } | null)?.sort_order ?? 0) + 1;
  }

  async create(song: Omit<GroupSong, 'id' | 'is_deleted' | 'created_at' | 'updated_at' | 'created_by'>): Promise<GroupSong> {
    const { data, error } = await this.supabase.client
      .from('group_songs')
      .insert(song)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async update(id: string, song: Partial<Omit<GroupSong, 'id' | 'group_id' | 'created_at' | 'created_by'>>): Promise<GroupSong> {
    const { data, error } = await this.supabase.client
      .from('group_songs')
      .update({ ...song, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('group_songs')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }
}
