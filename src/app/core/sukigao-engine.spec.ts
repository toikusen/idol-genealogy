import {
  BATCH_SIZE,
  ELIMINATION_THRESHOLD,
  FinalState,
  MAX_PICKS_PER_BATCH,
  SukigaoGameState,
  TOP_N,
  advanceCount,
  applyFinalChoice,
  batchCount,
  canUndo,
  chooseFinal,
  confirmFill,
  createGame,
  currentBatch,
  currentGroup,
  deriveSeed,
  fillOptions,
  fillShortfall,
  finalPair,
  isGameState,
  nextPreliminaryBatch,
  poolIds,
  prevPreliminaryBatch,
  rankWithComparator,
  seededShuffle,
  splitIntoGroups,
  startFinal,
  submitEliminationGroup,
  toggleFillPick,
  togglePreliminaryPick,
  undo,
} from './sukigao-engine';

const ids = (n: number, prefix = 'm') => Array.from({ length: n }, (_, i) => `${prefix}${String(i).padStart(3, '0')}`);

/** A hidden "true" preference: lower index in `order` = prettier to this player. */
function byOrder(order: readonly string[]) {
  const rank = new Map(order.map((id, i) => [id, i]));
  return (a: string, b: string) => rank.get(a)! - rank.get(b)!;
}

function newGame(n: number, seed = 42): SukigaoGameState {
  return createGame({ sessionId: 's1', seed, candidateVersion: `${n}:x`, candidateIds: ids(n) });
}

/** Plays the preliminary picking `perBatch` faces from each batch. */
function playPreliminary(state: SukigaoGameState, perBatch: number): SukigaoGameState {
  let s = state;
  const total = batchCount(s);
  for (let b = 0; b < total; b++) {
    for (const id of currentBatch(s).slice(0, perBatch)) s = togglePreliminaryPick(s, id);
    s = nextPreliminaryBatch(s);
  }
  return s;
}

/** Plays everything after the preliminary with a hidden preference order. */
function playBracket(state: SukigaoGameState, compare: (a: string, b: string) => number): SukigaoGameState {
  let s = state;
  let guard = 0;
  while (s.stage === 'elimination' || s.stage === 'final') {
    if (++guard > 2000) throw new Error('bracket did not terminate');
    if (s.stage === 'elimination') {
      const group = currentGroup(s);
      const picks = [...group].sort(compare).slice(0, advanceCount(group.length));
      s = submitEliminationGroup(s, picks);
    } else {
      const pair = finalPair(s.final!)!;
      s = chooseFinal(s, compare(pair[0], pair[1]) < 0 ? pair[0] : pair[1]);
    }
  }
  return s;
}

