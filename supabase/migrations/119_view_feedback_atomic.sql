-- Migration 119: check the view_feedback limits and insert in one transaction.
--
-- The edge function used to count and then insert, so a burst of parallel requests
-- from one address all saw the same counts and all got in. Submissions are rare
-- (capped at 300 a day), so one global advisory lock serialising them costs nothing.
-- Only the service role (the view-feedback edge function) may call this.

create or replace function submit_view_feedback(
  p_venue text, p_category text, p_message text, p_contact text, p_page_state text,
  p_msg_hash text, p_ip_hash text
) returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('view_feedback'));
  if p_ip_hash is not null then
    if (select count(*) from view_feedback where ip_hash = p_ip_hash and created_at > now() - interval '10 minutes') >= 3 then
      return 'burst';
    end if;
    if (select count(*) from view_feedback where ip_hash = p_ip_hash and created_at > now() - interval '1 day') >= 10 then
      return 'daily';
    end if;
  end if;
  if exists (select 1 from view_feedback where msg_hash = p_msg_hash and created_at > now() - interval '7 days') then
    return 'dup';
  end if;
  if (select count(*) from view_feedback where created_at > now() - interval '1 day') >= 300 then
    return 'cap';
  end if;
  insert into view_feedback (venue, category, message, contact, page_state, msg_hash, ip_hash)
  values (p_venue, p_category, p_message, p_contact, p_page_state, p_msg_hash, p_ip_hash);
  return 'ok';
end $$;

revoke all on function submit_view_feedback(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function submit_view_feedback(text, text, text, text, text, text, text) to service_role;
