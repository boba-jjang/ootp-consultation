import { describe, expect, it } from 'vitest';

import { DEFAULT_TEAM_SETTINGS, parseTeamRow, parseTeamSettings, settingsOf } from './index.ts';

describe('DEFAULT_TEAM_SETTINGS', () => {
  it('uses the design handoff defaults and is itself valid', () => {
    expect(DEFAULT_TEAM_SETTINGS).toEqual({
      name: '',
      league: '',
      rating_scale: '1-10',
      league_shows: 'potentials_only',
      dh_enabled: true,
      games_per_season: 162,
    });
    const filledIn = { ...DEFAULT_TEAM_SETTINGS, name: 'Seattle Arrows', league: 'ABL' };
    expect(parseTeamSettings(filledIn)).toEqual({ ok: true, value: filledIn });
  });
});

describe('parseTeamSettings', () => {
  const valid = { ...DEFAULT_TEAM_SETTINGS, name: 'Seattle Arrows', league: 'ABL' };

  it('trims the name and league', () => {
    const result = parseTeamSettings({ ...valid, name: '  Seattle Arrows ', league: ' ABL ' });
    expect(result).toEqual({ ok: true, value: valid });
  });

  it.each([
    ['an empty name', { name: '   ' }, 'name'],
    ['an empty league', { league: '' }, 'league'],
    ['an unknown rating scale', { rating_scale: '1-7' }, 'rating_scale'],
    ['an unknown league display', { league_shows: 'everything' }, 'league_shows'],
    ['zero games per season', { games_per_season: 0 }, 'games_per_season'],
    ['fractional games per season', { games_per_season: 161.5 }, 'games_per_season'],
  ])('rejects %s and names the field', (_case, change, field) => {
    const result = parseTeamSettings({ ...valid, ...change });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors)).toEqual([field]);
    }
  });

  it('still reads a team stored as current and potential', () => {
    expect(parseTeamSettings({ ...valid, league_shows: 'current_and_potential' }).ok).toBe(true);
  });

  it('drops Dev Lab slots, which teams no longer have', () => {
    expect(parseTeamSettings({ ...valid, dev_lab_slots: 4 })).toEqual({ ok: true, value: valid });
  });

  it('drops fields it does not know, such as owner_id', () => {
    const result = parseTeamSettings({ ...valid, owner_id: 'someone-else' });
    expect(result).toEqual({ ok: true, value: valid });
  });
});

describe('parseTeamRow', () => {
  const row = {
    id: '7b0e5a5e-3c1b-4f5e-9a64-2f6f0d6f9a10',
    owner_id: '0d7f3c2a-5b9e-4f1a-8c3d-6e2b1a4f9c87',
    created_at: '2026-10-04T01:30:00.123456+00:00',
    ...DEFAULT_TEAM_SETTINGS,
    name: 'Seattle Arrows',
    league: 'ABL',
  };

  it('reads a teams row as stored', () => {
    expect(parseTeamRow(row)).toEqual(row);
  });

  it('reads a row that still has the retired dev_lab_slots column, without it', () => {
    expect(parseTeamRow({ ...row, dev_lab_slots: 4 })).toEqual(row);
  });

  it('rejects a row missing its id', () => {
    const withoutId: Partial<typeof row> = { ...row };
    delete withoutId.id;
    expect(() => parseTeamRow(withoutId)).toThrow();
  });
});

describe('settingsOf', () => {
  it('keeps the settings and drops the row', () => {
    const row = {
      ...DEFAULT_TEAM_SETTINGS,
      name: 'Seattle Arrows',
      league: 'RSL',
      id: '11111111-1111-4111-8111-111111111111',
      owner_id: '22222222-2222-4222-8222-222222222222',
      created_at: '2026-10-04T00:00:00Z',
    };
    expect(settingsOf(row)).toEqual({
      ...DEFAULT_TEAM_SETTINGS,
      name: 'Seattle Arrows',
      league: 'RSL',
    });
  });
});
