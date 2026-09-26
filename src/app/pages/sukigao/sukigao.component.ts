import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo.service';
import { AnalyticsService } from '../../core/analytics.service';
import { siteUrl } from '../../core/public-url.utils';
import { taipeiDayKey } from '../../core/taipei-date.utils';
import { SupabaseImgPipe } from '../../shared/supabase-img.pipe';
import { SukigaoPool, SukigaoService, countGroups } from '../../core/sukigao.service';
import { SukigaoScope, SukigaoSessionService } from '../../core/sukigao-session.service';
import { SupabaseService } from '../../core/supabase.service';
import {
  BATCH_SIZE,
  SukigaoGameState,
  TOP_N,
  advanceCount,
  backToPreliminary,
  batchAt,
  batchCount,
  canUndo,
  chooseFinal,
  confirmFill,
  createGame,
  deriveSeed,
  currentBatch,
  currentBatchPicks,
  currentGroup,
  fillOptions,
  fillShortfall,
  finalPair,
  nextPreliminaryBatch,
  poolIds,
  referencedIds,
  prevPreliminaryBatch,
  seededShuffle,
  stratifiedSample,
  stageProgress,
  submitEliminationGroup,
  toggleFillPick,
  togglePreliminaryPick,
  undo,
} from '../../core/sukigao-engine';
import { SukigaoCandidate, SukigaoStats } from '../../models';
import { SukigaoResultStats, buildResultStats } from './sukigao-stats';
import { SukigaoCardComponent } from './sukigao-card.component';
import { SukigaoEditCtaComponent } from './sukigao-edit-cta.component';
import { SukigaoAccountSave, SukigaoResultComponent, SukigaoShareMethod, SukigaoSubmitState } from './sukigao-result.component';

type ViewState = 'loading' | 'error' | 'intro' | 'game' | 'too-few';

const FILL_PAGE_SIZE = 9;

/** Pool sizes on the intro: multiples of 9 so every batch is a full 3×3. 0 = everyone. */
const SIZE_OPTIONS = [
  { size: 54, icon: 'zap' },
  { size: 108, icon: 'clock' },
  { size: 0, icon: 'users' },
] as const;
/** Everyone in the scope (e.g. all ~270 current members). */
const DEFAULT_SIZE = 0;

export type SukigaoSizeIcon = (typeof SIZE_OPTIONS)[number]['icon'];

export interface SukigaoSizeOption {
  size: number;
  icon: SukigaoSizeIcon;
  count: number;
  minutes: number;
}
const IMMERSIVE_CLASS = 'sukigao-immersive';
const PRELOAD_WIDTH_GRID = 360;
const PRELOAD_WIDTH_LARGE = 480;
/** Pause after the ② pick so the badge is visible before the next group. */
const GROUP_ADVANCE_DELAY_MS = 260;

