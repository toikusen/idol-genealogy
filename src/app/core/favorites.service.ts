import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { FavoriteEntityType, UserFavorite } from '../models';

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly _favorites = signal<UserFavorite[]>([]);
  private _userId: string | null = null;
  private _loaded = false;

  private get db() { return this.supabase.client; }

  constructor(private supabase: SupabaseService) {}

  /** Call once after login to populate the Signal. */
  async load(userId: string): Promise<void> {
    if (this._loaded && this._userId === userId) return;
    this._userId = userId;
    const { data, error } = await this.db
      .from('user_favorites')
      .select('*')
      .eq('user_id', userId);
    if (error) throw error;
    this._favorites.set(data ?? []);
    this._loaded = true;
  }

  isFavorite(type: FavoriteEntityType, entityId: string): boolean {
    return this._favorites().some(
      f => f.entity_type === type && f.entity_id === entityId
    );
  }

  favoriteIds(type: FavoriteEntityType): string[] {
    return this._favorites()
      .filter(f => f.entity_type === type)
      .map(f => f.entity_id);
  }

  favorites(type?: FavoriteEntityType): UserFavorite[] {
    const all = this._favorites();
    return type ? all.filter(f => f.entity_type === type) : all;
  }

  async add(type: FavoriteEntityType, entityId: string): Promise<void> {
    if (!this._userId) return;
    const entry: UserFavorite = {
      user_id: this._userId,
      entity_type: type,
      entity_id: entityId,
      created_at: new Date().toISOString(),
    };
    // Optimistic update
    this._favorites.update(favs => [...favs, entry]);
    const { error } = await this.db.from('user_favorites').insert({
      user_id: this._userId,
      entity_type: type,
      entity_id: entityId,
    });
    if (error) {
      // Rollback
      this._favorites.update(favs =>
        favs.filter(f => !(f.entity_type === type && f.entity_id === entityId))
      );
      throw error;
    }
  }

  async remove(type: FavoriteEntityType, entityId: string): Promise<void> {
    if (!this._userId) return;
    const prev = this._favorites();
    // Optimistic update
    this._favorites.update(favs =>
      favs.filter(f => !(f.entity_type === type && f.entity_id === entityId))
    );
    const { error } = await this.db
      .from('user_favorites')
      .delete()
      .eq('user_id', this._userId)
      .eq('entity_type', type)
      .eq('entity_id', entityId);
    if (error) {
      // Rollback
      this._favorites.set(prev);
      throw error;
    }
  }

  reset(): void {
    this._favorites.set([]);
    this._userId = null;
    this._loaded = false;
  }
}
