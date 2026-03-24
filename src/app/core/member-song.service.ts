import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { MemberSong } from '../models';

@Injectable({ providedIn: 'root' })
export class MemberSongService {
  constructor(private supabase: SupabaseService) {}

  async getByMember(memberId: string): Promise<MemberSong[]> {
    const { data, error } = await this.supabase.client
      .from('member_songs')
      .select('*')
      .eq('member_id', memberId)
      .eq('is_deleted', false)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  async create(song: Omit<MemberSong, 'id' | 'is_deleted' | 'created_at' | 'updated_at' | 'created_by'>): Promise<MemberSong> {
    const { data, error } = await this.supabase.client
      .from('member_songs')
      .insert(song)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async update(id: string, song: Partial<Omit<MemberSong, 'id' | 'member_id' | 'is_deleted' | 'created_at' | 'created_by'>>): Promise<MemberSong> {
    const { data, error } = await this.supabase.client
      .from('member_songs')
      .update({ ...song, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('member_songs')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw error;
  }
}
