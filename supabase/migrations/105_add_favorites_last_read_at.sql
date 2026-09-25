-- Migration 105: Track per-favorite read state server-side.
-- The "new activity" badge used to live in localStorage, so a feed read on the phone
-- left the desktop badge lit. Existing rows default to now() on purpose: nobody should
-- come back to a burst of "new" items that they had already read before this migration.

alter table user_favorites
  add column if not exists last_read_at timestamptz not null default now();

-- Marking a favorite read is the first write path that is not insert/delete.
drop policy if exists "users can update own favorites" on user_favorites;
create policy "users can update own favorites"
  on user_favorites for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
