# Spec: Touch member updated_at on related table changes

## Problem

The homepage "recent updates" section queries `members.updated_at` descending. Changes to related tables (`history`, `member_songs`) do not update `members.updated_at`, so those edits never appear in recent updates.

## Goal

When a row in `history` or `member_songs` is inserted, updated, or deleted, automatically bump `members.updated_at` for the affected member.

## Approach

Database trigger (no app code changes required). This is consistent with existing patterns in the codebase (`members_updated_at`, `history_updated_at`, `venues_audit` triggers).

## Implementation

One new migration file: `supabase/migrations/051_touch_member_on_related_changes.sql`

### Shared function

```sql
create or replace function touch_member_updated_at()
returns trigger language plpgsql as $$
begin
  update members
    set updated_at = now()
  where id = coalesce(NEW.member_id, OLD.member_id);
  return null;
end;
$$;
```

- Uses `coalesce(NEW.member_id, OLD.member_id)` to handle DELETE (where NEW is null)
- Returns `null` because it is an AFTER trigger (return value is ignored)

### Triggers

```sql
create trigger history_touch_member
  after insert or update or delete on history
  for each row execute function touch_member_updated_at();

create trigger member_songs_touch_member
  after insert or update or delete on member_songs
  for each row execute function touch_member_updated_at();
```

## Scope

- **In scope:** `history`, `member_songs`
- **Out of scope:** `groups`, `teams`, `companies` — these do not have `member_id` and are not member-specific edits

## No app code changes

`MemberService`, `HistoryService`, `MemberSongService`, admin components — all untouched.
