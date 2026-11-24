import { Component, OnDestroy, OnInit, PLATFORM_ID, inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { GoogleCalendarService, RelatedGroupRef, ScheduleEvent, ScheduleResult } from '../../core/google-calendar.service';
import { GroupService } from '../../core/group.service';
import { isPublicGroupRecord, sanitizePublicGroupRecord } from '../../core/public-record.utils';
import { addDays, taipeiDateParts, taipeiDayKey, taipeiTime } from '../../core/taipei-date.utils';
import { Group, VenueCalendarEvent } from '../../models';
import { SafeUrlPipe } from '../safe-url.pipe';

export const CALENDAR_EMBED_URL = 'https://calendar.google.com/calendar/u/0/embed?src=mr7kibfjcm3gu52v6t64lreras@group.calendar.google.com&ctz=Asia/Taipei&showTitle=0&showNav=1&showPrint=0&showTabs=0&showCalendars=0&bgcolor=%23FDF8FF';

/** Today's events, the next 14 days and the full calendar embed. */
@Component({
  selector: 'app-schedule',
  standalone: true,
  imports: [CommonModule, RouterLink, SafeUrlPipe],
  templateUrl: './schedule.component.html',
  styleUrl: './schedule.component.css',
})
export class ScheduleComponent implements OnInit, OnDestroy {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly googleCalendarService = inject(GoogleCalendarService);
  private readonly groupService = inject(GroupService);
  private destroyed = false;

  readonly calendarUrl = CALENDAR_EMBED_URL;

  ngOnInit(): void {
    // Browser only: prerendered HTML is built nightly, so a server-rendered
    // "today" would be a stale day by the time anyone reads it.
    if (this.isBrowser) void this.loadSchedule();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
  }

  schedule: ScheduleResult | null = null;
  scheduleLoaded = false;
  scheduleLoading = false;
  /** Guards against a slower group-less pass landing after the enriched one. */
  private scheduleEpoch = 0;

  readonly maxChips = 4;

  private async loadSchedule(): Promise<void> {
    if (this.scheduleLoading || this.scheduleLoaded) return;
    this.scheduleLoading = true;
    const epoch = ++this.scheduleEpoch;
    try {
      // Render the schedule before the group catalog arrives; chips are an
      // enhancement and must never gate the events themselves.
      const base = await this.googleCalendarService.getSchedule([]);
      if (epoch !== this.scheduleEpoch || this.destroyed) return;
      this.schedule = base;
      this.scheduleLoaded = true;
      if (base.status !== 'ok') return;

      const groups = await this.groupService.getAll()
        .then(all => all.filter(isPublicGroupRecord).map(sanitizePublicGroupRecord))
        .catch(() => [] as Group[]);
      if (epoch !== this.scheduleEpoch || this.destroyed || groups.length === 0) return;

      const enriched = await this.googleCalendarService.getSchedule(groups);
      if (epoch !== this.scheduleEpoch || this.destroyed || enriched.status !== 'ok') return;
      this.schedule = enriched;
    } finally {
      if (epoch === this.scheduleEpoch) this.scheduleLoading = false;
    }
  }

  retrySchedule(): void {
    if (this.scheduleLoading) return;
    this.scheduleEpoch++;
    this.schedule = null;
    this.scheduleLoaded = false;
    void this.loadSchedule();
  }

  get todayDisplayDate(): string {
    if (!this.schedule) return '';
    const { month, day, weekday } = taipeiDateParts(`${this.schedule.today.dayKey}T00:00:00+08:00`);
    return `${month}/${day}（${weekday}）`;
  }

  get todayEventCount(): number {
    const t = this.schedule?.today;
    return t ? t.carryover.length + t.allDay.length + t.timed.length : 0;
  }

  dayHeading(dayKey: string): string {
    const { month, day, weekday } = taipeiDateParts(`${dayKey}T00:00:00+08:00`);
    const prefix = this.schedule && dayKey === addDays(this.schedule.today.dayKey, 1) ? '明日 · ' : '';
    return `${prefix}${month}/${day}（${weekday}）`;
  }

  /** Start and end fall on different Taipei days. All-day events never qualify. */
  isOvernightEvent(event: VenueCalendarEvent): boolean {
    if (!event.end || event.isAllDay) return false;
    return taipeiDayKey(event.start) !== taipeiDayKey(event.end);
  }

  allDayRange(event: ScheduleEvent): string {
    const from = taipeiDateParts(`${taipeiDayKey(event.start)}T00:00:00+08:00`);
    if (!event.allDayEndDayKey) return `${from.month}/${from.day}`;
    const to = taipeiDateParts(`${event.allDayEndDayKey}T00:00:00+08:00`);
    return `${from.month}/${from.day}–${to.month}/${to.day}`;
  }

  formatTodayEventTime(dateStr: string): string {
    return dateStr ? taipeiTime(dateStr) : '';
  }

  visibleChips(event: ScheduleEvent): RelatedGroupRef[] {
    return event.relatedGroups.slice(0, this.maxChips);
  }

  hiddenChipCount(event: ScheduleEvent): number {
    return Math.max(0, event.relatedGroups.length - this.maxChips);
  }
}
