import { Component, Inject, Input, OnChanges, PLATFORM_ID, SimpleChanges, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
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
        <div style="display:flex;align-items:center;gap:16px;margin-bottom:14px;">
          <div style="height:1px;width:20px;background:rgba(124,108,242,0.4);flex-shrink:0;"></div>
          <span style="font-size:0.72rem;letter-spacing:0.25em;text-transform:uppercase;color:var(--text-label);white-space:nowrap;">近期活動</span>
          @if (groups.length === 1 && !member) {
            <a
              [href]="eventSource === 'timetree' ? groups[0].timetree_url : 'https://calendar.google.com/calendar/'"
              (click)="openSourceUrl($event)"
              target="_blank"
              rel="noopener noreferrer"
              style="font-size:0.63rem;letter-spacing:0.1em;text-transform:uppercase;padding:2px 7px;border-radius:4px;background:rgba(124,108,242,0.12);color:#7c6cf2;text-decoration:none;cursor:pointer;">
              {{ eventSource === 'timetree' ? 'TimeTree' : 'OTAKU EVENT' }}
            </a>
          }
          <div style="flex:1;height:1px;background:linear-gradient(to right,rgba(124,108,242,0.18),transparent);"></div>
        </div>
        @if (loading) {
          <div style="font-size:0.75rem;color:var(--text-faint,#aaa);padding:4px 0;">讀取活動中…</div>
        } @else {
          <div [style.position]="hasMore ? 'relative' : null">
            @for (event of visibleSingleEvents; track event.id) {
              <a [href]="event.url ?? '#'" target="_blank" rel="noopener noreferrer"
                 style="display:grid;grid-template-columns:56px 1fr;gap:10px;padding:7px 10px;text-decoration:none;border-radius:6px;transition:background 0.15s;margin-bottom:1px;"
                 onmouseenter="this.style.background='rgba(124,108,242,0.05)'"
                 onmouseleave="this.style.background='transparent'">
                <span style="font-size:0.7rem;color:#7c6cf2;font-weight:600;padding-top:1px;line-height:1.4;">{{ formatDate(event.start, event.end, event.isAllDay) }}</span>
                <span style="font-size:0.82rem;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.4;">{{ event.title }}</span>
              </a>
            }
            @for (event of visibleMergedEvents; track event.id) {
              <a [href]="event.url ?? '#'" target="_blank" rel="noopener noreferrer"
                 style="display:grid;grid-template-columns:56px 1fr;gap:10px;padding:7px 10px;text-decoration:none;border-radius:6px;transition:background 0.15s;margin-bottom:1px;"
                 onmouseenter="this.style.background='rgba(124,108,242,0.05)'"
                 onmouseleave="this.style.background='transparent'">
                <span style="font-size:0.7rem;color:#7c6cf2;font-weight:600;padding-top:1px;line-height:1.4;">{{ formatDate(event.start, event.end, event.isAllDay) }}</span>
                <div>
                  <span style="font-size:0.82rem;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;line-height:1.4;">{{ event.title }}</span>
                  @if (event.groupNames.length > 0) {
                    <span style="font-size:0.68rem;color:var(--text-faint);line-height:1.3;">{{ event.groupNames.join(' · ') }}</span>
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
              style="display:flex;align-items:center;gap:10px;width:100%;background:none;border:none;cursor:pointer;padding:8px 10px 2px;color:rgba(124,108,242,0.5);transition:color 0.2s;"
              onmouseenter="this.style.color='rgba(124,108,242,0.9)'"
              onmouseleave="this.style.color='rgba(124,108,242,0.5)'">
              <div style="flex:1;height:1px;background:rgba(124,108,242,0.12);"></div>
              <span style="font-size:0.63rem;letter-spacing:0.2em;text-transform:uppercase;white-space:nowrap;">+ {{ remainingCount }} 筆</span>
              <div style="flex:1;height:1px;background:rgba(124,108,242,0.12);"></div>
            </button>
          }
          <p style="margin:8px 0 0;padding:0 10px;font-size:0.62rem;color:var(--text-faint,#bbb);letter-spacing:0.04em;line-height:1.6;opacity:0.8;">
            ※ 資料由 TimeTree / Otaku Event 提供，活動詳情以官方公告為準
          </p>
        }
      </section>
    }
  `,
})
export class GroupEventsComponent implements OnChanges {
  @Input() groups: Group[] = [];
  @Input() member: Member | null = null;
  @Input() members: Member[] = [];

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

  protected openSourceUrl(e: MouseEvent): void {
    e.preventDefault();
    const url = this.eventSource === 'timetree'
      ? (this.groups[0]?.timetree_url ?? 'https://calendar.google.com/calendar/')
      : 'https://calendar.google.com/calendar/';
    if (this.isBrowser) window.open(url, '_blank', 'noopener,noreferrer');
  }

  private generation = 0;
  private groupSignature = '';
  private readonly isBrowser: boolean;

  constructor(
    private calendarService: GoogleCalendarService,
    private timetreeService: TimeTreeService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    @Inject(PLATFORM_ID) platformId: object,
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['groups'] && !changes['member'] && !changes['members']) return;
    const nextSignature = this.groups.map(g => g.id).join('|') + '::' + this.members.map(m => m.id).join('|');
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
    const alias = this.timetreeAliasFromUrl(group.timetree_url);
    if (alias) {
      try {
        const events = await this.timetreeService.getUpcomingEvents(alias);
        return { events, source: 'timetree' };
      } catch {
        // silent fallback
      }
    }
    const events = await this.calendarService.getUpcomingGroupEvents(group);
    return { events, source: 'google' };
  }

  private timetreeAliasFromUrl(value: string | null): string | null {
    if (!value) return null;
    try {
      const url = new URL(value.trim());
      const host = url.hostname.toLowerCase();
      const parts = url.pathname.split('/').filter(Boolean);
      let alias: string | undefined;
      if ((host === 'timetreeapp.com' || host === 'www.timetreeapp.com') && parts[0] === 'public_calendars') {
        alias = parts[1];
      } else if (host === 'timetr.ee' && parts[0] === 'p') {
        alias = parts[1];
      }
      return alias && /^[\w-]+$/.test(alias) ? alias : null;
    } catch {
      return null;
    }
  }

  private async reload(): Promise<void> {
    const gen = ++this.generation;
    const groups = [...this.groups];
    const member = this.member;
    const members = [...this.members];
    this.loading = true;
    this.singleEvents = [];
    this.mergedEvents = [];
    this.eventSource = null;
    this.showAll = false;
    this.cdr.markForCheck();

    if (groups.length === 0 && !member && members.length === 0) {
      this.loading = false;
      return;
    }

    if (!this.isBrowser) {
      this.loading = false;
      this.cdr.markForCheck();
      return;
    }

    const groupEventPromises = groups.map(g =>
      this.fetchGroupEventsWithSource(g).then(r => ({ group: g as Group | null, events: r.events, source: r.source }))
    );
    const memberEventPromises = (sourceMembers: Member[]) => [
      ...(member
        ? [this.calendarService.getUpcomingMemberEvents(member).then(events => ({ group: null as Group | null, events, source: 'google' as const }))]
        : []),
      ...sourceMembers.map(m =>
        this.calendarService.getUpcomingMemberEvents(m).then(events => ({ group: null as Group | null, events, source: 'google' as const }))
      ),
    ];

    let results: PromiseSettledResult<{ group: Group | null; events: VenueCalendarEvent[]; source: 'timetree' | 'google' }>[];
    const singleGroupHasTimeTree = groups.length === 1 && !!this.timetreeAliasFromUrl(groups[0]?.timetree_url ?? null);
    if (singleGroupHasTimeTree && !member) {
      const groupResults = await this.ngZone.runOutsideAngular(() => Promise.allSettled(groupEventPromises));
      if (gen !== this.generation) return;
      const first = groupResults[0];
      const timeTreeSucceeded = first?.status === 'fulfilled' && first.value.source === 'timetree';
      const supplementalResults = timeTreeSucceeded
        ? []
        : await this.ngZone.runOutsideAngular(() => Promise.allSettled(memberEventPromises(members)));
      results = [...groupResults, ...supplementalResults];
    } else {
      results = await this.ngZone.runOutsideAngular(() =>
        Promise.allSettled([...groupEventPromises, ...memberEventPromises(members)])
      );
    }

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
