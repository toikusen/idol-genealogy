-- Migration 114: 顏控9選 — personal history for signed-in players.
--
-- A signed-in player's finished TOP 9s are kept so 我的最愛 can show their
-- history and the faces they pick most. This is deliberately separate from
-- sukigao_submissions: the public ranking stays anonymous and nothing links a
-- ranking vote to an account.
--
-- * One row per game (user_id, session_id): undoing and finishing the same
--   game again replaces its row instead of adding another.
-- * Each account keeps its latest 100 games.
-- * Rows are private: a player can read and delete their own, nothing else.
--   Writes go through save_my_sukigao_result(), which validates the members.

create table if not exists public.sukigao_user_results (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users on delete cascade,
  -- The game's client-side session id (a UUID).
  session_id        text not null,
  -- Best → worst, exactly 9 distinct members.
  member_ids        uuid[] not null,
  candidate_version text,
  played_at         timestamptz not null default now(),
  constraint sukigao_user_results_session_key unique (user_id, session_id),
  constraint sukigao_user_results_nine check (cardinality(member_ids) = 9)
);

create index if not exists idx_sukigao_user_results_user_played
  on public.sukigao_user_results (user_id, played_at desc);

alter table public.sukigao_user_results enable row level security;

drop policy if exists "users read own sukigao results" on public.sukigao_user_results;
create policy "users read own sukigao results"
  on public.sukigao_user_results for select
  using (auth.uid() = user_id);

drop policy if exists "users delete own sukigao results" on public.sukigao_user_results;
create policy "users delete own sukigao results"
  on public.sukigao_user_results for delete
  using (auth.uid() = user_id);

revoke all on table public.sukigao_user_results from anon, authenticated;
grant select, delete on table public.sukigao_user_results to authenticated;

create or replace function public.save_my_sukigao_result(
  p_session_id        text,
  p_member_ids        uuid[],
  p_candidate_version text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'save_my_sukigao_result: sign in required'
      using errcode = '42501';
  end if;

  if p_session_id is null
     or p_session_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    raise exception 'save_my_sukigao_result: invalid session id'
      using errcode = '22023';
  end if;

  if p_member_ids is null
     or array_ndims(p_member_ids) is distinct from 1
     or cardinality(p_member_ids) <> 9
     or array_position(p_member_ids, null) is not null
     or (select count(distinct m) from unnest(p_member_ids) as t(m)) <> 9 then
    raise exception 'save_my_sukigao_result: exactly 9 distinct members required'
      using errcode = '22023';
  end if;

  if (select count(*) from members where id = any(p_member_ids)) <> 9 then
    raise exception 'save_my_sukigao_result: unknown member id'
      using errcode = '22023';
  end if;

  -- clock_timestamp(), not now(): saves in one transaction still get an order.
  insert into sukigao_user_results (user_id, session_id, member_ids, candidate_version, played_at)
  values (v_user, lower(p_session_id), p_member_ids, left(p_candidate_version, 80), clock_timestamp())
  on conflict (user_id, session_id)
  do update set member_ids        = excluded.member_ids,
                candidate_version = excluded.candidate_version,
                played_at         = excluded.played_at
  returning id into v_id;

  -- Keep the latest 100 games per account.
  delete from sukigao_user_results
   where user_id = v_user
     and id in (
       select r.id from sukigao_user_results r
        where r.user_id = v_user
        order by r.played_at desc
        offset 100
     );

  return jsonb_build_object('id', v_id);
end;
$$;

revoke all on function public.save_my_sukigao_result(text, uuid[], text) from public, anon, authenticated;
grant execute on function public.save_my_sukigao_result(text, uuid[], text) to authenticated;
