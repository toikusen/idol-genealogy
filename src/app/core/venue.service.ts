import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Venue } from '../models';

@Injectable({ providedIn: 'root' })
export class VenueService {
  private get db() { return this.supabase.client; }
  private _cache: Venue[] | null = null;
  private _promise: Promise<Venue[]> | null = null;

  constructor(private supabase: SupabaseService) {}

  async getAll(): Promise<Venue[]> {
    if (this._cache) return this._cache;
    if (this._promise) return this._promise;
    this._promise = Promise.resolve(
      this.db
        .from('venues')
        .select('*')
        .eq('is_active', true)
        .order('region')
        .order('name')
    ).then(({ data, error }) => {
      this._promise = null;
      if (error) throw error;
      this._cache = data ?? [];
      return this._cache!;
    });
    return this._promise;
  }

  async getCount(): Promise<number> {
    if (this._cache) return this._cache.length;
    const venues = await this.getAll();
    return venues.length;
  }

  async getForAdmin(): Promise<Venue[]> {
    const { data, error } = await this.db
      .from('venues')
      .select('*')
      .order('region')
      .order('name');
    if (error) throw error;
    return data ?? [];
  }

  async create(venue: Omit<Venue, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
    const { error } = await this.db.from('venues').insert(venue);
    if (error) throw error;
    this.invalidateCache();
  }

  async update(id: string, patch: Partial<Omit<Venue, 'id' | 'created_at'>>): Promise<void> {
    const { error } = await this.db.from('venues').update(patch).eq('id', id);
    if (error) throw error;
    this.invalidateCache();
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('venues').delete().eq('id', id);
    if (error) throw error;
    this.invalidateCache();
  }

  invalidateCache() {
    this._cache = null;
    this._promise = null;
  }
}
