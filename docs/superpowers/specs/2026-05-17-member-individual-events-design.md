# Design: Member Individual Events on Member Pages

**Date:** 2026-05-17

## Problem

When a member performs at an event individually (e.g., `もも(From Pure Maker)` at a seitan event), the current system:

1. Matches the event to Pure Maker's group via the `(From X)` pattern
2. Shows the event on **all Pure Maker members' pages** (because they all share the same `activeGroups`)
3. Also shows the event on the **Pure Maker group page**

The event is a personal activity — it should only appear on the specific member's page, not on other group members' pages or the group page.

## Desired Behavior

| Context | Show event? |
|---|---|
| もも's member page | ✓ (もも is the named performer) |
| Other Pure Maker member pages | ✗ (they are not performing) |
| Pure Maker group page | ✗ (this is an individual event, not a group event) |
| Wataboshi Mori group page | ✓ (event title matches the host group) |

## Architecture

### 1. Remove `groupMatchesFromPattern` from `matchesGroup`

In `google-calendar.service.ts`, remove the call to `groupMatchesFromPattern` inside `matchesGroup`. This stops the `(From X)` pattern from triggering group-level matches on both group pages and member pages.

The `groupMatchesFromPattern` method is kept for reuse in member matching.

**Impact:** Group pages no longer show events where a member from that group appears as an individual performer.

### 2. Add `matchesMember` and `getUpcomingMemberEvents`

New method `matchesMember(event, member)` with three layers (OR logic):

**Layer 1 — `name(From group)` extraction** (handles short names like `もも`)
- Regex: extract performer name from `name(From Group)` / `name（From Group）` format
- Exact comparison against member's name / name_hiragana / name_roman / nickname
- Safe for short names because extraction is structural, not substring search

**Layer 2 — Performer keyword scan** (handles longer names)
- Reuses existing `groupNameNearPerformerKeyword` with member names as input
- Names under 3 CJK/kana chars are skipped by existing length thresholds

**Layer 3 — Title/location direct match** (handles distinctive longer names)
- Reuses existing `groupNameInPhrase` for title and location fields
- Same length thresholds as group matching

New method `getUpcomingMemberEvents(member, daysAhead = 90)`:
- Same caching pattern as `getUpcomingGroupEvents`
- Cache key: `member:{id}:{daysAhead}`
- Filters raw events through `matchesMember`

### 3. Update `GroupEventsComponent`

Add optional input:

```typescript
@Input() member: Member | null = null;
```

When `member` is provided, `reload()`:
1. Fetches group events as usual (now excluding "From X" matches automatically)
2. Additionally fetches `getUpcomingMemberEvents(member)`
3. Merges both result sets, deduplicates by event ID, sorts by start date

When `member` is null (group page usage), behavior is unchanged.

### 4. Update Member Page Template

```html
<app-group-events [groups]="activeGroups" [member]="member" />
```

Group pages do not pass `member`, no change required there.

## Files to Change

| File | Change |
|---|---|
| `src/app/core/google-calendar.service.ts` | Remove `groupMatchesFromPattern` from `matchesGroup`; add `matchesMember`, `getUpcomingMemberEvents` |
| `src/app/shared/group-events/group-events.component.ts` | Add `@Input() member`; merge group + member events in `reload()` |
| `src/app/pages/member-page/member-page.component.html` | Pass `[member]="member"` to `<app-group-events>` |
| `src/app/shared/group-events/group-events.component.spec.ts` | Update tests for new `member` input and merge logic |

## Edge Cases

- **Member with no active groups:** Member events still fetched via `getUpcomingMemberEvents`; group events list is empty.
- **Duplicate events:** An event matching both a group and a member (e.g., a group concert that also mentions the member by name) is deduped by event ID.
- **Short member names (< 3 chars):** Only matched via Layer 1 (`name(From group)` extraction). Not matched by performer keyword scan or direct title search to avoid false positives.
- **Members with roman/hiragana aliases:** All four name fields checked in `matchesMember`.
