import { Injectable } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { Member } from '../models';

@Injectable({ providedIn: 'root' })
export class MemberService {
  private db: SupabaseClient;

  constructor(private supabase: SupabaseService) {
    this.db = supabase.client;
  }

  async search(query: string): Promise<Member[]> {
    const { data, error } = await this.db
      .from('members')
      .select('*')
      .or(`name.ilike.%${query}%,name_jp.ilike.%${query}%`);
    if (error) throw error;
    return data ?? [];
  }

  async getById(id: string): Promise<Member | null> {
    const { data, error } = await this.db
      .from('members')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  async getRecent(limit = 10): Promise<Member[]> {
    const { data, error } = await this.db
      .from('members')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  }

  async create(member: Partial<Member>): Promise<void> {
    const { error } = await this.db.from('members').insert(member);
    if (error) throw error;
  }

  async update(id: string, member: Partial<Member>): Promise<void> {
    const { error } = await this.db.from('members').update(member).eq('id', id);
    if (error) throw error;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('members').delete().eq('id', id);
    if (error) throw error;
  }
}
