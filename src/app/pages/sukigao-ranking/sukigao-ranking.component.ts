import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo.service';
import { siteUrl } from '../../core/public-url.utils';
import { SupabaseImgPipe } from '../../shared/supabase-img.pipe';
import { SUKIGAO_RANKING_LIMIT, SukigaoService } from '../../core/sukigao.service';
import { SukigaoRankingEntry, SukigaoRankingMode, SukigaoStats } from '../../models';
import { formatPct } from '../sukigao/sukigao-stats';
import { SukigaoEditCtaComponent } from '../sukigao/sukigao-edit-cta.component';

type LoadState = 'loading' | 'ready' | 'error';

/** Places 4+ start with this many rows; 看更多 reveals MORE_STEP at a time. */
const FIRST_PAGE = 10;
const MORE_STEP = 20;
/** Most places listed per tab. #1 picks spread thin, so that list is shorter. */
const MAX_PLACES: Record<SukigaoRankingMode, number> = { top9: 50, first: 30 };
/** Shares under this are a coin toss between near-ties; they aren't listed. */
const MIN_PCT = 1;

@Component({
  selector: 'app-sukigao-ranking',
  standalone: true,
  imports: [RouterLink, SupabaseImgPipe, DecimalPipe, SukigaoEditCtaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sukigao-ranking.component.html',
  styleUrls: ['../sukigao/sukigao-buttons.css', './sukigao-ranking.component.css'],
})
export class SukigaoRankingComponent implements OnInit, OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly sukigao = inject(SukigaoService);
  private readonly seo = inject(SeoService);

  readonly tabs: { mode: SukigaoRankingMode; label: string }[] = [
    { mode: 'top9', label: '最常被選進 TOP9' },
    { mode: 'first', label: '大家心中的第一' },
  ];
  readonly limit = SUKIGAO_RANKING_LIMIT;

  readonly mode = signal<SukigaoRankingMode>('top9');
  readonly state = signal<LoadState>('loading');
  readonly entries = signal<SukigaoRankingEntry[]>([]);
  /** Play count / players, and the denominator for percentages. Null: show raw counts. */
  readonly stats = signal<SukigaoStats | null>(null);
  readonly shown = signal(FIRST_PAGE);

  /** What the tab lists: at least 1% of results (when known), capped per tab. */
  readonly visible = computed(() => {
    const total = this.stats()?.total ?? 0;
    const rows = total > 0 ? this.entries().filter(e => (this.count(e) / total) * 100 >= MIN_PCT) : this.entries();
    return rows.slice(0, MAX_PLACES[this.mode()]);
  });
  /** Why the list stops: members under 1% were left out, or the tab's cap was hit. */
  readonly endNote = computed(() => {
    const total = this.stats()?.total ?? 0;
    const shown = this.visible().length;
    if (total > 0 && this.entries().some(e => (this.count(e) / total) * 100 < MIN_PCT)) return '其餘不到 1% 的成員未列出';
    if (shown >= MAX_PLACES[this.mode()] && this.entries().length > shown) return `僅列出前 ${shown} 名`;
    return '';
  });
  readonly podium = computed(() => this.visible().slice(0, 3));
  readonly rest = computed(() => this.visible().slice(3, this.shown()));
  readonly moreCount = computed(() => Math.min(MORE_STEP, this.visible().length - this.shown()));

  private destroyed = false;
  private requestId = 0;

  ngOnInit(): void {
    this.seo.setPage(
      '大家的顏控9選｜台灣地偶顏控9選 - Idol Maps',
      '參與「台灣地偶顏控9選」的匿名統計：大家最常選進 TOP9 的臉，和大家心中的第一。',
      siteUrl('/sukigao/ranking'),
      '/og-sukigao.png',
    );
    // Live aggregate — fetched in the browser only, never baked into prerender.
    if (this.isBrowser) {
      void this.load();
      void this.loadStats();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
  }

  selectTab(mode: SukigaoRankingMode): void {
    if (mode === this.mode()) return;
    this.mode.set(mode);
    this.shown.set(FIRST_PAGE);
    void this.load();
  }

  onTabKeydown(event: KeyboardEvent, index: number): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + this.tabs.length) % this.tabs.length;
    this.selectTab(this.tabs[next].mode);
    const el = (event.currentTarget as HTMLElement | null)?.parentElement?.children[next] as HTMLElement | undefined;
    el?.focus();
  }

  async load(): Promise<void> {
    const id = ++this.requestId;
    this.state.set('loading');
    try {
      const rows = await this.sukigao.getRanking(this.mode(), this.limit);
      if (this.destroyed || id !== this.requestId) return;
      this.entries.set(rows);
      this.state.set('ready');
    } catch {
      if (this.destroyed || id !== this.requestId) return;
      this.state.set('error');
    }
  }

  private async loadStats(): Promise<void> {
    try {
      const stats = await this.sukigao.getStats();
      if (!this.destroyed && stats.total > 0) this.stats.set(stats);
    } catch {
      // Percentages fall back to raw counts.
    }
  }

  showMore(): void {
    this.shown.update(n => n + MORE_STEP);
  }

  /** "32%" of all results, or "123 次" when the total isn't available. */
  value(entry: SukigaoRankingEntry): string {
    const total = this.stats()?.total ?? 0;
    const n = this.count(entry);
    return total > 0 ? formatPct((n / total) * 100) : `${n.toLocaleString('en-US')} 次`;
  }

  /** Bar length relative to #1, so the leader always fills the track. */
  bar(entry: SukigaoRankingEntry): number {
    const top = this.entries()[0];
    const max = top ? this.count(top) : 0;
    return max > 0 ? Math.max(4, Math.round((this.count(entry) / max) * 100)) : 0;
  }

  count(entry: SukigaoRankingEntry): number {
    return this.mode() === 'first' ? entry.first_place_count : entry.top9_count;
  }

  /** Competition ranking: ties share a place (1, 2, 2, 4). */
  place(index: number): number {
    const rows = this.entries();
    let i = index;
    while (i > 0 && this.count(rows[i - 1]) === this.count(rows[index])) i--;
    return i + 1;
  }
}
