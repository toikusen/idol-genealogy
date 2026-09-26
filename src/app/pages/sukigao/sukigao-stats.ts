import { SukigaoCandidate, SukigaoStats } from '../../models';

/** Percentages show as soon as there is any counted result. */
export const MIN_RESULTS_FOR_PERCENT = 1;

export type SukigaoTasteKey = 'mainstream' | 'balanced' | 'unique';

export interface SukigaoTaste {
  key: SukigaoTasteKey;
  label: string;
  desc: string;
}

export interface SukigaoFaceShare {
  face: SukigaoCandidate;
  /** 0–100: share of all results that picked this face (into the TOP 9, or as #1). */
  pct: number;
}

export interface SukigaoResultStats {
  total: number;
  players: number;
  /** False while there are too few results for percentages (see MIN_RESULTS_FOR_PERCENT). */
  hasPercent: boolean;
  /** Most picked into a TOP 9. */
  top: SukigaoFaceShare | null;
  /** Most picked as #1 — only when it's someone other than `top`. */
  topFirst: SukigaoFaceShare | null;
  /** Per result position: share of all results with that face in their TOP 9. */
  picks: number[];
  taste: SukigaoTaste | null;
}

const TASTES: Record<SukigaoTasteKey, SukigaoTaste> = {
  mainstream: { key: 'mainstream', label: '主流顏控', desc: '你喜歡的臉，也是大家的心頭好' },
  balanced: { key: 'balanced', label: '平衡顏控', desc: '有大家公認的神顏，也有你的私心推' },
  unique: { key: 'unique', label: '獨特顏控', desc: '你喜歡的臉很少人發現，眼光獨到' },
};

/**
 * `poolSize` is how many faces the game can show. If everyone picked at
 * random, each face would sit in 9 / poolSize of all results; the taste label
 * compares the player's picks against that baseline.
 */
export function buildResultStats(
  stats: SukigaoStats,
  resultFaces: readonly SukigaoCandidate[],
  lookup: (id: string) => SukigaoCandidate | undefined,
  poolSize: number,
): SukigaoResultStats {
  const { total } = stats;
  const hasPercent = total >= MIN_RESULTS_FOR_PERCENT;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  const share = (id: string | null, key: 'top9' | 'first'): SukigaoFaceShare | null => {
    const face = id ? lookup(id) : undefined;
    const counts = id ? stats.counts.get(id) : undefined;
    return face && counts ? { face, pct: pct(counts[key]) } : null;
  };

  const picks = resultFaces.map(f => pct(stats.counts.get(f.id)?.top9 ?? 0));
  const top = hasPercent ? share(stats.topTop9Id, 'top9') : null;
  const topFirst = hasPercent && stats.topFirstId !== stats.topTop9Id ? share(stats.topFirstId, 'first') : null;

  let taste: SukigaoTaste | null = null;
  if (hasPercent && picks.length > 0 && poolSize > 0) {
    const avg = picks.reduce((a, b) => a + b, 0) / picks.length;
    const ratio = avg / ((9 / poolSize) * 100);
    taste = TASTES[ratio >= 2.5 ? 'mainstream' : ratio >= 1.3 ? 'balanced' : 'unique'];
  }

  return { total, players: stats.players, hasPercent, top, topFirst, picks, taste };
}

/** "32%", "<1%" for a sliver, "0%" for none. */
export function formatPct(p: number): string {
  if (p <= 0) return '0%';
  if (p < 1) return '<1%';
  return `${Math.round(p)}%`;
}
