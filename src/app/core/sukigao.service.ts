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

/** Distinct group names among `candidates`, for the "XX 團體" count. */
export function countGroups(candidates: readonly SukigaoCandidate[]): number {
  return new Set(candidates.flatMap(c => c.groupNames)).size;
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
  /** Added in migration 108; absent before it runs, which reads as current. */
  is_current?: boolean | null;
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
      const edge = await fetchEdge<CandidateRow[]>('/api/sukigao-candidates');
      if (edge) return buildPool(edge);
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
    const out: SukigaoCandidate[] = [];
    // Chunked: ids travel in the query string, which has a length limit.
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await this.supabase.client
        .from('members')
        .select('id,name,photo_url,color')
        .in('id', ids.slice(i, i + 100));
      if (error) throw error;
      for (const m of (data ?? []) as { id: string; name: string; photo_url: string | null; color: string | null }[]) {
        out.push({ id: m.id, name: m.name, photoUrl: m.photo_url ?? '', groupNames: [], color: m.color, isCurrent: false });
      }
    }
    return out;
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
      // The edge endpoint always serves the top 100, the only size the UI asks for.
      let rows = limit === SUKIGAO_RANKING_LIMIT
        ? await fetchEdge<SukigaoRankingEntry[]>(`/api/sukigao-ranking?mode=${mode}`)
        : null;
      if (!rows) {
        const { data, error } = await this.supabase.client.rpc('get_sukigao_ranking', {
          p_mode: mode,
          p_limit: limit,
        });
        if (error) throw error;
        rows = (data ?? []) as SukigaoRankingEntry[];
      }
      return rows.map(row => ({
        ...row,
        top9_count: Number(row.top9_count),
        first_place_count: Number(row.first_place_count),
      }));
    });
  }
}

/**
 * Reads one of the edge-cached /api/sukigao-* endpoints (functions/api). They
 * absorb traffic bursts; when one is missing (ng serve, a failed deploy) or
 * errors, callers fall back to Supabase directly, so this never throws.
 */
async function fetchEdge<T>(path: string): Promise<T | null> {
  if (typeof fetch !== 'function' || typeof window === 'undefined') return null;
  try {
    const res = await fetch(path, { headers: { Accept: 'application/json' } });
    if (!res.ok || !(res.headers.get('Content-Type') ?? '').includes('application/json')) return null;
    const body: unknown = await res.json();
    return Array.isArray(body) ? (body as T) : null;
  } catch {
    return null;
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
      isCurrent: row.is_current !== false,
    });
  }
  return { candidates, version: `${candidates.length}:${maxUpdated}`, groupCount: groups.size };
}
