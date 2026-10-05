import {
  DEFAULT_TEAM_SETTINGS,
  LEAGUE_SHOWS,
  RATING_SCALES,
  VIEW_DESCRIPTIONS,
  parseTeamSettings,
  type TeamSettings,
  type Upload,
} from '@ootp/core';
import {
  ViewTransition,
  addTransitionType,
  startTransition,
  useEffect,
  useRef,
  useState,
  type SubmitEvent,
} from 'react';
import { Link, useNavigate } from 'react-router';

import { useCreateTeamWithExports } from '../data.ts';
import { modulePath } from '../shell/modules.ts';
import { AppHeader } from '../ui/AppHeader.tsx';
import {
  Button,
  Choices,
  CoverageBadge,
  Field,
  LeagueTag,
  Panel,
  Steps,
} from '../ui/primitives.tsx';
import { listOf } from '../ui/text.ts';
import {
  NOTHING_PREFILLED,
  prefill,
  readExports,
  type Prefilled,
  type ReadExports,
} from './exports.ts';
import { BestFirstUpload, CoverageSoFar, DropZone, FoundInFiles, ViewsRead } from './pieces.tsx';
import styles from './Setup.module.css';

const STEPS = ['Add exports', 'Team and league', 'Review'] as const;
type Step = 0 | 1 | 2;

type NumberField = 'games_per_season' | 'dev_lab_slots';

/** The form keeps number inputs as typed text until it's submitted. */
type TeamForm = Omit<TeamSettings, NumberField> & Record<NumberField, string>;

const toForm = (settings: TeamSettings): TeamForm => ({
  ...settings,
  games_per_season: String(settings.games_per_season),
  dev_lab_slots: String(settings.dev_lab_slots),
});

const fromForm = (form: TeamForm) => ({
  ...form,
  games_per_season: Number(form.games_per_season),
  dev_lab_slots: Number(form.dev_lab_slots),
});

const SCALE_LABELS: Record<(typeof RATING_SCALES)[number], string> = {
  '1-5': '1–5',
  '1-10': '1–10',
  '2-8': '2–8',
  '20-80': '20–80',
  '1-100': '1–100',
};

const SHOWS_LABELS: Record<(typeof LEAGUE_SHOWS)[number], string> = {
  potentials_only: 'Potentials only',
  current_and_potential: 'Current and potential',
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

type FieldErrors = Partial<Record<keyof TeamSettings, string>>;

/**
 * Create a Team, in the three steps of the setup boards: add exports, team and league,
 * review. The exports are read and routed in the browser; the team and its first snapshot
 * are saved on Create.
 */
export function CreateTeam() {
  const navigate = useNavigate();
  const create = useCreateTeamWithExports();
  const [step, setStep] = useState<Step>(0);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [exports, setExports] = useState<ReadExports>(() => readExports([]));
  const [form, setForm] = useState<TeamForm>(() => toForm(DEFAULT_TEAM_SETTINGS));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [prefilled, setPrefilled] = useState<Prefilled>(NOTHING_PREFILLED);
  const stepElement = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);

  // A new step starts at its heading, for the keyboard and the screen reader.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    stepElement.current?.querySelector('h1')?.focus();
  }, [step]);

  const go = (next: Step) => {
    startTransition(() => {
      addTransitionType(next > step ? 'setup-forward' : 'setup-back');
      setStep(next);
    });
  };

  const addFiles = (files: Promise<Upload[]>) => {
    setReading(true);
    setReadError(null);
    files
      .then((uploads) => {
        if (uploads.length === 0) {
          setReadError('No CSV file was among those. OOTP exports are .csv files.');
        }
        setExports((current) => readExports([...current.uploads, ...uploads]));
      })
      .catch((error: unknown) => {
        setReadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        setReading(false);
      });
  };

  const submitTeam = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseTeamSettings(fromForm(form));
    if (!parsed.ok) {
      setErrors(parsed.errors);
      const first = FIELD_ORDER.find((field) => parsed.errors[field] !== undefined);
      const control = first ? event.currentTarget.elements.namedItem(first) : null;
      if (control instanceof HTMLElement) {
        control.focus();
      } else if (control instanceof RadioNodeList && control[0] instanceof HTMLElement) {
        control[0].focus();
      }
      return;
    }
    setErrors({});
    setForm(toForm(parsed.value));
    go(2);
  };

  const createTeam = () => {
    const parsed = parseTeamSettings(fromForm(form));
    if (!parsed.ok) {
      setErrors(parsed.errors);
      go(1);
      return;
    }
    create.mutate(
      { settings: parsed.value, uploads: exports.uploads },
      {
        onSuccess: ({ team, snapshot, message }) => {
          if (message === null) {
            void navigate(
              snapshot ? modulePath(team.id, snapshot.id, 'clubhouse') : `/t/${team.id}`,
              {
                replace: true,
              },
            );
          }
        },
      },
    );
  };

  return (
    <>
      <AppHeader />
      <main id="main" className={styles.main}>
        <Steps steps={STEPS} current={step} />
        <ViewTransition
          key={step}
          enter={{
            'setup-forward': 'setup-enter-forward',
            'setup-back': 'setup-enter-back',
            default: 'none',
          }}
          exit={{
            'setup-forward': 'setup-exit-forward',
            'setup-back': 'setup-exit-back',
            default: 'none',
          }}
          default="none"
        >
          <div ref={stepElement} className={styles.step}>
            {step === 0 ? (
              <StepExports
                exports={exports}
                reading={reading}
                readError={readError}
                onFiles={addFiles}
                onReset={() => {
                  setExports(readExports([]));
                  setReadError(null);
                }}
                onContinue={() => {
                  const filled = prefill(form, exports.summary, prefilled);
                  setForm(filled.settings);
                  setPrefilled(filled.prefilled);
                  go(1);
                }}
              />
            ) : step === 1 ? (
              <StepTeam
                form={form}
                errors={errors}
                onChange={(next) => {
                  setForm(next);
                }}
                onBack={() => {
                  go(0);
                }}
                onSubmit={submitTeam}
              />
            ) : (
              <StepReview
                form={form}
                exports={exports}
                creating={create.isPending}
                error={create.isError ? create.error.message : null}
                created={create.data?.message ? create.data : null}
                onEdit={go}
                onCreate={createTeam}
              />
            )}
          </div>
        </ViewTransition>
      </main>
    </>
  );
}

