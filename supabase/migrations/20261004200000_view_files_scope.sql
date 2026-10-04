-- Migration 0002: view_files.scope, whether a file is the team's own screen view or the
-- league's sortable stats, as the importer reports it (packages/core routeExport).
--
-- Nullable, so rows stored before this migration stay valid; the app re-reads raw files with
-- the current importer anyway.
alter table public.view_files
  add column scope text check (scope in ('team', 'league'));
