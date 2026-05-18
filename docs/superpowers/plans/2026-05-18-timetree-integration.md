# TimeTree Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add TimeTree public calendar URL as a group data field, and prioritize TimeTree event data over Google Calendar when displaying upcoming events for groups that have a TimeTree calendar.

**Architecture:** A Cloudflare Pages Function proxies requests to TimeTree's unofficial web endpoint (no API key required), paginates results, and returns a `VenueCalendarEvent[]`. A new `TimeTreeService` calls this function and caches responses client-side. `GroupEventsComponent` tries TimeTree first for any group that has a `timetree_url`; on failure it falls back silently to Google Calendar. Group page SNS section shows a TimeTree link; proposal system exposes the field for community editing.

**Tech Stack:** Angular 19, Cloudflare Pages Functions (TypeScript, no framework), Jasmine/TestBed, Supabase SQL migrations.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/052_add_timetree_url_to_groups.sql` | DB column |
| Modify | `src/app/models/index.ts` | Add `timetree_url` to `Group` |
| Create | `functions/api/timetree-events.ts` | Cloudflare Pages Function proxy |
| Create | `src/app/core/timetree.service.ts` | Client-side wrapper + cache |
| Create | `src/app/core/timetree.service.spec.ts` | Unit tests |
| Modify | `src/app/shared/group-events/group-events.component.ts` | Priority logic + source badge |
| Modify | `src/app/shared/group-events/group-events.component.spec.ts` | New tests |
| Modify | `src/app/pages/group-page/group-page.component.ts` | Add `timetree` to `snsUrls` |
| Modify | `src/app/pages/group-page/group-page.component.html` | Add TimeTree SNS link |
| Modify | `src/app/core/proposal-fields.config.ts` | Add field + label |
| Modify | `src/app/shared/proposal-panel/proposal-panel.component.ts` | URL_FIELDS, placeholder, validation |

---

## Task 1: DB Migration + Group Interface

**Files:**
- Create: `supabase/migrations/052_add_timetree_url_to_groups.sql`
- Modify: `src/app/models/index.ts`

- [ ] **Step 1: Create migration file**

```sql
-- supabase/migrations/052_add_timetree_url_to_groups.sql
ALTER TABLE groups ADD COLUMN IF NOT EXISTS timetree_url text;
```

- [ ] **Step 2: Add field to Group interface**

In `src/app/models/index.ts`, find `export interface Group` and add `timetree_url` after `youtube`:

```ts
  youtube: string | null;
  timetree_url: string | null;
  updated_at: string;
```

- [ ] **Step 3: Fix mockGroup in existing spec to include new field**

In `src/app/shared/group-events/group-events.component.spec.ts`, update `mockGroup`:

```ts
function mockGroup(id: string, name = `Group ${id}`): Group {
  return { id, name, name_jp: null, photo_url: null, color: '#000', company: null, company_id: null,
    founded_at: null, disbanded_at: null, notes: null, is_trainee: false, style: null,
    instagram: null, facebook: null, x: null, youtube: null, timetree_url: null,
    updated_at: '2026-01-01', created_at: '2026-01-01' };
}
```

- [ ] **Step 4: Run existing tests to confirm nothing broke**

```bash
npx ng test --include="src/app/shared/group-events/group-events.component.spec.ts" --watch=false
```

Expected: all existing tests pass.

- [ ] **Step 5: Apply migration to Supabase**

```bash
npx supabase db push
```

Expected: migration applied without error.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/052_add_timetree_url_to_groups.sql src/app/models/index.ts src/app/shared/group-events/group-events.component.spec.ts
git commit -m "feat(timetree): add timetree_url column to groups table and Group interface"
```

---

## Task 2: Cloudflare Pages Function

**Files:**
- Create: `functions/api/timetree-events.ts`

The function follows the exact same pattern as `functions/sitemap.xml.ts`: export `onRequest: PagesFunction`. Cloudflare Pages auto-routes `functions/api/timetree-events.ts` to `/api/timetree-events` — no redirect config needed.

- [ ] **Step 1: Create the function file**

