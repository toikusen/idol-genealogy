# Member Individual Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a member's personal events (e.g., birthday lives where they appear as `name(From Group)`) only on that member's page, not on other group members' pages or the group page itself.

**Architecture:** Remove the `(From X)` group-matching pattern from `matchesGroup` so group pages stop showing individual-member events. Add a `matchesMember` function that identifies events by the performer's name (including extraction from `name(From Group)` format). Update `GroupEventsComponent` to accept an optional `member` input and merge group events + member events with ID-based deduplication.

**Tech Stack:** Angular 19, TypeScript, Jasmine/Karma (`ng test`), Google Calendar API (no schema changes needed)

---

## File Map

| File | Change |
|---|---|
| `src/app/core/google-calendar.service.ts` | Remove `groupMatchesFromPattern` call from `matchesGroup`; add `matchesMember`, `memberNameInFromPattern`, `getUpcomingMemberEvents`; import `Member` |
| `src/app/core/google-calendar.service.spec.ts` | Add tests for removed `(From X)` group match; add tests for `matchesMember` and `memberNameInFromPattern` |
| `src/app/shared/group-events/group-events.component.ts` | Add `@Input() member`; update `reload()` to merge group + member events; import `Member` |
| `src/app/shared/group-events/group-events.component.spec.ts` | Add spy for `getUpcomingMemberEvents`; add tests for member input behavior and deduplication |
| `src/app/pages/member-page/member-page.component.html` | Pass `[member]="member"` to `<app-group-events>`; widen guard to include `|| member` |

---

### Task 1: Remove `(From X)` from group matching and verify with tests

