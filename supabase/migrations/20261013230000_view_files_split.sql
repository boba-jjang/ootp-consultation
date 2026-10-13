-- Migration 0003: view_files.split, the hand of a split export: L for vs left-handed pitchers
-- (a hitters' file) or batters (a pitchers' file), R for vs right. The Clubhouse's vs-left and
-- vs-right windows give it, or else the file name (packages/core routeExport); null for a
-- season file.
--
-- Nullable, so rows stored before this migration stay valid: the app re-reads them by their
-- file name, as before.
alter table public.view_files
  add column split text check (split in ('L', 'R'));
