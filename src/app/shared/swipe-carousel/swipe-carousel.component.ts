import { Component, ElementRef, Input, ViewEncapsulation, afterNextRender, computed, inject, signal } from '@angular/core';

/** How far (px) a horizontal drag must travel before it counts as a swipe. */
const SWIPE_MIN = 40;
/** Movement (px) before deciding whether a gesture is a horizontal drag or a vertical page scroll. */
const DECIDE_AT = 8;

/**
 * One-slide-at-a-time carousel for projected cards (links). Swiping either way moves to the
 * neighbouring slide and wraps around, so with two slides any swipe shows the other one.
 * Dots below switch directly. Hidden slides are `inert` so keyboard users only reach the visible card.
 */
@Component({
  selector: 'app-swipe-carousel',
  standalone: true,
  // the slides are projected content, so the slide rules can't be scoped to this template
  encapsulation: ViewEncapsulation.None,
  host: { role: 'region', 'aria-roledescription': 'carousel', '[attr.aria-label]': 'label' },
  styles: `
    app-swipe-carousel { display: block; }
    app-swipe-carousel .sc-viewport { overflow: hidden; overflow-x: clip; overflow-y: visible; touch-action: pan-y; }
    app-swipe-carousel .sc-track { display: flex; transition: transform 0.32s ease; }
    app-swipe-carousel .sc-track.sc-dragging { transition: none; }
    app-swipe-carousel .sc-track > * { flex: 0 0 100%; min-width: 0; box-sizing: border-box; -webkit-user-drag: none; user-select: none; }
    app-swipe-carousel .sc-dots { display: flex; justify-content: center; gap: 6px; margin-top: 10px; }
    app-swipe-carousel .sc-dot { width: 7px; height: 7px; padding: 0; border: 0; border-radius: 999px; background: rgba(232, 121, 160, 0.3); cursor: pointer; transition: width 0.2s ease, background 0.2s ease; }
    app-swipe-carousel .sc-dot[aria-current='true'] { width: 20px; background: #e879a0; }
    @media (prefers-reduced-motion: reduce) { app-swipe-carousel .sc-track, app-swipe-carousel .sc-dot { transition: none; } }
  `,
  template: `
    <div class="sc-viewport" (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="up()" (pointercancel)="reset()">
      <div class="sc-track" [class.sc-dragging]="dragging()" [style.transform]="transform()"><ng-content /></div>
    </div>
    @if (count() > 1) {
      <div class="sc-dots">
        @for (i of dots(); track i) {
          <button type="button" class="sc-dot" [attr.aria-label]="'第 ' + (i + 1) + ' 張，共 ' + count() + ' 張'" [attr.aria-current]="i === index()" (click)="go(i)"></button>
        }
      </div>
    }
  `,
})
export class SwipeCarouselComponent {
  @Input() label = '';
  readonly index = signal(0);
  readonly count = signal(0);
  readonly dragging = signal(false);
  private readonly dx = signal(0);
  readonly dots = computed(() => Array.from({ length: this.count() }, (_, i) => i));
  readonly transform = computed(() => `translateX(calc(${-this.index() * 100}% + ${this.dx()}px))`);

  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private start: { x: number; y: number; id: number } | null = null;
  private decided = false;
  private suppressClick = false;

  constructor() {
    afterNextRender(() => {
      this.count.set(this.slides().length);
      this.syncInert();
      // capture phase: a swipe that ends on a link must not also open it (routerLink handles clicks on the target)
      this.host.addEventListener('click', e => {
        if (!this.suppressClick) return;
        this.suppressClick = false;
        e.preventDefault(); e.stopPropagation();
      }, true);
      this.host.addEventListener('dragstart', e => e.preventDefault());
    });
  }

  /** Show slide `i`, wrapping past either end. */
  go(i: number): void {
    const n = this.count();
    if (!n) return;
    this.index.set(((i % n) + n) % n);
    this.syncInert();
  }

  down(e: PointerEvent): void {
    if (e.button !== 0 || this.count() < 2) return;
    this.start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    this.decided = false;
    this.suppressClick = false;
  }

  move(e: PointerEvent): void {
    if (!this.start || e.pointerId !== this.start.id) return;
    const dx = e.clientX - this.start.x, dy = e.clientY - this.start.y;
    if (!this.decided) {
      if (Math.abs(dx) < DECIDE_AT && Math.abs(dy) < DECIDE_AT) return;
      if (Math.abs(dy) >= Math.abs(dx)) { this.start = null; return; }   // vertical: let the page scroll
      this.decided = true;
      this.dragging.set(true);
      this.suppressClick = true;
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }
    this.dx.set(dx);
  }

  up(): void {
    const dx = this.dx();
    if (this.dragging() && Math.abs(dx) >= SWIPE_MIN) this.go(this.index() + (dx < 0 ? 1 : -1));
    this.reset();
  }

  reset(): void {
    this.start = null;
    this.dragging.set(false);
    this.dx.set(0);
  }

  private slides(): HTMLElement[] {
    return Array.from(this.host.querySelector('.sc-track')?.children ?? []) as HTMLElement[];
  }

  private syncInert(): void {
    this.slides().forEach((s, i) => (s.inert = i !== this.index()));
  }
}
