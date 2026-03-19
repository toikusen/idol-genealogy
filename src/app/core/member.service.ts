import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Member } from '../models';
import { kanaVariants } from './japanese.utils';

@Injectable({ providedIn: 'root' })
export class MemberService {
  private get db() { return this.supabase.client; }
  private _allCache: Member[] | null = null;
  private _allPromise: Promise<Member[]> | null = null;

  constructor(private supabase: SupabaseService) {}

  async search(query: string): Promise<Member[]> {
    const safe = query.replace(/[%_\\]/g, c => `\\${c}`);
    const variants = kanaVariants(safe);
    // Search name with all kana variants; name_roman only needs the original query (it's romaji)
    const nameFilters = variants.map(v => `name.ilike.%${v}%`).join(',');
    const { data, error } = await this.db
      .from('members')
      .select('*')
      .or(`${nameFilters},name_roman.ilike.%${safe}%`);
    if (error) throw error;
    return data ?? [];
  }

  async searchByAlias(query: string): Promise<{ member: Member; alias: string }[]> {
    const safe = query.replace(/[%_\\]/g, c => `\\${c}`);
    const variants = kanaVariants(safe);
    const aliasFilters = variants.map(v => `name_at_time.ilike.%${v}%`).join(',');
    const { data, error } = await this.db
      .from('history')
      .select('name_at_time, member:members(*)')
      .or(aliasFilters)
      .not('name_at_time', 'is', null);
    if (error) throw error;

    // Deduplicate by member id, keep first matched alias
    const seen = new Set<string>();
    const results: { member: Member; alias: string }[] = [];
    for (const row of data ?? []) {
      const m = row.member as unknown as Member | null;
      if (m && !seen.has(m.id)) {
        seen.add(m.id);
        results.push({ member: m, alias: row.name_at_time as string });
      }
    }
    return results;
  }

  async getById(id: string): Promise<Member | null> {
    const { data, error } = await this.db
      .from('members')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      if ((error as any).code === 'PGRST116') return null;
      throw error;
    }
    return data;
  }

  async getAll(): Promise<Member[]> {
    if (this._allCache) return this._allCache;
    if (this._allPromise) return this._allPromise;
    this._allPromise = Promise.resolve(
      this.db.from('members').select('*').order('updated_at', { ascending: false })
    ).then(({ data, error }) => {
      this._allPromise = null;
      if (error) throw error;
      this._allCache = data ?? [];
      return this._allCache!;
    });
    return this._allPromise;
  }

  /** Call after create/update/delete to force next getAll() to re-fetch */
  invalidateCache() { this._allCache = null; }

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
    this.invalidateCache();
  }

  async update(id: string, member: Partial<Member>): Promise<void> {
    const { error } = await this.db.from('members').update(member).eq('id', id);
    if (error) throw error;
    this.invalidateCache();
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('members').delete().eq('id', id);
    if (error) throw error;
    this.invalidateCache();
  }
}