@Component({
  selector: 'app-sukigao',
  standalone: true,
  imports: [RouterLink, SupabaseImgPipe, SukigaoCardComponent, SukigaoResultComponent, SukigaoEditCtaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sukigao.component.html',
  styleUrls: ['./sukigao-buttons.css', './sukigao.component.css'],
})
export class SukigaoComponent implements OnInit, OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly sukigao = inject(SukigaoService);
  private readonly session = inject(SukigaoSessionService);
  private readonly supabase = inject(SupabaseService);
  private readonly seo = inject(SeoService);
  private readonly analytics = inject(AnalyticsService);
  private readonly doc = inject(DOCUMENT);
  private readonly imgPipe = new SupabaseImgPipe();

  readonly TOP_N = TOP_N;
  readonly BATCH_SIZE = BATCH_SIZE;

  // Starts as 'intro' on both server and browser so hydration sees the same
  // markup; pool-dependent bits show placeholders until getPool() resolves.
  readonly view = signal<ViewState>('intro');
  readonly pool = signal<SukigaoPool | null>(null);
  readonly game = signal<SukigaoGameState | null>(null);
  /** Candidate metadata by id: the current pool plus any stale ids a saved session still uses. */
  private readonly faces = signal<Map<string, SukigaoCandidate>>(new Map());
  /** Ids repairFaces() already went looking for, so a miss is fetched once. */
  private readonly facesRequested = new Set<string>();
  /** Ordered ①② picks for the elimination group on screen (not persisted until complete). */
  readonly groupPicks = signal<string[]>([]);
  readonly fillPage = signal(0);
  readonly submitState = signal<SukigaoSubmitState>('idle');
  readonly submitReplaced = signal(false);
  /** Saving the finished TOP 9 to a signed-in player's 我的最愛 history. */
  readonly accountSave = signal<SukigaoAccountSave>('idle');

  private destroyed = false;
  private groupTimer: ReturnType<typeof setTimeout> | null = null;
  /** Bumped per submit; a reply only counts if it is still the latest one. */
  private submitSeq = 0;
  private submitChain: Promise<unknown> = Promise.resolve();
  private readonly preloaded = new Set<string>();

  // ── Derived state (recomputed only when the game signal changes) ──
  readonly stage = computed(() => this.game()?.stage ?? null);
  readonly batch = computed(() => this.resolve(this.game() ? currentBatch(this.game()!) : []));
  readonly batchPicks = computed(() => new Set(this.game() ? currentBatchPicks(this.game()!) : []));
  readonly batchNumber = computed(() => (this.game()?.batchIndex ?? 0) + 1);
  readonly batchTotal = computed(() => (this.game() ? batchCount(this.game()!) : 0));
  readonly isLastBatch = computed(() => this.batchNumber() >= this.batchTotal());
  readonly poolSize = computed(() => (this.game() ? poolIds(this.game()!).length : 0));
  readonly progress = computed(() => (this.game() ? Math.round(stageProgress(this.game()!) * 100) : 0));

  readonly preliminaryPickCount = computed(() => this.game()?.batchPicks.flat().length ?? 0);
  readonly shortfall = computed(() => (this.game() ? fillShortfall(this.game()!) : 0));
  private readonly fillAll = computed(() => (this.game()?.stage === 'fill' ? fillOptions(this.game()!) : []));
  readonly fillPageCount = computed(() => Math.max(1, Math.ceil(this.fillAll().length / FILL_PAGE_SIZE)));
  readonly fillItems = computed(() => {
    const page = Math.min(this.fillPage(), this.fillPageCount() - 1);
    return this.resolve(this.fillAll().slice(page * FILL_PAGE_SIZE, (page + 1) * FILL_PAGE_SIZE));
  });
  readonly fillPicked = computed(() => new Set(this.game()?.fillPicks ?? []));

  readonly group = computed(() => this.resolve(this.game() ? currentGroup(this.game()!) : []));
  readonly groupNeed = computed(() => advanceCount(this.group().length));
  readonly eliminationRound = computed(() => this.game()?.elimination?.round ?? 1);
  readonly groupNumber = computed(() => (this.game()?.elimination?.groupIndex ?? 0) + 1);
  readonly groupTotal = computed(() => this.game()?.elimination?.groups.length ?? 0);
  readonly eliminationFieldSize = computed(() =>
    (this.game()?.elimination?.groups ?? []).reduce((sum, grp) => sum + grp.length, 0));

  readonly pair = computed(() => {
    const g = this.game();
    const p = g?.final ? finalPair(g.final) : null;
    if (!p || !g?.final) return [];
    // Challenger is always pair[0]; flip sides per comparison (seeded, so a
    // reload shows the same layout) to avoid a left-hand bias.
    const flip = (deriveSeed(g.seed, 5000 + g.final.comparisons) & 1) === 1;
    return this.resolve(flip ? [p[1], p[0]] : p);
  });
  readonly comparisons = computed(() => this.game()?.final?.comparisons ?? 0);
  readonly canUndo = computed(() => (this.game() ? canUndo(this.game()!) : false));

  readonly resultFaces = computed(() => this.resolve(this.game()?.result ?? []));

  /** Everyone's numbers for the result page; null until loaded (or if they fail). */
  readonly stats = signal<SukigaoStats | null>(null);
  readonly resultStats = computed<SukigaoResultStats | null>(() => {
    const stats = this.stats();
    const faces = this.faces();
    if (!stats) return null;
    return buildResultStats(stats, this.resultFaces(), id => faces.get(id), this.pool()?.candidates.length ?? 0);
  });

  /** Where the saved game stands, for the intro's resume button. */
  readonly savedSummary = computed(() => {
    const g = this.game();
    if (!g) return null;
    switch (g.stage) {
      case 'preliminary': return `海選 ${g.batchIndex + 1} / ${batchCount(g)}`;
      case 'fill': return '補選';
      case 'elimination': return '候選淘汰';
      case 'final': return 'FINAL';
      case 'result': return null;
    }
  });

  // ── Intro: scope + size ──
  readonly scope = signal<SukigaoScope>('current');
  readonly sizeChoice = signal<number>(DEFAULT_SIZE);

  readonly scopeCounts = computed(() => {
    const all = this.pool()?.candidates ?? [];
    return { current: all.filter(c => c.isCurrent).length, all: all.length };
  });

  readonly scopeCandidates = computed(() => {
    const all = this.pool()?.candidates ?? [];
    return this.scope() === 'current' ? all.filter(c => c.isCurrent) : all;
  });

  readonly scopeGroupCount = computed(() => countGroups(this.scopeCandidates()));

  /** Size options that make sense for the scope; "全部" is always offered. */
  readonly sizeOptions = computed<SukigaoSizeOption[]>(() => {
    const total = this.scopeCandidates().length;
    return SIZE_OPTIONS
      .filter(o => o.size === 0 || o.size < total)
      .map(o => {
        const count = o.size === 0 ? total : o.size;
        const batches = Math.ceil(count / BATCH_SIZE);
        // ~10s per 3×3 batch plus ~1.5 min of elimination / final.
        return { ...o, count, minutes: Math.max(1, Math.round((batches * 10 + 90) / 60)) };
      });
  });

  readonly selectedSize = computed(() => {
    const options = this.sizeOptions();
    return options.find(o => o.size === this.sizeChoice()) ?? options[options.length - 1];
  });

  readonly canStart = computed(() => this.scopeCandidates().length >= TOP_N);

  selectScope(scope: SukigaoScope): void {
    this.scope.set(scope);
  }

  selectSize(size: number): void {
    this.sizeChoice.set(size);
  }

  /** Fresh per visit; the preview only renders in the browser, so no hydration concern. */
  private readonly previewSeed = this.session.newSeed();

  readonly previewFaces = computed(() => {
    const p = this.pool();
    if (!p) return [];
    return seededShuffle(p.candidates, this.previewSeed).slice(0, 9);
  });

  constructor() {
    // Safety net: any face the game refers to that has no card data (however
    // it got there) is fetched instead of staying a blank "…" card.
    effect(() => {
      const g = this.game();
      const faces = this.faces();
      if (!g || !this.isBrowser) return;
      const missing = referencedIds(g).filter(id => !faces.has(id) && !this.facesRequested.has(id));
      if (missing.length > 0) untracked(() => void this.repairFaces(missing, g.stage));
    });

    // While a round is on screen, the app's floating login pill / theme toggle
    // would cover the bottom action bar; styles.css hides them under this class.
    effect(() => {
      const immersive = this.isBrowser && this.view() === 'game' && this.stage() !== 'result';
      this.doc.body.classList.toggle(IMMERSIVE_CLASS, immersive);
    });
  }

  ngOnInit(): void {
    this.seo.setPage(
      '台灣地偶顏控9選｜選出最中你臉的9位偶像 - Idol Maps',
      '從台灣地下偶像中憑直覺選出最喜歡的9張臉，產生你的台灣地偶顏控 TOP9。',
      siteUrl('/sukigao'),
      '/og-sukigao.png',
    );
    // Storage and the candidate pool are browser-only; SSR renders the intro shell.
    if (!this.isBrowser) return;
    void this.load(false);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.isBrowser) this.doc.body.classList.remove(IMMERSIVE_CLASS);
    if (this.groupTimer) clearTimeout(this.groupTimer);
  }

  /** `showSpinner` is false for the first load, which runs under the hydrated intro. */
  async load(showSpinner = true): Promise<void> {
    if (showSpinner) this.view.set('loading');
    try {
      const pool = await this.sukigao.getPool();
      if (this.destroyed) return;
      const faces = new Map(pool.candidates.map(c => [c.id, c]));
      const saved = this.session.load();
      if (saved) {
        await this.fillMissingFaces(referencedIds(saved), faces);
        if (this.destroyed) return;
      }
      this.faces.set(faces);
      this.pool.set(pool);
      // Every visit lands on the intro; a saved game is offered via resume().
      if (saved) {
        this.game.set(saved);
        // submittedOn is cleared whenever a result is undone, so it always refers to saved.result.
        this.submitState.set(saved.submittedOn ? 'done' : 'idle');
        this.view.set('intro');
        // Played signed out, then signed in: the finished game lands in their history now.
        if (saved.stage === 'result') void this.saveToAccount();
      } else {
        this.view.set(pool.candidates.length >= TOP_N ? 'intro' : 'too-few');
      }
    } catch {
      if (this.destroyed) return;
      this.view.set('error');
    }
  }

  /** A saved session keeps its ids even if members left the pool since; fetch their cards. */
  private async fillMissingFaces(ids: readonly string[], faces: Map<string, SukigaoCandidate>): Promise<void> {
    const missing = ids.filter(id => !faces.has(id));
    if (missing.length === 0) return;
    try {
      for (const m of await this.sukigao.getMembersByIds(missing)) faces.set(m.id, m);
    } catch {
      // Placeholders below keep the session playable.
    }
    for (const id of missing) {
      if (!faces.has(id)) faces.set(id, { id, name: '（資料已更新）', photoUrl: '', groupNames: [], color: null, isCurrent: false });
    }
  }

  // ── Game lifecycle ──

  start(): void {
    const pool = this.pool();
    if (!pool || !this.canStart()) return;
    const current = this.game();
    if (current && current.stage !== 'result' && typeof window !== 'undefined'
        && !window.confirm('開始新的一局會清除上次的進度，確定嗎？')) {
      return;
    }
    const seed = this.session.newSeed();
    const scope = this.scope();
    const count = this.selectedSize().count;
    const ids = stratifiedSample(
      this.scopeCandidates().map(c => ({ id: c.id, stratum: c.groupNames[0] ?? 'solo' })),
      count,
      seed,
    );
    const game = createGame({
      sessionId: this.session.newSessionId(),
      seed,
      // Scope and size ride along so aggregate stats can tell games apart.
      candidateVersion: `${pool.version}|${scope}|${ids.length}`,
      candidateIds: ids,
    });
    this.faces.set(new Map(pool.candidates.map(c => [c.id, c])));
    this.clearGroupTimer();
    this.groupPicks.set([]);
    this.fillPage.set(0);
    this.submitState.set('idle');
    this.submitReplaced.set(false);
    this.commit(game);
    this.view.set('game');
    this.analytics.trackEvent('sukigao_start', { candidate_count: ids.length, scope });
    this.scrollTop();
  }

  restart(confirmFirst = true): void {
    const g = this.game();
    if (confirmFirst && g && g.stage !== 'result' && typeof window !== 'undefined'
        && !window.confirm('確定要重新開始嗎？目前的進度會被清除。')) {
      return;
    }
    this.session.clear();
    this.game.set(null);
    this.groupPicks.set([]);
    this.clearGroupTimer();
    this.view.set(this.pool() ? 'intro' : 'loading');
    this.scrollTop();
  }

  /** Picks up the saved game from the intro. */
  resume(): void {
    const g = this.game();
    if (!g) return;
    this.view.set('game');
    if (g.stage === 'result') {
      void this.loadStats();
      void this.saveToAccount();
    }
    // A result saved before it reached the ranking (offline, closed tab) goes in now;
    // one already sent — today or on an earlier day — is only shown, never re-counted.
    if (g.stage === 'result' && !g.submittedOn && this.submitState() !== 'done') {
      void this.submit();
    }
    this.preloadAhead();
    this.scrollTop();
  }

  /** Back to the intro without losing progress. */
  backToIntro(): void {
    this.groupPicks.set([]);
    this.clearGroupTimer();
    this.view.set('intro');
    this.scrollTop();
  }

  playAgain(): void {
    this.restart(false);
    this.start();
  }

  // ── Preliminary ──

  togglePick(id: string): void {
    this.update(g => togglePreliminaryPick(g, id));
  }

  prevBatch(): void {
    this.update(prevPreliminaryBatch);
    this.scrollTop();
  }

  nextBatch(): void {
    const before = this.game();
    this.update(nextPreliminaryBatch);
    const after = this.game();
    if (before?.stage === 'preliminary' && after && after.stage !== 'preliminary') {
      this.analytics.trackEvent('sukigao_preliminary_complete', { pool_size: poolIds(after).length });
      this.onStageEntered(after);
    }
    this.scrollTop();
  }

  // ── Fill ──

  toggleFill(id: string): void {
    this.update(g => toggleFillPick(g, id));
  }

  setFillPage(page: number): void {
    this.fillPage.set(Math.max(0, Math.min(page, this.fillPageCount() - 1)));
  }

  confirmFill(): void {
    this.update(confirmFill);
    const g = this.game();
    if (g && g.stage !== 'fill') this.onStageEntered(g);
    this.scrollTop();
  }

  backToPreliminary(): void {
    this.update(backToPreliminary);
    this.scrollTop();
  }

  // ── Elimination ──

  pickInGroup(id: string): void {
    if (this.groupTimer) return;
    const picks = this.groupPicks();
    if (picks.includes(id)) {
      this.groupPicks.set(picks.filter(p => p !== id));
      return;
    }
    const next = [...picks, id];
    this.groupPicks.set(next);
    if (next.length >= this.groupNeed()) {
      this.groupTimer = setTimeout(() => {
        this.groupTimer = null;
        const before = this.game();
        this.update(g => submitEliminationGroup(g, next));
        this.groupPicks.set([]);
        const after = this.game();
        if (before?.stage === 'elimination' && after?.stage !== 'elimination' && after) this.onStageEntered(after);
      }, GROUP_ADVANCE_DELAY_MS);
    }
  }

  groupBadge(id: string): string | null {
    const i = this.groupPicks().indexOf(id);
    return i === 0 ? '①' : i === 1 ? '②' : null;
  }

  // ── Final ──

  chooseFinal(id: string): void {
    const before = this.game();
    this.update(g => chooseFinal(g, id));
    const after = this.game();
    if (before?.stage === 'final' && after?.stage === 'result') this.onStageEntered(after);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (this.view() !== 'game' || this.stage() !== 'final' || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement | null;
    if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
    const pair = this.pair();
    if (pair.length !== 2) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.chooseFinal(pair[0].id);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.chooseFinal(pair[1].id);
    }
  }

  // ── Shared ──

  undo(): void {
    // A pending ①② advance is cancelled along with its picks.
    this.clearGroupTimer();
    if (this.groupPicks().length > 0) {
      this.groupPicks.set([]);
      return;
    }
    this.update(undo);
  }

  async submit(): Promise<void> {
    const g = this.game();
    if (!g?.result || g.result.length !== TOP_N || this.submitState() === 'sending') return;
    const seq = ++this.submitSeq;
    const resultKey = g.result.join(',');
    this.submitState.set('sending');
    // Requests go out one at a time, so the server always ends on the newest result.
    const previous = this.submitChain;
    const request = previous
      .catch(() => undefined)
      .then(() => this.sukigao.submit(this.session.getBrowserId(), g.result!, g.candidateVersion));
    this.submitChain = request.catch(() => undefined);
    try {
      const res = await request;
      // Ignore replies for a result that has since been undone or replaced by a new game.
      if (this.destroyed || !this.isCurrentSubmit(seq, g.sessionId, resultKey)) return;
      this.submitReplaced.set(res.replaced);
      this.submitState.set('done');
      this.commit({ ...this.game()!, submittedOn: res.submittedOn || this.today() });
      this.analytics.trackEvent('sukigao_submit', { replaced: res.replaced, auto: true });
    } catch {
      if (this.destroyed || !this.isCurrentSubmit(seq, g.sessionId, resultKey)) return;
      // The result stays in state + storage; only the network step failed.
      this.submitState.set('error');
    }
  }

  private isCurrentSubmit(seq: number, sessionId: string, resultKey: string): boolean {
    const latest = this.game();
    return seq === this.submitSeq && latest?.sessionId === sessionId && latest.result?.join(',') === resultKey;
  }

  private clearGroupTimer(): void {
    if (this.groupTimer) clearTimeout(this.groupTimer);
    this.groupTimer = null;
  }

  onShared(method: SukigaoShareMethod): void {
    this.analytics.trackEvent('sukigao_share', { method });
  }

  private onStageEntered(g: SukigaoGameState): void {
    if (g.stage === 'final') {
      this.analytics.trackEvent('sukigao_final_start', { pool_size: this.finalPoolSize(g) });
    } else if (g.stage === 'result') {
      this.analytics.trackEvent('sukigao_complete', { comparisons: g.final?.comparisons ?? 0 });
      // Every finished TOP 9 goes into the anonymous ranking; the server keeps
      // only a browser's last result per day, so replays and undos replace it.
      void this.submit();
      void this.loadStats();
      void this.saveToAccount();
    }
    this.preloadAhead();
  }

  /** Signed in: adds the finished game to 我的最愛's history (once per result). */
  async saveToAccount(): Promise<void> {
    const g = this.game();
    if (!this.isBrowser || !g?.result || g.result.length !== TOP_N) return;
    const resultKey = `${g.sessionId}|${g.result.join(',')}`;
    const stillShowing = () => {
      const latest = this.game();
      return !this.destroyed && !!latest?.result && `${latest.sessionId}|${latest.result.join(',')}` === resultKey;
    };
    let userId: string | null = null;
    try {
      userId = (await this.supabase.getSessionOnce())?.user.id ?? null;
    } catch {
      userId = null;
    }
    if (!stillShowing()) return;
    if (!userId) {
      this.accountSave.set('signed-out');
      return;
    }
    const savedKey = `${userId}|${resultKey}`;
    if (this.session.isSavedToAccount(savedKey)) {
      this.accountSave.set('saved');
      return;
    }
    this.accountSave.set('saving');
    try {
      await this.sukigao.saveMine(g.sessionId, g.result, g.candidateVersion);
      this.session.markSavedToAccount(savedKey);
      if (stillShowing()) this.accountSave.set('saved');
      this.analytics.trackEvent('sukigao_save_account', {});
    } catch {
      if (stillShowing()) this.accountSave.set('error');
    }
  }

  private async repairFaces(missing: string[], stage: string): Promise<void> {
    missing.forEach(id => this.facesRequested.add(id));
    this.analytics.trackEvent('sukigao_missing_faces', { count: missing.length, stage });
    const found = new Map<string, SukigaoCandidate>();
    await this.fillMissingFaces(missing, found);
    if (this.destroyed) return;
    this.faces.update(current => new Map([...current, ...found]));
  }

  private async loadStats(): Promise<void> {
    try {
      const stats = await this.sukigao.getStats();
      if (!this.destroyed) this.stats.set(stats);
    } catch {
      // The result page just leaves the stats card out.
    }
  }

  private finalPoolSize(g: SukigaoGameState): number {
    const f = g.final;
    if (!f) return 0;
    return f.ranked.length + f.pending.length + f.eliminated.length + (f.current ? 1 : 0);
  }

  private update(fn: (g: SukigaoGameState) => SukigaoGameState): void {
    const g = this.game();
    if (!g) return;
    const next = fn(g);
    if (next !== g) this.commit(next);
  }

  private commit(next: SukigaoGameState): void {
    const prev = this.game();
    // Leaving the result (undo) invalidates it: the next finish is a new submission.
    if (prev?.stage === 'result' && next.stage !== 'result' && next.submittedOn) next = { ...next, submittedOn: null };
    this.game.set(next);
    this.session.save(next);
    if (prev?.stage !== next.stage || prev?.batchIndex !== next.batchIndex) this.preloadAhead();
    if (prev?.stage === 'result' && next.stage !== 'result') {
      this.submitState.set('idle');
      this.accountSave.set('idle');
    }
    if (next.stage === 'fill' && prev?.stage !== 'fill') this.fillPage.set(0);
  }

  private resolve(ids: readonly string[]): SukigaoCandidate[] {
    const faces = this.faces();
    // Only for the moment before repairFaces() fills a missing card in.
    return ids.map(id => faces.get(id) ?? { id, name: '讀取中', photoUrl: '', groupNames: [], color: null, isCurrent: false });
  }

  /**
   * Warms the HTTP cache for what comes next — the next preliminary batch, the
   * next elimination group, or the whole final pool (≤ 18) — never the full list.
   */
  private preloadAhead(): void {
    const g = this.game();
    if (!g || !this.isBrowser) return;
    let ids: string[] = [];
    let width = PRELOAD_WIDTH_GRID;
    if (g.stage === 'preliminary') {
      ids = batchAt(g, g.batchIndex + 1);
    } else if (g.stage === 'elimination' && g.elimination) {
      ids = g.elimination.groups.slice(g.elimination.groupIndex + 1, g.elimination.groupIndex + 3).flat();
    } else if (g.stage === 'final' && g.final) {
      ids = [...g.final.ranked, ...g.final.pending, ...(g.final.current ? [g.final.current] : [])];
      width = PRELOAD_WIDTH_LARGE;
    }
    const faces = this.faces();
    for (const id of ids) {
      const url = this.imgPipe.transform(faces.get(id)?.photoUrl, width, 80);
      if (!url || this.preloaded.has(url)) continue;
      this.preloaded.add(url);
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
    }
  }

  private today(): string {
    return taipeiDayKey(new Date().toISOString());
  }

  private scrollTop(): void {
    if (typeof window === 'undefined') return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  }
}
