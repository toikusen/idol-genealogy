import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Group } from '../../models';
import { formatYmd, localDateMs } from '../../core/time.utils';
import { GanttTooltipComponent } from '../gantt-tooltip/gantt-tooltip.component';

export interface GroupTimelineRow {
  group: Group;
  leftPct: number;
  widthPct: number;
  isActive: boolean;
}

export interface GroupTimeline {
  rows: GroupTimelineRow[];
  years: { label: string; leftPct: number }[];
  undatedCount: number;
}

/**
 * Lays out one bar per group across a shared time axis running from the earliest
 * founding date to whichever is later: today, or the latest disbandment.
 * Groups without `founded_at` cannot be placed and are only counted.
 */
export function buildGroupTimeline(groups: Group[], now: number): GroupTimeline {
  const dated = groups
    .filter(g => !!g.founded_at)
    .sort((a, b) => a.founded_at!.localeCompare(b.founded_at!));
  const undatedCount = groups.length - dated.length;

  if (dated.length === 0) return { rows: [], years: [], undatedCount };

  const minMs = Math.min(...dated.map(g => localDateMs(g.founded_at!)));
  const maxMs = Math.max(now, ...dated.map(g => (g.disbanded_at ? localDateMs(g.disbanded_at) : now)));
  const total = maxMs - minMs || 1;

  const rows = dated.map(g => {
    const start = localDateMs(g.founded_at!);
    const end = g.disbanded_at ? localDateMs(g.disbanded_at) : maxMs;
    return {
      group: g,
      leftPct: ((start - minMs) / total) * 100,
      widthPct: Math.max(((end - start) / total) * 100, 0.5),
      isActive: !g.disbanded_at || localDateMs(g.disbanded_at) > now,
    };
  });

  const minYear = new Date(minMs).getFullYear();
  const maxYear = new Date(maxMs).getFullYear();
  // ponytail: thin out labels so a 20-year span doesn't collide; per-year if it fits
  const span = maxYear - minYear;
  const step = span > 24 ? 5 : span > 12 ? 2 : 1;
  const years: { label: string; leftPct: number }[] = [];
  for (let y = minYear; y <= maxYear; y += step) {
    const pct = ((new Date(y, 0, 1).getTime() - minMs) / total) * 100;
    if (pct >= 0 && pct <= 100) years.push({ label: String(y), leftPct: pct });
  }

  return { rows, years, undatedCount };
}

@Component({
  selector: 'app-company-groups-timeline',
  standalone: true,
  imports: [CommonModule, RouterLink, GanttTooltipComponent],
  template: `
    @if (rows.length > 0) {
      <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
        <div style="display:grid;grid-template-columns:max-content 1fr;row-gap:6px;min-width:480px;">

          <!-- Year axis -->
          <div></div>
          <div style="position:relative;height:20px;">
            @for (yr of years; track yr.label) {
              <span style="
                position:absolute;
                font-size:0.68rem;color:var(--text-secondary);
                letter-spacing:0.05em;
                transform:translateX(-50%);
                white-space:nowrap;
              " [style.left]="yr.leftPct + '%'">{{ yr.label }}</span>
            }
          </div>

          <!-- Rows -->
          @for (row of rows; track row.group.id) {
            <a [routerLink]="'/group/' + row.group.id"
              style="
                white-space:nowrap;
                padding:0 12px 0 4px;text-align:right;
                font-size:0.75rem;color:var(--text-secondary);
                text-decoration:none;
                display:flex;align-items:center;justify-content:flex-end;
                transition:color 0.15s;
              "
            >{{ row.group.name_jp || row.group.name }}</a>

            <div style="position:relative;display:flex;align-items:center;">
              <div style="flex:1;position:relative;height:10px;">
                <!-- Year grid lines -->
                @for (yr of years; track yr.label) {
                  <div style="
                    position:absolute;top:-10px;bottom:-10px;
                    width:1px;pointer-events:none;
                    background:rgba(180,160,180,0.12);
                  " [style.left]="yr.leftPct + '%'"></div>
                }
                <!-- Bar -->
                <div style="
                  position:absolute;top:0;height:100%;
                  border-radius:3px;
                  cursor:pointer;
                  box-shadow:inset 0 0 0 1px rgba(0,0,0,0.08);
                  transition:opacity 0.15s;
                "
                [style.left]="row.leftPct + '%'"
                [style.width]="row.widthPct + '%'"
                [style.background]="row.isActive ? '#c05080' : 'rgba(192,80,128,0.4)'"
                [style.opacity]="tooltipGroup && tooltipGroup.id !== row.group.id ? '0.5' : '1'"
                (mouseenter)="onBarMouseEnter($event, row.group)"
                (mousemove)="onBarMouseMove($event)"
                (mouseleave)="onBarMouseLeave()"
                (click)="onBarClick($event, row.group)"></div>
              </div>
            </div>
          }

          <!-- Bottom axis line -->
          <div></div>
          <div style="
            height:1px;margin-top:4px;
            background:linear-gradient(to right,rgba(180,160,180,0.2),transparent);
          "></div>

        </div>
      </div>
    }
    @if (undatedCount > 0) {
      <p style="font-size:0.72rem;color:var(--text-faint-45);margin:12px 0 0;">
        還有 {{ undatedCount }} 個團體尚無創立日期,歡迎補充
      </p>
    }
    @if (tooltipGroup) {
      <app-gantt-tooltip
        [x]="tooltipX"
        [y]="tooltipY"
        [title]="tooltipGroup.name_jp || tooltipGroup.name"
        [photoUrl]="tooltipGroup.photo_url"
        label="運作期間"
        [from]="formatYmd(tooltipGroup.founded_at)"
        [to]="tooltipGroup.disbanded_at ? formatYmd(tooltipGroup.disbanded_at) : null"
        accentColor="#c05080"
      />
    }
  `,
})
export class CompanyGroupsTimelineComponent implements OnChanges {
  @Input() groups: Group[] = [];

  rows: GroupTimelineRow[] = [];
  years: { label: string; leftPct: number }[] = [];
  undatedCount = 0;

  tooltipGroup: Group | null = null;
  tooltipX = 0;
  tooltipY = 0;
  /** Set by a click; keeps the tooltip up after the pointer leaves the bar. */
  private pinnedGroupId: string | null = null;

  formatYmd = formatYmd;

  ngOnChanges() {
    const timeline = buildGroupTimeline(this.groups, Date.now());
    this.rows = timeline.rows;
    this.years = timeline.years;
    this.undatedCount = timeline.undatedCount;
    this.tooltipGroup = null;
    this.pinnedGroupId = null;
  }

  onBarMouseEnter(event: MouseEvent, group: Group) {
    this.tooltipGroup = group;
    this.tooltipX = event.clientX;
    this.tooltipY = event.clientY;
  }

  onBarMouseMove(event: MouseEvent) {
    this.tooltipX = event.clientX;
    this.tooltipY = event.clientY;
  }

  onBarMouseLeave() {
    if (!this.pinnedGroupId) {
      this.tooltipGroup = null;
    }
  }

  /** Touch/click support: tapping a bar toggles its tooltip since touch devices have no hover. */
  onBarClick(event: MouseEvent, group: Group) {
    if (this.pinnedGroupId === group.id) {
      this.pinnedGroupId = null;
      this.tooltipGroup = null;
      return;
    }
    this.pinnedGroupId = group.id;
    this.tooltipGroup = group;
    this.tooltipX = event.clientX;
    this.tooltipY = event.clientY;
  }
}
