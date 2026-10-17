-- Migration 117: venue floor-plan uploads (anonymous, reviewed before use).
--
-- * Anyone may upload, but only through the venue-plan-upload edge function
--   (service role): it checks Turnstile, the per-IP daily cap, file type by
--   magic bytes and duplicates. There is deliberately no INSERT policy here.
-- * Files live in the private `venue-plans` bucket; nothing is public. Admins
--   review them in /admin/venue-plans through short-lived signed URLs.
-- * Rejected uploads are removed after 7 days and unreviewed ones after 30
--   (the edge function sweeps them after each upload).

create table if not exists venue_plans (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null references venues(id) on delete cascade,
  storage_path    text not null,
  sha256          text not null unique,
  mime            text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes      integer not null check (size_bytes > 0 and size_bytes <= 15728640),
  known_dimension text check (char_length(known_dimension) <= 200),
  source_url      text check (char_length(source_url) <= 500),
  contact_email   text check (char_length(contact_email) <= 200),
  note            text check (char_length(note) <= 500),
  ip_hash         text,
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reject_reason   text check (char_length(reject_reason) <= 300),
  reviewed_by     text,
  reviewed_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists venue_plans_status_idx on venue_plans (status, created_at);
create index if not exists venue_plans_ip_idx on venue_plans (ip_hash, created_at);

alter table venue_plans enable row level security;

do $$ begin
  create policy "admins read venue plans" on venue_plans
    for select using (
      exists (select 1 from user_roles where email = auth.email() and role in ('admin', 'superadmin'))
    );
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "admins review venue plans" on venue_plans
    for update using (
      exists (select 1 from user_roles where email = auth.email() and role in ('admin', 'superadmin'))
    ) with check (
      exists (select 1 from user_roles where email = auth.email() and role in ('admin', 'superadmin'))
    );
exception when duplicate_object then null; end $$;

-- Private bucket: raster images and PDF only, 15 MB. Only admins can read
-- (signed URLs); nobody but the service role can write.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('venue-plans', 'venue-plans', false, 15728640,
            array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
    on conflict (id) do update
      set public = false,
          file_size_limit = excluded.file_size_limit,
          allowed_mime_types = excluded.allowed_mime_types;
  end if;

  if to_regclass('storage.objects') is not null then
    drop policy if exists "Admins read venue-plans" on storage.objects;
    create policy "Admins read venue-plans" on storage.objects
      for select using (
        bucket_id = 'venue-plans'
        and exists (select 1 from user_roles where email = auth.email() and role in ('admin', 'superadmin'))
      );
  end if;
end $$;