describe('sukigao engine', () => {
  describe('seededShuffle', () => {
    it('is deterministic for the same seed', () => {
      const list = ids(400);
      expect(seededShuffle(list, 123)).toEqual(seededShuffle(list, 123));
    });

    it('keeps every item exactly once', () => {
      const list = ids(400);
      expect([...seededShuffle(list, 7)].sort()).toEqual(list);
    });

    it('gives different orders for different seeds', () => {
      const list = ids(50);
      expect(seededShuffle(list, 1)).not.toEqual(seededShuffle(list, 2));
    });

    it('does not mutate its input', () => {
      const list = ids(20);
      const copy = list.slice();
      seededShuffle(list, 9);
      expect(list).toEqual(copy);
    });

    it('derives distinct sub-seeds per round', () => {
      expect(deriveSeed(42, 1)).not.toBe(deriveSeed(42, 2));
      expect(deriveSeed(42, 1)).toBe(deriveSeed(42, 1));
    });
  });

  describe('createGame', () => {
    it('restores the exact same candidate order from the same seed', () => {
      expect(newGame(100, 5).candidateIds).toEqual(newGame(100, 5).candidateIds);
      expect(newGame(100, 5).candidateIds).not.toEqual(newGame(100, 6).candidateIds);
    });

    it('drops duplicate ids', () => {
      const g = createGame({ sessionId: 's', seed: 1, candidateVersion: 'v', candidateIds: ['a', 'b', 'a'] });
      expect(g.candidateIds.length).toBe(2);
    });

    it('survives a JSON round trip unchanged', () => {
      const g = playPreliminary(newGame(60), 2);
      expect(JSON.parse(JSON.stringify(g))).toEqual(g);
      expect(isGameState(JSON.parse(JSON.stringify(g)))).toBeTrue();
    });
  });

  describe('preliminary', () => {
    it('shows fixed batches of 12', () => {
      const g = newGame(30);
      expect(currentBatch(g).length).toBe(BATCH_SIZE);
      expect(batchCount(g)).toBe(3);
    });

    it(`caps picks at ${MAX_PICKS_PER_BATCH} per batch and toggles off`, () => {
      let g = newGame(30);
      const batch = currentBatch(g);
      for (const id of batch.slice(0, 6)) g = togglePreliminaryPick(g, id);
      expect(g.batchPicks[0].length).toBe(MAX_PICKS_PER_BATCH);
      g = togglePreliminaryPick(g, batch[0]);
      expect(g.batchPicks[0]).not.toContain(batch[0]);
    });

    it('ignores faces outside the current batch', () => {
      const g = newGame(30);
      const outside = g.candidateIds[20];
      expect(togglePreliminaryPick(g, outside)).toBe(g);
    });

    it('keeps picks when stepping back a batch', () => {
      let g = newGame(30);
      g = togglePreliminaryPick(g, currentBatch(g)[0]);
      g = nextPreliminaryBatch(g);
      g = prevPreliminaryBatch(g);
      expect(g.batchIndex).toBe(0);
      expect(g.batchPicks[0].length).toBe(1);
    });
  });

  describe('fill', () => {
    it('asks for a top-up instead of inventing faces when fewer than 9 were picked', () => {
      const g = playPreliminary(newGame(36), 2); // 3 batches × 2 = 6
      expect(g.stage).toBe('fill');
      expect(fillShortfall(g)).toBe(3);
      expect(confirmFill(g)).toBe(g);
    });

    it('offers only unpicked faces and continues once 9 are in the pool', () => {
      let g = playPreliminary(newGame(36), 2);
      const options = fillOptions(g);
      expect(options.length).toBe(30);
      expect(options.some(id => poolIds(g).includes(id))).toBeFalse();
      for (const id of options.slice(0, 3)) g = toggleFillPick(g, id);
      g = confirmFill(g);
      expect(g.stage).toBe('final');
    });
  });

  describe('elimination', () => {
    it('splits into groups of 3–4 with no byes', () => {
      for (let n = 9; n <= 140; n++) {
        const groups = splitIntoGroups(ids(n));
        expect(groups.flat().length).withContext(`n=${n}`).toBe(n);
        expect(groups.every(g => g.length === 3 || g.length === 4)).withContext(`n=${n}`).toBeTrue();
      }
    });

    it('never cuts a pool above the threshold below 9 in one round', () => {
      for (let n = ELIMINATION_THRESHOLD + 1; n <= 200; n++) {
        const survivors = splitIntoGroups(ids(n)).reduce((sum, g) => sum + advanceCount(g.length), 0);
        expect(survivors).withContext(`n=${n}`).toBeGreaterThanOrEqual(TOP_N);
        expect(survivors).withContext(`n=${n}`).toBeLessThan(n);
      }
    });

    it('handles odd leftovers (2 / 1) without crashing', () => {
      expect(splitIntoGroups(ids(2)).map(g => g.length)).toEqual([2]);
      expect(splitIntoGroups(ids(5)).flat().length).toBe(5);
      expect(advanceCount(2)).toBe(1);
      expect(advanceCount(1)).toBe(1);
      expect(advanceCount(0)).toBe(0);
    });

    it('shrinks the pool round by round until it is 9–18', () => {
      let g = playPreliminary(newGame(240), 4); // 20 batches × 4 = 80
      expect(g.stage).toBe('elimination');
      const compare = byOrder(ids(240));
      const sizes: number[] = [];
      let guard = 0;
      while (g.stage === 'elimination') {
        if (++guard > 500) fail('elimination did not terminate');
        const e = g.elimination!;
        if (e.groupIndex === 0) sizes.push(e.groups.flat().length);
        const group = currentGroup(g);
        g = submitEliminationGroup(g, [...group].sort(compare).slice(0, 2));
      }
      expect(sizes).toEqual([80, 40, 20]);
      expect(g.stage).toBe('final');
      const f = g.final!;
      const finalPool = f.ranked.length + f.pending.length + (f.current ? 1 : 0);
      expect(finalPool).toBe(10);
    });

    it('rejects invalid group picks', () => {
      const g = playPreliminary(newGame(120), 4); // 40
      const group = currentGroup(g);
      expect(submitEliminationGroup(g, [group[0]])).toBe(g);
      expect(submitEliminationGroup(g, [group[0], group[0]])).toBe(g);
      expect(submitEliminationGroup(g, [group[0], 'not-in-group'])).toBe(g);
    });

    it('reshuffles each round deterministically', () => {
      const a = playPreliminary(newGame(120, 3), 4);
      const b = playPreliminary(newGame(120, 3), 4);
      expect(a.elimination!.groups).toEqual(b.elimination!.groups);
    });
  });

  describe('final partial insertion ranking', () => {
    it('produces the true top 9 in order', () => {
      for (const size of [9, 10, 13, 18]) {
        const pool = seededShuffle(ids(size), size);
        const truth = ids(size);
        const result = rankWithComparator(pool, byOrder(truth));
        expect(result.ranked).withContext(`size=${size}`).toEqual(truth.slice(0, TOP_N));
      }
    });

    it('handles exactly 9 candidates', () => {
      const truth = ids(9);
      const result = rankWithComparator(seededShuffle(truth, 99), byOrder(truth));
      expect(result.ranked).toEqual(truth);
      expect(result.eliminated).toEqual([]);
    });

    it('handles 10 candidates by eliminating exactly one', () => {
      const truth = ids(10);
      const result = rankWithComparator(seededShuffle(truth, 4), byOrder(truth));
      expect(result.ranked.length).toBe(9);
      expect(result.eliminated).toEqual([truth[9]]);
    });

    it('handles 18 candidates with far fewer than all-pairs comparisons', () => {
      const truth = ids(18);
      const result = rankWithComparator(seededShuffle(truth, 18), byOrder(truth));
      expect(result.ranked).toEqual(truth.slice(0, 9));
      expect(result.eliminated.length).toBe(9);
      expect(result.comparisons).toBeLessThan((18 * 17) / 2);
      expect(result.comparisons).toBeLessThanOrEqual(60);
    });

    it('eliminates a weak challenger with a single comparison against last place', () => {
      const truth = ids(10);
      const top = rankWithComparator(truth.slice(0, 9), byOrder(truth));
      const loaded: FinalState = { ...top, current: truth[9], lo: 0, hi: 9 };
      const after = applyFinalChoice(loaded, truth[8]);
      expect(after.eliminated).toEqual([truth[9]]);
      expect(after.comparisons).toBe(top.comparisons + 1);
      expect(after.ranked).toEqual(truth.slice(0, 9));
      expect(finalPair(after)).toBeNull();
    });

    it('challenges last place first once the top is full', () => {
      const truth = ids(10);
      const s = rankWithComparator(truth.slice(0, 9), byOrder(truth));
      const loaded = { ...s, current: truth[9], lo: 0, hi: 9 };
      expect(finalPair(loaded)).toEqual([truth[9], truth[8]]);
    });

    it('ignores a winner that is not on screen', () => {
      const s = startFinal(ids(5));
      expect(applyFinalChoice(s, 'nobody')).toBe(s);
    });

    it('always ends with exactly 9 when given at least 9', () => {
      for (let size = 9; size <= 18; size++) {
        const truth = seededShuffle(ids(size), size * 7);
        const result = rankWithComparator(ids(size), byOrder(truth));
        expect(result.ranked.length).withContext(`size=${size}`).toBe(9);
        expect(new Set(result.ranked).size).toBe(9);
      }
    });
  });

  describe('full game', () => {
    it('ends with exactly 9 distinct faces from the pool', () => {
      const truth = seededShuffle(ids(400), 1);
      let g = playPreliminary(newGame(400), 3);
      g = playBracket(g, byOrder(truth));
      expect(g.stage).toBe('result');
      expect(g.result!.length).toBe(TOP_N);
      expect(new Set(g.result!).size).toBe(TOP_N);
      expect(g.completedAt).not.toBeNull();
    });

    it('goes straight to the final with a 9–18 pool', () => {
      const g = playPreliminary(newGame(48), 3); // 12
      expect(g.stage).toBe('final');
    });
  });

  describe('undo', () => {
    it('restores the previous comparison, ranking and counters', () => {
      let g = playPreliminary(newGame(48), 3);
      const before = g;
      const pair = finalPair(g.final!)!;
      g = chooseFinal(g, pair[0]);
      expect(g.final!.comparisons).toBe(1);
      expect(canUndo(g)).toBeTrue();
      g = undo(g);
      expect(g.final).toEqual(before.final);
      expect(finalPair(g.final!)).toEqual(pair);
      expect(g.stage).toBe('final');
    });

    it('steps back from the result into the final', () => {
      const truth = ids(48);
      let g = playBracket(playPreliminary(newGame(48), 3), byOrder(truth));
      expect(g.stage).toBe('result');
      g = undo(g);
      expect(g.stage).toBe('final');
      expect(g.completedAt).toBeNull();
      expect(finalPair(g.final!)).not.toBeNull();
    });

    it('steps back across an elimination group and a round boundary', () => {
      let g = playPreliminary(newGame(120), 4); // 40
      const firstGroup = currentGroup(g);
      g = submitEliminationGroup(g, firstGroup.slice(0, 2));
      g = undo(g);
      expect(currentGroup(g)).toEqual(firstGroup);
      expect(g.elimination!.firsts).toEqual([]);
    });

    it('can undo back out of the bracket into the preliminary', () => {
      let g = playPreliminary(newGame(48), 3);
      expect(g.stage).toBe('final');
      g = undo(g);
      expect(g.stage).toBe('preliminary');
      expect(g.batchIndex).toBe(batchCount(g) - 1);
      expect(canUndo(g)).toBeFalse();
    });

    it('is a no-op with nothing to undo', () => {
      const g = newGame(20);
      expect(undo(g)).toBe(g);
    });
  });

  describe('isGameState', () => {
    it('rejects foreign shapes', () => {
      expect(isGameState(null)).toBeFalse();
      expect(isGameState({ version: 2 })).toBeFalse();
      expect(isGameState({ ...newGame(20), stage: 'final', final: null })).toBeFalse();
    });
  });
});
