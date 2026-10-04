-- Owner-only access on every table: the owner can read and write their rows, while a second
-- signed-in user and an anonymous caller see nothing and can change nothing.
begin;
create extension if not exists pgtap with schema extensions;

select plan(54);

-- Two users. Signing in is simulated the way PostgREST does it: the role plus JWT claims.
insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'owner@example.test'),
  ('b0000000-0000-4000-8000-000000000002', 'other@example.test');

-- ---------------------------------------------------------------------------------------
-- The owner writes one row in each table, relying on the owner_id default.
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated"}';

select lives_ok(
  $$ insert into public.teams
       (id, name, league, rating_scale, league_shows, dh_enabled, games_per_season, dev_lab_slots)
     values ('a1000000-0000-4000-8000-000000000001', 'Seattle Arrows', 'ABL', '1-10',
             'potentials_only', true, 162, 4) $$,
  'owner can insert a team'
);
select lives_ok(
  $$ insert into public.snapshots (id, team_id, label, game_number)
     values ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
             'Game 42', 42) $$,
  'owner can insert a snapshot of their team'
);
select lives_ok(
  $$ insert into public.view_files
       (id, snapshot_id, original_filename, detected_view, side, routing, content, sha256,
        importer_version)
     values ('a3000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
             'seattle_arrows_lineups_-_overview_default.csv', 'default', 'hitters', 'primary',
             E'POS,#,Name\r\nC,35,Test\r\n',
             encode(sha256(convert_to(E'POS,#,Name\r\nC,35,Test\r\n', 'UTF8')), 'hex'), '0.0.0') $$,
  'owner can insert a view file into their snapshot'
);
select lives_ok(
  $$ insert into public.import_events (id, view_file_id, level, code, message, details)
     values ('a4000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001',
             'info', 'routed', 'Routed as primary', '{"players_matched": 1}') $$,
  'owner can insert an import event for their view file'
);
select lives_ok(
  $$ insert into public.advisor_messages (id, snapshot_id, question, answer, citations, model)
     values ('a5000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
             'Who leads off?', 'Test answer', '[]', 'test-model') $$,
  'owner can insert an advisor message for their snapshot'
);

select is(
  (select owner_id from public.teams where id = 'a1000000-0000-4000-8000-000000000001'),
  'a0000000-0000-4000-8000-000000000001'::uuid,
  'owner_id defaults to the caller'
);

select results_eq(
  $$ select (select count(*) from public.teams), (select count(*) from public.snapshots),
            (select count(*) from public.view_files), (select count(*) from public.import_events),
            (select count(*) from public.advisor_messages) $$,
  $$ values (1::bigint, 1::bigint, 1::bigint, 1::bigint, 1::bigint) $$,
  'owner reads their row in every table'
);

select results_eq(
  $$ with u as (update public.teams set name = 'Seattle' returning 1) select count(*) from u $$,
  $$ values (1::bigint) $$, 'owner can update their team'
);
select results_eq(
  $$ with u as (update public.snapshots set label = 'Game 43', game_number = 43 returning 1)
     select count(*) from u $$,
  $$ values (1::bigint) $$, 'owner can update their snapshot'
);
select results_eq(
  $$ with u as (update public.view_files set routing = 'supplemental' returning 1)
     select count(*) from u $$,
  $$ values (1::bigint) $$, 'owner can update their view file'
);
select results_eq(
  $$ with u as (update public.import_events set level = 'warning' returning 1)
     select count(*) from u $$,
  $$ values (1::bigint) $$, 'owner can update their import event'
);
select results_eq(
  $$ with u as (update public.advisor_messages set answer = 'Updated' returning 1)
     select count(*) from u $$,
  $$ values (1::bigint) $$, 'owner can update their advisor message'
);

-- ---------------------------------------------------------------------------------------
-- A second signed-in user sees none of it and can't change it.
set local request.jwt.claims to '{"sub": "b0000000-0000-4000-8000-000000000002", "role": "authenticated"}';

select is_empty($$ select 1 from public.teams $$, 'another user sees no teams');
select is_empty($$ select 1 from public.snapshots $$, 'another user sees no snapshots');
select is_empty($$ select 1 from public.view_files $$, 'another user sees no view files');
select is_empty($$ select 1 from public.import_events $$, 'another user sees no import events');
select is_empty($$ select 1 from public.advisor_messages $$, 'another user sees no advisor messages');

select results_eq(
  $$ with u as (update public.teams set name = 'Taken' returning 1) select count(*) from u $$,
  $$ values (0::bigint) $$, 'another user updates no teams'
);
select results_eq(
  $$ with u as (update public.snapshots set label = 'Taken' returning 1) select count(*) from u $$,
  $$ values (0::bigint) $$, 'another user updates no snapshots'
);
select results_eq(
  $$ with u as (update public.view_files set content = 'Taken' returning 1) select count(*) from u $$,
  $$ values (0::bigint) $$, 'another user updates no view files'
);
select results_eq(
  $$ with u as (update public.import_events set message = 'Taken' returning 1) select count(*) from u $$,
  $$ values (0::bigint) $$, 'another user updates no import events'
);
select results_eq(
  $$ with u as (update public.advisor_messages set answer = 'Taken' returning 1) select count(*) from u $$,
  $$ values (0::bigint) $$, 'another user updates no advisor messages'
);

