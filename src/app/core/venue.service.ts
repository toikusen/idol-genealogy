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

  /**
   * Not filtered by `is_active`: closed venues keep working URLs, just noindex.
   *
   * Served from the list cache when it is warm. `getAll()` selects the same
   * columns, so tapping a venue in the list would otherwise block the whole
   * route on a round trip for a row already in memory — a full RTT of dead
   * time on a phone, with nothing on screen until it lands.
   */
  async getById(id: string): Promise<Venue | null> {
    const cached = this._cache?.find(v => v.id === id);
    if (cached) return cached;

    const { data, error } = await this.db.from('venues').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ?? null;
  }

  /**
   * Neighbours are taken by walking forward from this venue in name order and
   * wrapping around, not by slicing the first N. The north region has 38 venues;
   * a fixed slice would link the same six from every page and leave the rest
   * with no inbound links at all. Walking the ring gives each venue a different
   * set and makes the region a connected graph a crawler can traverse.
   */
  async getNearbyVenues(venue: Venue, limit = 6): Promise<Venue[]> {
    const ring = await this.activeVenuesInRegion(venue.region);
    const start = ring.findIndex(v => v.id === venue.id);
    const others = start === -1
      ? ring.filter(v => v.id !== venue.id)
      : [...ring.slice(start + 1), ...ring.slice(0, start)];
    return others.slice(0, limit);
  }

  /** `getAll()` already orders by region then name, so filtering keeps the ring order. */
  private async activeVenuesInRegion(region: Venue['region']): Promise<Venue[]> {
    if (this._cache) return this._cache.filter(v => v.region === region);

    const { data, error } = await this.db
      .from('venues')
      .select('*')
      .eq('region', region)
      .eq('is_active', true)
      .order('name');
    if (error) throw error;
    return (data ?? []) as Venue[];
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
