-- Migration 118: feedback from the 別擋我推 (/view) page — wrong venue details, ideas, bugs.
--
-- * Anyone may send, but only through the view-feedback edge function (service role):
--   it checks the honeypot, Turnstile (once TURNSTILE_SECRET is set), content rules,
--   per-IP caps, duplicates and a daily ceiling. There is deliberately no INSERT policy.
-- * Only admins read and triage it.

create table if not exists view_feedback (
  id          uuid primary key default gen_random_uuid(),
  venue       text not null check (char_length(venue) <= 40),
  category    text not null check (category in ('venue', 'idea', 'bug', 'other')),
  message     text not null check (char_length(message) between 5 and 500),
  contact     text check (char_length(contact) <= 100),
  page_state  text check (char_length(page_state) <= 600),
  msg_hash    text not null,
  ip_hash     text,
  status      text not null default 'new' check (status in ('new', 'done')),
  created_at  timestamptz not null default now()
);
create index if not exists view_feedback_created_idx on view_feedback (created_at);
create index if not exists view_feedback_ip_idx on view_feedback (ip_hash, created_at);
create index if not exists view_feedback_hash_idx on view_feedback (msg_hash, created_at);

alter table view_feedback enable row level security;

do $$ begin
  create policy "admins read view feedback" on view_feedback
    for select using (
      exists (select 1 from user_roles where email = auth.email() and role in ('admin', 'superadmin'))
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admins triage view feedback" on view_feedback
    for update using (
      exists (select 1 from user_roles where email = auth.email() and role in ('admin', 'superadmin'))
    ) with check (
      exists (select 1 from user_roles where email = auth.email() and role in ('admin', 'superadmin'))
    );
exception when duplicate_object then null; end $$;
