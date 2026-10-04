-- Structural guarantees for every table in the public schema, including ones that later
-- migrations add: row-level security, the owner-only policy, privileges and indexes.
begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

create temporary table app_tables on commit drop as
select c.oid, c.relname
from pg_class c
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r';

select set_eq(
  $$ select relname::text from app_tables $$,
  array['teams', 'snapshots', 'view_files', 'import_events', 'advisor_messages'],
  'public has exactly the five tables from migration 0001'
);

select is_empty(
  $$ select t.relname from app_tables t join pg_class c on c.oid = t.oid
     where not c.relrowsecurity $$,
  'every public table has row-level security enabled'
);

select is_empty(
  $$ select t.relname from app_tables t
     where (select count(*) from information_schema.columns col
            where col.table_schema = 'public' and col.table_name = t.relname
              and col.column_name in ('id', 'owner_id', 'created_at')) <> 3 $$,
  'every public table has id, owner_id and created_at'
);

select is_empty(
  $$ select t.relname from app_tables t
     join pg_attribute a on a.attrelid = t.oid and a.attname = 'owner_id'
     left join pg_attrdef d on d.adrelid = t.oid and d.adnum = a.attnum
     where not a.attnotnull or pg_get_expr(d.adbin, d.adrelid) is distinct from 'auth.uid()' $$,
  'owner_id is required and defaults to the caller everywhere'
);

select is_empty(
  $$ select t.relname from app_tables t
     where not exists (
       select 1 from pg_constraint fk
       where fk.conrelid = t.oid and fk.contype = 'f'
         and fk.confrelid = 'auth.users'::regclass and fk.confdeltype = 'c') $$,
  'owner_id references auth.users and cascades when the user is deleted'
);

select is_empty(
  $$ select t.relname, p.policyname from app_tables t
     join pg_policies p on p.schemaname = 'public' and p.tablename = t.relname
     where p.cmd <> 'ALL' or p.roles <> '{authenticated}'
        or p.qual <> '(owner_id = ( SELECT auth.uid() AS uid))'
        or p.with_check <> '(owner_id = ( SELECT auth.uid() AS uid))' $$,
  'every policy is the owner-only shape for signed-in users'
);

select is_empty(
  $$ select t.relname from app_tables t
     where (select count(*) from pg_policies p
            where p.schemaname = 'public' and p.tablename = t.relname) <> 1 $$,
  'every public table has exactly one policy'
);

select is_empty(
  $$ select t.relname, privilege_type from app_tables t
     join information_schema.role_table_grants g
       on g.table_schema = 'public' and g.table_name = t.relname
     where g.grantee = 'anon' $$,
  'anonymous callers have no privileges on any public table'
);

select is_empty(
  $$ select t.relname, g.privilege_type from app_tables t
     join information_schema.role_table_grants g
       on g.table_schema = 'public' and g.table_name = t.relname
     where g.grantee = 'authenticated'
       and g.privilege_type not in ('SELECT', 'INSERT', 'UPDATE', 'DELETE') $$,
  'signed-in users get no privilege beyond select, insert, update and delete (no truncate)'
);

select is_empty(
  $$ select t.relname from app_tables t
     where (select count(distinct g.privilege_type) from information_schema.role_table_grants g
            where g.table_schema = 'public' and g.table_name = t.relname
              and g.grantee = 'authenticated') <> 4 $$,
  'signed-in users can select, insert, update and delete on every public table'
);

-- An index covers a foreign key when its leading columns are the key's columns.
select is_empty(
  $$ select fk.conrelid::regclass::text, fk.conname
     from pg_constraint fk join app_tables t on t.oid = fk.conrelid
     where fk.contype = 'f'
       and not exists (
         select 1 from pg_index i
         where i.indrelid = fk.conrelid
           and (i.indkey::int2[])[0:cardinality(fk.conkey) - 1] = fk.conkey) $$,
  'every foreign key is covered by an index'
);

select is_empty(
  $$ select t.relname from app_tables t
     where not exists (
       select 1 from pg_index i
       join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
       where i.indrelid = t.oid and a.attname = 'owner_id' and i.indnkeyatts = 1) $$,
  'every public table has an index on owner_id'
);

select * from finish();
rollback;
