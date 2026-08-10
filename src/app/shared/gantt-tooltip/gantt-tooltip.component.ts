import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseImgPipe } from '../supabase-img.pipe';

/**
 * Floating card for gantt bars. Purely presentational: the parent owns the
 * hover/tap state, the cursor position and the date formatting, so the same
 * card serves a member's 在籍期間 and a group's 運作期間 unchanged.
 */
@Component({
  selector: 'app-gantt-tooltip',
  standalone: true,
  imports: [CommonModule, SupabaseImgPipe],
  styles: [`
    @keyframes ganttTooltipIn {
      from { opacity: 0; transform: translate(-50%, calc(-100% - 20px)); }
      to   { opacity: 1; transform: translate(-50%, calc(-100% - 14px)); }
    }
    .gantt-tooltip {
      animation: ganttTooltipIn 0.16s cubic-bezier(0.22, 1, 0.36, 1) forwards;
    }
  `],
  template: `
    <div
      class="gantt-tooltip"
      style="
        position: fixed;
        pointer-events: none;
        z-index: 9999;
        transform: translate(-50%, calc(-100% - 14px));
      "
      [style.left.px]="x"
      [style.top.px]="y"
    >
      <!-- Card -->
      <div style="
        position: relative;
        background: rgba(13, 6, 15, 0.97);
        border: 1px solid rgba(232,121,160,0.16);
        border-radius: 9px;
        padding: 11px 15px 12px;
        min-width: 155px;
        box-shadow:
          0 12px 40px rgba(6, 3, 10, 0.6),
          0 2px 8px rgba(232,121,160,0.08),
          inset 0 1px 0 rgba(255,220,240,0.05);
      ">
        <!-- Accent glow line -->
        <div style="
          position: absolute; top: 0; left: 16px; right: 16px; height: 1px;
          border-radius: 4px;
          opacity: 0.7;
        " [style.background]="'linear-gradient(to right, transparent, ' + accentColor + ' 40%, ' + accentColor + ' 60%, transparent)'"></div>

        <!-- Title -->
        <div style="
          display: flex; align-items: center; gap: 8px;
          margin-bottom: 8px;
        ">
          @if (photoUrl) {
            <img [src]="photoUrl | supabaseImg:44" [alt]="title"
              style="width:22px;height:22px;border-radius:50%;object-fit:cover;flex-shrink:0;"/>
          }
          <span style="
            font-size: 0.82rem;
            color: rgba(255, 238, 250, 0.93);
            letter-spacing: 0.06em;
            white-space: nowrap;
          ">{{ title }}</span>
        </div>

        <!-- Divider -->
        <div style="
          height: 1px; margin-bottom: 8px;
          background: linear-gradient(to right, rgba(232,121,160,0.12), rgba(124,108,242,0.08), transparent);
        "></div>

        <!-- Label -->
        <div style="
          font-size: 0.56rem; letter-spacing: 0.32em;
          color: rgba(200,160,195,0.4); text-transform: uppercase;
          margin-bottom: 5px;
        ">{{ label }}</div>

        <!-- Date range -->
        <div style="
          display: flex; align-items: center; gap: 8px;
          font-size: 0.73rem; letter-spacing: 0.03em;
          white-space: nowrap;
        ">
          <span style="color: rgba(240, 215, 232, 0.82);">{{ from }}</span>
          <span style="
            display: inline-flex; align-items: center; gap: 0;
            color: rgba(232,121,160,0.45); font-size: 0.65rem; letter-spacing: 0;
          ">→</span>
          @if (to) {
            <span style="color: rgba(240, 215, 232, 0.82);">{{ to }}</span>
          } @else {
            <span style="
              font-size: 0.68rem; letter-spacing: 0.18em;
              font-weight: 500;
            " [style.color]="accentColor">{{ openEndedLabel }}</span>
          }
        </div>
      </div>

      <!-- Arrow -->
      <div style="
        position: absolute; bottom: -5px; left: 50%;
        transform: translateX(-50%) rotate(45deg);
        width: 9px; height: 9px;
        background: rgba(13, 6, 15, 0.94);
        border-right: 1px solid rgba(232,121,160,0.16);
        border-bottom: 1px solid rgba(232,121,160,0.16);
      "></div>
    </div>
  `,
})
export class GanttTooltipComponent {
  /** Viewport coordinates of the cursor / tapped bar. */
  @Input() x = 0;
  @Input() y = 0;
  @Input() title = '';
  /** Small caps heading above the dates, e.g. 在籍期間. */
  @Input() label = '';
  @Input() from = '';
  /** Null renders `openEndedLabel` in the accent colour instead of an end date. */
  @Input() to: string | null = null;
  /** Stand-in for a missing end date. 尚未開始 when the period has not begun. */
  @Input() openEndedLabel = '現在';
  @Input() accentColor = '#e879a0';
  @Input() photoUrl: string | null = null;
}
