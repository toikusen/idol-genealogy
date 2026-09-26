import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SukigaoService } from '../../core/sukigao.service';
import { taipeiDayKey, taipeiTime } from '../../core/taipei-date.utils';
import { SukigaoCandidate, SukigaoUserResult } from '../../models';
import { SupabaseImgPipe } from '../../shared/supabase-img.pipe';
import { FavoriteToggleComponent } from '../../shared/favorite-toggle/favorite-toggle.component';
import { renderShareImage } from '../sukigao/sukigao-share-image';

const MEDALS = ['🥇', '🥈', '🥉'];
const MOST_PICKED_LIMIT = 6;

export interface MostPicked {
  id: string;
  count: number;
  /** How many of those games had them at #1. */
  firsts: number;
}

/** Faces that show up in the most games, ties broken by #1 finishes. */
export function mostPicked(results: readonly SukigaoUserResult[], limit = MOST_PICKED_LIMIT): MostPicked[] {
  const tally = new Map<string, MostPicked>();
  for (const r of results) {
    r.member_ids.forEach((id, i) => {
      const t = tally.get(id) ?? { id, count: 0, firsts: 0 };
      t.count++;
      if (i === 0) t.firsts++;
      tally.set(id, t);
    });
  }
  return [...tally.values()]
    .sort((a, b) => b.count - a.count || b.firsts - a.firsts)
    .slice(0, limit);
}