select results_eq(
  $$ with d as (delete from public.teams returning 1) select count(*) from d $$,
  $$ values (0::bigint) $$, 'another user deletes no teams'
);
select results_eq(
  $$ with d as (delete from public.snapshots returning 1) select count(*) from d $$,
  $$ values (0::bigint) $$, 'another user deletes no snapshots'
);
select results_eq(
  $$ with d as (delete from public.view_files returning 1) select count(*) from d $$,
  $$ values (0::bigint) $$, 'another user deletes no view files'
);
select results_eq(
  $$ with d as (delete from public.import_events returning 1) select count(*) from d $$,
  $$ values (0::bigint) $$, 'another user deletes no import events'
);
select results_eq(
  $$ with d as (delete from public.advisor_messages returning 1) select count(*) from d $$,
  $$ values (0::bigint) $$, 'another user deletes no advisor messages'
);

-- Writing rows in the owner's name fails the policy check.
select throws_ok(
  $$ insert into public.teams
       (owner_id, name, league, rating_scale, league_shows, dh_enabled, games_per_season, dev_lab_slots)
     values ('a0000000-0000-4000-8000-000000000001', 'Planted', 'ABL', '1-10', 'potentials_only',
             true, 162, 4) $$,
  '42501', null, 'another user cannot insert a team owned by the owner'
);
select throws_ok(
  $$ insert into public.snapshots (owner_id, team_id, label, game_number)
     values ('a0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
             'Planted', 1) $$,
  '42501', null, 'another user cannot insert a snapshot owned by the owner'
);
select throws_ok(
  $$ insert into public.view_files
       (owner_id, snapshot_id, original_filename, routing, content, sha256, importer_version)
     values ('a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
             'planted.csv', 'rejected', 'x', repeat('0', 64), '0.0.0') $$,
  '42501', null, 'another user cannot insert a view file owned by the owner'
);
select throws_ok(
  $$ insert into public.import_events (owner_id, view_file_id, level, code, message)
     values ('a0000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001',
             'error', 'planted', 'Planted') $$,
  '42501', null, 'another user cannot insert an import event owned by the owner'
);
select throws_ok(
  $$ insert into public.advisor_messages (owner_id, snapshot_id, question, answer, model)
     values ('a0000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
             'Planted?', 'Planted', 'test-model') $$,
  '42501', null, 'another user cannot insert an advisor message owned by the owner'
);

-- Rows of their own can't hang off the owner's rows either: the composite foreign keys
-- require the parent to have the same owner.
select throws_ok(
  $$ insert into public.snapshots (team_id, label, game_number)
     values ('a1000000-0000-4000-8000-000000000001', 'Attached', 1) $$,
  '23503', null, 'another user cannot attach a snapshot to the owner''s team'
);
select throws_ok(
  $$ insert into public.view_files
       (snapshot_id, original_filename, routing, content, sha256, importer_version)
     values ('a2000000-0000-4000-8000-000000000001', 'attached.csv', 'rejected', 'x',
             repeat('0', 64), '0.0.0') $$,
  '23503', null, 'another user cannot attach a view file to the owner''s snapshot'
);
select throws_ok(
  $$ insert into public.import_events (view_file_id, level, code, message)
     values ('a3000000-0000-4000-8000-000000000001', 'error', 'attached', 'Attached') $$,
  '23503', null, 'another user cannot attach an import event to the owner''s view file'
);
select throws_ok(
  $$ insert into public.advisor_messages (snapshot_id, question, answer, model)
     values ('a2000000-0000-4000-8000-000000000001', 'Attached?', 'Attached', 'test-model') $$,
  '23503', null, 'another user cannot attach an advisor message to the owner''s snapshot'
);

-- Their own team works, but they can't hand it to the owner.
select lives_ok(
  $$ insert into public.teams
       (id, name, league, rating_scale, league_shows, dh_enabled, games_per_season, dev_lab_slots)
     values ('b1000000-0000-4000-8000-000000000002', 'Other Team', 'ABL', '20-80',
             'current_and_potential', false, 162, 1) $$,
  'another user can insert a team of their own'
);
select throws_ok(
  $$ update public.teams set owner_id = 'a0000000-0000-4000-8000-000000000001'
     where id = 'b1000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'another user cannot give their team to the owner'
);
select results_eq(
  $$ select id from public.teams $$,
  $$ values ('b1000000-0000-4000-8000-000000000002'::uuid) $$,
  'another user reads only their own team'
);

-- ---------------------------------------------------------------------------------------
-- An anonymous caller has no access at all.
reset role;
set local role anon;
set local request.jwt.claims to '{"role": "anon"}';

