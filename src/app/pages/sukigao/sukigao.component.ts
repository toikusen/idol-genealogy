import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo.service';
import { AnalyticsService } from '../../core/analytics.service';
import { siteUrl } from '../../core/public-url.utils';
import { taipeiDayKey } from '../../core/taipei-date.utils';
import { SupabaseImgPipe } from '../../shared/supabase-img.pipe';
import { SukigaoPool, SukigaoService } from '../../core/sukigao.service';
import { SukigaoSessionService } from '../../core/sukigao-session.service';
import {
  BATCH_SIZE,
  MAX_PICKS_PER_BATCH,
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
  prevPreliminaryBatch,
  seededShuffle,
  stageProgress,
  submitEliminationGroup,
  toggleFillPick,
  togglePreliminaryPick,
  undo,
} from '../../core/sukigao-engine';
import { SukigaoCandidate } from '../../models';
import { SukigaoCardComponent } from './sukigao-card.component';
import { SukigaoResultComponent, SukigaoShareMethod, SukigaoSubmitState } from './sukigao-result.component';

type ViewState = 'loading' | 'error' | 'intro' | 'game' | 'too-few';

const FILL_PAGE_SIZE = 12;
const PRELOAD_WIDTH_GRID = 360;
const PRELOAD_WIDTH_LARGE = 480;
/** Pause after the ② pick so the badge is visible before the next group. */
const GROUP_ADVANCE_DELAY_MS = 260;

