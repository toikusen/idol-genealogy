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
    const raw = data ?? [];
    const valid = await this.pruneDeleted(userId, raw);
    this._favorites.set(valid);
    this._loaded = true;
  }

  /** Remove favorites whose group/member no longer exists in the DB. */
  private async pruneDeleted(userId: string, favs: UserFavorite[]): Promise<UserFavorite[]> {
    const groupIds = favs.filter(f => f.entity_type === 'group').map(f => f.entity_id);
    const memberIds = favs.filter(f => f.entity_type === 'member').map(f => f.entity_id);

    const [groupRes, memberRes] = await Promise.all([
      groupIds.length
        ? this.db.from('groups').select('id').in('id', groupIds)
        : Promise.resolve({ data: [], error: null }),
      memberIds.length
        ? this.db.from('members').select('id').in('id', memberIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    // A failed live-check must not be mistaken for "everything was deleted",
    // or we would wipe the user's favorites. Skip pruning entirely on error.
    if (groupRes.error || memberRes.error) {
      console.error('Skipping favorites prune; live-check query failed', groupRes.error ?? memberRes.error);
      return favs;
    }

    const liveGroups = new Set((groupRes.data ?? []).map((r: { id: string }) => r.id));
    const liveMembers = new Set((memberRes.data ?? []).map((r: { id: string }) => r.id));

    const stale = favs.filter(f =>
      (f.entity_type === 'group' && !liveGroups.has(f.entity_id)) ||
      (f.entity_type === 'member' && !liveMembers.has(f.entity_id))
    );

    if (stale.length > 0) {
      // Clean up stale rows, grouped by entity_type to keep it to one DELETE per type.
      const staleIdsByType = new Map<FavoriteEntityType, string[]>();
      for (const f of stale) {
        const ids = staleIdsByType.get(f.entity_type) ?? [];
        ids.push(f.entity_id);
        staleIdsByType.set(f.entity_type, ids);
      }

      await Promise.all(
        Array.from(staleIdsByType.entries()).map(async ([entityType, ids]) => {
          const { error } = await this.db.from('user_favorites')
            .delete()
            .eq('user_id', userId)
            .eq('entity_type', entityType)
            .in('entity_id', ids);
          if (error) console.error('Failed to prune stale favorites', entityType, error);
        })
      );
    }

    return favs.filter(f =>
      (f.entity_type === 'group' && liveGroups.has(f.entity_id)) ||
      (f.entity_type === 'member' && liveMembers.has(f.entity_id))
    );
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
    if (this.isFavorite(type, entityId)) return;

    const prev = this._favorites();
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
      this._favorites.set(prev);
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
