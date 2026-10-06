import { RATING_SCALES } from '@ootp/core';
import type { ReactNode, SubmitEvent } from 'react';

import { Choices, Field, Panel } from '../ui/primitives.tsx';
import { SCALE_LABELS, type FieldErrors, type TeamForm } from './form.ts';
import styles from './Setup.module.css';

/**
 * The team settings, as the setup board lays them out: team, ratings, league rules. The
 * children are the form's actions. Create a Team and Team settings both use it.
 */
export function TeamSettingsForm({
  form,
  errors,
  onChange,
  onSubmit,
  nameHelp,
  leagueHelp,
  children,
}: {
  form: TeamForm;
  errors: FieldErrors;
  onChange: (form: TeamForm) => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
  nameHelp?: string;
  leagueHelp?: string;
  children: ReactNode;
}) {
  const update = <K extends keyof TeamForm>(field: K, value: TeamForm[K]) => {
    onChange({ ...form, [field]: value });
  };
  return (
    <form noValidate onSubmit={onSubmit} className={styles.form}>
      <Panel title="Team" className={styles.formPanel}>
        <Field
          id="team-name"
          name="name"
          autoComplete="off"
          label="Team name"
          help={nameHelp}
          value={form.name}
          error={errors.name}
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
          help={leagueHelp}
          value={form.league}
          error={errors.league}
          onChange={(event) => {
            update('league', event.target.value);
          }}
        />
      </Panel>
      <Panel title="Ratings" className={styles.formPanel}>
        <Choices
          legend="Rating scale your league uses"
          name="rating_scale"
          font="mono"
          options={RATING_SCALES.map((scale) => ({ value: scale, label: SCALE_LABELS[scale] }))}
          value={form.rating_scale}
          onChange={(value) => {
            update('rating_scale', value);
          }}
          help="Ratings are stored on 20–80; this says how your exports show them."
        />
      </Panel>
      <Panel title="League rules" className={styles.formPanel}>
        <Choices
          legend="Designated hitter"
          name="dh_enabled"
          options={[
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
          value={form.dh_enabled ? 'on' : 'off'}
          onChange={(value) => {
            update('dh_enabled', value === 'on');
          }}
          help="With the DH on, pitchers don't bat and the lineup has nine hitters."
        />
        <Field
          id="team-games"
          name="games_per_season"
          type="number"
          inputMode="numeric"
          min={1}
          autoComplete="off"
          label="Games per season"
          help="Sets the length of the season timeline"
          value={form.games_per_season}
          error={errors.games_per_season}
          onChange={(event) => {
            update('games_per_season', event.target.value);
          }}
        />
      </Panel>
      <div className={styles.actions}>{children}</div>
    </form>
  );
}
