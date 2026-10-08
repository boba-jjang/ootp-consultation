import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  collectUploads,
  describeFile,
  replacementKey,
  replacementProblem,
  routeExport,
  type Upload,
} from '../index.ts';
import { FIXTURES, editCell, readFixtureText, routeFixture } from '../../test/fixtures.ts';

/** The 16 game-42 exports, as a browser would hand them over. */
const uploads = (): Upload[] =>
  readdirSync(new URL('seattle-g42/', FIXTURES), { encoding: 'utf8' })
    .filter((file) => file.endsWith('.csv'))
    .map((name) => ({ name, text: readFixtureText(`seattle-g42/${name}`) }));

/** One game-42 export, by the end of its file name. */
const upload = (ending: string): Upload => {
  const found = uploads().find((candidate) => candidate.name.endsWith(ending));
  if (!found) {
    throw new Error(`no fixture ends with ${ending}`);
  }
  return found;
};

const STATS_1 = '_lineups_-_overview_batting_stats_1.csv';
const STAFF_RATINGS = '_lineups_-_overview_cus_pitch_pot.csv';
const HITTER_CAPTURE = '_cus_pitch_pot_hitter_capture.csv';
const LEAGUE_SUPERSTATS_1 = '_sortable_stats_batting_superstats_1.csv';

/** A re-export of a view: the same file name, one cell different. */
const reexport = (original: Upload): Upload => ({
  ...original,
  text: editCell(original.text, 'Yoshitsugu Ishida', 'POS', 'C'),
});

/** batting_stats_1 with one hitter's games raised to 43, which dates it game 43. */
const game43Stats = (): Upload => {
  const stats = upload(STATS_1);
  return { ...stats, text: editCell(stats.text, 'Cheng-qian Eng', 'G', '43') };
};

const notes: Upload = { name: 'notes.csv', text: 'a,b\n1,2\n' };

describe('collectUploads', () => {
  const kept = (uploads: Upload[]) => collectUploads(uploads).kept.map((pending) => pending.upload);

  it('keeps every game-42 export, and counts a file added twice once', () => {
    const all = uploads();
    expect(kept([...all, ...all.slice(0, 3)])).toEqual(all);
    expect(collectUploads(all)).not.toHaveProperty('replaced');
  });

  it('keeps a re-export beside the earlier copy of its view, as importUpload does', () => {
    const first = upload(STATS_1);
    const second = {
      ...first,
      text: editCell(first.text, 'Yoshitsugu Ishida', 'AVG', '.175'),
    };
    const other = upload('_lineups_-_overview_default.csv');
    expect(kept([first, other, second])).toEqual([first, other, second]);
  });

  it('keeps the same text under another name, and routes what it keeps', () => {
    const stats = upload(STATS_1);
    const copy = { ...stats, name: 'copy.csv' };
    const collected = collectUploads([stats, stats, copy]);
    expect(collected.kept.map((pending) => pending.upload)).toEqual([stats, copy]);
    expect(collected.kept.map((pending) => pending.routed.view)).toEqual([
      'batting_stats_1',
      'batting_stats_1',
    ]);
  });

  it('keeps the hitter capture beside the staff cus_pitch_pot, and two rejected files', () => {
    const collected = collectUploads([upload(STAFF_RATINGS), upload(HITTER_CAPTURE)]);
    expect(collected.kept.map((pending) => pending.routed.routing)).toEqual([
      'primary',
      'supplemental',
    ]);
    expect(kept([notes, { name: 'other.csv', text: 'c,d\n3,4\n' }])).toHaveLength(2);
  });
});

describe('replacementKey', () => {
  const routed = (file: Upload) => routeExport(file.name, file.text);

  it('is the view, scope and routing when both files have a known view', () => {
    const stats = routed(upload(STATS_1));
    expect(replacementKey(stats, routed(upload(STAFF_RATINGS)))).toBe(
      'batting_stats_1|team|primary',
    );
    expect(replacementKey(routed(upload(HITTER_CAPTURE)), routed(upload(STAFF_RATINGS)))).toBe(
      'cus_pitch_pot|team|supplemental',
    );
  });

  it('is the side, scope and routing when either file has no known view', () => {
    const custom = routeFixture(
      'seattle-g53/seattle_arrows_lineups_-_overview_batting_stats_1_cust.csv',
    );
    const stats = routed(upload(STATS_1));
    expect(replacementKey(custom, stats)).toBe('hitters|team|primary');
    expect(replacementKey(stats, custom)).toBe('hitters|team|primary');
    const bio = routeFixture('seattle-g53/seattle_arrows_lineups_-_overview_default.csv');
    expect(replacementKey(bio, custom)).toBe('|team|primary');
  });

  it('is null for a rejected file', () => {
    const rejected = routeExport(notes.name, notes.text);
    expect(replacementKey(rejected, rejected)).toBeNull();
    expect(replacementKey(rejected, routed(upload(STATS_1)))).toBeNull();
  });
});

