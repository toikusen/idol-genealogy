# Touch member updated_at on related table changes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a row in `history` or `member_songs` is inserted, updated, or deleted, automatically bump `members.updated_at` so the member surfaces in the homepage "recent updates" section.

**Architecture:** One PostgreSQL function `touch_member_updated_at()` + two AFTER triggers (one on `history`, one on `member_songs`). All logic lives in the database; no app code changes required.

**Tech Stack:** PostgreSQL (via Supabase migration), PL/pgSQL

---

### Task 1: Write and apply the migration

**Files:**
- Create: `supabase/migrations/051_touch_member_on_related_changes.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/migrations/051_touch_member_on_related_changes.sql` with the following content:

```sql
-- Bump members.updated_at whenever a related row (history, member_songs) changes,
-- so the member appears in the homepage "recent updates" section.
create or replace function touch_member_updated_at()
returns trigger language plpgsql as $$
begin
  update members
    set updated_at = now()
  where id = coalesce(NEW.member_id, OLD.member_id);
  return null;
end;
$$;

create trigger history_touch_member
  after insert or update or delete on history
  for each row execute function touch_member_updated_at();

create trigger member_songs_touch_member
  after insert or update or delete on member_songs
  for each row execute function touch_member_updated_at();
```

- [ ] **Step 2: Apply the migration in Supabase Dashboard**

Open the Supabase SQL Editor for this project and run the file contents.

Verify by running:
```sql
select trigger_name, event_manipulation, event_object_table
from information_schema.triggers
where trigger_name in ('history_touch_member', 'member_songs_touch_member');
```

Expected output: 2 rows, one for `history` and one for `member_songs`, each with 3 `event_manipulation` entries (INSERT, UPDATE, DELETE).

- [ ] **Step 3: Smoke test the trigger**

In the Supabase SQL Editor, pick a real `member_id` and a real `history` row `id`, then run:

```sql
-- record the current timestamp
select id, updated_at from members where id = '<your-member-id>';

-- touch a history row belonging to that member
update history set notes = notes where member_id = '<your-member-id>' limit 1;

-- verify updated_at bumped
select id, updated_at from members where id = '<your-member-id>';
```

Expected: `updated_at` is now newer than the value recorded in the first query.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/051_touch_member_on_related_changes.sql
git commit -m "feat(db): touch members.updated_at when history or member_songs change"
```
