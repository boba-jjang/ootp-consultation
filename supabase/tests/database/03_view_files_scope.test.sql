-- view_files.scope from migration 0002: optional, and team or league when set.
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

select has_column('public', 'view_files', 'scope', 'view_files has a scope column');
select col_type_is('public', 'view_files', 'scope', 'text', 'scope is text');
select col_is_null('public', 'view_files', 'scope', 'scope is optional, so older rows stay valid');
select is(
  (select pg_get_constraintdef(c.oid)
   from pg_constraint c
   join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.conrelid = 'public.view_files'::regclass and c.contype = 'c' and a.attname = 'scope'),
  $$CHECK ((scope = ANY (ARRAY['team'::text, 'league'::text])))$$,
  'scope is team or league'
);

select * from finish();
rollback;