```ts
// functions/api/timetree-events.ts

interface TimeTreeEvent {
  id: string;
  title: string;
  location_name: string | null;
  all_day: boolean;
  start_at: number;
  end_at: number;
  url: string | null;
}

interface TimeTreeResponse {
  paging: { next: boolean; next_cursor?: string };
  public_events: TimeTreeEvent[];
}

interface VenueCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string | null;
  location: string | null;
  url: string | null;
  isAllDay: boolean;
}

const cache = new Map<string, { data: VenueCalendarEvent[]; expiresAt: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_PAGES = 5;

function toVenueEvent(e: TimeTreeEvent): VenueCalendarEvent {
  const start = new Date(e.start_at).toISOString();
  let end: string | null = null;
  if (e.all_day) {
    if (e.end_at > e.start_at) {
      end = new Date(e.end_at + 1).toISOString();
    }
  } else {
    end = new Date(e.end_at).toISOString();
  }
  return {
    id: String(e.id),
    title: e.title,
    start,
    end,
    location: e.location_name || null,
    url: e.url ?? null,
    isAllDay: e.all_day,
  };
}

export const onRequest: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const alias = url.searchParams.get('alias');
  const days = Math.max(1, Math.min(365, parseInt(url.searchParams.get('days') ?? '90', 10)));

  if (!alias) return new Response('Missing alias', { status: 400 });

  const cacheKey = `${alias}:${days}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return Response.json(cached.data);
  }

  try {
    const utcOffsetMs = 8 * 60 * 60 * 1000;
    const todayStartTW = Math.floor((Date.now() + utcOffsetMs) / 86400000) * 86400000 - utcOffsetMs;
    const from = todayStartTW;
    const to = todayStartTW + days * 86400000;

    const allEvents: VenueCalendarEvent[] = [];
    let cursor: string | undefined;
    let page = 0;

    do {
      const params = new URLSearchParams({
        from: String(from),
        to: String(to),
        utc_offset: '480',
        limit: '100',
      });
      if (cursor) params.set('cursor', cursor);

      const res = await fetch(
        `https://timetreeapp.com/api/v2/public_calendars/${alias}/public_events?${params}`,
        { headers: { 'X-TimeTreeA': 'web/2.1.0/en' } }
      );

      if (res.status === 404) return Response.json([]);
      if (!res.ok) return new Response('TimeTree error', { status: 503 });

      const data: TimeTreeResponse = await res.json();
      allEvents.push(...data.public_events.map(toVenueEvent));
      cursor = data.paging.next ? data.paging.next_cursor : undefined;
      page++;
    } while (cursor && page < MAX_PAGES);

    cache.set(cacheKey, { data: allEvents, expiresAt: Date.now() + CACHE_TTL_MS });
    return Response.json(allEvents);
  } catch {
    return new Response('Internal error', { status: 503 });
  }
};
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit --project tsconfig.json 2>&1 | grep "timetree" || echo "No errors for timetree files"
```

Expected: no errors related to `timetree-events.ts`. (The Angular tsconfig may not include `functions/`, which is fine — Cloudflare uses its own compilation.)

- [ ] **Step 3: Commit**

```bash
git add functions/api/timetree-events.ts
git commit -m "feat(timetree): add Cloudflare Pages Function proxy for TimeTree web endpoint"
```

---

## Task 3: TimeTreeService + Tests

**Files:**
- Create: `src/app/core/timetree.service.ts`
- Create: `src/app/core/timetree.service.spec.ts`

- [ ] **Step 1: Write failing tests first**

Create `src/app/core/timetree.service.spec.ts`:

```ts
import { TestBed } from '@angular/core/testing';
import { TimeTreeService } from './timetree.service';
import { VenueCalendarEvent } from '../models';

function mockEvent(id: string): VenueCalendarEvent {
  return { id, title: `Event ${id}`, start: '2026-06-01T00:00:00.000Z', end: null, location: null, url: null, isAllDay: true };
}

