-- Allow 'support' as a history status value
alter table history
  drop constraint if exists history_status_check;

alter table history
  add constraint history_status_check
  check (status in ('active','graduated','transferred','concurrent','support'));
