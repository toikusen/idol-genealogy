import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Company, Group } from '../models';
import { isNotFoundError } from './supabase.utils';

@Injectable({ providedIn: 'root' })
export class CompanyService {
  private get db() { return this.supabase.client; }
  private _allCache: Company[] | null = null;
  private _allPromise: Promise<Company[]> | null = null;

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

  invalidateCache() { this._allCache = null; }

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
    const { data, error } = await this.db
      .from('companies').select('*').eq('id', id).single();
    if (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
    return data;
  }

  async getGroupsByCompany(companyId: string): Promise<Group[]> {
    const { data, error } = await this.db
      .from('groups').select('*').eq('company_id', companyId);
    if (error) throw error;
    // Active groups first, then disbanded — sorted in component by disbanded_at nullability
    return data ?? [];
  }

  async create(company: Partial<Company>): Promise<void> {
    const { error } = await this.db.from('companies').insert(company);
    if (error) throw error;
    this.invalidateCache();
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
