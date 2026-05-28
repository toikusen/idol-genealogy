-- Allow venues as a proposal target table
alter table proposals drop constraint proposals_table_name_check;
alter table proposals add constraint proposals_table_name_check
  check (table_name in ('members', 'groups', 'history', 'companies', 'venues'));
