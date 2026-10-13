-- view_files.split from migration 0003: optional, and L or R when set.
begin;
create extension if not exists pgtap with schema extensions;

select plan(4);

select has_column('public', 'view_files', 'split', 'view_files has a split column');
select col_type_is('public', 'view_files', 'split', 'text', 'split is text');
select col_is_null(
  'public', 'view_files', 'split',
  'split is optional, so season files and older rows stay valid'
);
select is(
  (select pg_get_constraintdef(c.oid)
   from pg_constraint c
   join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.conrelid = 'public.view_files'::regclass and c.contype = 'c' and a.attname = 'split'),
  $$CHECK ((split = ANY (ARRAY['L'::text, 'R'::text])))$$,
  'split is L or R'
);

select * from finish();
rollback;