describe('replacementProblem', () => {
  const routed = (file: Upload) => routeExport(file.name, file.text);

  it('accepts the same view from the same game', () => {
    const stats = upload(STATS_1);
    expect(replacementProblem(routed(stats), 42, routed(reexport(stats)))).toBeNull();
    const staff = upload(STAFF_RATINGS);
    expect(replacementProblem(routed(staff), 42, routed(reexport(staff)))).toBeNull();
  });

  it('accepts a view that carries no game number into any snapshot', () => {
    const staff = upload(STAFF_RATINGS);
    expect(replacementProblem(routed(staff), 81, routed(staff))).toBeNull();
  });

  it('refuses another view, naming both', () => {
    expect(replacementProblem(routed(upload(STAFF_RATINGS)), 42, routed(upload(STATS_1)))).toBe(
      'This file is batting_stats_1, not cus_pitch_pot.',
    );
  });

  it('refuses the staff ratings view for the hitter capture, and a team view for a league file', () => {
    expect(
      replacementProblem(routed(upload(HITTER_CAPTURE)), 42, routed(upload(STAFF_RATINGS))),
    ).toBe('This file is cus_pitch_pot, not cus_pitch_pot run on the hitters.');
    expect(
      replacementProblem(
        routed(upload(LEAGUE_SUPERSTATS_1)),
        42,
        routed(upload('_lineups_-_overview_batting_superstats_1.csv')),
      ),
    ).toBe('This file is batting_superstats_1, not the league’s batting_superstats_1.');
  });

  it('lets a custom team file replace only another file of its side and scope', () => {
    const g53 = (path: string) => routeFixture(`seattle-g53/${path}`);
    const stats = g53('seattle_arrows_lineups_-_overview_batting_stats_1_cust.csv');
    expect(
      replacementProblem(
        stats,
        53,
        g53('seattle_arrows_lineups_-_overview_batting_superstats_1.csv'),
      ),
    ).toBeNull();
    expect(
      replacementProblem(stats, 53, routed(upload('_lineups_-_overview_custom_bat_pot.csv'))),
    ).toBeNull();
    expect(replacementProblem(stats, 53, g53('seattle_arrows_pitching_pitching_stats_1.csv'))).toBe(
      'This file is a custom pitchers view, not a custom hitters view.',
    );
    expect(
      replacementProblem(
        stats,
        53,
        g53('rsl_statistics_player_statistics_-_sortable_stats_batting_superstats_1.csv'),
      ),
    ).toBe('This file is the league’s custom hitters view, not a custom hitters view.');
  });

  it('lets one bio view replace another, whichever sides it lists', () => {
    const bio = routeFixture('seattle-g53/seattle_arrows_lineups_-_overview_default.csv');
    expect(bio.side).toBeNull();
    expect(
      replacementProblem(bio, 53, routed(upload('_lineups_-_overview_default.csv'))),
    ).toBeNull();
  });

  it('refuses an export from another game, which belongs to that game’s snapshot', () => {
    const problem = replacementProblem(routed(upload(STATS_1)), 42, routed(game43Stats()));
    expect(problem).toBe(
      'This export is from game 43, not game 42. Use Add data instead: it goes to the Game 43 snapshot.',
    );
  });

  it('refuses a file the app can’t read, with the importer’s reason', () => {
    const rejected = routed(notes);
    const reason = rejected.events.find((event) => event.level === 'error')?.message;
    expect(reason).toBeTruthy();
    expect(replacementProblem(routed(upload(STATS_1)), 42, rejected)).toBe(reason);
  });

  it('describes each kind of file', () => {
    expect(describeFile(routed(upload(STATS_1)))).toBe('batting_stats_1');
    expect(describeFile(routed(upload(HITTER_CAPTURE)))).toBe('cus_pitch_pot run on the hitters');
    expect(describeFile(routed(upload(LEAGUE_SUPERSTATS_1)))).toBe(
      'the league’s batting_superstats_1',
    );
    expect(describeFile(routed(notes))).toBe('a file the app can’t read');
  });

  it('describes a custom view by its scope and side, and the bio view by its name', () => {
    const g53 = (path: string) => describeFile(routeFixture(`seattle-g53/${path}`));
    expect(g53('seattle_arrows_lineups_-_overview_batting_stats_1_cust.csv')).toBe(
      'a custom hitters view',
    );
    expect(g53('seattle_arrows_pitching_pitching_superstat_1.csv')).toBe('a custom pitchers view');
    expect(g53('starter_pitching_stats_1.csv')).toBe('the league’s custom pitchers view');
    expect(g53('rsl_statistics_player_statistics_-_sortable_stats_batting_stats_1_cust.csv')).toBe(
      'the league’s custom hitters view',
    );
    expect(g53('seattle_arrows_lineups_-_overview_default.csv')).toBe('default');
    expect(describeFile({ view: null, scope: 'team', side: null, routing: 'primary' })).toBe(
      'a custom view',
    );
  });
});
