/**
 * 顏控9選 game engine — pure, serializable, framework-free.
 *
 * Every function here takes a plain-JSON state and returns a new one; nothing
 * mutates its input and nothing touches Angular, storage or the network. The
 * component renders `SukigaoGameState`, the session service persists it, and
 * this file owns every rule in between.
 *
 * Flow:
 *   preliminary  12 faces per batch, pick up to 4 → pool
 *   fill         only when the pool is < 9: top up from faces not picked
 *   elimination  only while the pool is > 18: groups of 3–4, keep the top 2
 *   final        pairwise partial insertion ranking down to an ordered TOP 9
 *   result
 */

export const TOP_N = 9;
export const BATCH_SIZE = 12;
export const MAX_PICKS_PER_BATCH = 4;
/** Elimination runs while the pool is larger than this. */
export const ELIMINATION_THRESHOLD = 18;
/** Undo depth kept in storage; the brackets never need more than ~120 steps. */
const MAX_UNDO = 150;

export type SukigaoStage = 'preliminary' | 'fill' | 'elimination' | 'final' | 'result';

// ── Seeded randomness ──────────────────────────────────────────────────────

/** mulberry32: tiny, fast, good enough for shuffling a few hundred ids. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derives an independent seed for a sub-shuffle (e.g. elimination round 2). */
export function deriveSeed(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Fisher–Yates with a seeded RNG. Same seed + same input → same order. */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = items.slice();
  const rng = createRng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── Elimination grouping ───────────────────────────────────────────────────

/**
 * Splits ids into groups of 4, using groups of 3 to absorb the remainder so
 * nobody gets a free pass: r=3 → one 3-group, r=2 → two, r=1 → three.
 * Inputs too small for that fall back to whatever is left (2 or 1).
 */
export function splitIntoGroups(ids: readonly string[]): string[][] {
  const n = ids.length;
  const r = n % 4;
  const threes = r === 0 ? 0 : 4 - r;
  const groups: string[][] = [];
  if (n >= threes * 3) {
    const fours = (n - threes * 3) / 4;
    let i = 0;
    for (let g = 0; g < fours; g++, i += 4) groups.push(ids.slice(i, i + 4));
    for (let g = 0; g < threes; g++, i += 3) groups.push(ids.slice(i, i + 3));
    return groups;
  }
  // n < 9 with an awkward remainder — only reachable through direct calls.
  for (let i = 0; i < n; i += 4) groups.push(ids.slice(i, i + 4));
  return groups;
}

/** How many of a group advance: 2 from 3–4, 1 from a pair, a lone face walks through. */
export function advanceCount(groupSize: number): number {
  if (groupSize >= 3) return 2;
  return Math.min(groupSize, 1);
}

// ── Final: partial insertion ranking ───────────────────────────────────────

/**
 * Binary-insertion ranking that only cares about the top `limit`.
 *
 * `ranked` is best → worst and never longer than `limit`. Each pending face is
 * inserted by binary search over `ranked`. Once the top is full, the new face
 * is compared with the current last place first: losing there eliminates it
 * in a single comparison, winning narrows the search to the places above.
 */
export interface FinalState {
  limit: number;
  ranked: string[];
  pending: string[];
  current: string | null;
  /** Insertion window in `ranked`: the face belongs somewhere in [lo, hi]. */
  lo: number;
  hi: number;
  eliminated: string[];
  comparisons: number;
}

export function startFinal(pool: readonly string[], limit = TOP_N): FinalState {
  const [first, ...rest] = pool;
  const state: FinalState = {
    limit,
    ranked: first !== undefined ? [first] : [],
    pending: rest,
    current: null,
    lo: 0,
    hi: 0,
    eliminated: [],
    comparisons: 0,
  };
  return advanceFinal(state);
}

/** Index in `ranked` the current face is compared against, or -1 when done. */
export function finalPivot(state: FinalState): number {
  if (state.current === null || state.lo >= state.hi) return -1;
  const full = state.ranked.length >= state.limit;
  // First comparison against a full top: challenge last place.
  if (full && state.lo === 0 && state.hi === state.ranked.length) return state.ranked.length - 1;
  return Math.floor((state.lo + state.hi) / 2);
}

/** The two faces on screen: [challenger, incumbent]. */
export function finalPair(state: FinalState): [string, string] | null {
  const pivot = finalPivot(state);
  if (pivot < 0 || state.current === null) return null;
  return [state.current, state.ranked[pivot]];
}

export function isFinalDone(state: FinalState): boolean {
  return state.current === null && state.pending.length === 0;
}

export function applyFinalChoice(state: FinalState, winnerId: string): FinalState {
  const pair = finalPair(state);
  if (!pair || (winnerId !== pair[0] && winnerId !== pair[1])) return state;
  const pivot = finalPivot(state);
  const challengerWins = winnerId === pair[0];
  const next: FinalState = {
    ...state,
    lo: challengerWins ? state.lo : pivot + 1,
    hi: challengerWins ? pivot : state.hi,
    comparisons: state.comparisons + 1,
  };
  return advanceFinal(next);
}

/** Settles the current face if its window has closed, then loads the next one. */
function advanceFinal(state: FinalState): FinalState {
  let s = state;
  while (true) {
    if (s.current !== null) {
      if (s.lo < s.hi) return s;
      s = placeCurrent(s);
    }
    if (s.pending.length === 0) return s;
    const [current, ...pending] = s.pending;
    s = { ...s, current, pending, lo: 0, hi: s.ranked.length };
  }
}

function placeCurrent(state: FinalState): FinalState {
  const id = state.current!;
  let ranked = state.ranked.slice();
  let eliminated = state.eliminated;
  if (state.lo >= state.limit) {
    eliminated = [...eliminated, id];
  } else {
    ranked.splice(state.lo, 0, id);
    if (ranked.length > state.limit) {
      eliminated = [...eliminated, ...ranked.slice(state.limit)];
      ranked = ranked.slice(0, state.limit);
    }
  }
  return { ...state, ranked, eliminated, current: null, lo: 0, hi: 0 };
}

/**
 * Drives the final synchronously with a comparator (a < 0 means `a` wins).
 * Used by tests and handy for simulating how many taps a pool costs.
 */
export function rankWithComparator(
  pool: readonly string[],
  compare: (a: string, b: string) => number,
  limit = TOP_N,
): FinalState {
  let state = startFinal(pool, limit);
  let pair = finalPair(state);
  while (pair) {
    state = applyFinalChoice(state, compare(pair[0], pair[1]) < 0 ? pair[0] : pair[1]);
    pair = finalPair(state);
  }
  return state;
}

// ── Whole-game state ───────────────────────────────────────────────────────

export interface EliminationState {
  round: number;
  groups: string[][];
  groupIndex: number;
  /** Faces picked ① in this round, in group order. */
  firsts: string[];
  /** Faces picked ② (and walk-throughs) in this round. */
  seconds: string[];
}

/** Everything the undo stack has to restore; kept small on purpose. */
export interface SukigaoProgress {
  stage: SukigaoStage;
  elimination: EliminationState | null;
  final: FinalState | null;
  result: string[] | null;
}

export interface SukigaoGameState extends SukigaoProgress {
  version: 1;
  sessionId: string;
  seed: number;
  candidateVersion: string;
  /** Seeded preliminary order. Frozen for the session even if the DB changes. */
  candidateIds: string[];
  batchIndex: number;
  /** Picks per preliminary batch, index-aligned with the batches. */
  batchPicks: string[][];
  /** Extra faces added on the fill screen. */
  fillPicks: string[];
  undo: SukigaoProgress[];
  startedAt: string;
  completedAt: string | null;
  /** Taipei day the result was last sent to the anonymous ranking. */
  submittedOn: string | null;
}

export interface CreateGameInput {
  sessionId: string;
  seed: number;
  candidateVersion: string;
  candidateIds: readonly string[];
  now?: Date;
}

export function createGame(input: CreateGameInput): SukigaoGameState {
  const candidateIds = seededShuffle([...new Set(input.candidateIds)], input.seed);
  return {
    version: 1,
    sessionId: input.sessionId,
    seed: input.seed >>> 0,
    candidateVersion: input.candidateVersion,
    candidateIds,
    batchIndex: 0,
    batchPicks: [],
    fillPicks: [],
    stage: 'preliminary',
    elimination: null,
    final: null,
    result: null,
    undo: [],
    startedAt: (input.now ?? new Date()).toISOString(),
    completedAt: null,
    submittedOn: null,
  };
}

export function batchCount(state: SukigaoGameState): number {
  return Math.ceil(state.candidateIds.length / BATCH_SIZE);
}

export function batchAt(state: SukigaoGameState, index: number): string[] {
  return state.candidateIds.slice(index * BATCH_SIZE, (index + 1) * BATCH_SIZE);
}

export function currentBatch(state: SukigaoGameState): string[] {
  return batchAt(state, state.batchIndex);
}

export function currentBatchPicks(state: SukigaoGameState): string[] {
  return state.batchPicks[state.batchIndex] ?? [];
}

/** Every face picked so far in the preliminary + fill, in pick order. */
export function poolIds(state: SukigaoGameState): string[] {
  return [...new Set([...state.batchPicks.flat(), ...state.fillPicks])];
}

export function togglePreliminaryPick(state: SukigaoGameState, id: string): SukigaoGameState {
  if (state.stage !== 'preliminary' || !currentBatch(state).includes(id)) return state;
  const picks = currentBatchPicks(state);
  let nextPicks: string[];
  if (picks.includes(id)) nextPicks = picks.filter(p => p !== id);
  else if (picks.length >= MAX_PICKS_PER_BATCH) return state;
  else nextPicks = [...picks, id];
  const batchPicks = state.batchPicks.slice();
  batchPicks[state.batchIndex] = nextPicks;
  return { ...state, batchPicks };
}

export function prevPreliminaryBatch(state: SukigaoGameState): SukigaoGameState {
  if (state.stage !== 'preliminary' || state.batchIndex === 0) return state;
  return { ...state, batchIndex: state.batchIndex - 1 };
}

export function nextPreliminaryBatch(state: SukigaoGameState): SukigaoGameState {
  if (state.stage !== 'preliminary') return state;
  if (state.batchIndex < batchCount(state) - 1) {
    return { ...state, batchIndex: state.batchIndex + 1 };
  }
  return enterBracket(state);
}

/** Faces offered on the fill screen: seen but not picked, in preliminary order. */
export function fillOptions(state: SukigaoGameState): string[] {
  const picked = new Set(state.batchPicks.flat());
  return state.candidateIds.filter(id => !picked.has(id));
}

export function fillShortfall(state: SukigaoGameState): number {
  return Math.max(0, TOP_N - poolIds(state).length);
}

export function toggleFillPick(state: SukigaoGameState, id: string): SukigaoGameState {
  if (state.stage !== 'fill' || !fillOptions(state).includes(id)) return state;
  const fillPicks = state.fillPicks.includes(id)
    ? state.fillPicks.filter(p => p !== id)
    : [...state.fillPicks, id];
  return { ...state, fillPicks };
}

export function confirmFill(state: SukigaoGameState): SukigaoGameState {
  if (state.stage !== 'fill' || fillShortfall(state) > 0) return state;
  return enterBracket(state);
}

/** Back from the fill screen to the last preliminary batch. */
export function backToPreliminary(state: SukigaoGameState): SukigaoGameState {
  if (state.stage !== 'fill') return state;
  return { ...state, stage: 'preliminary', batchIndex: Math.max(0, batchCount(state) - 1) };
}

/** Pool is final: route to fill / elimination / final by its size. */
function enterBracket(state: SukigaoGameState): SukigaoGameState {
  const pool = poolIds(state);
  if (pool.length < TOP_N) {
    return { ...state, stage: 'fill' };
  }
  const withUndo = pushUndo(state);
  if (pool.length > ELIMINATION_THRESHOLD) {
    return { ...withUndo, ...eliminationRound(pool, state.seed, 1) };
  }
  // The final seeds its order from the preliminary shuffle; reshuffle so the
  // earliest batches don't always get inserted first.
  return enterFinal(withUndo, seededShuffle(pool, deriveSeed(state.seed, 1000)));
}

function eliminationRound(pool: readonly string[], seed: number, round: number): Pick<SukigaoProgress, 'stage' | 'elimination'> {
  const shuffled = seededShuffle(pool, deriveSeed(seed, round));
  return {
    stage: 'elimination',
    elimination: { round, groups: splitIntoGroups(shuffled), groupIndex: 0, firsts: [], seconds: [] },
  };
}

export function currentGroup(state: SukigaoGameState): string[] {
  const e = state.elimination;
  if (state.stage !== 'elimination' || !e) return [];
  return e.groups[e.groupIndex] ?? [];
}

/**
 * Records the ordered picks for the current group and moves on. `picks` must
 * list exactly `advanceCount(group.length)` distinct faces from the group.
 */
export function submitEliminationGroup(state: SukigaoGameState, picks: readonly string[]): SukigaoGameState {
  const e = state.elimination;
  const group = currentGroup(state);
  if (!e || group.length === 0) return state;
  const need = advanceCount(group.length);
  if (picks.length !== need || new Set(picks).size !== need || picks.some(p => !group.includes(p))) {
    return state;
  }
  const next: EliminationState = {
    ...e,
    groupIndex: e.groupIndex + 1,
    firsts: [...e.firsts, picks[0]],
    seconds: [...e.seconds, ...picks.slice(1)],
  };
  const withUndo = pushUndo(state);
  if (next.groupIndex < next.groups.length) {
    return { ...withUndo, elimination: next };
  }
  return finishEliminationRound(withUndo, next);
}

function finishEliminationRound(state: SukigaoGameState, e: EliminationState): SukigaoGameState {
  const survivors = [...e.firsts, ...e.seconds];
  if (survivors.length > ELIMINATION_THRESHOLD) {
    return { ...state, ...eliminationRound(survivors, state.seed, e.round + 1) };
  }
  // Group winners go in first: they tend to settle high, so the ② picks that
  // follow often lose to last place in a single comparison.
  const firsts = seededShuffle(e.firsts, deriveSeed(state.seed, 2000 + e.round));
  const seconds = seededShuffle(e.seconds, deriveSeed(state.seed, 3000 + e.round));
  return enterFinal(state, [...firsts, ...seconds]);
}

function enterFinal(state: SukigaoGameState, pool: string[]): SukigaoGameState {
  const final = startFinal(pool, TOP_N);
  const base: SukigaoGameState = { ...state, stage: 'final', elimination: null, final };
  return isFinalDone(final) ? completeGame(base) : base;
}

export function chooseFinal(state: SukigaoGameState, winnerId: string): SukigaoGameState {
  if (state.stage !== 'final' || !state.final) return state;
  const final = applyFinalChoice(state.final, winnerId);
  if (final === state.final) return state;
  const next: SukigaoGameState = { ...pushUndo(state), final };
  return isFinalDone(final) ? completeGame(next) : next;
}

function completeGame(state: SukigaoGameState): SukigaoGameState {
  return {
    ...state,
    stage: 'result',
    result: state.final ? state.final.ranked.slice(0, TOP_N) : [],
    completedAt: new Date().toISOString(),
  };
}

export function canUndo(state: SukigaoGameState): boolean {
  return state.undo.length > 0;
}

/** Restores the previous bracket step (group pick or pairwise choice). */
export function undo(state: SukigaoGameState): SukigaoGameState {
  if (state.undo.length === 0) return state;
  const prev = state.undo[state.undo.length - 1];
  return {
    ...state,
    ...prev,
    undo: state.undo.slice(0, -1),
    completedAt: prev.stage === 'result' ? state.completedAt : null,
  };
}

function pushUndo(state: SukigaoGameState): SukigaoGameState {
  const snapshot: SukigaoProgress = {
    stage: state.stage,
    elimination: state.elimination,
    final: state.final,
    result: state.result,
  };
  return { ...state, undo: [...state.undo, snapshot].slice(-MAX_UNDO) };
}

/** Overall 0–1 progress estimate for the progress bar. */
export function stageProgress(state: SukigaoGameState): number {
  switch (state.stage) {
    case 'preliminary':
      return batchCount(state) === 0 ? 0 : state.batchIndex / batchCount(state);
    case 'fill':
      return 1;
    case 'elimination': {
      const e = state.elimination!;
      return e.groups.length === 0 ? 0 : e.groupIndex / e.groups.length;
    }
    case 'final': {
      const f = state.final!;
      const total = f.ranked.length + f.pending.length + f.eliminated.length + (f.current ? 1 : 0);
      const settled = f.ranked.length + f.eliminated.length;
      return total === 0 ? 0 : settled / total;
    }
    case 'result':
      return 1;
  }
}

/** Structural check for state read back from storage. */
export function isGameState(value: unknown): value is SukigaoGameState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<SukigaoGameState>;
  const stages: SukigaoStage[] = ['preliminary', 'fill', 'elimination', 'final', 'result'];
  return v.version === 1
    && typeof v.sessionId === 'string'
    && typeof v.seed === 'number'
    && typeof v.candidateVersion === 'string'
    && Array.isArray(v.candidateIds)
    && v.candidateIds.every(id => typeof id === 'string')
    && typeof v.batchIndex === 'number'
    && Array.isArray(v.batchPicks)
    && Array.isArray(v.fillPicks)
    && Array.isArray(v.undo)
    && stages.includes(v.stage as SukigaoStage)
    && (v.stage !== 'elimination' || !!v.elimination)
    && (v.stage !== 'final' || !!v.final)
    && (v.stage !== 'result' || Array.isArray(v.result));
}
