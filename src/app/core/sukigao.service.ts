import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { TtlCache } from './ttl-cache';
import { isPublicMemberRecord } from './public-record.utils';
import { SukigaoAdminStats, SukigaoCandidate, SukigaoStats, SukigaoUserResult } from '../models';

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

/** Supabase access for 顏控9選. Storage lives in SukigaoSessionService. */
@Injectable({ providedIn: 'root' })
export class SukigaoService {
  private readonly poolCache = new TtlCache<SukigaoPool>(5 * 60_000);
  private readonly statsCache = new TtlCache<SukigaoStats>(60_000);

  constructor(private supabase: SupabaseService) {}

  /** Metadata for every eligible face (no images are fetched here). */
  getPool(): Promise<SukigaoPool> {
    return this.poolCache.get('pool', async () => {
      const edge = await fetchEdge<CandidateRow[]>('/api/sukigao-candidates', Array.isArray);
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
    const result = (data ?? {}) as { submitted_on?: string; replaced?: boolean };
    return { submittedOn: result.submitted_on ?? '', replaced: !!result.replaced };
  }

  // ── Signed-in history (migration 114) ──

  /** Saves a finished game to the signed-in player's history; the same game again replaces its row. */
  async saveMine(sessionId: string, memberIds: string[], candidateVersion: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('save_my_sukigao_result', {
      p_session_id: sessionId,
      p_member_ids: memberIds,
      p_candidate_version: candidateVersion,
    });
    if (error) throw error;
  }

  /** The signed-in player's games, newest first (RLS returns only their own). */
  async getMine(): Promise<SukigaoUserResult[]> {
    const { data, error } = await this.supabase.client
      .from('sukigao_user_results')
      .select('id,session_id,member_ids,played_at')
      .order('played_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data ?? []) as SukigaoUserResult[];
  }

  async deleteMine(id: string): Promise<void> {
    const { error } = await this.supabase.client.from('sukigao_user_results').delete().eq('id', id);
    if (error) throw error;
  }

  /**
   * Just the play count, for the home page entry. Edge only — a busy home page
   * must never fall back to querying the database directly — so null when the
   * endpoint is unavailable.
   */
  async getPlayCount(): Promise<number | null> {
    const raw = await fetchEdge<StatsPayload>('/api/sukigao-stats', isStatsPayload);
    return raw ? buildStats(raw).plays : null;
  }

  /** Play and player counts for the result page. No per-member numbers are public. */
  getStats(): Promise<SukigaoStats> {
    return this.statsCache.get('stats', async () => {
      let raw = await fetchEdge<StatsPayload>('/api/sukigao-stats', isStatsPayload);
      if (!raw) {
        const { data, error } = await this.supabase.client.rpc('get_sukigao_summary');
        if (error) throw error;
        if (!isStatsPayload(data)) throw new Error('get_sukigao_summary: unexpected payload');
        raw = data;
      }
      return buildStats(raw);
    });
  }

  /** 後台: per-member pick counts. The RPC refuses anyone without a staff role. */
  async getAdminStats(): Promise<SukigaoAdminStats> {
    const { data, error } = await this.supabase.client.rpc('get_sukigao_admin_stats');
    if (error) throw error;
    return buildAdminStats((data ?? {}) as AdminStatsPayload);
  }
}

type Num = number | string;

interface StatsPayload {
  total: Num;
  plays?: Num;
  players: Num;
}

function isStatsPayload(body: unknown): body is StatsPayload {
  return !!body && typeof body === 'object' && 'total' in body;
}

export function buildStats(raw: StatsPayload): SukigaoStats {
  const total = Number(raw.total) || 0;
  return { total, plays: Number(raw.plays) || total, players: Number(raw.players) || 0 };
}

interface AdminStatsPayload extends StatsPayload {
  members?: { member_id: string; name: string; top9: Num; first: Num }[];
  setups?: { scope: string | null; size: Num | null; results: Num }[];
  daily?: { day: string; results: Num; plays: Num }[];
}

export function buildAdminStats(raw: AdminStatsPayload): SukigaoAdminStats {
  return {
    ...buildStats(raw),
    members: (raw.members ?? []).map(m => ({
      member_id: m.member_id,
      name: m.name,
      top9: Number(m.top9) || 0,
      first: Number(m.first) || 0,
    })),
    setups: (raw.setups ?? []).map(s => ({
      scope: s.scope ?? '',
      size: Number(s.size) || 0,
      results: Number(s.results) || 0,
    })),
    daily: (raw.daily ?? []).map(d => ({
      day: d.day,
      results: Number(d.results) || 0,
      plays: Number(d.plays) || 0,
    })),
  };
}

/**
 * Reads one of the edge-cached /api/sukigao-* endpoints (functions/api). They
 * absorb traffic bursts; when one is missing (ng serve, a failed deploy) or
 * errors, callers fall back to Supabase directly, so this never throws.
 */
async function fetchEdge<T>(path: string, isValid: (body: unknown) => boolean): Promise<T | null> {
  if (typeof fetch !== 'function' || typeof window === 'undefined') return null;
  try {
    const res = await fetch(path, { headers: { Accept: 'application/json' } });
    if (!res.ok || !(res.headers.get('Content-Type') ?? '').includes('application/json')) return null;
    const body: unknown = await res.json();
    return isValid(body) ? (body as T) : null;
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
