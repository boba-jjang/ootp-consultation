import type { SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useState, type ReactNode, type SubmitEvent } from 'react';

import {
  DEFAULT_TEAM_SETTINGS,
  LEAGUE_SHOWS,
  RATING_SCALES,
  parseTeamRow,
  parseTeamSettings,
  type TeamRow,
  type TeamSettings,
} from '@ootp/core';

type NumberField = 'games_per_season' | 'dev_lab_slots';

/** The form keeps number inputs as typed text until it's submitted. */
type TeamForm = Omit<TeamSettings, NumberField> & Record<NumberField, string>;

const EMPTY_FORM: TeamForm = {
  ...DEFAULT_TEAM_SETTINGS,
  games_per_season: String(DEFAULT_TEAM_SETTINGS.games_per_season),
  dev_lab_slots: String(DEFAULT_TEAM_SETTINGS.dev_lab_slots),
};

const LEAGUE_SHOWS_LABELS: Record<(typeof LEAGUE_SHOWS)[number], string> = {
  potentials_only: 'Potentials only',
  current_and_potential: 'Current and potential',
};

export function Teams({ client }: { client: SupabaseClient }) {
  const [teams, setTeams] = useState<TeamRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<TeamForm>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof TeamSettings, string>>>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let current = true;
    void client
      .from('teams')
      .select('*')
      .order('created_at', { ascending: true })
      .then((response) => {
        if (!current) {
          return;
        }
        if (response.error) {
          setLoadError(`Couldn't load teams: ${response.error.message}`);
          return;
        }
        setLoadError(null);
        setTeams((response.data as unknown[]).map(parseTeamRow));
      });
    return () => {
      current = false;
    };
  }, [client]);

  async function save(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);
    const parsed = parseTeamSettings({
      ...form,
      games_per_season: Number(form.games_per_season),
      dev_lab_slots: Number(form.dev_lab_slots),
    });
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      return;
    }
    setFieldErrors({});
    setSaving(true);
    const response = await client.from('teams').insert(parsed.value).select().single();
    setSaving(false);
    if (response.error) {
      setSaveError(`Couldn't save the team: ${response.error.message}`);
      return;
    }
    const saved = parseTeamRow(response.data as unknown);
    setTeams((current) => [...(current ?? []), saved]);
    setForm(EMPTY_FORM);
  }

  function update<K extends keyof TeamForm>(field: K, value: TeamForm[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <>
      <h2>Teams</h2>
      {loadError && <p role="alert">{loadError}</p>}
      {teams === null && !loadError && <p>Loading teams…</p>}
      {teams?.length === 0 && <p>No teams yet.</p>}
      {teams && teams.length > 0 && (
        <ul>
          {teams.map((team) => (
            <li key={team.id}>
              <strong>{team.name}</strong> ({team.league}): {team.rating_scale} scale,{' '}
              {LEAGUE_SHOWS_LABELS[team.league_shows].toLowerCase()}, DH{' '}
              {team.dh_enabled ? 'on' : 'off'}, {team.games_per_season} games, {team.dev_lab_slots}{' '}
              Dev Lab slots. Saved {new Date(team.created_at).toLocaleString()}.
            </li>
          ))}
        </ul>
      )}

      <h2>Add a team</h2>
      <form
        noValidate
        onSubmit={(event) => {
          void save(event);
        }}
      >
        <Field label="Team name" error={fieldErrors.name}>
          <input
            value={form.name}
            onChange={(event) => {
              update('name', event.target.value);
            }}
          />
        </Field>
        <Field label="League" error={fieldErrors.league}>
          <input
            value={form.league}
            onChange={(event) => {
              update('league', event.target.value);
            }}
          />
        </Field>
        <Field label="Rating scale" error={fieldErrors.rating_scale}>
          <select
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
        </Field>
        <Field label="The league shows" error={fieldErrors.league_shows}>
          <select
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
        </Field>
        <Field label="DH" error={fieldErrors.dh_enabled}>
          <input
            type="checkbox"
            checked={form.dh_enabled}
            onChange={(event) => {
              update('dh_enabled', event.target.checked);
            }}
          />
        </Field>
        <Field label="Games per season" error={fieldErrors.games_per_season}>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={form.games_per_season}
            onChange={(event) => {
              update('games_per_season', event.target.value);
            }}
          />
        </Field>
        <Field label="Dev Lab slots" error={fieldErrors.dev_lab_slots}>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={30}
            value={form.dev_lab_slots}
            onChange={(event) => {
              update('dev_lab_slots', event.target.value);
            }}
          />
        </Field>
        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save team'}
        </button>
        {saveError && <p role="alert">{saveError}</p>}
      </form>
    </>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error: string | undefined;
  children: ReactNode;
}) {
  return (
    <p>
      <label>
        {label} {children}
      </label>
      {error && <span role="alert"> {error}</span>}
    </p>
  );
}
