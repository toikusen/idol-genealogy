import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Member, MemberLeaderboardEntry } from '../models';
import { kanaVariants } from './japanese.utils';
import { isNotFoundError } from './supabase.utils';

@Injectable({ providedIn: 'root' })
export class MemberService {
  private get db() { return this.supabase.client; }
  private _allCache: Member[] | null = null;
  private _allPromise: Promise<Member[]> | null = null;
  private _byIdCache = new Map<string, Member | null>();

  constructor(private supabase: SupabaseService) {}

  async search(query: string): Promise<Member[]> {
    const safe = query.replace(/[%_\\]/g, c => `\\${c}`);
    const variants = kanaVariants(safe);
    // Search both stage name and hiragana with kana variants; romaji only needs the raw query.
    const nameFilters = variants
      .flatMap(v => [`name.ilike.%${v}%`, `name_hiragana.ilike.%${v}%`])
      .join(',');
    const { data, error } = await this.db
      .from('members')
      .select('*')
      .or(`${nameFilters},name_roman.ilike.%${safe}%,emoji.ilike.%${safe}%`);
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
    if (this._byIdCache.has(id)) return this._byIdCache.get(id)!;
    const { data, error } = await this.db
      .from('members')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      if (isNotFoundError(error)) {
        this._byIdCache.set(id, null);
        return null;
      }
      throw error;
    }
    this._byIdCache.set(id, data);
    return data;
  }

  async getByHandle(handle: string): Promise<Member | null> {
    const normalized = handle.trim().replace(/^@+/, '');
    if (!normalized) return null;

    const { data, error } = await this.db
      .from('members')
      .select('*')
      .or(`instagram.ilike.${normalized},x.ilike.${normalized},facebook.ilike.${normalized}`)
      .limit(1);
    if (error) throw error;
    return data?.[0] ?? null;
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
  invalidateCache() {
    this._allCache = null;
    this._byIdCache.clear();
  }

  async getUpcomingBirthdays(withinDays = 30): Promise<{ member: Member; daysUntil: number }[]> {
    const { data, error } = await this.db
      .from('members')
      .select('id,name,name_hiragana,name_roman,photo_url,color,birthdate,notes,updated_at')
      .not('birthdate', 'is', null);
    if (error) throw error;

    const { data: activeHistories, error: historyError } = await this.db
      .from('history')
      .select('member_id')
      .eq('status', 'active');
    if (historyError) throw historyError;
    const activeMemberIds = new Set((activeHistories ?? []).map(h => h.member_id));

    const today = new Date();
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const results: { member: Member; daysUntil: number }[] = [];
    const members = (data ?? []) as unknown as Member[];
    for (const member of members) {
      if (!activeMemberIds.has(member.id)) continue;
      const days = this.calcDaysUntilBirthday(member.birthdate!, todayMidnight);
      if (days !== null && days <= withinDays) {
        results.push({ member, daysUntil: days });
      }
    }
    return results.sort((a, b) => a.daysUntil - b.daysUntil);
  }

  private calcDaysUntilBirthday(birthdate: string, todayMidnight: Date): number | null {
    const m = birthdate.match(/(?:^\d{4}-)?(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    const month = +m[1] - 1;
    const day = +m[2];
    let next = new Date(todayMidnight.getFullYear(), month, day);
    if (next < todayMidnight) {
      next = new Date(todayMidnight.getFullYear() + 1, month, day);
    }
    return Math.round((next.getTime() - todayMidnight.getTime()) / 86400000);
  }

  async getCount(): Promise<number> {
    const { count, error } = await this.db
      .from('members')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    return count ?? 0;
  }

  async getSoloMembers(): Promise<Member[]> {
    const { data, error } = await this.db
      .from('members').select('*').not('company_id', 'is', null).order('name', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async getRecent(limit = 10): Promise<Member[]> {
    const { data, error } = await this.db
      .from('members')
      .select('id,name,name_hiragana,name_roman,photo_url,color,notes,updated_at')
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as unknown as Member[];
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

  async getTopByViews(limit: number): Promise<MemberLeaderboardEntry[]> {
    const { data, error } = await this.supabase.client.rpc(
      'get_top_members_by_views', { p_limit: limit }
    );
    if (error) throw error;
    return (data ?? []) as MemberLeaderboardEntry[];
  }
}