@Component({
  selector: 'app-sukigao',
  standalone: true,
  imports: [RouterLink, SupabaseImgPipe, SukigaoCardComponent, SukigaoResultComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sukigao.component.html',
  styleUrls: ['./sukigao-buttons.css', './sukigao.component.css'],
})
export class SukigaoComponent implements OnInit, OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly sukigao = inject(SukigaoService);
  private readonly session = inject(SukigaoSessionService);
  private readonly seo = inject(SeoService);
  private readonly analytics = inject(AnalyticsService);
  private readonly imgPipe = new SupabaseImgPipe();

  readonly TOP_N = TOP_N;
  readonly BATCH_SIZE = BATCH_SIZE;
  readonly MAX_PICKS = MAX_PICKS_PER_BATCH;

  // Starts as 'intro' on both server and browser so hydration sees the same
  // markup; pool-dependent bits show placeholders until getPool() resolves.
  readonly view = signal<ViewState>('intro');
  readonly pool = signal<SukigaoPool | null>(null);
  readonly game = signal<SukigaoGameState | null>(null);
  /** Candidate metadata by id: the current pool plus any stale ids a saved session still uses. */
  private readonly faces = signal<Map<string, SukigaoCandidate>>(new Map());
  /** Ordered ①② picks for the elimination group on screen (not persisted until complete). */
  readonly groupPicks = signal<string[]>([]);
  readonly fillPage = signal(0);
  readonly submitState = signal<SukigaoSubmitState>('idle');
  readonly submitReplaced = signal(false);

  private destroyed = false;
  private groupTimer: ReturnType<typeof setTimeout> | null = null;
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

  readonly previewFaces = computed(() => {
    const p = this.pool();
    if (!p) return [];
    // Stable per day, so the hero doesn't reshuffle on every visit within a day.
    const seed = Number(taipeiDayKey(new Date().toISOString()).replace(/-/g, ''));
    return seededShuffle(p.candidates, seed).slice(0, 9);
  });

  ngOnInit(): void {
    this.seo.setPage(
      '台灣地偶顏控9選｜選出最中你臉的9位偶像 - Idol Maps',
      '從台灣地下偶像中憑直覺選出最喜歡的9張臉，產生你的台灣地偶顏控 TOP9。',
      siteUrl('/sukigao'),
    );
    // Storage and the candidate pool are browser-only; SSR renders the intro shell.
    if (!this.isBrowser) return;
    void this.load(false);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
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
        await this.fillMissingFaces(saved, faces);
        if (this.destroyed) return;
      }
      this.faces.set(faces);
      this.pool.set(pool);
      if (saved) {
        this.game.set(saved);
        this.submitState.set(saved.submittedOn === this.today() ? 'done' : 'idle');
        this.view.set('game');
        this.preloadAhead();
      } else {
        this.view.set(pool.candidates.length >= TOP_N ? 'intro' : 'too-few');
      }
    } catch {
      if (this.destroyed) return;
      this.view.set('error');
    }
  }

  /** A saved session keeps its ids even if members left the pool since; fetch their cards. */
  private async fillMissingFaces(state: SukigaoGameState, faces: Map<string, SukigaoCandidate>): Promise<void> {
    const missing = state.candidateIds.filter(id => !faces.has(id));
    if (missing.length === 0) return;
    try {
      for (const m of await this.sukigao.getMembersByIds(missing)) faces.set(m.id, m);
    } catch {
      // Placeholders below keep the session playable.
    }
    for (const id of missing) {
      if (!faces.has(id)) faces.set(id, { id, name: '（資料已更新）', photoUrl: '', groupNames: [], color: null });
    }
  }

  // ── Game lifecycle ──

  start(): void {
    const pool = this.pool();
    if (!pool || pool.candidates.length < TOP_N) return;
    const game = createGame({
      sessionId: this.session.newSessionId(),
      seed: this.session.newSeed(),
      candidateVersion: pool.version,
      candidateIds: pool.candidates.map(c => c.id),
    });
    this.faces.set(new Map(pool.candidates.map(c => [c.id, c])));
    this.groupPicks.set([]);
    this.fillPage.set(0);
    this.submitState.set('idle');
    this.submitReplaced.set(false);
    this.commit(game);
    this.view.set('game');
    this.analytics.trackEvent('sukigao_start', { candidate_count: pool.candidates.length });
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
    if (this.groupTimer) clearTimeout(this.groupTimer);
    this.view.set(this.pool() ? 'intro' : 'loading');
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
    if (this.stage() !== 'final' || event.altKey || event.ctrlKey || event.metaKey) return;
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
    if (this.groupPicks().length > 0) {
      this.groupPicks.set([]);
      return;
    }
    if (this.groupTimer) {
      clearTimeout(this.groupTimer);
      this.groupTimer = null;
    }
    this.update(undo);
  }

  async submit(): Promise<void> {
    const g = this.game();
    if (!g?.result || g.result.length !== TOP_N || this.submitState() === 'sending') return;
    this.submitState.set('sending');
    try {
      const res = await this.sukigao.submit(this.session.getBrowserId(), g.result, g.candidateVersion);
      if (this.destroyed) return;
      this.submitReplaced.set(res.replaced);
      this.submitState.set('done');
      const latest = this.game();
      if (latest) this.commit({ ...latest, submittedOn: res.submittedOn || this.today() });
      this.analytics.trackEvent('sukigao_submit', { replaced: res.replaced });
    } catch {
      if (this.destroyed) return;
      // The result stays in state + storage; only the network step failed.
      this.submitState.set('error');
    }
  }

  onShared(method: SukigaoShareMethod): void {
    this.analytics.trackEvent('sukigao_share', { method });
  }

  private onStageEntered(g: SukigaoGameState): void {
    if (g.stage === 'final') {
      this.analytics.trackEvent('sukigao_final_start', { pool_size: this.finalPoolSize(g) });
    } else if (g.stage === 'result') {
      this.analytics.trackEvent('sukigao_complete', { comparisons: g.final?.comparisons ?? 0 });
    }
    this.preloadAhead();
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
    this.game.set(next);
    this.session.save(next);
    if (prev?.stage !== next.stage || prev?.batchIndex !== next.batchIndex) this.preloadAhead();
    if (prev?.stage === 'result' && next.stage !== 'result') this.submitState.set('idle');
    if (next.stage === 'fill' && prev?.stage !== 'fill') this.fillPage.set(0);
  }

  private resolve(ids: readonly string[]): SukigaoCandidate[] {
    const faces = this.faces();
    return ids.map(id => faces.get(id) ?? { id, name: '…', photoUrl: '', groupNames: [], color: null });
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
