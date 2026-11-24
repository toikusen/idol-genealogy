import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalyticsService } from '../../core/analytics.service';

/** Link card from an entity page into the sukigao game. */
@Component({
  selector: 'app-sukigao-entry',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/sukigao" class="sukigao-entry" (click)="trackClick()">
      <span class="sukigao-entry__text">
        <strong class="sukigao-entry__title">台灣地偶顏控9選</strong>
        <span class="sukigao-entry__sub">憑直覺選出最中你臉的 9 位偶像</span>
      </span>
      <span class="sukigao-entry__cta" aria-hidden="true">開始玩 →</span>
    </a>
  `,
  styles: `
    .sukigao-entry {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin: 40px 0 0;
      padding: 14px 18px;
      border-radius: 18px;
      text-decoration: none;
      color: var(--text-primary);
      background:
        radial-gradient(120% 140% at 0% 0%, rgba(232, 121, 160, 0.18), transparent 60%),
        radial-gradient(120% 140% at 100% 100%, rgba(155, 107, 214, 0.14), transparent 60%),
        var(--bg-surface);
      border: 1px solid rgba(232, 121, 160, 0.28);
      box-shadow: 0 6px 24px rgba(232, 121, 160, 0.12);
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .sukigao-entry:hover,
    .sukigao-entry:focus-visible {
      border-color: rgba(232, 121, 160, 0.5);
      box-shadow: 0 10px 30px rgba(232, 121, 160, 0.2);
    }
    .sukigao-entry__text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .sukigao-entry__title {
      font-size: 1rem;
      letter-spacing: 0.06em;
      color: var(--text-heading);
    }
    .sukigao-entry__sub {
      font-size: 0.78rem;
      color: var(--text-faint-70);
    }
    .sukigao-entry__cta {
      flex: none;
      padding: 8px 16px;
      border-radius: 999px;
      background: linear-gradient(135deg, #f08fb4, #e0679b);
      color: #fff;
      font-size: 0.85rem;
      font-weight: 700;
      white-space: nowrap;
    }
  `,
})
export class SukigaoEntryComponent {
  /** Which page hosts the card; reported so each placement can be measured. */
  @Input({ required: true }) page!: 'member' | 'group';

  private readonly analytics = inject(AnalyticsService);

  trackClick(): void {
    this.analytics.trackEvent('sukigao_entry_click', { entry_page: this.page });
  }
}
