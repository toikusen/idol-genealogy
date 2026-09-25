import { ChangeDetectionStrategy, Component, Input, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalyticsService } from '../../core/analytics.service';
import { SukigaoCandidate } from '../../models';

export type SukigaoEditCtaVariant = 'compact' | 'full';

/**
 * "Photo wrong? You can fix it" prompt shown under every 顏控9選 screen.
 *
 * - compact (during a round): a collapsible list of the faces on screen, each
 *   linking to that member's edit panel in a new tab so the game isn't lost.
 * - full (intro / result / ranking): the same, plus pointers to /wanted and
 *   an "about Idol Maps" block that sends players on to the rest of the site.
 */
@Component({
  selector: 'app-sukigao-edit-cta',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (variant === 'compact') {
      @if (faces.length > 0) {
        <details class="skedit skedit--compact">
          <summary>📸 照片模糊、放錯人？點這裡修正這{{ faces.length === 2 ? '兩' : '組' }}成員的資料</summary>
          <ul class="skedit__list">
            @for (face of faces; track face.id) {
              <li>
                <span class="skedit__name">{{ face.name }}</span>
                <a class="skedit__fix" [href]="editUrl(face)" target="_blank" rel="noopener" (click)="onEdit()">修正資料 ↗</a>
              </li>
            }
          </ul>
          <p class="skedit__note">會在新分頁開啟，不用登入也能提案；遊戲進度會保留。</p>
        </details>
      }
    } @else {
      <aside class="skedit skedit--full" aria-label="協助修正資料">
        <p class="skedit__title">📸 照片模糊、放錯人，或名字寫錯了？</p>
        <p class="skedit__text">
          Idol Maps 的資料由粉絲一起維護，<strong>不用登入也能提案修正</strong>。
        </p>

        @if (faces.length > 0) {
          <details class="skedit__faces">
            <summary>修正這 {{ faces.length }} 位的資料</summary>
            <ul class="skedit__list">
              @for (face of faces; track face.id) {
                <li>
                  <span class="skedit__name">{{ face.name }}</span>
                  <a class="skedit__fix" [href]="editUrl(face)" target="_blank" rel="noopener" (click)="onEdit()">修正資料 ↗</a>
                </li>
              }
            </ul>
          </details>
        }

        <p class="skedit__text">
          沒有照片的成員不會出現在顏控9選。<br />幫他們補上照片，下一局就能一起被選！
        </p>
        <div class="skedit__links">
          <a routerLink="/wanted" class="skedit__btn" (click)="onPromo('wanted')">看看哪些成員還缺資料 →</a>
          <a routerLink="/guide" class="skedit__link" (click)="onPromo('guide')">怎麼編輯？</a>
        </div>

        <div class="skedit__about">
          <p class="skedit__about-title">關於 Idol Maps</p>
          <p class="skedit__text">
            台灣地下偶像資料庫：成員經歷、團體系譜、活動行程、場地資訊，都由粉絲一起整理。
          </p>
          <div class="skedit__links">
            <a routerLink="/" class="skedit__btn" (click)="onPromo('home')">探索 Idol Maps →</a>
            <a routerLink="/members" class="skedit__link" (click)="onPromo('members')">瀏覽全部成員</a>
          </div>
        </div>
      </aside>
    }
  `,
  styleUrl: './sukigao-edit-cta.component.css',
})
export class SukigaoEditCtaComponent {
  private readonly analytics = inject(AnalyticsService);

  @Input() variant: SukigaoEditCtaVariant = 'full';
  /** Faces the player is looking at; each gets a "修正資料" link. */
  @Input() faces: SukigaoCandidate[] = [];
  /** Where the prompt sits, for analytics only (never which member). */
  @Input() context = '';

  editUrl(face: SukigaoCandidate): string {
    return `/member/${encodeURIComponent(face.id)}?propose=true`;
  }

  onEdit(): void {
    this.analytics.trackEvent('sukigao_edit_click', { context: this.context });
  }

  onPromo(target: string): void {
    this.analytics.trackEvent('sukigao_promo_click', { context: this.context, target });
  }
}
