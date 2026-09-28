import { SukigaoCandidate } from '../../models';
import { TASTE_KEYS, buildResultStats, pickTaste } from './sukigao-stats';

const face = (id: string, group: string | null = null, isCurrent = true): SukigaoCandidate =>
  ({ id, name: id, photoUrl: '', groupNames: group ? [group] : [], color: null, isCurrent });

describe('buildResultStats', () => {
  it('keeps only the play and player counts', () => {
    expect(buildResultStats({ total: 200, plays: 350, players: 160 })).toEqual({ plays: 350, players: 160 });
  });
});

describe('pickTaste', () => {
  // Five groups (2+2+2+2+1), all current: no group-based type applies.
  const spread = (prefix = 'p') => Array.from({ length: 9 }, (_, i) => face(`${prefix}${i}`, `G${i % 5}`));
  const taste = (faces: SukigaoCandidate[]) => pickTaste(faces)!.key;

  it('has 6 types, none compared against other players', () => {
    expect(TASTE_KEYS).toEqual(['box', 'nostalgic', 'double', 'group-tour', 'live', 'wide']);
  });

  it('is null without a result', () => {
    expect(pickTaste([])).toBeNull();
  });

  it('箱推: 4+ from one group', () => {
    const faces = [...Array.from({ length: 4 }, (_, i) => face(`a${i}`, 'Same')), ...spread().slice(0, 5)];
    expect(taste(faces)).toBe('box');
  });

  it('solo members never make a 箱推', () => {
    const faces = Array.from({ length: 9 }, (_, i) => face(`s${i}`));
    expect(taste(faces)).toBe('group-tour');
  });

  it('考古顏控: 3+ graduated members', () => {
    const faces = spread().map((f, i) => (i < 3 ? { ...f, isCurrent: false } : f));
    expect(taste(faces)).toBe('nostalgic');
  });

  it('雙團心動: two groups with 3 each', () => {
    const faces = [
      ...Array.from({ length: 3 }, (_, i) => face(`a${i}`, 'A')),
      ...Array.from({ length: 3 }, (_, i) => face(`b${i}`, 'B')),
      face('c0', 'C'), face('d0', 'D'), face('e0', 'E'),
    ];
    expect(taste(faces)).toBe('double');
  });

  it('百團巡禮: 8+ different groups', () => {
    const faces = Array.from({ length: 9 }, (_, i) => face(`p${i}`, `G${i < 8 ? i : 0}`));
    expect(taste(faces)).toBe('group-tour');
  });

  it('現場派顏控: all nine are current', () => {
    expect(taste(spread())).toBe('live');
  });

  it('全方位顏控: everything else', () => {
    const faces = spread().map((f, i) => (i === 0 ? { ...f, isCurrent: false } : f));
    expect(taste(faces)).toBe('wide');
  });
});
