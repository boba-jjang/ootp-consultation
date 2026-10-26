import {
  SLIDERS,
  type InningBand,
  type RunnerEntry,
  type RunnerRatings,
  type RunningSlider,
  type RunningSliderId,
  type SliderId,
  type StrategyLabel,
  type StrategySetting,
} from '@ootp/core';
import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';

import type { ClubhouseState } from '../clubhouse/Clubhouse.tsx';
import { classes } from '../ui/classes.ts';
import { Button } from '../ui/primitives.tsx';
import {
  borderlineWithout,
  differingCells,
  part2Borderline,
  playerRows,
  ratedCount,
  runnerRead,
  situationCount,
  teamRows,
} from './card.ts';
import {
  BANDS_LEGEND,
  BAND_NAMES,
  BASERUNNING_UNLOCK,
  CALLOUT_LINK,
  CALLOUT_TEXT,
  CARD_BUTTON,
  CARD_LEDE,
  DOWNLOAD,
  DRAWER_CLOSE,
  DRAWER_OPEN,
  GATED,
  GATED_TITLE,
  GRID_NOTE,
  LABELS,
  LABEL_LEGEND,
  LABEL_TEXT,
  NO_READ,
  NO_RULE,
  NO_RULE_SUBLINE,
  NO_RULE_TITLE,
  NO_SPLITS_TEXT,
  PANEL_TITLE,
  PART1_COLUMNS,
  PART1_NOTE,
  PART1_TITLE,
  PART2_COLUMNS,
  PART2_NOTE,
  PART2_TITLE,
  RUNNERS_NOTE,
  RUNNERS_SUMMARY,
  RUNNER_COLUMNS,
  SCORE_COLUMN,
  SELECT_LABEL,
  SPLITS_LINK,
  STATE_NAMES,
  TEAM_WORD,
  TRY_AGAIN,
  WORKING_LINEUP,
  WORKING_STRATEGY,
  borderlineFooter,
  cardHeading,
  errorText,
  fallbackSubline,
  lhpPill,
  lineupErrorText,
  overrideWhy,
  overridesTitle,
  part2BorderlineText,
  phat,
  ratingsText,
  readsAs,
  recordText,
  runnersCaption,
  scopeText,
  situationsText,
  sliderName,
  subline,
  surname,
  ubr,
  unlockNote,
  whole,
  type BoardCard,
} from './copy.ts';
import styles from './StrategyView.module.css';

/**
 * The strategy view's pieces, which read nothing themselves, so the sheet can show them on
 * mock data: the team set with its labels, the running cards with their overrides, the
 * runner table, the gated and no-rule sliders, the situations drawer, the manager's card and
 * the working, failed and fallback states. Every string and number comes from copy.ts, every
 * count from card.ts; nothing here computes.
 */

export type BoardStatus =
  | { kind: 'ready' }
  | { kind: 'working'; stage: 'lineup' | 'strategy' }
  | { kind: 'failed'; stage: 'lineup' | 'strategy'; message: string; onRetry: () => void };

const NEUTRAL = 5;

/** The strategy panel with its toolbar, the drawer and the manager's card, closed by default. */
export function StrategyBoard({
  card,
  status,
  clubhouse,
  onDownload,
  downloaded,
}: {
  card: BoardCard | null;
  status: BoardStatus;
  /** The Clubhouse tab's route, where the league files and the splits are uploaded. */
  clubhouse: string;
  onDownload: (card: BoardCard) => void;
  /** The status line after a download, or null. */
  downloaded: string | null;
}) {
  const id = useId();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cardOpen, setCardOpen] = useState(false);
  const drawerId = `${id}-drawer`;
  const cardId = `${id}-card`;
  const ready = card !== null && status.kind === 'ready';
  return (
    <div className={styles.board}>
      <div className={styles.toolbar}>
        <Button
          variant="outline"
          aria-expanded={drawerOpen}
          aria-controls={drawerId}
          disabled={!ready}
          onClick={() => {
            setDrawerOpen((open) => !open);
          }}
        >
          {drawerOpen ? DRAWER_CLOSE : DRAWER_OPEN}
        </Button>
        <Button
          variant="primary"
          aria-expanded={cardOpen}
          aria-controls={cardId}
          disabled={!ready}
          onClick={() => {
            setCardOpen((open) => !open);
          }}
        >
          {CARD_BUTTON}
        </Button>
      </div>
      <Panel title={PANEL_TITLE}>
        {ready ? <TeamSet card={card} clubhouse={clubhouse} /> : <Status status={status} />}
      </Panel>
      {ready && drawerOpen ? <SituationsDrawer id={drawerId} card={card} /> : null}
      {ready && cardOpen ? (
        <ManagersCard id={cardId} card={card} onDownload={onDownload} downloaded={downloaded} />
      ) : null}
    </div>
  );
}

