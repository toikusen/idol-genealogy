import { Component, Input, OnChanges, SimpleChanges, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Group, Member, VenueCalendarEvent } from '../../models';
import { GoogleCalendarService } from '../../core/google-calendar.service';
import { TimeTreeService } from '../../core/timetree.service';

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
          @if (eventSource && groups.length === 1 && !member) {
            <span style="font-size:0.55rem;letter-spacing:0.1em;text-transform:uppercase;padding:1px 5px;border-radius:3px;background:rgba(124,108,242,0.12);color:#7c6cf2;">
              {{ eventSource === 'timetree' ? 'TimeTree' : 'Google Calendar' }}
            </span>
          }
          <div style="flex:1;height:1px;background:linear-gradient(to right,rgba(124,108,242,0.18),transparent);"></div>
        </div>
        @if (loading) {
          <div style="font-size:0.68rem;color:var(--text-faint,#aaa);padding:4px 0;">讀取活動中…</div>
        } @else {
          <div [style.position]="hasMore ? 'relative' : null">
            @for (event of visibleSingleEvents; track event.id) {
              <a [href]="event.url ?? '#'" target="_blank" rel="noopener noreferrer"
                 style="display:grid;grid-template-columns:52px 1fr;gap:8px;padding:5px 6px;text-decoration:none;border-radius:6px;transition:background 0.15s;"
                 onmouseenter="this.style.background='rgba(124,108,242,0.05)'"
                 onmouseleave="this.style.background='transparent'">
                <span style="font-size:0.62rem;color:#7c6cf2;font-weight:600;padding-top:1px;">{{ formatDate(event.start, event.end, event.isAllDay) }}</span>
                <span style="font-size:0.7rem;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">{{ event.title }}</span>
              </a>
            }
            @for (event of visibleMergedEvents; track event.id) {
              <a [href]="event.url ?? '#'" target="_blank" rel="noopener noreferrer"
                 style="display:grid;grid-template-columns:52px 1fr;gap:8px;padding:5px 6px;text-decoration:none;border-radius:6px;transition:background 0.15s;"
                 onmouseenter="this.style.background='rgba(124,108,242,0.05)'"
                 onmouseleave="this.style.background='transparent'">
                <span style="font-size:0.62rem;color:#7c6cf2;font-weight:600;padding-top:1px;">{{ formatDate(event.start, event.end, event.isAllDay) }}</span>
                <div>
                  <span style="font-size:0.7rem;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;">{{ event.title }}</span>
                  @if (event.groupNames.length > 0) {
                    <span style="font-size:0.6rem;color:var(--text-faint);">{{ event.groupNames.join(' · ') }}</span>
                  }
                </div>
              </a>
            }
            @if (hasMore) {
              <div style="position:absolute;bottom:0;left:0;right:0;height:36px;pointer-events:none;background:linear-gradient(to bottom,transparent,var(--bg-page,#fdf6fb));"></div>
            }
          </div>
          @if (hasMore) {
            <button (click)="showAll = true"
              style="display:flex;align-items:center;gap:10px;width:100%;background:none;border:none;cursor:pointer;padding:8px 6px 2px;color:rgba(124,108,242,0.5);transition:color 0.2s;"
              onmouseenter="this.style.color='rgba(124,108,242,0.9)'"
              onmouseleave="this.style.color='rgba(124,108,242,0.5)'">
              <div style="flex:1;height:1px;background:rgba(124,108,242,0.12);"></div>
              <span style="font-size:0.58rem;letter-spacing:0.22em;text-transform:uppercase;white-space:nowrap;">+ {{ remainingCount }} 筆</span>
              <div style="flex:1;height:1px;background:rgba(124,108,242,0.12);"></div>
            </button>
          }
        }
      </section>
    }
  `,
})
export class GroupEventsComponent implements OnChanges {
  @Input() groups: Group[] = [];
  @Input() member: Member | null = null;

  protected loading = false;
  singleEvents: VenueCalendarEvent[] = [];
  mergedEvents: MergedEvent[] = [];
  eventSource: 'timetree' | 'google' | null = null;
  protected showAll = false;

  private readonly INITIAL_LIMIT = 10;

  protected get visibleSingleEvents(): VenueCalendarEvent[] {
    return this.showAll ? this.singleEvents : this.singleEvents.slice(0, this.INITIAL_LIMIT);
  }

  protected get visibleMergedEvents(): MergedEvent[] {
    return this.showAll ? this.mergedEvents : this.mergedEvents.slice(0, this.INITIAL_LIMIT);
  }

  protected get hasMore(): boolean {
    return !this.showAll && (this.singleEvents.length + this.mergedEvents.length) > this.INITIAL_LIMIT;
  }

  protected get remainingCount(): number {
    return Math.max(0, this.singleEvents.length + this.mergedEvents.length - this.INITIAL_LIMIT);
  }

  private generation = 0;
  private groupSignature = '';

  constructor(
    private calendarService: GoogleCalendarService,
    private timetreeService: TimeTreeService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['groups'] && !changes['member']) return;
    const nextSignature = this.groups.map(g => g.id).join('|');
    if (nextSignature === this.groupSignature && !changes['member']) return;
    this.groupSignature = nextSignature;
    void this.reload();
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
    if (isAllDay) endDate.setDate(endDate.getDate() - 1);
    if (endDate.getFullYear() === startDate.getFullYear() &&
        endDate.getMonth() === startDate.getMonth() &&
        endDate.getDate() === startDate.getDate()) {
      return `${sm}/${sd}`;
    }
    const em = endDate.getMonth() + 1;
    const ed = endDate.getDate();
    return sm === em ? `${sm}/${sd}–${ed}` : `${sm}/${sd}–${em}/${ed}`;
  }

  private async fetchGroupEventsWithSource(group: Group): Promise<{ events: VenueCalendarEvent[]; source: 'timetree' | 'google' }> {
    if (group.timetree_url) {
      const alias = new URL(group.timetree_url).pathname.split('/').filter(Boolean).pop();
      if (alias) {
        try {
          const events = await this.timetreeService.getUpcomingEvents(alias);
          return { events, source: 'timetree' };
        } catch {
          // silent fallback
        }
      }
    }
    const events = await this.calendarService.getUpcomingGroupEvents(group);
    return { events, source: 'google' };
  }

  private async reload(): Promise<void> {
    const gen = ++this.generation;
    const groups = [...this.groups];
    const member = this.member;
    this.loading = true;
    this.singleEvents = [];
    this.mergedEvents = [];
    this.eventSource = null;
    this.showAll = false;
    this.cdr.markForCheck();

    if (groups.length === 0 && !member) {
      this.loading = false;
      return;
    }

    const results = await this.ngZone.runOutsideAngular(() =>
      Promise.allSettled([
        ...groups.map(g =>
          this.fetchGroupEventsWithSource(g).then(r => ({ group: g as Group | null, events: r.events, source: r.source }))
        ),
        ...(member
          ? [this.calendarService.getUpcomingMemberEvents(member).then(events => ({ group: null as Group | null, events, source: 'google' as const }))]
          : []),
      ])
    );

    if (gen !== this.generation) return;

    this.ngZone.run(() => {
      const eventMap = new Map<string, MergedEvent>();
      for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        for (const event of r.value.events) {
          const existing = eventMap.get(event.id);
          const groupName = r.value.group?.name ?? null;
          if (existing) {
            if (groupName && !existing.groupNames.includes(groupName)) {
              existing.groupNames.push(groupName);
            }
          } else {
            eventMap.set(event.id, { ...event, groupNames: groupName ? [groupName] : [] });
          }
        }
      }
      const allEvents = [...eventMap.values()].sort((a, b) => a.start.localeCompare(b.start));

      if (groups.length === 1 && !member) {
        this.singleEvents = allEvents;
        const first = results[0];
        this.eventSource = first.status === 'fulfilled' ? first.value.source : null;
      } else {
        this.mergedEvents = allEvents;
      }

      this.loading = false;
      this.cdr.markForCheck();
    });
  }
}
