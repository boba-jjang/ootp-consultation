import { useState, type SubmitEvent } from 'react';
import { Link } from 'react-router';

import {
  DEFAULT_TEAM_SETTINGS,
  LEAGUE_SHOWS,
  RATING_SCALES,
  parseTeamSettings,
  type TeamSettings,
} from '@ootp/core';

import { useAuthActions, useSessionState } from '../session.ts';
import { useCreateTeam, useTeams } from '../data.ts';
import { Button, Field, Panel } from '../ui/primitives.tsx';
import styles from './Message.module.css';

type NumberField = 'games_per_season' | 'dev_lab_slots';

/** The form keeps number inputs as typed text until it's submitted. */
type TeamForm = Omit<TeamSettings, NumberField> & Record<NumberField, string>;

const EMPTY_FORM: TeamForm = {
  ...DEFAULT_TEAM_SETTINGS,
  games_per_season: String(DEFAULT_TEAM_SETTINGS.games_per_season),
  dev_lab_slots: String(DEFAULT_TEAM_SETTINGS.dev_lab_slots),
};

/** The form's fields, top to bottom, so the first error gets the focus. */
const FIELD_ORDER: readonly (keyof TeamSettings)[] = [
  'name',
  'league',
  'rating_scale',
  'league_shows',
  'dh_enabled',
  'games_per_season',
  'dev_lab_slots',
];

const LEAGUE_SHOWS_LABELS: Record<(typeof LEAGUE_SHOWS)[number], string> = {
  potentials_only: 'Potentials only',
  current_and_potential: 'Current and potential',
};

/**
 * Your teams, and a plain form to add one. The Team menu and the Create a Team flow replace
 * this screen in their own plan item; the data hooks stay.
 */
export function TeamsScreen() {
  const { client, session } = useSessionState();
  const teams = useTeams();
  const createTeam = useCreateTeam();
  const [form, setForm] = useState<TeamForm>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof TeamSettings, string>>>({});
  const [signOutError, setSignOutError] = useState<string | null>(null);

  function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseTeamSettings({
      ...form,
      games_per_season: Number(form.games_per_season),
      dev_lab_slots: Number(form.dev_lab_slots),
    });
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      const first = FIELD_ORDER.find((field) => parsed.errors[field] !== undefined);
      const control = first ? event.currentTarget.elements.namedItem(first) : null;
      if (control instanceof HTMLElement) {
        control.focus();
      }
      return;
    }
    setFieldErrors({});
    createTeam.mutate(parsed.value, {
      onSuccess: () => {
        setForm(EMPTY_FORM);
      },
    });
  }

  function update<K extends keyof TeamForm>(field: K, value: TeamForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <main id="main" className={styles.main}>
      <h1 className={styles.title}>Your teams</h1>
      <p className={styles.text}>
        Signed in as {session?.user.email ?? session?.user.id}.{' '}
        {client ? <SignOutLink client={client} onFail={setSignOutError} /> : null}
      </p>
      {signOutError ? (
        <p className={styles.text} role="alert">
          {signOutError}
        </p>
      ) : null}

      <Panel title="Teams">
        {teams.isPending ? <p role="status">Loading teams…</p> : null}
        {teams.isError ? <p role="alert">{teams.error.message}</p> : null}
        {teams.data?.length === 0 ? <p>No teams yet.</p> : null}
        {teams.data && teams.data.length > 0 ? (
          <ul className={styles.list}>
            {teams.data.map((team) => (
              <li key={team.id}>
                <Link to={`/t/${team.id}`}>{team.name}</Link> ({team.league}): {team.rating_scale}{' '}
                scale, {LEAGUE_SHOWS_LABELS[team.league_shows].toLowerCase()}, DH{' '}
                {team.dh_enabled ? 'on' : 'off'}, {team.games_per_season} games,{' '}
                {team.dev_lab_slots} Dev Lab slots.
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <Panel title="Add a team">
        <form noValidate onSubmit={save} className={styles.form}>
          <Field
            id="team-name"
            name="name"
            autoComplete="off"
            label="Team name"
            value={form.name}
            error={fieldErrors.name}
            onChange={(event) => {
              update('name', event.target.value);
            }}
          />
          <Field
            id="team-league"
            name="league"
            autoComplete="off"
            font="mono"
            label="League"
            value={form.league}
            error={fieldErrors.league}
            onChange={(event) => {
              update('league', event.target.value);
            }}
          />
          <label className={styles.select}>
            Rating scale
            <select
              name="rating_scale"
              value={form.rating_scale}
              onChange={(event) => {
                update('rating_scale', event.target.value as TeamForm['rating_scale']);
              }}
            >
              {RATING_SCALES.map((scale) => (
                <option key={scale} value={scale}>
                  {scale}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.select}>
            The league shows
            <select
              name="league_shows"
              value={form.league_shows}
              onChange={(event) => {
                update('league_shows', event.target.value as TeamForm['league_shows']);
              }}
            >
              {LEAGUE_SHOWS.map((option) => (
                <option key={option} value={option}>
                  {LEAGUE_SHOWS_LABELS[option]}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              name="dh_enabled"
              checked={form.dh_enabled}
              onChange={(event) => {
                update('dh_enabled', event.target.checked);
              }}
            />
            DH
          </label>
          <Field
            id="team-games"
            name="games_per_season"
            type="number"
            inputMode="numeric"
            min={1}
            autoComplete="off"
            label="Games per season"
            value={form.games_per_season}
            error={fieldErrors.games_per_season}
            onChange={(event) => {
              update('games_per_season', event.target.value);
            }}
          />
          <Field
            id="team-slots"
            name="dev_lab_slots"
            type="number"
            inputMode="numeric"
            min={1}
            max={30}
            autoComplete="off"
            label="Dev Lab slots"
            value={form.dev_lab_slots}
            error={fieldErrors.dev_lab_slots}
            onChange={(event) => {
              update('dev_lab_slots', event.target.value);
            }}
          />
          <div className={styles.actions}>
            <Button type="submit" variant="primary" disabled={createTeam.isPending}>
              {createTeam.isPending ? 'Saving…' : 'Save team'}
            </Button>
          </div>
          {createTeam.isError ? <p role="alert">{createTeam.error.message}</p> : null}
        </form>
      </Panel>
    </main>
  );
}

function SignOutLink({
  client,
  onFail,
}: {
  client: NonNullable<ReturnType<typeof useSessionState>['client']>;
  onFail: (message: string) => void;
}) {
  const { signOut } = useAuthActions(client);
  return (
    <Button
      variant="link"
      onClick={() => {
        void signOut().then((message) => {
          if (message) {
            onFail(message);
          }
        });
      }}
    >
      Sign out
    </Button>
  );
}
