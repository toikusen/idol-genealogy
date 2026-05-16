import { Component, Input, OnChanges, PendingTasks, SimpleChanges } from '@angular/core';
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
      <section style="margin: 32px 0;">
        <div style="font-size:0.65rem;font-weight:600;color:var(--text-label,#888);letter-spacing:0.08em;text-transform:uppercase;margin-bottom:12px;">近期活動</div>
        @if (loading) {
          <div style="font-size:0.68rem;color:var(--text-faint,#aaa);">讀取活動中…</div>
        } @else {
          @for (event of singleEvents; track event.id) {
            <a [href]="event.url ?? '#'" target="_blank" rel="noopener noreferrer"
               style="display:grid;grid-template-columns:52px 1fr;gap:8px;padding:5px 0;text-decoration:none;border-top:1px solid rgba(0,0,0,0.06);">
              <span style="font-size:0.62rem;color:#7c6cf2;font-weight:600;">{{ formatDate(event.start) }}</span>
              <span style="font-size:0.7rem;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ event.title }}</span>
            </a>
          }
          @for (event of mergedEvents; track event.id) {
            <a [href]="event.url ?? '#'" target="_blank" rel="noopener noreferrer"
               style="display:grid;grid-template-columns:52px 1fr;gap:8px;padding:5px 0;text-decoration:none;border-top:1px solid rgba(0,0,0,0.06);">
              <span style="font-size:0.62rem;color:#7c6cf2;font-weight:600;">{{ formatDate(event.start) }}</span>
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
    private pendingTasks: PendingTasks,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['groups']) {
      void this.pendingTasks.run(() => this.reload());
    }
  }

  protected get hasEvents(): boolean {
    return this.singleEvents.length > 0 || this.mergedEvents.length > 0;
  }

  protected formatDate(start: string): string {
    try {
      const d = new Date(start);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    } catch {
      return start.slice(5, 10).replace('-', '/');
    }
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
  }
}
