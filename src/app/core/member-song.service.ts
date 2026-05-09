import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Member, MemberSong } from '../models';

export interface AdminMemberSong extends MemberSong {
  member?: Pick<Member, 'id' | 'name' | 'name_roman' | 'photo_url'> | null;
}

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

  async getAllForAdmin(): Promise<AdminMemberSong[]> {
    const { data, error } = await this.supabase.client
      .from('member_songs')
      .select('*')
      .eq('is_deleted', false)
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as AdminMemberSong[];
  }

  async getNextSortOrder(memberId: string): Promise<number> {
    const { data, error } = await this.supabase.client
      .from('member_songs')
      .select('sort_order')
      .eq('member_id', memberId)
      .eq('is_deleted', false)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return ((data as { sort_order?: number } | null)?.sort_order ?? 0) + 1;
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
