-- Migration 055: Add user_favorites table for PWA favorites feature

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
