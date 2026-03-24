import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { GroupSong } from '../models';

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