/** 我的最愛 → 顏控9選: a signed-in player's past TOP 9s and the faces they keep choosing. */
@Component({
  selector: 'app-favorites-sukigao',
  standalone: true,
  imports: [RouterLink, SupabaseImgPipe, FavoriteToggleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="fs" aria-label="我的顏控9選紀錄">
      @switch (state()) {
        @case ('loading') {
          <p class="fs-note" role="status">正在載入你的顏控9選紀錄…</p>
        }
        @case ('error') {
          <div class="fs-empty" role="alert">
            <p>紀錄載入失敗</p>
            <button type="button" class="fs-link-btn" (click)="load()">再試一次</button>
          </div>
        }
        @default {
          @if (results().length === 0) {
            <div class="fs-empty">
              <p class="fs-empty__title">還沒有顏控9選紀錄</p>
              <p class="fs-note">登入狀態下玩完，結果就會自動存在這裡</p>
              <a routerLink="/sukigao" class="fs-cta">去玩顏控9選 →</a>
            </div>
          } @else {
            <header class="fs-head">
              <p class="fs-head__count">你玩了 <strong>{{ results().length }}</strong> 次顏控9選</p>
              <a routerLink="/sukigao" class="fs-cta fs-cta--small">再玩一次 →</a>
            </header>

            @if (favorites().length > 0) {
              <h3 class="fs-title">你最常選的臉</h3>
              <ul class="fs-faves">
                @for (f of favorites(); track f.id) {
                  <li class="fs-fave">
                    <a class="fs-fave__face" [routerLink]="'/member/' + f.id">
                      <span class="fs-avatar fs-avatar--md">
                        @if (face(f.id).photoUrl) {
                          <img [src]="face(f.id).photoUrl | supabaseImg: 128 : 75" [alt]="face(f.id).name" width="56" height="56" loading="lazy" decoding="async" />
                        }
                      </span>
                      <span class="fs-fave__name">{{ face(f.id).name }}</span>
                      <span class="fs-fave__count">選了 {{ f.count }} 次{{ f.firsts ? ' · 🥇' + f.firsts : '' }}</span>
                    </a>
                    <app-favorite-toggle entityType="member" [entityId]="f.id" />
                  </li>
                }
              </ul>
            }

            <h3 class="fs-title">歷次紀錄</h3>
            <ol class="fs-history">
              @for (r of results(); track r.id) {
                <li class="fs-game" [class.fs-game--open]="openId() === r.id">
                  <button type="button" class="fs-game__summary" [attr.aria-expanded]="openId() === r.id" (click)="toggle(r.id)">
                    <span class="fs-game__date">{{ playedLabel(r.played_at) }}</span>
                    <span class="fs-game__first">🥇 {{ face(r.member_ids[0]).name }}</span>
                    <span class="fs-game__faces" aria-hidden="true">
                      @for (id of r.member_ids; track id; let i = $index) {
                        <span class="fs-avatar" [class.fs-avatar--top]="i < 3">
                          @if (face(id).photoUrl) {
                            <img [src]="face(id).photoUrl | supabaseImg: 96 : 70" alt="" width="40" height="40" loading="lazy" decoding="async" />
                          }
                        </span>
                      }
                    </span>
                  </button>
                  @if (openId() === r.id) {
                    <div class="fs-game__detail">
                      <ol class="fs-rank">
                        @for (id of r.member_ids; track id; let i = $index) {
                          <li class="fs-rank__row">
                            <span class="fs-rank__pos">{{ i < 3 ? medals[i] : (i + 1) + '.' }}</span>
                            <a class="fs-rank__name" [routerLink]="'/member/' + id">{{ face(id).name }}</a>
                            <app-favorite-toggle entityType="member" [entityId]="id" />
                          </li>
                        }
                      </ol>
                      <div class="fs-game__actions">
                        <button type="button" class="fs-btn" [disabled]="imageBusy() === r.id" (click)="shareImage(r)">
                          {{ imageBusy() === r.id ? '正在產生圖片…' : '📷 產生分享圖' }}
                        </button>
                        <button type="button" class="fs-link-btn fs-link-btn--danger" (click)="remove(r)">刪除這筆紀錄</button>
                      </div>
                    </div>
                  }
                </li>
              }
            </ol>
          }
        }
      }
      @if (toast()) {
        <p class="fs-toast" role="status">{{ toast() }}</p>
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .fs { display: flex; flex-direction: column; gap: 14px; padding: 4px 16px 32px; }
    @media (min-width: 769px) { .fs { padding-inline: 0; } }
    .fs-note { margin: 0; font-size: 0.82rem; color: var(--text-faint-60); text-align: center; }
    .fs-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 36px 16px; border: 1px dashed var(--border-subtle); border-radius: 16px; }
    .fs-empty p { margin: 0; }
    .fs-empty__title { font-weight: 700; color: var(--text-heading); }
    .fs-cta {
      display: inline-flex; align-items: center; margin-top: 6px; padding: 10px 20px; border-radius: 999px;
      background: linear-gradient(135deg, #f08fb4, #e0679b); color: #fff; font-weight: 700; font-size: 0.88rem;
      text-decoration: none; letter-spacing: 0.04em; box-shadow: 0 4px 14px rgba(224, 103, 155, 0.3);
    }
    .fs-cta--small { margin: 0; padding: 7px 14px; font-size: 0.8rem; }
    .fs-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .fs-head__count { margin: 0; font-size: 0.92rem; color: var(--text-secondary); }
    .fs-head__count strong { font-size: 1.3rem; color: rgba(232, 121, 160, 1); }
    .fs-title { margin: 8px 0 0; font-size: 0.78rem; font-weight: 700; letter-spacing: 0.2em; color: var(--text-label); }

    .fs-faves { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px; margin: 0; padding: 0; list-style: none; }
    .fs-fave {
      display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-radius: 14px;
      background: var(--bg-surface); border: 1px solid var(--border-subtle);
    }
    .fs-fave__face {
      display: grid; grid-template-columns: auto 1fr; grid-template-rows: auto auto; column-gap: 10px;
      align-items: center; flex: 1; min-width: 0; color: inherit; text-decoration: none;
    }
    .fs-fave__face .fs-avatar { grid-row: 1 / 3; }
    .fs-fave__name { font-weight: 700; font-size: 0.88rem; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .fs-fave__count { font-size: 0.72rem; color: var(--text-faint-60); }

    .fs-avatar {
      display: block; flex: none; width: 28px; height: 28px; border-radius: 50%; overflow: hidden;
      background: linear-gradient(135deg, var(--skel-from), var(--skel-to));
    }
    .fs-avatar img { display: block; width: 100%; height: 100%; object-fit: cover; transform: scale(1.05); }
    .fs-avatar--top { width: 40px; height: 40px; box-shadow: 0 0 0 2px rgba(232, 121, 160, 0.55); }
    .fs-avatar--md { width: 44px; height: 44px; }

    .fs-history { display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; list-style: none; }
    .fs-game { border-radius: 16px; background: var(--bg-surface); border: 1px solid var(--border-subtle); overflow: hidden; }
    .fs-game--open { border-color: rgba(232, 121, 160, 0.4); }
    .fs-game__summary {
      display: grid; grid-template-columns: 1fr auto; gap: 8px 12px; width: 100%; padding: 12px 14px;
      border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; font-family: var(--font-sans);
    }
    .fs-game__date { font-size: 0.76rem; color: var(--text-faint-60); }
    .fs-game__date { align-self: center; }
    .fs-game__first { justify-self: end; font-size: 0.8rem; font-weight: 700; max-width: 12em; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .fs-game__faces { grid-column: 1 / -1; display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    .fs-game__detail { padding: 0 14px 14px; }
    .fs-rank { margin: 0; padding: 0; list-style: none; }
    .fs-rank__row { display: flex; align-items: center; gap: 8px; padding: 2px 0; }
    .fs-rank__pos { width: 1.8rem; flex: none; color: var(--text-faint-60); font-size: 0.86rem; }
    .fs-rank__name { flex: 1; min-width: 0; color: var(--text-primary); text-decoration: none; font-size: 0.9rem; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
    .fs-game__actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-top: 10px; }
    .fs-btn {
      padding: 9px 16px; border-radius: 999px; border: 1px solid rgba(232, 121, 160, 0.4); background: var(--bg-pink-tint);
      color: var(--text-link); font-family: var(--font-sans); font-size: 0.84rem; cursor: pointer;
    }
    .fs-btn:disabled { opacity: 0.6; cursor: default; }
    .fs-link-btn { border: 0; background: none; padding: 4px; color: var(--text-secondary); font-family: var(--font-sans); font-size: 0.82rem; text-decoration: underline; cursor: pointer; }
    .fs-link-btn--danger { color: var(--text-faint-60); }
    .fs-toast { margin: 0; font-size: 0.8rem; text-align: center; color: var(--text-faint-70); }
  `],
})
export class FavoritesSukigaoComponent implements OnInit {
  private readonly sukigao = inject(SukigaoService);

  readonly medals = MEDALS;
  readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  readonly results = signal<SukigaoUserResult[]>([]);
  private readonly faces = signal<Map<string, SukigaoCandidate>>(new Map());
  readonly favorites = computed(() => mostPicked(this.results()));
  readonly openId = signal<string | null>(null);
  readonly imageBusy = signal<string | null>(null);
  readonly toast = signal('');

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.state.set('loading');
    try {
      const results = await this.sukigao.getMine();
      this.faces.set(await this.cardsFor(results));
      this.results.set(results);
      this.openId.set(results[0]?.id ?? null);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  face(id: string): SukigaoCandidate {
    return this.faces().get(id) ?? { id, name: '（資料已更新）', photoUrl: '', groupNames: [], color: null, isCurrent: false };
  }

  playedLabel(iso: string): string {
    return `${taipeiDayKey(iso).replace(/-/g, '/')} ${taipeiTime(iso)}`;
  }

  toggle(id: string): void {
    this.openId.set(this.openId() === id ? null : id);
  }

  async remove(r: SukigaoUserResult): Promise<void> {
    if (typeof window !== 'undefined' && !window.confirm('要刪除這筆顏控9選紀錄嗎？')) return;
    try {
      await this.sukigao.deleteMine(r.id);
      this.results.update(list => list.filter(x => x.id !== r.id));
    } catch {
      this.showToast('刪除失敗，請稍後再試');
    }
  }

  /** Same card as the result page: share sheet on phones, download elsewhere. */
  async shareImage(r: SukigaoUserResult): Promise<void> {
    this.imageBusy.set(r.id);
    try {
      const blob = await renderShareImage(r.member_ids.map(id => this.face(id)), 'idolmaps.com/sukigao');
      const file = new File([blob], 'idolmaps-顏控9選.png', { type: 'image/png' });
      if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: '我的台灣地偶顏控9選' });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') return;
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      this.showToast('圖片產生失敗，請稍後再試');
    } finally {
      this.imageBusy.set(null);
    }
  }

  /** Pool cards first (edge-cached, with groups); anyone no longer in the pool from members. */
  private async cardsFor(results: readonly SukigaoUserResult[]): Promise<Map<string, SukigaoCandidate>> {
    const wanted = new Set(results.flatMap(r => r.member_ids));
    const ids = [...wanted];
    const cards = new Map<string, SukigaoCandidate>();
    if (ids.length === 0) return cards;
    try {
      const pool = await this.sukigao.getPool();
      for (const c of pool.candidates) if (wanted.has(c.id)) cards.set(c.id, c);
    } catch {
      // fall through to the direct lookup
    }
    const missing = ids.filter(id => !cards.has(id));
    if (missing.length > 0) {
      try {
        for (const m of await this.sukigao.getMembersByIds(missing)) cards.set(m.id, m);
      } catch {
        // face() shows a placeholder
      }
    }
    return cards;
  }

  private showToast(message: string): void {
    this.toast.set(message);
    setTimeout(() => this.toast.set(''), 3500);
  }
}