function Panel({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section className={classes(styles.panel, className)} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.panelTitle}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Status({ status }: { status: BoardStatus }) {
  if (status.kind === 'failed') {
    return (
      <div className={styles.state}>
        <p role="alert" className={styles.error}>
          {status.stage === 'lineup' ? lineupErrorText(status.message) : errorText(status.message)}
        </p>
        <Button variant="outline" onClick={status.onRetry}>
          {TRY_AGAIN}
        </Button>
      </div>
    );
  }
  const stage = status.kind === 'working' ? status.stage : 'strategy';
  return (
    <p role="status" aria-live="polite" className={styles.working}>
      {stage === 'lineup' ? WORKING_LINEUP : WORKING_STRATEGY}
    </p>
  );
}

/** One of the four labels, as a chip: the treatment comes from the label, never a colour alone. */
function Label({ label }: { label: StrategyLabel }) {
  return (
    <span className={styles.label} data-label={label}>
      {LABEL_TEXT[label]}
    </span>
  );
}

function Legend() {
  return (
    <ul className={styles.legend} aria-label="The four labels">
      {LABELS.map((label) => (
        <li key={label} className={styles.legendItem}>
          <Label label={label} />
          <span>{LABEL_LEGEND[label]}</span>
        </li>
      ))}
    </ul>
  );
}

/** The 0–10 bar with the tick at 5; muted for a slider without a rule. */
function Bar({ value, muted = false }: { value: number; muted?: boolean }) {
  return (
    <div className={styles.bar} data-muted={muted} aria-hidden="true">
      <div className={styles.barFill} style={{ width: `${String(value * 10)}%` }} />
      <div className={styles.barTick} />
    </div>
  );
}

function TeamSet({ card, clubhouse }: { card: BoardCard; clubhouse: string }) {
  const { differing } = differingCells(card);
  const byId = new Map(card.sliders.map((entry) => [entry.slider, entry]));
  const changes =
    card.leftHanders.kind === 'changes'
      ? new Map(card.leftHanders.changes.map((entry) => [entry.slider, entry]))
      : new Map<SliderId, StrategySetting>();
  const noSplits = card.leftHanders.kind === 'missing' && card.leftHanders.reason === 'no-splits';
  return (
    <>
      <Legend />
      {card.running.stealing.calibrated ? null : (
        <p className={styles.callout}>
          {CALLOUT_TEXT} <Link to={clubhouse}>{CALLOUT_LINK}</Link>.
        </p>
      )}
      <div className={styles.banner}>
        <p className={styles.bannerText}>{scopeText(card.lineup)}</p>
        <p className={styles.bannerLine}>{situationsText(differing, situationCount(card))}</p>
      </div>
      <div className={styles.cards}>
        <RunningCard card={card} slider="stealing" />
        <RunningCard card={card} slider="baserunning" />
      </div>
      <RunnerTable card={card} />
      <h3 className={styles.subtitle}>{GATED_TITLE}</h3>
      <ul className={styles.gated} aria-label={GATED_TITLE}>
        {GATED.flatMap((slider) => {
          const entry = byId.get(slider);
          return entry
            ? [<GatedRow key={slider} entry={entry} change={changes.get(slider)} />]
            : [];
        })}
      </ul>
      <LeftHanders card={card} clubhouse={clubhouse} />
      <h3 className={styles.subtitle}>{NO_RULE_TITLE}</h3>
      <ul className={styles.noRule} aria-label={NO_RULE_TITLE}>
        {NO_RULE.flatMap((slider) => {
          const entry = byId.get(slider);
          return entry
            ? [
                <li key={slider} className={styles.noRuleRow}>
                  <span className={styles.rowName}>{sliderName(slider)}</span>
                  <span className={classes(styles.value, styles.valueMuted)}>
                    {whole(entry.value)}
                  </span>
                  <Label label={entry.label} />
                  <span className={styles.unlock}>{unlockNote(slider, noSplits)}</span>
                </li>,
              ]
            : [];
        })}
      </ul>
    </>
  );
}

/** The Stealing or Baserunning card: the team value, its reason and the Player Strategy overrides. */
function RunningCard({ card, slider }: { card: BoardCard; slider: RunningSliderId }) {
  const titleId = useId();
  const running: RunningSlider = card.running[slider];
  const rated = ratedCount(card);
  const borderline = borderlineWithout(card, slider);
  const noRule = running.label === 'no rule yet';
  const ratingsOf = (name: string): RunnerRatings | null =>
    card.runners.find((runner) => runner.name === name)?.ratings ?? null;
  const why = (name: string) => (running.calibrated ? null : overrideWhy(ratingsOf(name)));
  return (
    <article className={styles.card} aria-labelledby={titleId}>
      <div className={styles.cardHead}>
        <div className={styles.cardName}>
          <h3 id={titleId} className={styles.cardTitle}>
            {sliderName(slider)}
          </h3>
          <Label label={running.label} />
        </div>
        <span className={styles.team}>
          <span className={styles.teamWord}>{TEAM_WORD}</span>
          <span className={classes(styles.teamValue, noRule && styles.valueMuted)}>
            {whole(running.value)}
          </span>
        </span>
      </div>
      <Bar value={running.value} muted={noRule} />
      <p className={styles.subline}>
        {noRule
          ? NO_RULE_SUBLINE
          : running.calibrated
            ? subline(slider, running.value, rated, running.overrides.length)
            : fallbackSubline(running.value)}
      </p>
      <p className={styles.reason}>{running.reason}</p>
      {noRule ? (
        <p className={styles.unlock}>{BASERUNNING_UNLOCK}</p>
      ) : (
        <div className={styles.box}>
          <span className={styles.boxTitle}>{overridesTitle(running.overrides.length)}</span>
          {running.overrides.length > 0 ? (
            <ul className={styles.overrides} aria-label={overridesTitle(running.overrides.length)}>
              {running.overrides.map((override) => {
                const detail = why(override.name);
                return (
                  <li key={override.name} className={styles.override}>
                    <span>{surname(override.name)}</span>{' '}
                    <span className={styles.overrideValue}>{whole(override.value)}</span>
                    {detail === null ? null : (
                      <span className={styles.overrideWhy}> · {detail}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {borderline.length > 0 ? (
            <Footer text={borderlineFooter(running.value, borderline)} />
          ) : null}
        </div>
      )}
    </article>
  );
}

/** "◆ Borderline (stays at …): …", the ◆ Borderline in gold. */
function Footer({ text }: { text: string }) {
  const mark = LABEL_TEXT.borderline;
  return (
    <p className={styles.footer}>
      <span className={styles.gold}>{mark}</span>
      {text.slice(mark.length)}
    </p>
  );
}

function RunnerTable({ card }: { card: BoardCard }) {
  return (
    <details className={styles.details}>
      <summary className={styles.summary}>
        {RUNNERS_SUMMARY} <span className={styles.summaryMeta}>{runnersCaption(card)}</span>
      </summary>
      <div className={styles.tableWrap} role="region" aria-label={RUNNERS_SUMMARY} tabIndex={0}>
        <table className={styles.table}>
          <caption className="sr-only">{runnersCaption(card)}</caption>
          <thead>
            <tr>
              <th scope="col">{RUNNER_COLUMNS.runner}</th>
              <th scope="col" className={classes(styles.num, styles.wide)}>
                {RUNNER_COLUMNS.record}
              </th>
              <th scope="col" className={classes(styles.num, styles.wide)}>
                {RUNNER_COLUMNS.phat}
              </th>
              <th scope="col" className={styles.num}>
                {RUNNER_COLUMNS.steal}
              </th>
              <th scope="col" className={classes(styles.num, styles.wide)}>
                {RUNNER_COLUMNS.ubr}
              </th>
              <th scope="col" className={styles.num}>
                {RUNNER_COLUMNS.base}
              </th>
              <th scope="col" className={styles.wide}>
                {RUNNER_COLUMNS.reads}
              </th>
            </tr>
          </thead>
          <tbody>
            {card.runners.map((runner) => (
              <RunnerRow key={runner.name} runner={runner} />
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.muted}>{RUNNERS_NOTE}</p>
    </details>
  );
}

function RunnerRow({ runner }: { runner: RunnerEntry }) {
  const read = runnerRead(runner);
  const stealing = runner.stealing;
  const baserunning = runner.baserunning;
  return (
    <tr>
      <th scope="row" className={styles.runner}>
        <span className={styles.runnerName}>{runner.name}</span>
        {runner.ratings === null ? null : (
          <span className={styles.ratings}>{ratingsText(runner.ratings)}</span>
        )}
      </th>
      {read.kind === 'unrated' ? (
        <td colSpan={6} className={styles.muted}>
          {read.reason}
        </td>
      ) : (
        <>
          <td className={classes(styles.num, styles.wide)}>{recordText(runner.record)}</td>
          <td className={classes(styles.num, styles.wide)}>
            {stealing?.read == null ? NO_READ : phat(stealing.read)}
          </td>
          <td className={styles.num} data-override={stealing?.override === true}>
            {stealing?.value == null ? NO_READ : whole(stealing.value)}
          </td>
          <td className={classes(styles.num, styles.wide)}>
            {baserunning?.read == null ? NO_READ : ubr(baserunning.read)}
          </td>
          <td className={styles.num} data-override={baserunning?.override === true}>
            {baserunning?.value == null ? NO_READ : whole(baserunning.value)}
          </td>
          <td
            className={classes(styles.wide, styles.reads)}
            data-override={read.kind === 'override'}
          >
            {readsAs(read)}
          </td>
        </>
      )}
    </tr>
  );
}

function GatedRow({
  entry,
  change,
}: {
  entry: StrategySetting;
  change: StrategySetting | undefined;
}) {
  return (
    <li className={styles.gatedRow}>
      <div className={styles.rowHead}>
        <div className={styles.cardName}>
          <span className={styles.rowName}>{sliderName(entry.slider)}</span>
          <Label label={entry.label} />
          {change === undefined ? null : <span className={styles.pill}>{lhpPill(change)}</span>}
        </div>
        <span className={styles.value}>{whole(entry.value)}</span>
      </div>
      <Bar value={entry.value} />
      <p className={styles.reason}>{entry.reason}</p>
    </li>
  );
}

function LeftHanders({ card, clubhouse }: { card: BoardCard; clubhouse: string }) {
  const note = card.leftHanders;
  if (note.kind === 'missing' && note.reason === 'no-splits') {
    return (
      <p className={styles.notice}>
        <span>{NO_SPLITS_TEXT}</span>{' '}
        <Link to={clubhouse} state={{ split: 'L' } satisfies ClubhouseState}>
          {SPLITS_LINK}
        </Link>
        .
      </p>
    );
  }
  return <p className={note.kind === 'missing' ? styles.notice : styles.muted}>{note.message}</p>;
}

/** The 3 × 4 grid of one slider, the bands as a switcher on a narrow panel. */
function SituationsDrawer({ id, card }: { id: string; card: BoardCard }) {
  const selectId = useId();
  const [slider, setSlider] = useState<SliderId>(SLIDERS[0]);
  const [band, setBand] = useState<InningBand | null>(null);
  const grid = card.grid.find((entry) => entry.slider === slider);
  const team = card.sliders.find((entry) => entry.slider === slider)?.value ?? NEUTRAL;
  const bands = [...new Set(grid?.cells.map((cell) => cell.band) ?? [])];
  const states = [...new Set(grid?.cells.map((cell) => cell.state) ?? [])];
  const active = band ?? bands[0] ?? null;
  const cellOf = (b: InningBand, state: string) =>
    grid?.cells.find((cell) => cell.band === b && cell.state === state);
  return (
    <section id={id} className={styles.drawer} aria-label={SELECT_LABEL}>
      <div className={styles.drawerHead}>
        <label htmlFor={selectId} className={styles.selectLabel}>
          {SELECT_LABEL}
        </label>
        <select
          id={selectId}
          className={styles.select}
          value={slider}
          onChange={(event) => {
            setSlider(event.target.value as SliderId);
          }}
        >
          {SLIDERS.map((option) => (
            <option key={option} value={option}>
              {sliderName(option)}
            </option>
          ))}
        </select>
      </div>
      <p className={styles.muted}>{GRID_NOTE}</p>
      <div className={styles.bands} role="tablist" aria-label={BANDS_LEGEND}>
        {bands.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={option === active}
            className={styles.bandTab}
            onClick={() => {
              setBand(option);
            }}
          >
            {BAND_NAMES[option]}
          </button>
        ))}
      </div>
      <div role="table" aria-label={`${sliderName(slider)} by situation`} className={styles.grid}>
        <div role="rowgroup">
          <div role="row" className={styles.gridRow}>
            <div role="columnheader" className={styles.gridHead}>
              {SCORE_COLUMN}
            </div>
            {bands.map((option) => (
              <div
                key={option}
                role="columnheader"
                className={classes(styles.gridHead, styles.bandCol)}
                data-active={option === active}
              >
                {BAND_NAMES[option]}
              </div>
            ))}
            <div role="columnheader" className={styles.gridHead}>
              {TEAM_WORD}
            </div>
          </div>
        </div>
        <div role="rowgroup">
          {states.map((state) => (
            <div key={state} role="row" className={styles.gridRow}>
              <div role="rowheader" className={styles.gridLabel}>
                {STATE_NAMES[state]}
              </div>
              {bands.map((option) => {
                const cell = cellOf(option, state);
                const value = cell?.value ?? team;
                return (
                  <div
                    key={option}
                    role="cell"
                    className={classes(styles.cell, styles.bandCol)}
                    data-band={option}
                    data-active={option === active}
                    data-differs={value !== team}
                  >
                    {whole(value)}
                  </div>
                );
              })}
              <div role="cell" className={classes(styles.cell, styles.teamCell)}>
                {whole(team)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** The manager's card: Part 1 in OOTP's Team Strategy order, Part 2 by player. */
function ManagersCard({
  id,
  card,
  onDownload,
  downloaded,
}: {
  id: string;
  card: BoardCard;
  onDownload: (card: BoardCard) => void;
  downloaded: string | null;
}) {
  const headingId = useId();
  const borderline = part2BorderlineText(part2Borderline(card));
  return (
    <section id={id} className={classes(styles.panel, styles.managers)} aria-labelledby={headingId}>
      <div className={styles.managersHead}>
        <div>
          <h2 id={headingId} className={styles.panelTitle}>
            {cardHeading(card.snapshot)}
          </h2>
          <p className={styles.lead}>{CARD_LEDE}</p>
        </div>
        <div className={styles.downloadRow}>
          <Button
            variant="outline"
            onClick={() => {
              onDownload(card);
            }}
          >
            {DOWNLOAD}
          </Button>
          {downloaded === null ? null : (
            <span className={styles.muted} role="status">
              {downloaded}
            </span>
          )}
        </div>
      </div>
      <h3 className={styles.subtitle}>{PART1_TITLE}</h3>
      <p className={styles.muted}>{PART1_NOTE}</p>
      <div className={styles.tableWrap} role="region" aria-label={PART1_TITLE} tabIndex={0}>
        <table className={styles.table} aria-label={PART1_TITLE}>
          <thead>
            <tr>
              <th scope="col">{PART1_COLUMNS.slider}</th>
              <th scope="col" className={styles.num}>
                {PART1_COLUMNS.value}
              </th>
              <th scope="col">{PART1_COLUMNS.label}</th>
              <th scope="col" className={styles.wide}>
                {PART1_COLUMNS.reason}
              </th>
            </tr>
          </thead>
          <tbody>
            {teamRows(card).map((entry) => (
              <tr key={entry.slider}>
                <th scope="row">{sliderName(entry.slider)}</th>
                <td className={styles.num} data-set={entry.value !== NEUTRAL}>
                  {whole(entry.value)}
                </td>
                <td>
                  <Label label={entry.label} />
                </td>
                <td className={classes(styles.wide, styles.reasonCell)}>{entry.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.notice}>{card.leftHanders.message}</p>
      <h3 className={styles.subtitle}>{PART2_TITLE}</h3>
      <p className={styles.muted}>{PART2_NOTE}</p>
      <div className={styles.tableWrap} role="region" aria-label={PART2_TITLE} tabIndex={0}>
        <table className={styles.table} aria-label={PART2_TITLE}>
          <thead>
            <tr>
              <th scope="col">{PART2_COLUMNS.player}</th>
              <th scope="col" className={styles.num}>
                {PART2_COLUMNS.stealing}
              </th>
              <th scope="col" className={styles.num}>
                {PART2_COLUMNS.baserunning}
              </th>
            </tr>
          </thead>
          <tbody>
            {playerRows(card).map((row) => (
              <tr key={row.name}>
                <th scope="row">{row.name}</th>
                <td className={styles.num} data-set={row.stealing !== null}>
                  {row.stealing === null ? NO_READ : whole(row.stealing)}
                </td>
                <td className={styles.num} data-set={row.baserunning !== null}>
                  {row.baserunning === null ? NO_READ : whole(row.baserunning)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {borderline === null ? null : <p className={styles.muted}>{borderline}</p>}
    </section>
  );
}
