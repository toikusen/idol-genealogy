import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Group, GroupVideo, Team, GroupLeaderboardEntry, GroupRecentHeatEntry, GroupTrendingEntry, RelatedGroup } from '../models';
import { isChannelId } from './youtube-feed.utils';
import { kanaVariants } from './japanese.utils';
import { isPublicGroupRecord } from './public-record.utils';
import { isNotFoundError } from './supabase.utils';
import { TtlCache } from './ttl-cache';

@Injectable({ providedIn: 'root' })
export class GroupService {
  private get db() { return this.supabase.client; }
  private _allCache: Group[] | null = null;
  private _allPromise: Promise<Group[]> | null = null;
  private _byIdCache = new Map<string, Group | null>();
  private readonly _publicCountCache = new TtlCache<number>(60_000);
  private readonly _recentPopularCache = new TtlCache<GroupRecentHeatEntry[]>(60_000);
  private readonly _trendingCache = new TtlCache<GroupTrendingEntry[]>(60_000);
  private readonly _teamsCache = new TtlCache<Team[]>(120_000);

  constructor(private supabase: SupabaseService) {}

  async getAll(): Promise<Group[]> {
    if (this._allCache) return this._allCache;
    if (this._allPromise) return this._allPromise;
    this._allPromise = Promise.resolve(
      this.db.from('groups').select('*').order('name', { ascending: true })
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
      .from('groups')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    return count ?? 0;
  }

  async getPublicCount(): Promise<number> {
    return this._publicCountCache.get('all', async () => {
      const { data, error } = await this.db
        .from('groups')
        .select('name,name_jp');
      if (error) throw error;
      return (data ?? []).filter(isPublicGroupRecord).length;
    });
  }

  invalidateCache() {
    this._allCache = null;
    this._byIdCache.clear();
    this._publicCountCache.invalidate();
  }

  async search(query: string): Promise<Group[]> {
    const safe = query.replace(/[%_\\]/g, c => `\\${c}`);
    const variants = kanaVariants(safe);
    const nameFilters = variants.map(v => `name.ilike.%${v}%`).join(',');
    const nameJpFilters = variants.map(v => `name_jp.ilike.%${v}%`).join(',');
    const { data, error } = await this.db
      .from('groups').select('*')
      .or(`${nameFilters},${nameJpFilters}`);
    if (error) throw error;
    return data ?? [];
  }

  async searchCompanies(query: string): Promise<string[]> {
    const safe = query.replace(/[%_\\]/g, c => `\\${c}`);
    const { data, error } = await this.db
      .from('groups').select('company')
      .ilike('company', `%${safe}%`)
      .not('company', 'is', null);
    if (error) throw error;
    const unique = [...new Set((data ?? []).map(g => g.company as string))];
    return unique.sort();
  }

  async getById(id: string): Promise<Group | null> {
    if (this._byIdCache.has(id)) return this._byIdCache.get(id)!;
    const { data, error } = await this.db
      .from('groups').select('*').eq('id', id).single();
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

  async getTeamsByGroup(groupId: string): Promise<Team[]> {
    return this._teamsCache.get(groupId, async () => {
      const { data, error } = await this.db
        .from('teams').select('*').eq('group_id', groupId);
      if (error) throw error;
      return data ?? [];
    });
  }

  async create(group: Partial<Group>): Promise<string> {
    const { data, error } = await this.db.from('groups').insert(group).select('id').single();
    if (error) throw error;
    this.invalidateCache();
    return data.id as string;
  }

  async update(id: string, group: Partial<Group>): Promise<void> {
    const { error } = await this.db.from('groups').update(group).eq('id', id);
    if (error) throw error;
    this.invalidateCache();
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.db.from('groups').delete().eq('id', id);
    if (error) throw error;
    this.invalidateCache();
  }

  /**
   * Groups to recommend alongside `groupId`, best first: co-visited by other
   * readers, then same company / shared member / same debut era as fallback.
   * All of it is derived server-side, so a group needs no extra curation to
   * show up here.
   */
  async getRelated(groupId: string, limit = 12): Promise<RelatedGroup[]> {
    const { data, error } = await this.db.rpc(
      'get_related_groups', { p_group_id: groupId, p_limit: limit }
    );
    if (error) throw error;
    return ((data ?? []) as RelatedGroup[]).filter(isPublicGroupRecord);
  }

  /**
   * Top videos from the group's YouTube channel, ranked by view count.
   *
   * Browser-only — callers must guard with isPlatformBrowser. Returns [] on any
   * failure: a missing video strip is not worth surfacing an error on a group page.
   */
  async getChannelVideos(channelId: string | null, names: (string | null)[] = []): Promise<GroupVideo[]> {
    if (!isChannelId(channelId)) return [];

    const query = new URLSearchParams({ channel: channelId! });
    // Sent so a company channel shared by several groups can be filtered down to
    // this group's videos. Ignored when nothing in the channel matches.
    for (const name of names) if (name?.trim()) query.append('match', name.trim());

    try {
      const res = await fetch(`/api/youtube-videos?${query}`);
      return res.ok ? await res.json() : [];
    } catch {
      return [];
    }
  }

  /**
   * Resolves a YouTube channel URL to its UC... ID via the server (the browser
   * cannot fetch youtube.com directly — CORS).
   *
   * Returns the ID, or null when the URL is genuinely not a channel. Throws on a
   * transient upstream failure so callers can leave a stored ID untouched
   * instead of nulling it out.
   */
  async resolveYouTubeChannelId(url: string): Promise<string | null> {
    const res = await fetch(`/api/youtube-channel-id?url=${encodeURIComponent(url)}`);
    if (res.status === 400) return null; // not a channel URL
    if (!res.ok) throw new Error('YouTube 暫時無法連線,頻道 ID 未更新');
    const { channelId } = await res.json() as { channelId: string | null };
    return channelId;
  }

  async createTeam(team: Partial<Team>): Promise<void> {
    const { error } = await this.db.from('teams').insert(team);
    if (error) throw error;
    this._teamsCache.invalidate();
  }

  async updateTeam(id: string, team: Partial<Team>): Promise<void> {
    const { error } = await this.db.from('teams').update(team).eq('id', id);
    if (error) throw error;
    this._teamsCache.invalidate();
  }

  async deleteTeam(id: string): Promise<void> {
    const { error } = await this.db.from('teams').delete().eq('id', id);
    if (error) throw error;
    this._teamsCache.invalidate();
  }

  async getTopByViews(limit: number): Promise<GroupLeaderboardEntry[]> {
    const { data, error } = await this.supabase.client.rpc(
      'get_top_groups_by_views', { p_limit: limit }
    );
    if (error) throw error;
    return (data ?? []) as GroupLeaderboardEntry[];
  }

  async getRecentPopular(limit: number, windowDays = 7): Promise<GroupRecentHeatEntry[]> {
    return this._recentPopularCache.get(`${limit}:${windowDays}`, async () => {
      const { data, error } = await this.supabase.client.rpc(
        'get_recent_popular_groups', { p_limit: limit, p_window_days: windowDays }
      );
      if (error) throw error;
      return (data ?? []) as GroupRecentHeatEntry[];
    });
  }

  async getTrending(limit: number): Promise<GroupTrendingEntry[]> {
    return this._trendingCache.get(String(limit), async () => {
      const { data, error } = await this.supabase.client.rpc(
        'get_trending_groups', { p_limit: limit }
      );
      if (error) throw error;
      return (data ?? []) as GroupTrendingEntry[];
    });
  }
}
