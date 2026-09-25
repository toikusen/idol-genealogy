import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, PLATFORM_ID, inject, signal } from '@angular/core';
import { DecimalPipe, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SeoService } from '../../core/seo.service';
import { siteUrl } from '../../core/public-url.utils';
import { SupabaseImgPipe } from '../../shared/supabase-img.pipe';
import { SUKIGAO_RANKING_LIMIT, SukigaoService } from '../../core/sukigao.service';
import { SukigaoRankingEntry, SukigaoRankingMode } from '../../models';
import { SukigaoEditCtaComponent } from '../sukigao/sukigao-edit-cta.component';

type LoadState = 'loading' | 'ready' | 'error';

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
    { mode: 'top9', label: 'TOP9 入選次數' },
    { mode: 'first', label: '第一名次數' },
  ];
  readonly limit = SUKIGAO_RANKING_LIMIT;

  readonly mode = signal<SukigaoRankingMode>('top9');
  readonly state = signal<LoadState>('loading');
  readonly entries = signal<SukigaoRankingEntry[]>([]);

  private destroyed = false;
  private requestId = 0;

  ngOnInit(): void {
    this.seo.setPage(
      '台灣地偶顏控排行｜大家的顏控9選 - Idol Maps',
      '參與「台灣地偶顏控9選」使用者的匿名 TOP9 結果統計：最常入選與最常拿到第一名的成員。',
      siteUrl('/sukigao/ranking'),
    );
    // Live aggregate — fetched in the browser only, never baked into prerender.
    if (this.isBrowser) void this.load();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
  }

  selectTab(mode: SukigaoRankingMode): void {
    if (mode === this.mode()) return;
    this.mode.set(mode);
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
