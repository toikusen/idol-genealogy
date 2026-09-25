import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { TtlCache } from './ttl-cache';
import { isPublicMemberRecord } from './public-record.utils';
import { SukigaoCandidate, SukigaoRankingEntry, SukigaoRankingMode } from '../models';

export interface SukigaoPool {
  candidates: SukigaoCandidate[];
  /** `count:max(updated_at)` — cheap fingerprint to tell pool revisions apart. */
  version: string;
  groupCount: number;
}

export interface SukigaoSubmitResult {
  submittedOn: string;
  replaced: boolean;
}

interface CandidateRow {
  id: string;
  name: string;
  name_roman: string | null;
  nickname: string | null;
  photo_url: string | null;
  color: string | null;
  group_names: string[] | null;
  updated_at: string | null;
}

export const SUKIGAO_RANKING_LIMIT = 100;

/** Supabase access for 顏控9選. Storage lives in SukigaoSessionService. */
@Injectable({ providedIn: 'root' })
export class SukigaoService {
  private readonly poolCache = new TtlCache<SukigaoPool>(5 * 60_000);
  private readonly rankingCache = new TtlCache<SukigaoRankingEntry[]>(60_000);

  constructor(private supabase: SupabaseService) {}

  /** Metadata for every eligible face (no images are fetched here). */
  getPool(): Promise<SukigaoPool> {
    return this.poolCache.get('pool', async () => {
      const { data, error } = await this.supabase.client.rpc('get_sukigao_candidates');
      if (error) throw error;
      return buildPool((data ?? []) as CandidateRow[]);
    });
  }

  /**
   * Faces a saved session still references but that have since left the
   * pool (graduated, photo removed…). The session keeps them; we only need
   * enough to draw their card.
   */
  async getMembersByIds(ids: string[]): Promise<SukigaoCandidate[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.supabase.client
      .from('members')
      .select('id,name,photo_url,color')
      .in('id', ids);
    if (error) throw error;
    return ((data ?? []) as { id: string; name: string; photo_url: string | null; color: string | null }[])
      .map(m => ({ id: m.id, name: m.name, photoUrl: m.photo_url ?? '', groupNames: [], color: m.color }));
  }

  async submit(browserToken: string, memberIds: string[], candidateVersion: string): Promise<SukigaoSubmitResult> {
    const { data, error } = await this.supabase.client.rpc('submit_sukigao_result', {
      p_browser_token: browserToken,
      p_member_ids: memberIds,
      p_candidate_version: candidateVersion,
    });
    if (error) throw error;
    this.rankingCache.invalidate();
    const result = (data ?? {}) as { submitted_on?: string; replaced?: boolean };
    return { submittedOn: result.submitted_on ?? '', replaced: !!result.replaced };
  }

  getRanking(mode: SukigaoRankingMode, limit = SUKIGAO_RANKING_LIMIT): Promise<SukigaoRankingEntry[]> {
    return this.rankingCache.get(`${mode}:${limit}`, async () => {
      const { data, error } = await this.supabase.client.rpc('get_sukigao_ranking', {
        p_mode: mode,
        p_limit: limit,
      });
      if (error) throw error;
      return ((data ?? []) as SukigaoRankingEntry[]).map(row => ({
        ...row,
        top9_count: Number(row.top9_count),
        first_place_count: Number(row.first_place_count),
      }));
    });
  }
}

export function buildPool(rows: CandidateRow[]): SukigaoPool {
  const candidates: SukigaoCandidate[] = [];
  const groups = new Set<string>();
  let maxUpdated = '';
  for (const row of rows) {
    if (!row.photo_url || !isPublicMemberRecord(row)) continue;
    const groupNames = (row.group_names ?? []).filter(Boolean);
    groupNames.forEach(g => groups.add(g));
    if (row.updated_at && row.updated_at > maxUpdated) maxUpdated = row.updated_at;
    candidates.push({
      id: row.id,
      name: row.name,
      photoUrl: row.photo_url,
      groupNames,
      color: row.color,
    });
  }
  return { candidates, version: `${candidates.length}:${maxUpdated}`, groupCount: groups.size };
}
