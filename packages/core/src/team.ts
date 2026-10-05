import { z } from 'zod';

/**
 * Rating scales a league can display. Ratings are stored on 20-80 after import; this records
 * what the exports use. Assumed from OOTP's settings until the Basis lists them.
 */
export const RATING_SCALES = ['1-5', '1-10', '2-8', '20-80', '1-100'] as const;

/** What the league shows: potentials only, or current and potential ratings. */
export const LEAGUE_SHOWS = ['potentials_only', 'current_and_potential'] as const;

const teamSettingsSchema = z.object({
  name: z.string().trim().min(1, 'Enter the team name.'),
  league: z.string().trim().min(1, 'Enter the league.'),
  rating_scale: z.enum(RATING_SCALES, 'Choose the rating scale.'),
  league_shows: z.enum(LEAGUE_SHOWS, 'Choose what the league shows.'),
  dh_enabled: z.boolean(),
  games_per_season: z.int('Use a whole number of games.').positive('Use at least 1 game.'),
  dev_lab_slots: z
    .int('Use a whole number of slots.')
    .min(1, 'Use 1 to 30 slots.')
    .max(30, 'Use 1 to 30 slots.'),
});

/** The Team setup fields from the design handoff, named as in the `teams` table. */
export type TeamSettings = z.infer<typeof teamSettingsSchema>;

/** Setup defaults from the design handoff: a 1-10 scale, potentials only, DH on, 162 games, 4 slots. */
export const DEFAULT_TEAM_SETTINGS: TeamSettings = {
  name: '',
  league: '',
  rating_scale: '1-10',
  league_shows: 'potentials_only',
  dh_enabled: true,
  games_per_season: 162,
  dev_lab_slots: 4,
};

export type ParseResult<T> =
  { ok: true; value: T } | { ok: false; errors: Partial<Record<keyof TeamSettings, string>> };

/** Validates and normalizes team settings, with one message per invalid field. */
export function parseTeamSettings(input: unknown): ParseResult<TeamSettings> {
  const result = teamSettingsSchema.safeParse(input);
  if (result.success) {
    return { ok: true, value: result.data };
  }
  const errors: Partial<Record<keyof TeamSettings, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as keyof TeamSettings;
    errors[field] ??= issue.message;
  }
  return { ok: false, errors };
}

const teamRowSchema = teamSettingsSchema.extend({
  id: z.uuid(),
  owner_id: z.uuid(),
  created_at: z.string(),
});

/** A row of the `teams` table. */
export type TeamRow = z.infer<typeof teamRowSchema>;

/** The settings of a row, and nothing else: no id, owner or date leaves with an export. */
export function settingsOf(row: TeamRow): TeamSettings {
  return teamSettingsSchema.parse(row);
}

/** Reads a `teams` row from the database, throwing if it doesn't match the schema. */
export function parseTeamRow(input: unknown): TeamRow {
  return teamRowSchema.parse(input);
}