select throws_ok($$ select 1 from public.teams $$, '42501', null, 'anonymous callers cannot read teams');
select throws_ok($$ select 1 from public.snapshots $$, '42501', null, 'anonymous callers cannot read snapshots');
select throws_ok($$ select 1 from public.view_files $$, '42501', null, 'anonymous callers cannot read view files');
select throws_ok($$ select 1 from public.import_events $$, '42501', null, 'anonymous callers cannot read import events');
select throws_ok($$ select 1 from public.advisor_messages $$, '42501', null, 'anonymous callers cannot read advisor messages');
select throws_ok(
  $$ insert into public.teams
       (owner_id, name, league, rating_scale, league_shows, dh_enabled, games_per_season, dev_lab_slots)
     values ('a0000000-0000-4000-8000-000000000001', 'Anonymous', 'ABL', '1-10', 'potentials_only',
             true, 162, 4) $$,
  '42501', null, 'anonymous callers cannot insert a team'
);

-- ---------------------------------------------------------------------------------------
-- Back as the owner: nothing above touched their rows, and deleting the team removes the rest.
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub": "a0000000-0000-4000-8000-000000000001", "role": "authenticated"}';

select results_eq(
  $$ select t.name, s.label, v.routing, e.level, m.answer
     from public.teams t
     join public.snapshots s on s.team_id = t.id
     join public.view_files v on v.snapshot_id = s.id
     join public.import_events e on e.view_file_id = v.id
     join public.advisor_messages m on m.snapshot_id = s.id $$,
  $$ values ('Seattle'::text, 'Game 43'::text, 'supplemental'::text, 'warning'::text, 'Updated'::text) $$,
  'the owner''s rows are exactly as the owner left them'
);
select is_empty(
  $$ select 1 from public.teams where id = 'b1000000-0000-4000-8000-000000000002' $$,
  'the owner does not see the other user''s team'
);

select throws_ok(
  $$ insert into public.view_files
       (snapshot_id, original_filename, routing, content, sha256, importer_version)
     values ('a2000000-0000-4000-8000-000000000001', 'again.csv', 'primary',
             E'POS,#,Name\r\nC,35,Test\r\n',
             encode(sha256(convert_to(E'POS,#,Name\r\nC,35,Test\r\n', 'UTF8')), 'hex'), '0.0.0') $$,
  '23505', null, 'uploading the same file to a snapshot again is rejected as a duplicate'
);

select results_eq(
  $$ with d as (delete from public.advisor_messages returning 1) select count(*) from d $$,
  $$ values (1::bigint) $$, 'owner can delete their advisor message'
);
select results_eq(
  $$ with d as (delete from public.import_events returning 1) select count(*) from d $$,
  $$ values (1::bigint) $$, 'owner can delete their import event'
);
select results_eq(
  $$ with d as (delete from public.view_files returning 1) select count(*) from d $$,
  $$ values (1::bigint) $$, 'owner can delete their view file'
);
select results_eq(
  $$ with d as (delete from public.snapshots returning 1) select count(*) from d $$,
  $$ values (1::bigint) $$, 'owner can delete their snapshot'
);
select results_eq(
  $$ with d as (delete from public.teams returning 1) select count(*) from d $$,
  $$ values (1::bigint) $$, 'owner can delete their team'
);

-- Cascade: a fresh team with a full chain of rows disappears in one delete.
insert into public.teams
  (id, name, league, rating_scale, league_shows, dh_enabled, games_per_season, dev_lab_slots)
values ('a1000000-0000-4000-8000-000000000009', 'Cascade', 'ABL', '1-10', 'potentials_only',
        true, 162, 4);
insert into public.snapshots (id, team_id, label, game_number)
values ('a2000000-0000-4000-8000-000000000009', 'a1000000-0000-4000-8000-000000000009', 'Game 1', 1);
insert into public.view_files
  (id, snapshot_id, original_filename, routing, content, sha256, importer_version)
values ('a3000000-0000-4000-8000-000000000009', 'a2000000-0000-4000-8000-000000000009',
        'x.csv', 'rejected', 'x', repeat('0', 64), '0.0.0');
insert into public.import_events (view_file_id, level, code, message)
values ('a3000000-0000-4000-8000-000000000009', 'error', 'unrecognized', 'Unrecognized view');
insert into public.advisor_messages (snapshot_id, question, answer, model)
values ('a2000000-0000-4000-8000-000000000009', 'Q', 'A', 'test-model');
delete from public.teams where id = 'a1000000-0000-4000-8000-000000000009';

select results_eq(
  $$ select (select count(*) from public.snapshots), (select count(*) from public.view_files),
            (select count(*) from public.import_events), (select count(*) from public.advisor_messages) $$,
  $$ values (0::bigint, 0::bigint, 0::bigint, 0::bigint) $$,
  'deleting a team deletes its snapshots, files, import events and advisor messages'
);

select * from finish();
rollback;
