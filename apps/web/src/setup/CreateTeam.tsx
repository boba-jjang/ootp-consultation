import { DEFAULT_TEAM_SETTINGS, dataSetName, parseTeamSettings, type Upload } from '@ootp/core';
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
import { Button, CoverageBadge, LeagueTag, Panel, Steps } from '../ui/primitives.tsx';
import { listOf } from '../ui/text.ts';
import {
  NOTHING_PREFILLED,
  NO_EXPORTS,
  addExports,
  prefill,
  removeExport,
  snapshotLine,
  type Prefilled,
  type ReadExports,
} from './exports.ts';
import { SCALE_LABELS, fromForm, toForm, type FieldErrors, type TeamForm } from './form.ts';
import { focusFirstError } from './focus.ts';
import { BestFirstUpload, CoverageSoFar, DropZone, FilesRead, FoundInFiles } from './pieces.tsx';
import { TeamSettingsForm } from './TeamSettingsForm.tsx';
import styles from './Setup.module.css';

const STEPS = ['Add exports', 'Team and league', 'Review'] as const;
type Step = 0 | 1 | 2;

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
  const [exports, setExports] = useState<ReadExports>(NO_EXPORTS);
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
        setExports((current) => addExports(current, uploads));
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
      focusFirstError(event.currentTarget, parsed.errors);
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
                onRemove={(key) => {
                  setExports((current) => removeExport(current, key));
                }}
                onReset={() => {
                  setExports(NO_EXPORTS);
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
  onRemove,
  onReset,
  onContinue,
}: {
  exports: ReadExports;
  reading: boolean;
  readError: string | null;
  onFiles: (files: Promise<Upload[]>) => void;
  onRemove: (key: string) => void;
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
            ? `${exports.files.length} ${exports.files.length === 1 ? 'file' : 'files'} read. Here's what they say about your team.`
            : "Start with your OOTP exports. The team, league and roster are read from them, so there's less to type."}
        </p>
      </div>
      {has ? (
        <>
          <FoundInFiles summary={exports.summary} />
          <div className={styles.columns}>
            <FilesRead files={exports.files} coverage={exports.coverage} onRemove={onRemove} />
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
      <TeamSettingsForm
        form={form}
        errors={errors}
        onChange={onChange}
        onSubmit={onSubmit}
        nameHelp="From your file names"
        leagueHelp="From the league column in your exports"
      >
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button type="submit" variant="primary">
          Continue
        </Button>
      </TeamSettingsForm>
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
          {form.games_per_season} games
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
          {has ? snapshotLine(summary) : 'Add exports once the team exists'}
        </SummaryItem>
      </dl>
      <Panel title="On day one" meta={<CoverageBadge level={coverage.level} prefix="" />}>
        <p className={styles.muted}>{coverage.summary}</p>
        {coverage.next.length > 0 ? (
          <p className={styles.muted}>
            Opens with more data:{' '}
            {listOf(coverage.next.map(({ side, set }) => dataSetName(side, set)))}.
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
