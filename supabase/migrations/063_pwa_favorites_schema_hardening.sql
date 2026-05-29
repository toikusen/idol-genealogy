-- Migration 063: Harden PWA favorites/push schema.
-- Keep this migration idempotent so existing production tables are preserved
-- while fresh environments can be rebuilt from migrations.

create table if not exists user_favorites (
  user_id      uuid not null references auth.users on delete cascade,
  entity_type  text not null check (entity_type in ('group', 'member')),
  entity_id    uuid not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, entity_type, entity_id)
);

alter table user_favorites enable row level security;

drop policy if exists "users can read own favorites" on user_favorites;
create policy "users can read own favorites"
  on user_favorites for select
  using (auth.uid() = user_id);

drop policy if exists "users can insert own favorites" on user_favorites;
create policy "users can insert own favorites"
  on user_favorites for insert
  with check (auth.uid() = user_id);

drop policy if exists "users can delete own favorites" on user_favorites;
create policy "users can delete own favorites"
  on user_favorites for delete
  using (auth.uid() = user_id);

create index if not exists idx_user_favorites_entity
  on user_favorites (entity_type, entity_id);

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
  notify_claimed_at timestamptz,
  unique (source, source_event_id, group_id)
);

alter table group_events
  add column if not exists notified_at timestamptz;

alter table group_events
  add column if not exists notify_claimed_at timestamptz;

alter table group_events enable row level security;

drop policy if exists "public can read group_events" on group_events;
create policy "public can read group_events"
  on group_events for select
  using (true);

create index if not exists idx_group_events_group_seen
  on group_events (group_id, first_seen_at desc);

create index if not exists idx_group_events_pending_push
  on group_events (notified_at, notify_claimed_at, starts_at);

create table if not exists push_subscriptions (
  id          uuid        not null default gen_random_uuid() primary key,
  user_id     uuid        not null references auth.users on delete cascade,
  endpoint    text        not null,
  p256dh      text        not null,
  auth_key    text        not null,
  created_at  timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table push_subscriptions enable row level security;

drop policy if exists "users can manage own subscriptions" on push_subscriptions;
create policy "users can manage own subscriptions"
  on push_subscriptions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_push_subscriptions_user
  on push_subscriptions (user_id);

create table if not exists birthday_push_notifications (
  user_id      uuid not null references auth.users on delete cascade,
  member_id    uuid not null references members(id) on delete cascade,
  birthday_on  date not null,
  claimed_at   timestamptz not null default now(),
  delivered_at timestamptz,
  primary key (user_id, member_id, birthday_on)
);

alter table birthday_push_notifications enable row level security;

-- No client access is needed; scheduled edge functions use the service role.
drop policy if exists "users can read own birthday push log" on birthday_push_notifications;
create policy "users can read own birthday push log"
  on birthday_push_notifications for select
  using (auth.uid() = user_id);
