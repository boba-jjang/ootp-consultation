-- Migration 0001: the five tables from docs/implementation-plan.md, "Database and auth".
--
-- Raw export files are the source of truth. Postgres stores each file verbatim with its
-- import log, and the browser derives everything else, so no derived table lives here.
--
-- Every table has id, owner_id and created_at. owner_id defaults to the caller, and
-- row-level security limits every row to its owner. Child tables reference their parent by
-- (id, owner_id), so a row can only point at a parent row with the same owner.

-- Teams: the Team setup fields from the design handoff.
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  name text not null check (btrim(name) <> ''),
  league text not null check (btrim(league) <> ''),
  -- The scale the league displays ratings on; ratings are stored on 20-80 after import.
  rating_scale text not null check (btrim(rating_scale) <> ''),
  league_shows text not null check (league_shows in ('potentials_only', 'current_and_potential')),
  dh_enabled boolean not null,
  games_per_season smallint not null check (games_per_season > 0),
  dev_lab_slots smallint not null check (dev_lab_slots between 1 and 30),
  unique (id, owner_id)
);

-- Snapshots: one per upload day. game_number is the most games played by any hitter.
create table public.snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  team_id uuid not null,
  label text not null check (btrim(label) <> ''),
  game_number integer not null check (game_number >= 0),
  unique (id, owner_id),
  foreign key (team_id, owner_id) references public.teams (id, owner_id) on delete cascade
);

-- View files: each uploaded CSV kept verbatim, with how the importer routed it.
-- Unique on snapshot plus hash, so uploading the same file twice dedupes.
create table public.view_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  snapshot_id uuid not null,
  original_filename text not null check (btrim(original_filename) <> ''),
  -- Null when the importer couldn't recognize the view (the file is then rejected).
  detected_view text,
  -- Which players the view lists, as the importer reports it.
  side text,
  routing text not null check (routing in ('primary', 'supplemental', 'rejected')),
  content text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  importer_version text not null check (btrim(importer_version) <> ''),
  unique (id, owner_id),
  unique (snapshot_id, sha256),
  foreign key (snapshot_id, owner_id) references public.snapshots (id, owner_id) on delete cascade
);

-- Import events: the import log (routing, players matched, header mappings, rejections).
create table public.import_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  view_file_id uuid not null,
  level text not null check (level in ('info', 'warning', 'error')),
  code text not null check (btrim(code) <> ''),
  message text not null,
  details jsonb not null default '{}'::jsonb,
  foreign key (view_file_id, owner_id) references public.view_files (id, owner_id) on delete cascade
);

-- Advisor messages (Phase 5). Rows also count calls toward the daily cap.
create table public.advisor_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  snapshot_id uuid not null,
  question text not null,
  answer text not null,
  citations jsonb not null default '[]'::jsonb,
  model text not null,
  foreign key (snapshot_id, owner_id) references public.snapshots (id, owner_id) on delete cascade
);

-- An index on every foreign key and on owner_id. Composite foreign keys are covered by an
-- index with the same leading columns.
create index teams_owner_id_idx on public.teams (owner_id);
create index snapshots_owner_id_idx on public.snapshots (owner_id);
create index snapshots_team_id_owner_id_idx on public.snapshots (team_id, owner_id);
create index view_files_owner_id_idx on public.view_files (owner_id);
create index view_files_snapshot_id_owner_id_idx on public.view_files (snapshot_id, owner_id);
create index import_events_owner_id_idx on public.import_events (owner_id);
create index import_events_view_file_id_owner_id_idx on public.import_events (view_file_id, owner_id);
create index advisor_messages_owner_id_idx on public.advisor_messages (owner_id);
create index advisor_messages_snapshot_id_owner_id_idx on public.advisor_messages (snapshot_id, owner_id);

-- Access: signed-in users only, and only their own rows. Supabase's default privileges grant
-- everything (truncate included, which row-level security doesn't cover) to anon and
-- authenticated, so replace them with exactly what the app needs.
revoke all on public.teams, public.snapshots, public.view_files, public.import_events,
  public.advisor_messages from anon, authenticated;
grant select, insert, update, delete on public.teams, public.snapshots, public.view_files,
  public.import_events, public.advisor_messages to authenticated;

alter table public.teams enable row level security;
alter table public.snapshots enable row level security;
alter table public.view_files enable row level security;
alter table public.import_events enable row level security;
alter table public.advisor_messages enable row level security;

-- One policy shape for every table. `(select auth.uid())` is evaluated once per query
-- rather than once per row.
create policy teams_owner on public.teams for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy snapshots_owner on public.snapshots for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy view_files_owner on public.view_files for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy import_events_owner on public.import_events for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy advisor_messages_owner on public.advisor_messages for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
