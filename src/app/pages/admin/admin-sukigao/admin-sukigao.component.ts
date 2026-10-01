import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SukigaoService } from '../../../core/sukigao.service';
import { SukigaoAdminStats } from '../../../models';
import { SupabaseImgPipe } from '../../../shared/supabase-img.pipe';

export type AdminSukigaoSort = 'top9' | 'first';
export type AdminSukigaoFilter = 'all' | 'current' | 'graduated';

export interface AdminSukigaoRow {
  id: string;
  name: string;
  groups: string;
  photoUrl: string;
  /** False for graduates; null when the member has left the pool (no photo…). */
  isCurrent: boolean | null;
  top9: number;
  first: number;
}

/** Share bands, the same cut-offs the public result used before 116. */
export const ADMIN_SUKIGAO_BANDS = [
  { key: 'high', label: '≥ 3%' },
  { key: 'mid', label: '1–3%' },
  { key: 'low', label: '< 1%' },
  { key: 'zero', label: '0（沒被選過）' },
] as const;

/** Member rows shown at first, and added per 查看更多. */
export const ADMIN_SUKIGAO_PAGE = 30;

const SCOPE_LABELS: Record<string, string> = { current: '現役', all: '現役＋畢業' };

/**
 * 後台 → 顏控9選統計. The per-member numbers that used to be public (TOP 9
 * picks, first places, shares). get_sukigao_admin_stats() refuses non-staff,
 * so this page is only a view; the route guard is not what protects the data.
 */
@Component({
  selector: 'app-admin-sukigao',
  standalone: true,
  imports: [DecimalPipe, RouterLink, SupabaseImgPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-sukigao.component.html',
})
export class AdminSukigaoComponent implements OnInit {
  readonly loading = signal(true);
  readonly error = signal('');
  readonly stats = signal<SukigaoAdminStats | null>(null);
  readonly rows = signal<AdminSukigaoRow[]>([]);

  readonly sort = signal<AdminSukigaoSort>('top9');
  readonly filter = signal<AdminSukigaoFilter>('all');
  readonly query = signal('');
  readonly shown = signal(ADMIN_SUKIGAO_PAGE);

  readonly sorts: { key: AdminSukigaoSort; label: string }[] = [
    { key: 'top9', label: '入選 TOP9' },
    { key: 'first', label: '第一名' },
  ];
  readonly filters: { key: AdminSukigaoFilter; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'current', label: '現役' },
    { key: 'graduated', label: '畢業' },
  ];
  readonly bands = ADMIN_SUKIGAO_BANDS;

  readonly total = computed(() => this.stats()?.total ?? 0);

  readonly visibleRows = computed(() => {
    const key = this.sort();
    const other: AdminSukigaoSort = key === 'top9' ? 'first' : 'top9';
    const filter = this.filter();
    const q = this.query().trim().toLowerCase();
    return this.rows()
      .filter(r => filter === 'all' || (filter === 'current' ? r.isCurrent === true : r.isCurrent !== true))
      .filter(r => !q || r.name.toLowerCase().includes(q) || r.groups.toLowerCase().includes(q))
      .sort((a, b) => b[key] - a[key] || b[other] - a[other] || a.name.localeCompare(b.name));
  });

  readonly pagedRows = computed(() => this.visibleRows().slice(0, this.shown()));
  readonly remaining = computed(() => Math.max(0, this.visibleRows().length - this.shown()));

  /** How many members fall in each share band (TOP 9 picks), current vs graduated. */
  readonly bandCounts = computed(() => {
    const total = this.total();
    const count = (isCurrent: boolean) => {
      const rows = this.rows().filter(r => (r.isCurrent === true) === isCurrent);
      return this.bands.map(band => rows.filter(r => bandOf(r.top9, total) === band.key).length);
    };
    return { current: count(true), graduated: count(false) };
  });

  readonly today = computed(() => this.stats()?.daily.at(-1) ?? null);
  readonly dailyMax = computed(() => Math.max(1, ...(this.stats()?.daily ?? []).map(d => d.plays)));

  constructor(private sukigao: SukigaoService) {}

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [stats, pool] = await Promise.all([
        this.sukigao.getAdminStats(),
        this.sukigao.getPool().catch(() => null),
      ]);
      this.stats.set(stats);
      this.rows.set(buildAdminRows(stats, pool?.candidates ?? []));
    } catch (e: unknown) {
      this.error.set(e instanceof Error && e.message ? e.message : '載入失敗');
    } finally {
      this.loading.set(false);
    }
  }

  pct(n: number): string {
    const total = this.total();
    if (total <= 0 || n <= 0) return '0%';
    const p = (n / total) * 100;
    return p < 1 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`;
  }

  scopeLabel(scope: string): string {
    return SCOPE_LABELS[scope] ?? '未記錄';
  }

  barHeight(plays: number): number {
    return Math.round((plays / this.dailyMax()) * 100);
  }

  setSort(sort: AdminSukigaoSort): void {
    this.sort.set(sort);
    this.shown.set(ADMIN_SUKIGAO_PAGE);
  }

  setFilter(filter: AdminSukigaoFilter): void {
    this.filter.set(filter);
    this.shown.set(ADMIN_SUKIGAO_PAGE);
  }

  onQuery(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.shown.set(ADMIN_SUKIGAO_PAGE);
  }

  showMore(): void {
    this.shown.update(n => n + ADMIN_SUKIGAO_PAGE);
  }
}

export function bandOf(top9: number, total: number): (typeof ADMIN_SUKIGAO_BANDS)[number]['key'] {
  if (top9 <= 0 || total <= 0) return 'zero';
  const p = (top9 / total) * 100;
  return p >= 3 ? 'high' : p >= 1 ? 'mid' : 'low';
}

/** Every face in the pool (so the never-picked show up too), plus anyone picked who has since left it. */
export function buildAdminRows(
  stats: SukigaoAdminStats,
  pool: readonly { id: string; name: string; photoUrl: string; groupNames: string[]; isCurrent: boolean }[],
): AdminSukigaoRow[] {
  const counts = new Map(stats.members.map(m => [m.member_id, m]));
  const rows: AdminSukigaoRow[] = pool.map(c => ({
    id: c.id,
    name: c.name,
    groups: c.groupNames.join('・') || 'Solo',
    photoUrl: c.photoUrl,
    isCurrent: c.isCurrent,
    top9: counts.get(c.id)?.top9 ?? 0,
    first: counts.get(c.id)?.first ?? 0,
  }));
  const inPool = new Set(pool.map(c => c.id));
  for (const m of stats.members) {
    if (inPool.has(m.member_id)) continue;
    rows.push({ id: m.member_id, name: m.name, groups: '', photoUrl: '', isCurrent: null, top9: m.top9, first: m.first });
  }
  return rows;
}