**Files:**
- Modify: `src/app/core/google-calendar.service.ts` (inside `matchesGroup`)
- Modify: `src/app/core/google-calendar.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Add this test to `google-calendar.service.spec.ts`, inside the `describe('GoogleCalendarService')` block, after the existing venue tests. First add a `baseGroup` constant at the top of the file alongside `baseVenue`:

```typescript
const baseGroup: Group = {
  id: 'g1', name: 'Group 1', name_jp: null, photo_url: null, color: '#000',
  company: null, company_id: null, founded_at: null, disbanded_at: null,
  notes: null, is_trainee: false, style: null, instagram: null, facebook: null,
  x: null, youtube: null, updated_at: '2026-01-01', created_at: '2026-01-01',
};
```

Add `Group` to the import at the top of the spec file:
```typescript
import { Group, Venue } from '../models';
```

Then add the test:
```typescript
it('does not match a group when event only references it via (From Group) in description', () => {
  const group: Group = { ...baseGroup, id: 'pure-maker', name: 'Pure Maker' };
  const event = {
    id: 'e-seitan',
    summary: '綿空もり生誕祭2026',
    description: '🤍演出者🤍\nもも(From Pure Maker)',
    start: { dateTime: '2026-06-06T17:30:00+08:00' },
  };
  expect((service as any).matchesGroup(event, group)).toBeFalse();
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```bash
ng test --include='**/google-calendar.service.spec.ts' --watch=false
```

Expected: the new test fails because `matchesGroup` currently returns `true` via `groupMatchesFromPattern`.

- [ ] **Step 3: Remove `groupMatchesFromPattern` from `matchesGroup`**

In `src/app/core/google-calendar.service.ts`, inside `matchesGroup`, find the block:

```typescript
    if (event.description) {
      if (this.groupNameNearOrganizerKeyword(names, event.description)) return true;
      if (this.groupNameNearPerformerKeyword(names, event.description)) return true;
      if (this.groupMatchesFromPattern(names, event.description)) return true;
    }
```

Remove only the `groupMatchesFromPattern` line, keeping the other two:

```typescript
    if (event.description) {
      if (this.groupNameNearOrganizerKeyword(names, event.description)) return true;
      if (this.groupNameNearPerformerKeyword(names, event.description)) return true;
    }
```

Do NOT delete the `groupMatchesFromPattern` method itself — it will be reused in Task 2.

- [ ] **Step 4: Run tests — expect PASS**

```bash
ng test --include='**/google-calendar.service.spec.ts' --watch=false
```

Expected: all tests pass, including the new one.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/google-calendar.service.ts src/app/core/google-calendar.service.spec.ts
git commit -m "fix(calendar): remove (From X) pattern from group matching"
```

---

### Task 2: Add `matchesMember` and `getUpcomingMemberEvents` to `GoogleCalendarService`

**Files:**
- Modify: `src/app/core/google-calendar.service.ts`
- Modify: `src/app/core/google-calendar.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add a `mockMember` factory and three new tests to `google-calendar.service.spec.ts`. Add `Member` to the model import:

```typescript
import { Group, Member, Venue } from '../models';
```

Add the factory function at the top of the file alongside `baseGroup`:

```typescript
function mockMember(id: string, overrides: Partial<Member> = {}): Member {
  return {
    id, name: `Member ${id}`, name_hiragana: null, name_roman: null, emoji: null,
    photo_url: null, color: null, color_name: null, birthdate: null, nickname: null,
    instagram: null, facebook: null, x: null, maid_url: null, notes: null,
    company_id: null, no_sns: false, updated_at: '2026-01-01', created_at: '2026-01-01',
    ...overrides,
  };
}
```

Add these tests inside `describe('GoogleCalendarService')`:

```typescript
it('matchesMember: matches short-name member via (From Group) pattern', () => {
  const member = mockMember('m1', { name: 'もも' });
  const event = {
    id: 'e-seitan',
    summary: '綿空もり生誕祭2026',
    description: '🤍演出者🤍\nもも(From Pure Maker)',
    start: { dateTime: '2026-06-06T17:30:00+08:00' },
  };
  expect((service as any).matchesMember(event, member)).toBeTrue();
});

it('matchesMember: does not match a different member via (From Group) pattern', () => {
  const member = mockMember('m2', { name: '幻波' });
  const event = {
    id: 'e-seitan',
    summary: '綿空もり生誕祭2026',
    description: '🤍演出者🤍\nもも(From Pure Maker)',
    start: { dateTime: '2026-06-06T17:30:00+08:00' },
  };
  expect((service as any).matchesMember(event, member)).toBeFalse();
});

it('matchesMember: matches longer-name member via performer keyword', () => {
  const member = mockMember('m3', { name: '初恋ちゃん' });
  const event = {
    id: 'e-live',
    summary: '夏日LIVE',
    description: '演出者\n初恋ちゃん',
    start: { dateTime: '2026-07-01T18:00:00+08:00' },
  };
  expect((service as any).matchesMember(event, member)).toBeTrue();
});

it('matchesMember: matches member roman name in event title', () => {
  const member = mockMember('m4', { name: '春花', name_roman: 'Haruka' });
  const event = {
    id: 'e-solo',
    summary: 'Haruka Solo Live 2026',
    description: null,
    start: { dateTime: '2026-08-01T19:00:00+08:00' },
  };
  expect((service as any).matchesMember(event, member)).toBeTrue();
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
ng test --include='**/google-calendar.service.spec.ts' --watch=false
```

Expected: the four new tests fail with "matchesMember is not a function".

- [ ] **Step 3: Add `Member` import to `google-calendar.service.ts`**

Change the import line in `src/app/core/google-calendar.service.ts`:

```typescript
import { Group, Member, Venue, VenueCalendarEvent } from '../models';
```

- [ ] **Step 4: Add `memberNameInFromPattern` private method**

Add this method to `GoogleCalendarService` after `groupMatchesFromPattern`:

```typescript
private memberNameInFromPattern(names: string[], description: string): boolean {
  // Extracts the performer name from "name(From Group)" or "name（From Group）" format.
  // Each phrase is one line from descriptionPhrases. The regex matches text immediately
  // before a "(From " opener — precise enough to safely handle short names like "もも".
  const fromPattern = /^(.+?)\s*[（(]\s*[Ff]rom\s+/;
  for (const phrase of this.descriptionPhrases(description)) {
    const m = fromPattern.exec(phrase.trim());
    if (!m) continue;
    const extracted = m[1].trim().normalize('NFKC').toLowerCase();
    for (const name of names) {
      if (extracted === name.normalize('NFKC').toLowerCase()) return true;
    }
  }
  return false;
}
```

- [ ] **Step 5: Add `matchesMember` private method**

Add this method after `memberNameInFromPattern`:

```typescript
private matchesMember(event: GoogleCalendarEventResource, member: Member): boolean {
  const names = [member.name, member.name_hiragana, member.name_roman, member.nickname]
    .filter((n): n is string => !!n);
  if (names.length === 0) return false;

  // Layer 1: extract performer from "name(From Group)" — handles short names precisely
  if (event.description && this.memberNameInFromPattern(names, event.description)) return true;

  // Layer 2: performer keyword scan — reuses existing logic, handles names ≥ 3 CJK/kana chars
  if (event.description && this.groupNameNearPerformerKeyword(names, event.description)) return true;

  // Layer 3: title / location direct match — reuses existing phrase matching thresholds
  const summaryNfkc = (event.summary ?? '').normalize('NFKC').toLowerCase();
  const locationNfkc = (event.location ?? '').normalize('NFKC').toLowerCase();
  if (this.groupNameInPhrase(names, summaryNfkc)) return true;
  if (this.groupNameInPhrase(names, locationNfkc)) return true;

  return false;
}
```

- [ ] **Step 6: Add `getUpcomingMemberEvents` public method**

Add this method after `getUpcomingGroupEvents`:

```typescript
getUpcomingMemberEvents(member: Member, daysAhead = 90): Promise<VenueCalendarEvent[]> {
  if (!this.isConfigured()) return Promise.resolve([]);
  const cacheKey = `member:${member.id}:${daysAhead}`;
  const cached = this.cache.get(cacheKey);
  if (cached) return cached;
  const rawPromise = this.rawCache.get(daysAhead) ?? this.fetchUpcomingEvents(daysAhead);
  const promise = rawPromise.then(events =>
    events
      .filter(event => this.matchesMember(event, member))
      .map(event => this.toVenueEvent(event)),
  );
  this.cache.set(cacheKey, promise);
  return promise;
}
```

- [ ] **Step 7: Run tests — expect PASS**

```bash
ng test --include='**/google-calendar.service.spec.ts' --watch=false
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/app/core/google-calendar.service.ts src/app/core/google-calendar.service.spec.ts
git commit -m "feat(calendar): add matchesMember and getUpcomingMemberEvents"
```

---

### Task 3: Update `GroupEventsComponent` to accept `member` and merge events

**Files:**
- Modify: `src/app/shared/group-events/group-events.component.ts`
- Modify: `src/app/shared/group-events/group-events.component.spec.ts`

- [ ] **Step 1: Write the failing tests**

In `group-events.component.spec.ts`:

1. Add `Member` to the import:
```typescript
import { Group, Member, VenueCalendarEvent } from '../../models';
```

2. Add a `mockMember` factory after `mockEvent`:
```typescript
function mockMember(id: string, name = `Member ${id}`): Member {
  return {
    id, name, name_hiragana: null, name_roman: null, emoji: null, photo_url: null,
    color: null, color_name: null, birthdate: null, nickname: null, instagram: null,
    facebook: null, x: null, maid_url: null, notes: null, company_id: null,
    no_sns: false, updated_at: '2026-01-01', created_at: '2026-01-01',
  };
}
```

3. In `beforeEach`, add `getUpcomingMemberEvents` to the spy:
```typescript
calendarSpy = jasmine.createSpyObj('GoogleCalendarService', ['getUpcomingGroupEvents', 'getUpcomingMemberEvents']);
```

4. Add three new tests inside `describe('GroupEventsComponent')`:

```typescript
it('shows member individual events when member input is provided', async () => {
  calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([]));
  calendarSpy.getUpcomingMemberEvents.and.returnValue(Promise.resolve([mockEvent('e-personal')]));
  component.member = mockMember('m1');
  triggerChange([mockGroup('g1')]);
  await settleEvents();
  expect(component.mergedEvents.length).toBe(1);
  expect(component.mergedEvents[0].id).toBe('e-personal');
});

it('deduplicates an event that appears in both group and member results', async () => {
  const ev = mockEvent('e-shared');
  calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([ev]));
  calendarSpy.getUpcomingMemberEvents.and.returnValue(Promise.resolve([ev]));
  component.member = mockMember('m1');
  triggerChange([mockGroup('g1')]);
  await settleEvents();
  expect(component.mergedEvents.length).toBe(1);
});

it('does not call getUpcomingMemberEvents when no member is provided', async () => {
  calendarSpy.getUpcomingGroupEvents.and.returnValue(Promise.resolve([]));
  triggerChange([mockGroup('g1')]);
  await settleEvents();
  expect(calendarSpy.getUpcomingMemberEvents).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
ng test --include='**/group-events.component.spec.ts' --watch=false
```

Expected: three new tests fail ("member" property does not exist / `getUpcomingMemberEvents` not called).

- [ ] **Step 3: Update `group-events.component.ts`**

Replace the entire file content with:

```typescript
import { Component, Input, OnChanges, SimpleChanges, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Group, Member, VenueCalendarEvent } from '../../models';
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

  private generation = 0;
  private groupSignature = '';

  constructor(
    private calendarService: GoogleCalendarService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['groups']) return;
    const nextSignature = this.groups.map(g => g.id).join('|');
    if (nextSignature === this.groupSignature) return;
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

  private async reload(): Promise<void> {
    const gen = ++this.generation;
    const groups = [...this.groups];
    const member = this.member;
    this.loading = true;
    this.singleEvents = [];
    this.mergedEvents = [];

    if (groups.length === 0 && !member) {
      this.loading = false;
      return;
    }

    const results = await this.ngZone.runOutsideAngular(() =>
      Promise.allSettled([
        ...groups.map(g =>
          this.calendarService.getUpcomingGroupEvents(g).then(events => ({ group: g as Group | null, events })),
        ),
        ...(member
          ? [this.calendarService.getUpcomingMemberEvents(member).then(events => ({ group: null as null, events }))]
          : []),
      ]),
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

      // Single mode: 1 group, no member — show without group name label
      if (groups.length === 1 && !member) {
        this.singleEvents = allEvents;
      } else {
        this.mergedEvents = allEvents;
      }

      this.loading = false;
      this.cdr.markForCheck();
    });
  }
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
ng test --include='**/group-events.component.spec.ts' --watch=false
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/shared/group-events/group-events.component.ts src/app/shared/group-events/group-events.component.spec.ts
git commit -m "feat(group-events): add member input and merge individual events"
```

---

### Task 4: Update member page template to pass `member` to `GroupEventsComponent`

**Files:**
- Modify: `src/app/pages/member-page/member-page.component.html` (line ~574–575)

- [ ] **Step 1: Update the template guard and pass `member` input**

In `member-page.component.html`, find:
```html
      @if (activeGroups.length > 0) {
        <app-group-events [groups]="activeGroups" />
```

Replace with:
```html
      @if (activeGroups.length > 0 || member) {
        <app-group-events [groups]="activeGroups" [member]="member" />
```

The widened guard (`|| member`) ensures the component renders even when a member has no active groups but may have individual events. `member` is always non-null on this page after data loads, so this effectively always renders on member pages.

- [ ] **Step 2: Run the full test suite**

```bash
ng test --watch=false
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/member-page/member-page.component.html
git commit -m "feat(member-page): pass member to group-events for individual event matching"
```
