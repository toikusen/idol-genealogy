import { SukigaoCandidate, SukigaoStats } from '../../models';

/**
 * Nothing on the public result compares members with each other: the taste
 * type is read from the player's own TOP 9 only (groups, graduates), and the
 * only crowd numbers shown are how many games were played and by how many
 * people. The per-member numbers live in 後台 (admin/sukigao).
 */
export type SukigaoTasteKey =
  | 'box'
  | 'nostalgic'
  | 'double'
  | 'group-tour'
  | 'live'
  | 'wide';

export interface SukigaoTaste {
  key: SukigaoTasteKey;
  label: string;
  desc: string;
}

export interface SukigaoResultStats {
  /** Games played, replays included — the headline count. */
  plays: number;
  players: number;
}

const TASTES: Record<SukigaoTasteKey, SukigaoTaste> = {
  box: { key: 'box', label: '箱推', desc: '同一團就佔了你 TOP9 好幾席，整團都是你的菜' },
  nostalgic: { key: 'nostalgic', label: '考古顏控', desc: '畢業的她們，依然是你心中的神顏' },
  double: { key: 'double', label: '雙團心動', desc: '兩個團各有好幾位你的菜，心分成了兩半' },
  'group-tour': { key: 'group-tour', label: '百團巡禮', desc: '9 位幾乎來自不同團，每一團都有你的菜' },
  live: { key: 'live', label: '現場派顏控', desc: '9 位都是現在就能去見到的她們，下一場見' },
  wide: { key: 'wide', label: '全方位顏控', desc: '各團都有讓你心動的臉，喜好很廣' },
};

/** Every type, in the order they are checked (for tests and docs). */
export const TASTE_KEYS = Object.keys(TASTES) as SukigaoTasteKey[];

/** The first type that fits wins, most specific first; 全方位 fits every result. */
export function pickTaste(faces: readonly SukigaoCandidate[]): SukigaoTaste | null {
  if (faces.length === 0) return null;

  // Solo members count as a group of their own.
  const groupOf = (f: SukigaoCandidate) => f.groupNames[0] ?? `solo:${f.id}`;
  const perGroup = new Map<string, number>();
  faces.forEach(f => perGroup.set(groupOf(f), (perGroup.get(groupOf(f)) ?? 0) + 1));
  const sizes = [...perGroup.values()].sort((a, b) => b - a);

  if (sizes[0] >= 4) return TASTES.box;
  if (faces.filter(f => !f.isCurrent).length >= 3) return TASTES.nostalgic;
  if (sizes[0] >= 3 && (sizes[1] ?? 0) >= 3) return TASTES.double;
  if (perGroup.size >= 8) return TASTES['group-tour'];
  if (faces.every(f => f.isCurrent)) return TASTES.live;
  return TASTES.wide;
}

export function buildResultStats(stats: SukigaoStats): SukigaoResultStats {
  return { plays: stats.plays, players: stats.players };
}
