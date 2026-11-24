import { ChangeDetectionStrategy, Component, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AnalyticsService } from '../../core/analytics.service';
import { GoogleCalendarService, ScheduleEvent, ScheduleResult } from '../../core/google-calendar.service';
import { taipeiDateParts, taipeiTime } from '../../core/taipei-date.utils';

/** How many events the strip lists before pointing at the full schedule. */
const MAX_ROWS = 2;

interface StripRow {
  id: string;
  /** Time today, or date and time for a later day. */
  when: string;
  title: string;
}

interface StripView {
  heading: string;
  rows: StripRow[];
  /** Link text: names how many of the headline day's events did not fit. */
  more: string;
  /** Shown in place of event rows when there is nothing to list. */
  note: string;
}

/**
 * Compact "what's on today" card for the home page, linking to /events.
 * Always renders at the same height, so the page does not jump when the
 * calendar answers, fails, or has nothing to show.
 */
@Component({
  selector: 'app-today-strip',
  standalone: true,
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './today-strip.component.html',
  styleUrl: './today-strip.component.css',
})
export class TodayStripComponent implements OnInit {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly calendar = inject(GoogleCalendarService);
  private readonly analytics = inject(AnalyticsService);

  /** Null while loading, and on the server: prerendered HTML is built nightly, so its "today" would be stale. */
  private readonly schedule = signal<ScheduleResult | null>(null);

  readonly view = computed<StripView>(() => toView(this.schedule()));

  ngOnInit(): void {
    if (!this.isBrowser) return;
    void this.calendar.getSchedule([]).then(result => this.schedule.set(result));
  }

  trackClick(): void {
    this.analytics.trackEvent('today_strip_click', {});
  }
}

const MORE_DEFAULT = '看行程';

function moreLabel(dayTotal: number): string {
  return dayTotal > MAX_ROWS ? `還有 ${dayTotal - MAX_ROWS} 場` : MORE_DEFAULT;
}

function dayLabel(dayKey: string): string {
  const { month, day, weekday } = taipeiDateParts(`${dayKey}T00:00:00+08:00`);
  return `${month}/${day}（${weekday}）`;
}

function toRow(event: ScheduleEvent, dayKey?: string): StripRow {
  const time = event.isAllDay ? '全天' : taipeiTime(event.start);
  if (!dayKey) return { id: event.id, when: time, title: event.title };
  const { month, day } = taipeiDateParts(`${dayKey}T00:00:00+08:00`);
  return { id: event.id, when: `${month}/${day} ${time}`, title: event.title };
}

export function toView(schedule: ScheduleResult | null): StripView {
  if (!schedule) return { heading: '活動行程', rows: [], more: MORE_DEFAULT, note: '載入中…' };
  if (schedule.status !== 'ok') return { heading: '活動行程', rows: [], more: MORE_DEFAULT, note: '今日與未來 14 天的演出、特典會' };

  const { timed, allDay, carryover } = schedule.today;
  const today = [...timed, ...allDay, ...carryover];
  const later = schedule.upcoming.flatMap(day => day.events.map(event => toRow(event, day.dayKey)));
  // A quiet day is topped up with what comes next, so the card is never half empty.
  const rows = [...today.map(event => toRow(event)), ...later].slice(0, MAX_ROWS);

  if (today.length > 0) return { heading: `今日 ${today.length} 場活動`, rows, more: moreLabel(today.length), note: '' };
  const next = schedule.upcoming[0];
  if (next) return { heading: `下一場 ${dayLabel(next.dayKey)}`, rows, more: moreLabel(next.events.length), note: '' };
  return { heading: '活動行程', rows: [], more: MORE_DEFAULT, note: '未來 14 天暫無已知活動' };
}
