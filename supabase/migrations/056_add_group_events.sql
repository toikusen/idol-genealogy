-- Migration 056: Add group_events cache table for external calendar sync

create table if not exists group_events (
  id               uuid        not null default gen_random_uuid() primary key,
  group_id         uuid        not null references groups(id) on delete cascade,
  source           text        not null,
  source_event_id  text        not null,
  title            text        not null,
  starts_at        timestamptz not null,
  ends_at          timestamptz,
  location         text,
  url              text,
  content_hash     text,
  first_seen_at    timestamptz not null default now(),
  last_seen_at     timestamptz not null default now(),
  notified_at      timestamptz,
  unique (source, source_event_id, group_id)
);

alter table group_events enable row level security;

drop policy if exists "public can read group_events" on group_events;
create policy "public can read group_events"
  on group_events for select
  using (true);

create index if not exists idx_group_events_group_seen
  on group_events (group_id, first_seen_at desc);
