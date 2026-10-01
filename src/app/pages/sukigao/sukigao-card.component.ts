import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { SupabaseImgPipe } from '../../shared/supabase-img.pipe';
import { SukigaoCandidate } from '../../models';

/**
 * One face as a button: a circle photo in a square frame. Many member photos
 * were uploaded through the circle cropper (square JPEG, dark corners), so a
 * circle is the one shape that shows those and rectangular photos alike.
 * The whole card is the hit target; selection is announced through
 * aria-pressed and shown with a pink ring + check/badge.
 */
@Component({
  selector: 'app-sukigao-card',
  standalone: true,
  imports: [SupabaseImgPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="sk-card"
      [class.sk-card--selected]="selected"
      [class.sk-card--large]="size === 'large'"
      [attr.aria-pressed]="pressable ? selected : null"
      [attr.aria-label]="ariaLabel"
      [disabled]="disabled"
      (click)="pick.emit(candidate.id)"
    >
      <span class="sk-card__photo">
        <span class="sk-card__circle">
          @if (candidate.photoUrl) {
            <img
              [src]="candidate.photoUrl | supabaseImg: imageWidth : 80"
              [alt]="candidate.name"
              [attr.loading]="eager ? 'eager' : 'lazy'"
              [attr.fetchpriority]="eager ? 'high' : null"
              decoding="async"
              width="300"
              height="300"
            />
          } @else {
            <span class="sk-card__placeholder" aria-hidden="true">{{ candidate.name.charAt(0) }}</span>
          }
        </span>
        @if (badge) {
          <span class="sk-card__badge" aria-hidden="true">{{ badge }}</span>
        } @else if (selected) {
          <span class="sk-card__check" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
          </span>
        }
      </span>
      <span class="sk-card__meta">
        <span class="sk-card__name">{{ candidate.name }}</span>
        <span class="sk-card__group">{{ groupLabel }}</span>
      </span>
    </button>
  `,
  styleUrl: './sukigao-card.component.css',
})
export class SukigaoCardComponent {
  @Input({ required: true }) candidate!: SukigaoCandidate;
  @Input() selected = false;
  @Input() disabled = false;
  /** Replaces the check icon, e.g. ① / ②. */
  @Input() badge: string | null = null;
  @Input() size: 'grid' | 'large' = 'grid';
  @Input() eager = false;
  /** Toggle cards expose aria-pressed; one-shot choices (the final) do not. */
  @Input() pressable = true;
  @Input() actionLabel = '';
  @Output() pick = new EventEmitter<string>();

  get imageWidth(): number {
    return this.size === 'large' ? 480 : 360;
  }

  get groupLabel(): string {
    return this.candidate.groupNames.length > 0 ? this.candidate.groupNames.join('・') : 'Solo';
  }

  get ariaLabel(): string {
    const base = `${this.candidate.name}（${this.groupLabel}）`;
    return this.actionLabel ? `${this.actionLabel}：${base}` : base;
  }
}
