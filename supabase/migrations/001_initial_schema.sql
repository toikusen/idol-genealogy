-- IMPORTANT: Apply this migration manually in the Supabase Dashboard SQL Editor
-- Copy the entire content below and execute it in: https://supabase.com/dashboard/project/[YOUR_PROJECT_ID]/sql/new

-- Enable moddatetime extension for auto updated_at
create extension if not exists moddatetime schema extensions;

-- Members
create table members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  name_jp     text,
  photo_url   text,
  birthdate   date,
  notes       text,
  updated_at  timestamptz default now(),
  created_at  timestamptz default now()
);

create trigger members_updated_at
  before update on members
  for each row execute procedure extensions.moddatetime(updated_at);

-- Groups
create table groups (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  name_jp       text,
  color         text default '#e879a0',
  founded_at    date,
  disbanded_at  date,
  updated_at    timestamptz default now(),
  created_at    timestamptz default now()
);

create trigger groups_updated_at
  before update on groups
  for each row execute procedure extensions.moddatetime(updated_at);

-- Teams
create table teams (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid references groups(id) on delete restrict,
  name        text not null,
  color       text,
  created_at  timestamptz default now()
);

-- History
create table history (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid references members(id) on delete restrict,
  group_id    uuid references groups(id) on delete restrict,
  team_id     uuid references teams(id) on delete set null,
  role        text,
  status      text check (status in ('active','graduated','transferred','concurrent')),
  joined_at   date not null,
  left_at     date,
  notes       text,
  is_approved boolean default true,
  updated_at  timestamptz default now(),
  created_at  timestamptz default now()
);

create trigger history_updated_at
  before update on history
  for each row execute procedure extensions.moddatetime(updated_at);

-- RLS: enable on all tables
alter table members enable row level security;
alter table groups enable row level security;
alter table teams enable row level security;
alter table history enable row level security;

-- RLS policies: all can read, authenticated can write/delete
create policy "anyone can read members" on members for select using (true);
create policy "auth users can insert members" on members for insert with check (auth.uid() is not null);
create policy "auth users can update members" on members for update using (auth.uid() is not null);
create policy "auth users can delete members" on members for delete using (auth.uid() is not null);

create policy "anyone can read groups" on groups for select using (true);
create policy "auth users can insert groups" on groups for insert with check (auth.uid() is not null);
create policy "auth users can update groups" on groups for update using (auth.uid() is not null);
create policy "auth users can delete groups" on groups for delete using (auth.uid() is not null);

create policy "anyone can read teams" on teams for select using (true);
create policy "auth users can insert teams" on teams for insert with check (auth.uid() is not null);
create policy "auth users can update teams" on teams for update using (auth.uid() is not null);
create policy "auth users can delete teams" on teams for delete using (auth.uid() is not null);

create policy "anyone can read history" on history for select using (true);
create policy "auth users can insert history" on history for insert with check (auth.uid() is not null);
create policy "auth users can update history" on history for update using (auth.uid() is not null);
create policy "auth users can delete history" on history for delete using (auth.uid() is not null);
