import { Component, Input, OnChanges, SimpleChanges, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Group, VenueCalendarEvent } from '../../models';
import { GoogleCalendarService } from '../../core/google-calendar.service';

interface MergedEvent extends VenueCalendarEvent {
  groupNames: string[];
}

@Component({
  selector: 'app-group-events',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (loading || hasEvents) {
      <section style="margin:28px 0;">
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:10px;">
          <div style="height:1px;width:20px;background:rgba(124,108,242,0.4);flex-shrink:0;"></div>
          <span style="font-size:0.72rem;letter-spacing:0.25em;text-transform:uppercase;color:var(--text-label);white-space:nowrap;">近期活動</span>
          <div style="flex:1;height:1px;background:linear-gradient(to right,rgba(124,108,242,0.18),transparent);"></div>
        </div>
        @if (loading) {
          <div style="font-size:0.68rem;color:var(--text-faint,#aaa);padding:4px 0;">讀取活動中…</div>
        } @else {
          @for (event of singleEvents; track event.id) {
            <a [href]="event.url ?? '#'" target="_blank" rel="noopener noreferrer"
               style="display:grid;grid-template-columns:52px 1fr;gap:8px;padding:5px 6px;text-decoration:none;border-radius:6px;transition:background 0.15s;"
               onmouseenter="this.style.background='rgba(124,108,242,0.05)'"
               onmouseleave="this.style.background='transparent'">
              <span style="font-size:0.62rem;color:#7c6cf2;font-weight:600;padding-top:1px;">{{ formatDate(event.start, event.end, event.isAllDay) }}</span>
              <span style="font-size:0.7rem;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ event.title }}</span>
            </a>
          }
          @for (event of mergedEvents; track event.id) {
            <a [href]="event.url ?? '#'" target="_blank" rel="noopener noreferrer"
               style="display:grid;grid-template-columns:52px 1fr;gap:8px;padding:5px 6px;text-decoration:none;border-radius:6px;transition:background 0.15s;"
               onmouseenter="this.style.background='rgba(124,108,242,0.05)'"
               onmouseleave="this.style.background='transparent'">
              <span style="font-size:0.62rem;color:#7c6cf2;font-weight:600;padding-top:1px;">{{ formatDate(event.start, event.end, event.isAllDay) }}</span>
              <div>
                <span style="font-size:0.7rem;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;">{{ event.title }}</span>
                <span style="font-size:0.6rem;color:var(--text-faint);">{{ event.groupNames.join(' · ') }}</span>
              </div>
            </a>
          }
        }
      </section>
    }
  `,
})
export class GroupEventsComponent implements OnChanges {
  @Input() groups: Group[] = [];

  protected loading = false;
  singleEvents: VenueCalendarEvent[] = [];
  mergedEvents: MergedEvent[] = [];

  private generation = 0;

  constructor(
    private calendarService: GoogleCalendarService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['groups']) void this.ngZone.run(() => this.reload());
  }

  protected get hasEvents(): boolean {
    return this.singleEvents.length > 0 || this.mergedEvents.length > 0;
  }

  protected formatDate(start: string, end: string | null, isAllDay: boolean): string {
    const startDate = new Date(start);
    if (isNaN(startDate.getTime())) return start.slice(5, 10).replace('-', '/');
    const sm = startDate.getMonth() + 1;
    const sd = startDate.getDate();
    if (!end) return `${sm}/${sd}`;
    const endDate = new Date(end);
    if (isNaN(endDate.getTime())) return `${sm}/${sd}`;
    // All-day event end is exclusive in Google Calendar — subtract 1 day
    if (isAllDay) endDate.setDate(endDate.getDate() - 1);
    // Same day as start → single date
    if (endDate.getFullYear() === startDate.getFullYear() &&
        endDate.getMonth() === startDate.getMonth() &&
        endDate.getDate() === startDate.getDate()) {
      return `${sm}/${sd}`;
    }
    const em = endDate.getMonth() + 1;
    const ed = endDate.getDate();
    return sm === em ? `${sm}/${sd}–${ed}` : `${sm}/${sd}–${em}/${ed}`;
  }

  private async reload(): Promise<void> {
    const gen = ++this.generation;
    this.loading = true;
    this.singleEvents = [];
    this.mergedEvents = [];

    const results = await Promise.allSettled(
      this.groups.map(g =>
        this.calendarService.getUpcomingGroupEvents(g).then(events => ({ group: g, events })),
      ),
    );

    if (gen !== this.generation) return;

    if (this.groups.length === 1) {
      const r = results[0];
      this.singleEvents = r.status === 'fulfilled' ? r.value.events : [];
    } else {
      const eventMap = new Map<string, MergedEvent>();
      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        for (const event of r.value.events) {
          const existing = eventMap.get(event.id);
          if (existing) {
            existing.groupNames.push(r.value.group.name);
          } else {
            eventMap.set(event.id, { ...event, groupNames: [r.value.group.name] });
          }
        }
      }
      this.mergedEvents = [...eventMap.values()].sort((a, b) => a.start.localeCompare(b.start));
    }

    this.loading = false;
    this.cdr.markForCheck();
  }
}
