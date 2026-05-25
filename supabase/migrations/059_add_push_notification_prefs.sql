-- Migration 059: Add push_notification_prefs table for per-type notification preferences

create table if not exists push_notification_prefs (
  user_id          uuid        not null primary key references auth.users on delete cascade,
  notify_event     boolean     not null default true,
  notify_new_song  boolean     not null default true,
  notify_status    boolean     not null default true,
  notify_birthday  boolean     not null default true,
  notify_disbanded boolean     not null default true,
  updated_at       timestamptz not null default now()
);

alter table push_notification_prefs enable row level security;

-- for all covers SELECT + INSERT + UPDATE needed by frontend upsert
create policy "users can manage own notification prefs"
  on push_notification_prefs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
