-- Migration 057: Add push_subscriptions table for Web Push API

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