function StepExports({
  exports,
  reading,
  readError,
  onFiles,
  onReset,
  onContinue,
}: {
  exports: ReadExports;
  reading: boolean;
  readError: string | null;
  onFiles: (files: Promise<Upload[]>) => void;
  onReset: () => void;
  onContinue: () => void;
}) {
  const has = exports.uploads.length > 0;
  const datable = exports.summary.gameNumber !== null;
  const hint = !has
    ? 'Add at least one export to continue, or set up without files.'
    : !datable
      ? 'Add a hitter stats view (batting_stats_1 or batting_stats_2): its games played date the snapshot.'
      : null;
  return (
    <>
      <div className={styles.intro}>
        <h1 className={styles.title} tabIndex={-1}>
          Create a team
        </h1>
        <p className={styles.lead}>
          {has
            ? `${exports.named.length} ${exports.named.length === 1 ? 'file' : 'files'} read. Here's what they say about your team.`
            : "Start with your OOTP exports. The team, league and roster are read from them, so there's less to type."}
        </p>
      </div>
      {has ? (
        <>
          <FoundInFiles summary={exports.summary} />
          <div className={styles.columns}>
            <ViewsRead named={exports.named} coverage={exports.coverage} />
            <CoverageSoFar coverage={exports.coverage} />
          </div>
          <DropZone size="small" busy={reading} onFiles={onFiles} />
        </>
      ) : (
        <div className={styles.columns}>
          <DropZone size="large" busy={reading} onFiles={onFiles} />
          <BestFirstUpload />
        </div>
      )}
      {readError ? (
        <p className={styles.error} role="alert">
          {readError}
        </p>
      ) : null}
      <div className={styles.actions}>
        {has ? (
          <Button variant="ghost" onClick={onReset}>
            Start over
          </Button>
        ) : (
          <Button variant="link" onClick={onContinue}>
            Set up without files
          </Button>
        )}
        <span className={styles.actionsEnd}>
          {hint ? (
            <span id="continue-hint" className={styles.hint}>
              {hint}
            </span>
          ) : null}
          <Button
            variant="primary"
            disabled={hint !== null}
            aria-describedby={hint ? 'continue-hint' : undefined}
            onClick={onContinue}
          >
            Continue
          </Button>
        </span>
      </div>
    </>
  );
}