describe('TimeTreeService', () => {
  let service: TimeTreeService;
  let fetchSpy: jasmine.Spy;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TimeTreeService);
    fetchSpy = spyOn(window, 'fetch');
  });

  it('returns events on success', async () => {
    const events = [mockEvent('1')];
    fetchSpy.and.returnValue(Promise.resolve(new Response(JSON.stringify(events), { status: 200 })));
    const result = await service.getUpcomingEvents('pure_maker');
    expect(result).toEqual(events);
    expect(fetchSpy).toHaveBeenCalledWith('/api/timetree-events?alias=pure_maker&days=90');
  });

  it('throws on non-OK response', async () => {
    fetchSpy.and.returnValue(Promise.resolve(new Response('error', { status: 503 })));
    await expectAsync(service.getUpcomingEvents('pure_maker')).toBeRejectedWithError(/503/);
  });

  it('returns cached promise on repeated call', async () => {
    const events = [mockEvent('2')];
    fetchSpy.and.returnValue(Promise.resolve(new Response(JSON.stringify(events), { status: 200 })));
    const p1 = service.getUpcomingEvents('ore_idol');
    const p2 = service.getUpcomingEvents('ore_idol');
    expect(p1).toBe(p2);
    await p1;
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('uses different cache keys for different aliases', async () => {
    const events: VenueCalendarEvent[] = [];
    fetchSpy.and.returnValue(Promise.resolve(new Response(JSON.stringify(events), { status: 200 })));
    const p1 = service.getUpcomingEvents('alias_a');
    const p2 = service.getUpcomingEvents('alias_b');
    expect(p1).not.toBe(p2);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx ng test --include="src/app/core/timetree.service.spec.ts" --watch=false
```

Expected: FAIL with "Cannot find module './timetree.service'".

- [ ] **Step 3: Implement the service**

Create `src/app/core/timetree.service.ts`:

```ts
import { Injectable } from '@angular/core';
import { VenueCalendarEvent } from '../models';

@Injectable({ providedIn: 'root' })
export class TimeTreeService {
  private readonly cache = new Map<string, Promise<VenueCalendarEvent[]>>();

  getUpcomingEvents(alias: string, daysAhead = 90): Promise<VenueCalendarEvent[]> {
    const key = `timetree:${alias}:${daysAhead}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const promise = fetch(`/api/timetree-events?alias=${encodeURIComponent(alias)}&days=${daysAhead}`)
      .then(res => {
        if (!res.ok) throw new Error(`TimeTree ${res.status}`);
        return res.json() as Promise<VenueCalendarEvent[]>;
      });
    this.cache.set(key, promise);
    return promise;
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx ng test --include="src/app/core/timetree.service.spec.ts" --watch=false
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/timetree.service.ts src/app/core/timetree.service.spec.ts
git commit -m "feat(timetree): add TimeTreeService with client-side caching"
```

---

## Task 4: GroupEventsComponent — Priority Logic + Source Badge

**Files:**
- Modify: `src/app/shared/group-events/group-events.component.ts`
- Modify: `src/app/shared/group-events/group-events.component.spec.ts`

- [ ] **Step 1: Write new failing tests**

Add these test cases to `src/app/shared/group-events/group-events.component.spec.ts`:

First, update the imports and `beforeEach` to include `TimeTreeService`:

```ts
import { GroupEventsComponent } from './group-events.component';
import { GoogleCalendarService } from '../../core/google-calendar.service';
import { TimeTreeService } from '../../core/timetree.service';
import { Group, Member, VenueCalendarEvent } from '../../models';
```

In `beforeEach`, add TimeTree spy:

```ts
let timetreeSpy: jasmine.SpyObj<TimeTreeService>;

beforeEach(async () => {
  calendarSpy = jasmine.createSpyObj('GoogleCalendarService', ['getUpcomingGroupEvents', 'getUpcomingMemberEvents']);
  timetreeSpy = jasmine.createSpyObj('TimeTreeService', ['getUpcomingEvents']);
  await TestBed.configureTestingModule({
    imports: [GroupEventsComponent],
    providers: [
      { provide: GoogleCalendarService, useValue: calendarSpy },
      { provide: TimeTreeService, useValue: timetreeSpy },
    ],
  }).compileComponents();
  // ... rest of beforeEach unchanged
});
```

Add these test cases at the end of the `describe` block:

```ts
describe('TimeTree priority', () => {
  function mockGroupWithTimeTree(id: string): Group {
    return { ...mockGroup(id), timetree_url: 'https://timetreeapp.com/public_calendars/test_alias/' };
  }

  it('uses TimeTree when group has timetree_url', async () => {
    const ttEvent = mockEvent('tt1', '2026-07-01T00:00:00');
    timetreeSpy.getUpcomingEvents.and.returnValue(Promise.resolve([ttEvent]));
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([]));
    triggerChange([mockGroupWithTimeTree('g1')]);
    await settleEvents();
    expect(timetreeSpy.getUpcomingEvents).toHaveBeenCalledWith('test_alias');
    expect(calendarSpy.getUpcomingGroupEvents).not.toHaveBeenCalled();
    expect(component.singleEvents.length).toBe(1);
    expect(component.singleEvents[0].id).toBe('tt1');
  });

  it('falls back to Google Calendar when TimeTree throws', async () => {
    const gcEvent = mockEvent('gc1', '2026-07-01T00:00:00');
    timetreeSpy.getUpcomingEvents.and.returnValue(Promise.reject(new Error('503')));
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([gcEvent]));
    triggerChange([mockGroupWithTimeTree('g1')]);
    await settleEvents();
    expect(calendarSpy.getUpcomingGroupEvents).toHaveBeenCalled();
    expect(component.singleEvents.length).toBe(1);
    expect(component.singleEvents[0].id).toBe('gc1');
  });

  it('uses Google Calendar directly when group has no timetree_url', async () => {
    const gcEvent = mockEvent('gc2');
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([gcEvent]));
    triggerChange([mockGroup('g1')]);
    await settleEvents();
    expect(timetreeSpy.getUpcomingEvents).not.toHaveBeenCalled();
    expect(component.singleEvents[0].id).toBe('gc2');
  });

  it('sets eventSource to timetree when TimeTree succeeds', async () => {
    timetreeSpy.getUpcomingEvents.and.returnValue(Promise.resolve([mockEvent('tt1')]));
    triggerChange([mockGroupWithTimeTree('g1')]);
    await settleEvents();
    expect(component.eventSource).toBe('timetree');
  });

  it('sets eventSource to google when TimeTree fails', async () => {
    timetreeSpy.getUpcomingEvents.and.returnValue(Promise.reject(new Error('503')));
    calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([mockEvent('gc1')]));
    triggerChange([mockGroupWithTimeTree('g1')]);
    await settleEvents();
    expect(component.eventSource).toBe('google');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx ng test --include="src/app/shared/group-events/group-events.component.spec.ts" --watch=false
```

Expected: FAIL — `TimeTreeService` not found / `eventSource` undefined.

- [ ] **Step 3: Update GroupEventsComponent**

Replace the entire `group-events.component.ts` with the updated version:

```ts
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
                @if (event.groupNames.length > 0) {
                  <span style="font-size:0.6rem;color:var(--text-faint);">{{ event.groupNames.join(' · ') }}</span>
                }
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
  @Input() member: Member | null = null;

  protected loading = false;
  singleEvents: VenueCalendarEvent[] = [];
  mergedEvents: MergedEvent[] = [];
  eventSource: 'timetree' | 'google' | null = null;

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
```

- [ ] **Step 4: Run all group-events tests**

```bash
npx ng test --include="src/app/shared/group-events/group-events.component.spec.ts" --watch=false
```

Expected: all tests PASS (existing + new TimeTree priority tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/group-events/group-events.component.ts src/app/shared/group-events/group-events.component.spec.ts
git commit -m "feat(timetree): add TimeTree priority logic and source badge to GroupEventsComponent"
```

---

## Task 5: Group Page — SNS Link

**Files:**
- Modify: `src/app/pages/group-page/group-page.component.ts`
- Modify: `src/app/pages/group-page/group-page.component.html`

- [ ] **Step 1: Update snsUrls type in component TS**

In `src/app/pages/group-page/group-page.component.ts`, find and update the `snsUrls` property declaration:

```ts
snsUrls: { instagram: string | null; facebook: string | null; x: string | null; youtube: string | null; timetree: string | null } = {
  instagram: null, facebook: null, x: null, youtube: null, timetree: null,
};
```

Find the `snsUrls = { instagram: null, facebook: null, x: null, youtube: null };` reset (around line 288) and update it:

```ts
this.snsUrls = { instagram: null, facebook: null, x: null, youtube: null, timetree: null };
```

Find the `snsUrls = { instagram: ..., facebook: ..., x: ..., youtube: ... }` assignment (around line 313) and add `timetree`:

```ts
this.snsUrls = {
  instagram: normalizeSnsUrl(pageData.group.instagram, 'instagram'),
  facebook: normalizeSnsUrl(pageData.group.facebook, 'facebook'),
  x: normalizeSnsUrl(pageData.group.x, 'x'),
  youtube: normalizeSnsUrl(pageData.group.youtube, 'youtube'),
  timetree: pageData.group.timetree_url ?? null,
};
```

Note: `timetree_url` is already a full URL — no normalization needed, use it directly.

- [ ] **Step 2: Add TimeTree to SNS condition and icon in template**

In `src/app/pages/group-page/group-page.component.html`, find the SNS section opening condition (around line 230):

```html
@if (snsUrls.instagram || snsUrls.facebook || snsUrls.x || snsUrls.youtube) {
```

Change to:

```html
@if (snsUrls.instagram || snsUrls.facebook || snsUrls.x || snsUrls.youtube || snsUrls.timetree) {
```

Find the end of the `@if (snsUrls.youtube)` block (after the YouTube `</a>`) and add the TimeTree link immediately after:

```html
                @if (snsUrls.timetree) {
                  <a [href]="snsUrls.timetree" target="_blank" rel="noopener noreferrer"
                    style="color: rgba(124,108,242,0.7); transition: color 0.2s; display: flex;"
                    title="TimeTree">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>
                    </svg>
                  </a>
                }
```

- [ ] **Step 3: Build to check for template errors**

```bash
npx ng build --configuration=development 2>&1 | tail -20
```

Expected: build succeeds with no template errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/group-page/group-page.component.ts src/app/pages/group-page/group-page.component.html
git commit -m "feat(timetree): add TimeTree link to group page SNS section"
```

---

## Task 6: Proposal System — Field Registration + Validation

**Files:**
- Modify: `src/app/core/proposal-fields.config.ts`
- Modify: `src/app/shared/proposal-panel/proposal-panel.component.ts`

- [ ] **Step 1: Add field to proposal-fields.config.ts**

In `src/app/core/proposal-fields.config.ts`:

In `PROPOSAL_ALLOWED_FIELDS.groups`, add `'timetree_url'` after `'youtube'`:

```ts
  groups: [
    'name', 'name_jp', 'color', 'founded_at', 'disbanded_at',
    'instagram', 'facebook', 'x', 'youtube', 'timetree_url', 'company_id', 'photo_url',
  ],
```

In `FIELD_LABELS.groups`, add the label after `youtube`:

```ts
    youtube: 'YouTube', timetree_url: 'TimeTree',
```

- [ ] **Step 2: Add to URL_FIELDS in proposal panel**

In `src/app/shared/proposal-panel/proposal-panel.component.ts`, find `URL_FIELDS`:

```ts
private readonly URL_FIELDS = new Set(['instagram', 'facebook', 'x', 'maid_url', 'youtube', 'website', 'photo_url', 'google_maps_url', 'timetree_url']);
```

- [ ] **Step 3: Add placeholder**

In `fieldPlaceholder()`, add inside the `hints` object:

```ts
'groups:timetree_url': 'https://timetreeapp.com/public_calendars/...',
```

- [ ] **Step 4: Add TimeTree-specific URL validation**

In `proposal-panel.component.ts`, find the URL validation block (around line 1043):

```ts
// Validate URL fields must start with https://
const invalidUrlFields = Object.keys(proposed).filter(
  f => this.URL_FIELDS.has(f) && !String(proposed[f]).startsWith('https://')
);
```

Add a TimeTree-specific check immediately after the generic URL validation `if` block (after its closing `}`):

```ts
// Validate timetree_url must be a TimeTree public calendar URL
if (proposed['timetree_url'] && !String(proposed['timetree_url']).startsWith('https://timetreeapp.com/public_calendars/')) {
  this.fieldErrors['timetree_url'] = '必須是 https://timetreeapp.com/public_calendars/ 開頭的網址';
  this.scrollToField('timetree_url');
  return;
}
```

- [ ] **Step 5: Build to confirm no errors**

```bash
npx ng build --configuration=development 2>&1 | tail -20
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/app/core/proposal-fields.config.ts src/app/shared/proposal-panel/proposal-panel.component.ts
git commit -m "feat(timetree): add timetree_url to proposal system with URL validation"
```

---

## Task 7: Final Verification

- [ ] **Step 1: Run all tests**

```bash
npx ng test --watch=false 2>&1 | tail -30
```

Expected: all tests pass, no failures.

- [ ] **Step 2: Build production bundle**

```bash
npx ng build 2>&1 | tail -10
```

Expected: build succeeds.

- [ ] **Step 3: Manual smoke test checklist**

Start dev server: `npx ng serve`

Open a group page that has no `timetree_url` set:
- [ ] Near-future events show from Google Calendar
- [ ] No source badge visible (only shows in single-group + has events)

To test TimeTree flow locally, temporarily set `timetree_url` for a group in Supabase to `https://timetreeapp.com/public_calendars/pure_maker/` and visit that group's page:
- [ ] Source badge shows "TimeTree"
- [ ] Events are from TimeTree

Open the group's proposal panel (pencil icon):
- [ ] `TimeTree` field appears in the form
- [ ] Placeholder reads `https://timetreeapp.com/public_calendars/...`
- [ ] Submitting an invalid URL (e.g. `https://google.com`) shows validation error
- [ ] Submitting a valid TimeTree URL succeeds

Check SNS section for a group with `timetree_url` set:
- [ ] Clock-style TimeTree icon appears next to YouTube icon
- [ ] Clicking opens the TimeTree public calendar in a new tab
