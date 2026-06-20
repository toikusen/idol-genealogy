import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Company, Group, Member } from '../models';
import { isPublicCompanyRecord } from './public-record.utils';
import { isNotFoundError } from './supabase.utils';
import { TtlCache } from './ttl-cache';

@Injectable({ providedIn: 'root' })
export class CompanyService {
  private get db() { return this.supabase.client; }
  private _allCache: Company[] | null = null;
  private _allPromise: Promise<Company[]> | null = null;
  private _byIdCache = new Map<string, Company | null>();
  private readonly _publicCountCache = new TtlCache<number>(60_000);
  // Relational reads pull from the groups/members tables, which are written by
  // other services; the short TTL bounds cross-service staleness.
  private readonly _groupsByCompanyCache = new TtlCache<Group[]>(60_000);
  private readonly _membersByCompanyCache = new TtlCache<Member[]>(60_000);

  constructor(private supabase: SupabaseService) {}

  async getAll(): Promise<Company[]> {
    if (this._allCache) return this._allCache;
    if (this._allPromise) return this._allPromise;
    this._allPromise = Promise.resolve(
      this.db.from('companies').select('*').order('name', { ascending: true })
    ).then(({ data, error }) => {
      this._allPromise = null;
      if (error) throw error;
      this._allCache = data ?? [];
      return this._allCache!;
    });
    return this._allPromise;
  }

  async getCount(): Promise<number> {
    const { count, error } = await this.db
      .from('companies')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    return count ?? 0;
  }

  async getPublicCount(): Promise<number> {
    return this._publicCountCache.get('all', async () => {
      const { data, error } = await this.db
        .from('companies')
        .select('name');
      if (error) throw error;
      return (data ?? []).filter(isPublicCompanyRecord).length;
    });
  }

  invalidateCache() {
    this._allCache = null;
    this._byIdCache.clear();
    this._publicCountCache.invalidate();
    this._groupsByCompanyCache.invalidate();
    this._membersByCompanyCache.invalidate();
  }

  // Used by admin table to show group count per company
  async getGroupCounts(): Promise<Record<string, number>> {
    const { data, error } = await this.db
      .from('groups').select('company_id').not('company_id', 'is', null);
    if (error) return {};
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      if (row.company_id) counts[row.company_id] = (counts[row.company_id] ?? 0) + 1;
    }
    return counts;
  }

  async search(query: string): Promise<Company[]> {
    const safe = query.replace(/[%_\\]/g, c => `\\${c}`);
    const { data, error } = await this.db
      .from('companies').select('*').ilike('name', `%${safe}%`).order('name', { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async getById(id: string): Promise<Company | null> {
    if (this._byIdCache.has(id)) return this._byIdCache.get(id)!;
    const { data, error } = await this.db
      .from('companies').select('*').eq('id', id).single();
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

  async getGroupsByCompany(companyId: string): Promise<Group[]> {
    return this._groupsByCompanyCache.get(companyId, async () => {
      const { data, error } = await this.db
        .from('groups').select('*').eq('company_id', companyId);
      if (error) throw error;
      return data ?? [];
    });
  }

  async getMembersByCompany(companyId: string): Promise<Member[]> {
    return this._membersByCompanyCache.get(companyId, async () => {
      const { data, error } = await this.db
        .from('members').select('*').eq('company_id', companyId).order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    });
  }

  async create(company: Partial<Company>): Promise<string> {
    const { data, error } = await this.db.from('companies').insert(company).select('id').single();
    if (error) throw error;
    this.invalidateCache();
    return data.id;
  }

  async update(id: string, company: Partial<Company>): Promise<void> {
    const { error } = await this.db.from('companies').update(company).eq('id', id);
    if (error) throw error;
    this.invalidateCache();
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('companies').delete().eq('id', id);
    if (error) throw error;
    this.invalidateCache();
  }
}
