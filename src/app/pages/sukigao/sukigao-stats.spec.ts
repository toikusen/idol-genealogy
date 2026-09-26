import { SukigaoCandidate, SukigaoStats } from '../../models';
import { MIN_RESULTS_FOR_CROWD_TYPES, TASTE_KEYS, buildResultStats, formatPct, pickTaste } from './sukigao-stats';

const face = (id: string, group: string | null = null, isCurrent = true): SukigaoCandidate =>
  ({ id, name: id, photoUrl: '', groupNames: group ? [group] : [], color: null, isCurrent });

function stats(total: number, counts: Record<string, [number, number]>, topTop9Id: string | null, topFirstId: string | null): SukigaoStats {
  return {
    total,
    plays: total * 2,
    players: Math.round(total * 0.8),
    counts: new Map(Object.entries(counts).map(([id, [top9, first]]) => [id, { top9, first }])),
    topTop9Id,
    topFirstId,
  };
}

describe('buildResultStats', () => {
  const faces = Array.from({ length: 9 }, (_, i) => face(`p${i}`));
  const lookup = (id: string) => face(id);

  it('turns counts into shares of all results', () => {
    const s = buildResultStats(stats(200, { p0: [64, 30], star: [90, 10], ace: [50, 40] }, 'star', 'ace'), faces, lookup, 300);
    expect(s.hasPercent).toBeTrue();
    expect(s.picks[0]).toBe(32);
    expect(s.picks[1]).toBe(0);
    expect(s.top!.face.id).toBe('star');
    expect(s.top!.pct).toBe(45);
    expect(s.topFirst!.face.id).toBe('ace');
    expect(s.topFirst!.pct).toBe(20);
  });

  it('skips the #1 row when it is the same face as the most picked', () => {
    const s = buildResultStats(stats(100, { star: [60, 30] }, 'star', 'star'), faces, lookup, 300);
    expect(s.topFirst).toBeNull();
  });

  it('shows no percentages before the first counted result', () => {
    const s = buildResultStats(stats(0, {}, null, null), faces, lookup, 300);
    expect(s.hasPercent).toBeFalse();
    expect(s.top).toBeNull();
    expect(s.taste).toBeNull();
    expect(s.total).toBe(0);
  });

  it('labels taste against the random-pick baseline (9 / pool)', () => {
    // Three groups of three: no group-based type applies. Baseline with 300 faces: 3%.
    const spread = Array.from({ length: 9 }, (_, i) => face(`p${i}`, `G${i % 3}`));
    const all = (n: number) => Object.fromEntries(spread.map(f => [f.id, [n, 0] as [number, number]]));
    expect(buildResultStats(stats(20, all(10), 'p0', null), spread, lookup, 300).taste!.key).toBe('mainstream');
    expect(buildResultStats(stats(20, all(1), 'p0', null), spread, lookup, 300).taste!.key).toBe('balanced');
    expect(buildResultStats(stats(20, all(0), 'p0', null), spread, lookup, 300).taste!.key).toBe('unique');
  });
});

describe('pickTaste', () => {
  const big = MIN_RESULTS_FOR_CROWD_TYPES * 10; // 300 results
  const spread = (prefix = 'p') => Array.from({ length: 9 }, (_, i) => face(`${prefix}${i}`, `G${i % 3}`));
  const counts = (entries: [string, number, number][]) => new Map(entries.map(([id, top9, first]) => [id, { top9, first }]));
  const s = (total: number, c: Map<string, { top9: number; first: number }>, topFirstId: string | null = null): SukigaoStats =>
    ({ total, plays: total, players: total, counts: c, topTop9Id: null, topFirstId });
  const pcts = (st: SukigaoStats, faces: SukigaoCandidate[]) => faces.map(f => ((st.counts.get(f.id)?.top9 ?? 0) / st.total) * 100);
  const taste = (st: SukigaoStats, faces: SukigaoCandidate[]) => pickTaste(st, faces, pcts(st, faces), 300)!.key;

  it('has 9 types', () => {
    expect(TASTE_KEYS.length).toBe(9);
  });

  it('箱推: 4+ from one group', () => {
    const faces = [...Array.from({ length: 4 }, (_, i) => face(`a${i}`, 'Same')), ...spread().slice(0, 5)];
    expect(taste(s(big, counts([])), faces)).toBe('box');
  });

  it('考古顏控: 3+ graduated members', () => {
    const faces = spread().map((f, i) => (i < 3 ? { ...f, isCurrent: false } : f));
    expect(taste(s(big, counts([])), faces)).toBe('nostalgic');
  });

  it('顏控天花板: 6+ from the overall top 10', () => {
    const faces = spread();
    const c = counts(faces.map((f, i) => [f.id, i < 6 ? 200 - i : 1, 0] as [string, number, number]));
    for (let i = 0; i < 20; i++) c.set(`x${i}`, { top9: 50, first: 0 });
    expect(taste(s(big, c), faces)).toBe('ceiling');
  });

  it('神秘挖寶人: 4+ faces well below the baseline', () => {
    const faces = spread();
    // Baseline 3% of 300 results = 9; under half of that is rare.
    const c = counts(faces.map((f, i) => [f.id, i < 4 ? 2 : 20, 0] as [string, number, number]));
    for (let i = 0; i < 20; i++) c.set(`x${i}`, { top9: 100, first: 0 });
    expect(taste(s(big, c), faces)).toBe('treasure');
  });

  it('冠軍同好: your #1 is the most common #1', () => {
    const faces = spread();
    const c = counts(faces.map(f => [f.id, 20, 0] as [string, number, number]));
    for (let i = 0; i < 20; i++) c.set(`x${i}`, { top9: 100, first: 0 });
    expect(taste(s(big, c, 'p0'), faces)).toBe('same-first');
  });

  it('crowd types wait for enough results', () => {
    const faces = spread();
    const c = counts(faces.map(f => [f.id, 1, 0] as [string, number, number]));
    expect(taste(s(10, c, 'p0'), faces)).not.toBe('same-first');
  });

  it('百團巡禮: 8+ different groups (solo counts as its own)', () => {
    const faces = Array.from({ length: 9 }, (_, i) => face(`p${i}`, i < 7 ? `G${i}` : null));
    const c = counts(faces.map(f => [f.id, 20, 0] as [string, number, number]));
    for (let i = 0; i < 20; i++) c.set(`x${i}`, { top9: 100, first: 0 });
    expect(taste(s(big, c), faces)).toBe('group-tour');
  });
});

describe('formatPct', () => {
  it('rounds, and marks slivers', () => {
    expect(formatPct(0)).toBe('0%');
    expect(formatPct(0.4)).toBe('<1%');
    expect(formatPct(31.6)).toBe('32%');
  });
});
