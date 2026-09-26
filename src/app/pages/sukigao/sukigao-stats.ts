import { SukigaoCandidate, SukigaoStats } from '../../models';

/** Percentages show as soon as there is any counted result. */
export const MIN_RESULTS_FOR_PERCENT = 1;

/**
 * A pick below this share of results is shown as 慧眼 (you spotted her
 * early), never as a small number like 0% or <1% that the member herself
 * might see in a shared result.
 */
export const RARE_BELOW_PCT = 3;

export type SukigaoTasteKey =
  | 'box'
  | 'nostalgic'
  | 'ceiling'
  | 'treasure'
  | 'same-first'
  | 'group-tour'
  | 'mainstream'
  | 'balanced'
  | 'unique';

export interface SukigaoTaste {
  key: SukigaoTasteKey;
  label: string;
  desc: string;
}

/**
 * Types that compare against everyone's picks (天花板, 挖寶, 冠軍同好) need
 * enough results that the player's own game doesn't make up the "consensus".
 */
export const MIN_RESULTS_FOR_CROWD_TYPES = 30;

export interface SukigaoFaceShare {
  face: SukigaoCandidate;
  /** 0–100: share of all results that picked this face (into the TOP 9, or as #1). */
  pct: number;
}

export interface SukigaoResultStats {
  total: number;
  /** Games played, replays included — the headline count. */
  plays: number;
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
  box: { key: 'box', label: '箱推', desc: '同一團就佔了你 TOP9 好幾席，整團都是你的菜' },
  nostalgic: { key: 'nostalgic', label: '考古顏控', desc: '畢業的她們，依然是你心中的神顏' },
  ceiling: { key: 'ceiling', label: '顏控天花板', desc: '你選的都是大家的心頭好，你的眼光跟大家一致' },
  treasure: { key: 'treasure', label: '神秘挖寶人', desc: '好幾位是還沒被很多人發現的臉，你總能先看見她們的美' },
  'same-first': { key: 'same-first', label: '冠軍同好', desc: '你的第一名，也是最多人的第一名' },
  'group-tour': { key: 'group-tour', label: '百團巡禮', desc: '9 位幾乎來自不同團，每一團都有你的菜' },
  mainstream: { key: 'mainstream', label: '主流顏控', desc: '你喜歡的臉，也是大家的心頭好' },
  balanced: { key: 'balanced', label: '平衡顏控', desc: '有大家公認的神顏，也有你的私心推' },
  unique: { key: 'unique', label: '獨特顏控', desc: '你喜歡的臉還沒被很多人發現，眼光獨到' },
};

/** Every type, in the order they are checked (for tests and docs). */
export const TASTE_KEYS = Object.keys(TASTES) as SukigaoTasteKey[];

/**
 * The first type that fits wins, most specific first: the TOP9 itself
 * (箱推 / graduates), then how it lines up with everyone else, then
 * group spread, and finally the mainstream → unique scale every result fits.
 */
export function pickTaste(
  stats: SukigaoStats,
  faces: readonly SukigaoCandidate[],
  picks: readonly number[],
  poolSize: number,
): SukigaoTaste | null {
  if (faces.length === 0 || poolSize <= 0) return null;

  // Solo members count as a group of their own.
  const groupOf = (f: SukigaoCandidate) => f.groupNames[0] ?? `solo:${f.id}`;
  const perGroup = new Map<string, number>();
  faces.forEach(f => perGroup.set(groupOf(f), (perGroup.get(groupOf(f)) ?? 0) + 1));
  const biggestGroup = Math.max(...perGroup.values());

  if (biggestGroup >= 4) return TASTES.box;
  if (faces.filter(f => !f.isCurrent).length >= 3) return TASTES.nostalgic;

  // If everyone picked at random, each face would be in 9 / poolSize of results.
  const baseline = (9 / poolSize) * 100;
  if (stats.total >= MIN_RESULTS_FOR_CROWD_TYPES) {
    const hot = new Set(
      [...stats.counts.entries()]
        .filter(([, c]) => c.top9 > 0)
        .sort((a, b) => b[1].top9 - a[1].top9)
        .slice(0, 10)
        .map(([id]) => id),
    );
    if (faces.filter(f => hot.has(f.id)).length >= 6) return TASTES.ceiling;
    if (picks.filter(p => p < baseline * 0.5).length >= 4) return TASTES.treasure;
    if (stats.topFirstId && faces[0].id === stats.topFirstId) return TASTES['same-first'];
  }

  if (perGroup.size >= 8) return TASTES['group-tour'];

  const avg = picks.reduce((a, b) => a + b, 0) / picks.length;
  const ratio = avg / baseline;
  return TASTES[ratio >= 2.5 ? 'mainstream' : ratio >= 1.3 ? 'balanced' : 'unique'];
}

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

  const taste = hasPercent ? pickTaste(stats, resultFaces, picks, poolSize) : null;

  return { total, plays: stats.plays, players: stats.players, hasPercent, top, topFirst, picks, taste };
}

/** "32%", "<1%" for a sliver, "0%" for none. */
export function formatPct(p: number): string {
  if (p <= 0) return '0%';
  if (p < 1) return '<1%';
  return `${Math.round(p)}%`;
}
