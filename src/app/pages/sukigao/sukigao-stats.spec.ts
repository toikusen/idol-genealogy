import { SukigaoCandidate, SukigaoStats } from '../../models';
import { buildResultStats, formatPct } from './sukigao-stats';

const face = (id: string): SukigaoCandidate => ({ id, name: id, photoUrl: '', groupNames: [], color: null, isCurrent: true });

function stats(total: number, counts: Record<string, [number, number]>, topTop9Id: string | null, topFirstId: string | null): SukigaoStats {
  return {
    total,
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
    // Baseline with 300 faces: 3% per face.
    const all = (n: number) => Object.fromEntries(faces.map(f => [f.id, [n, 0] as [number, number]]));
    expect(buildResultStats(stats(100, all(10), 'p0', null), faces, lookup, 300).taste!.key).toBe('mainstream');
    expect(buildResultStats(stats(100, all(5), 'p0', null), faces, lookup, 300).taste!.key).toBe('balanced');
    expect(buildResultStats(stats(100, all(2), 'p0', null), faces, lookup, 300).taste!.key).toBe('unique');
  });
});

describe('formatPct', () => {
  it('rounds, and marks slivers', () => {
    expect(formatPct(0)).toBe('0%');
    expect(formatPct(0.4)).toBe('<1%');
    expect(formatPct(31.6)).toBe('32%');
  });
});
