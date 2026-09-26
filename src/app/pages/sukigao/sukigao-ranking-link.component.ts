import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';

/**
 * The way into 大家的顏控排行. `card` is the prominent block used on the intro
 * and result pages; `pill` is the compact version for the result top bar.
 */
@Component({
  selector: 'app-sukigao-ranking-link',
  standalone: true,
  imports: [RouterLink, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (variant === 'pill') {
      <a routerLink="/sukigao/ranking" class="srl-pill">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3.5 4"/><path d="M17 6h3a3 3 0 0 1-3.5 4"/></svg>
        顏控排行
      </a>
    } @else {
      <a routerLink="/sukigao/ranking" class="srl-card">
        <span class="srl-card__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8"/><path d="M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3.5 4"/><path d="M17 6h3a3 3 0 0 1-3.5 4"/></svg>
        </span>
        <span class="srl-card__text">
          <strong class="srl-card__title">大家的顏控排行</strong>
          <span class="srl-card__sub">
            看看誰是最多人選的臉@if (plays) {<span class="srl-card__plays"> · {{ plays | number }} 次</span>}
          </span>
        </span>
        <svg class="srl-card__arrow" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
      </a>
    }
  `,
  styles: [`
    :host { display: block; width: 100%; }
    :host(.srl-inline) { display: inline-block; width: auto; }

    .srl-card {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      box-sizing: border-box;
      padding: 12px 14px;
      border-radius: 16px;
      border: 1.5px solid rgba(232, 121, 160, 0.45);
      background:
        radial-gradient(120% 160% at 0% 0%, rgba(240, 143, 180, 0.2), transparent 60%),
        var(--bg-surface);
      color: var(--text-primary);
      text-decoration: none;
      box-shadow: 0 4px 16px rgba(232, 121, 160, 0.14);
      transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
    }
    .srl-card:hover,
    .srl-card:focus-visible {
      transform: translateY(-1px);
      border-color: rgba(232, 121, 160, 0.7);
      box-shadow: 0 8px 22px rgba(232, 121, 160, 0.22);
    }
    .srl-card__icon {
      display: grid;
      place-items: center;
      flex: none;
      width: 42px;
      height: 42px;
      border-radius: 50%;
      background: linear-gradient(135deg, #f08fb4, #e0679b);
      color: #fff;
      box-shadow: 0 3px 10px rgba(224, 103, 155, 0.35);
    }
    .srl-card__text {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
      text-align: left;
    }
    .srl-card__title {
      font-size: 1rem;
      letter-spacing: 0.06em;
      color: var(--text-heading);
    }
    .srl-card__sub {
      font-size: 0.76rem;
      color: var(--text-faint-70);
    }
    .srl-card__plays { white-space: nowrap; }
    .srl-card__arrow {
      flex: none;
      color: rgba(232, 121, 160, 1);
      transition: transform 0.15s ease;
    }
    .srl-card:hover .srl-card__arrow { transform: translateX(3px); }

    .srl-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-height: 36px;
      padding: 6px 14px;
      border-radius: 999px;
      border: 1.5px solid rgba(232, 121, 160, 0.5);
      background: var(--bg-surface);
      color: rgba(224, 103, 155, 1);
      font-size: 0.82rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-decoration: none;
      white-space: nowrap;
    }
    .srl-pill:hover { background: var(--bg-pink-tint-hover); }

    @media (prefers-reduced-motion: reduce) {
      .srl-card, .srl-card__arrow { transition: none; }
    }
  `],
})
export class SukigaoRankingLinkComponent {
  @Input() variant: 'card' | 'pill' = 'card';
  /** Optional play count shown under the title. */
  @Input() plays: number | null = null;
}