function StepTeam({
  form,
  errors,
  onChange,
  onBack,
  onSubmit,
}: {
  form: TeamForm;
  errors: FieldErrors;
  onChange: (form: TeamForm) => void;
  onBack: () => void;
  onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
}) {
  const update = <K extends keyof TeamForm>(field: K, value: TeamForm[K]) => {
    onChange({ ...form, [field]: value });
  };
  return (
    <>
      <div className={styles.intro}>
        <h1 className={styles.title} tabIndex={-1}>
          Team and league
        </h1>
        <p className={styles.lead}>
          We filled in what your files showed. These settings change how ratings are read and how
          the lineup is built.
        </p>
      </div>
      <form noValidate onSubmit={onSubmit} className={styles.form}>
        <Panel title="Team" className={styles.formPanel}>
          <Field
            id="team-name"
            name="name"
            autoComplete="off"
            label="Team name"
            help="From your file names"
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
            help="From the league column in your exports"
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
          <Choices
            legend="Batting and pitching ratings your league shows"
            name="league_shows"
            options={LEAGUE_SHOWS.map((shows) => ({ value: shows, label: SHOWS_LABELS[shows] }))}
            value={form.league_shows}
            onChange={(value) => {
              update('league_shows', value);
            }}
            help="Fielding and running ratings have no potentials in OOTP, so they're always read as current."
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
          <Field
            id="team-slots"
            name="dev_lab_slots"
            type="number"
            inputMode="numeric"
            min={1}
            max={30}
            autoComplete="off"
            label="Dev Lab slots"
            help="Set by your league, from 1 to 30"
            value={form.dev_lab_slots}
            error={errors.dev_lab_slots}
            onChange={(event) => {
              update('dev_lab_slots', event.target.value);
            }}
          />
        </Panel>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button type="submit" variant="primary">
            Continue
          </Button>
        </div>
      </form>
    </>
  );
}

function StepReview({
  form,
  exports,
  creating,
  error,
  created,
  onEdit,
  onCreate,
}: {
  form: TeamForm;
  exports: ReadExports;
  creating: boolean;
  error: string | null;
  /** The team was saved but its exports weren't: the message says why. */
  created: { team: { id: string }; message: string | null } | null;
  onEdit: (step: Step) => void;
  onCreate: () => void;
}) {
  const has = exports.uploads.length > 0;
  const { coverage, summary } = exports;
  const players = summary.hitters + summary.pitchers;
  return (
    <>
      <div className={styles.intro}>
        <h1 className={styles.title} tabIndex={-1}>
          Review and create
        </h1>
        <p className={styles.lead}>Everything here can be changed later in team settings.</p>
      </div>
      <dl className={styles.summary}>
        <SummaryItem
          title="Team"
          edit="Edit team"
          onEdit={() => {
            onEdit(1);
          }}
        >
          {form.name} <LeagueTag>{form.league}</LeagueTag>
        </SummaryItem>
        <SummaryItem
          title="Ratings"
          edit="Edit ratings"
          onEdit={() => {
            onEdit(1);
          }}
        >
          {SCALE_LABELS[form.rating_scale]} scale, converted to 20–80
          <br />
          Batting and pitching: {SHOWS_LABELS[form.league_shows].toLowerCase()}
        </SummaryItem>
        <SummaryItem
          title="League rules"
          edit="Edit league rules"
          onEdit={() => {
            onEdit(1);
          }}
        >
          DH {form.dh_enabled ? 'on' : 'off'}
          <br />
          {form.games_per_season} games, {form.dev_lab_slots} Dev Lab slots
        </SummaryItem>
        <SummaryItem
          title="First snapshot"
          edit="Edit first snapshot"
          onEdit={() => {
            onEdit(0);
          }}
        >
          {has ? `Game ${summary.gameNumber ?? '?'}` : 'None yet'}
          <br />
          {has
            ? `${coverage.views.onFile.length} views, ${players} players`
            : 'Add exports anytime from the Clubhouse'}
        </SummaryItem>
      </dl>
      <Panel title="On day one" meta={<CoverageBadge level={coverage.level} prefix="" />}>
        <p className={styles.muted}>{coverage.summary}</p>
        {coverage.next.length > 0 ? (
          <p className={styles.muted}>
            Opens with more views:{' '}
            {listOf(coverage.next.map((view) => VIEW_DESCRIPTIONS[view].title.toLowerCase()))}.
          </p>
        ) : null}
      </Panel>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {created?.message ? (
        <p className={styles.error} role="alert">
          The team was created, but its exports weren't saved: {created.message}{' '}
          <Link to={`/t/${created.team.id}`}>Open the team</Link>.
        </p>
      ) : null}
      <div className={styles.actions}>
        <Button
          variant="ghost"
          onClick={() => {
            onEdit(1);
          }}
          disabled={creating}
        >
          Back
        </Button>
        <span className={styles.actionsEnd}>
          <span className={styles.hint}>
            {has
              ? `Saves your files as this team's game ${summary.gameNumber ?? '?'} snapshot.`
              : 'Creates the team with no snapshot yet.'}
          </span>
          <Button variant="primary" onClick={onCreate} disabled={creating || created !== null}>
            {creating ? 'Creating…' : 'Create team'}
          </Button>
        </span>
      </div>
    </>
  );
}

function SummaryItem({
  title,
  edit,
  onEdit,
  children,
}: {
  title: string;
  edit: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.summaryItem}>
      <dt className={styles.summaryTitle}>{title}</dt>
      <dd className={styles.summaryText}>{children}</dd>
      <Button variant="ghost" className={styles.summaryEdit} onClick={onEdit}>
        {edit}
      </Button>
    </div>
  );
}
