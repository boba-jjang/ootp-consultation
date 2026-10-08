import type { ComponentProps, ReactNode } from 'react';

import { buttonClass, classes, type ButtonVariant } from './classes.ts';
import { CheckIcon, LockIcon } from './icons.tsx';
import styles from './primitives.module.css';

/**
 * The design system's building blocks, from docs/design-handoff.md: variants are explicit,
 * values come from tokens, and every control is at least 44 px tall.
 */

/** Primary is the one gold action on a screen; outline and accent are quieter; ghost and link are inline. */
export type { ButtonVariant };

export function Button({
  variant = 'outline',
  className,
  type = 'button',
  ...props
}: ComponentProps<'button'> & { variant?: ButtonVariant }) {
  return <button type={type} className={buttonClass(variant, className)} {...props} />;
}

/** A link that looks like a button; the router's Link replaces the anchor where it applies. */
export function LinkButton({
  variant = 'outline',
  className,
  ...props
}: ComponentProps<'a'> & { variant?: ButtonVariant }) {
  return <a className={buttonClass(variant, className)} {...props} />;
}

/** A view or file name, in the mono face. */
export function Chip({ children }: { children: ReactNode }) {
  return <span className={styles.chip}>{children}</span>;
}

/** A labeled value, such as "Team column: Seattle". */
export function Badge({ label, value }: { label: ReactNode; value?: ReactNode }) {
  return (
    <span className={styles.badge}>
      {label}
      {value === undefined ? null : <span className={styles.badgeValue}>{value}</span>}
    </span>
  );
}

/** The league code next to a team name. */
export function LeagueTag({ children }: { children: ReactNode }) {
  return <span className={styles.leagueTag}>{children}</span>;
}

/** Emerald ▲ or crimson ▼, always with the arrow, so color never carries the meaning alone. */
export function Trend({
  direction,
  size,
  children,
}: {
  direction: 'up' | 'down';
  size?: 'small';
  children: ReactNode;
}) {
  const tone =
    direction === 'up'
      ? styles.trendUp
      : size === 'small'
        ? styles.trendDownSmall
        : styles.trendDown;
  return (
    <span className={classes(styles.trend, tone)}>
      <span aria-hidden="true">{direction === 'up' ? '▲' : '▼'}</span>
      <span className="sr-only">{direction === 'up' ? 'up' : 'down'}</span>
      {children}
    </span>
  );
}

export type CoverageLevel = 'low' | 'moderate' | 'high';

const COVERAGE_LABEL: Record<CoverageLevel, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
};
const COVERAGE_LIT: Record<CoverageLevel, number> = { low: 1, moderate: 2, high: 3 };
const COVERAGE_CLASS: Record<CoverageLevel, string | undefined> = {
  low: styles.coverageLow,
  moderate: styles.coverageModerate,
  high: styles.coverageHigh,
};

/** The data-coverage badge: three bars and a word. Not the estimate confidence band. */
export function CoverageBadge({
  level,
  prefix = 'Coverage',
}: {
  level: CoverageLevel;
  prefix?: string;
}) {
  return (
    <span className={classes(styles.coverage, COVERAGE_CLASS[level])}>
      {prefix}
      <span className={styles.coverageBars} aria-hidden="true">
        {[1, 2, 3].map((bar) => (
          <span key={bar} className={styles.coverageBar} data-lit={bar <= COVERAGE_LIT[level]} />
        ))}
      </span>
      <span className={styles.coverageLabel}>{COVERAGE_LABEL[level]}</span>
    </span>
  );
}

/** The three data layers as labeled bars: lit when that layer is on file. */
export function CoverageLayers({
  stats,
  superstats,
  ratings,
}: {
  stats: boolean;
  superstats: boolean;
  ratings: boolean;
}) {
  const layers: [string, boolean][] = [
    ['Stats', stats],
    ['Superstats', superstats],
    ['Ratings', ratings],
  ];
  const level: CoverageLevel = ratings ? 'high' : superstats ? 'moderate' : 'low';
  return (
    <div className={styles.layers}>
      {layers.map(([label, lit]) => (
        <div key={label} className={styles.layer} data-lit={lit} data-level={level}>
          <span className={styles.layerBar} aria-hidden="true" />
          <span>
            {label}
            <span className="sr-only">{lit ? ', on file' : ', missing'}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** One cell of a coverage matrix: on file, partly (some of its columns), or empty. */
export type MatrixState = 'on' | 'partial' | 'empty';

const MATRIX_WORDS: Record<MatrixState, string> = {
  on: 'on file',
  partial: 'partly on file',
  empty: 'empty',
};

export function MatrixCell({ label, state }: { label: string; state: MatrixState }) {
  return (
    <span className={styles.matrixCell}>
      <span className={styles.matrixSwatch} data-state={state} aria-hidden="true" />
      <span className="sr-only">
        {label}, {MATRIX_WORDS[state]}
      </span>
    </span>
  );
}

export function Panel({
  title,
  meta,
  children,
  className,
  ...props
}: ComponentProps<'section'> & { title: ReactNode; meta?: ReactNode }) {
  return (
    <section className={classes(styles.panel, className)} {...props}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>{title}</h2>
        {meta === undefined ? null : <p className={styles.panelMeta}>{meta}</p>}
      </div>
      {children}
    </section>
  );
}

export function Card({ children, className, ...props }: ComponentProps<'article'>) {
  return (
    <article className={classes(styles.card, className)} {...props}>
      {children}
    </article>
  );
}

/** The setup flow's step indicator. */
export function Steps({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <nav aria-label="Setup steps">
      <ol className={styles.steps}>
        {steps.map((label, index) => {
          const state = index < current ? 'done' : index === current ? 'current' : 'todo';
          return (
            <li
              key={label}
              className={styles.step}
              data-state={state}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              {index > 0 ? <span className={styles.stepConnector} aria-hidden="true" /> : null}
              <span className={styles.stepNumber}>
                {state === 'done' ? <CheckIcon size={14} /> : index + 1}
              </span>
              <span>{label}</span>
              {state === 'done' ? <span className="sr-only">, done</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** A module that can't run yet: it stays visible, with a lock, and names what unlocks it. */
export function Locked({ title, unlocks }: { title: ReactNode; unlocks: ReactNode }) {
  return (
    <div className={styles.locked} role="note">
      <div className={styles.lockedPlaceholder} aria-hidden="true">
        <span className={styles.lockedBar} style={{ width: '70%' }} />
        <span className={styles.lockedBar} data-accent="true" style={{ width: '50%' }} />
        <span className={styles.lockedBar} style={{ width: '85%' }} />
      </div>
      <div className={styles.lockedCard}>
        <p className={styles.lockedTitle}>
          <LockIcon />
          {title}
        </p>
        <p className={styles.lockedText}>{unlocks}</p>
      </div>
    </div>
  );
}

export function Field({
  id,
  label,
  help,
  error,
  font,
  className,
  ...input
}: ComponentProps<'input'> & {
  id: string;
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  font?: 'mono';
}) {
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;
  const describedBy =
    [help ? helpId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        className={classes(styles.input, className)}
        data-mono={font === 'mono'}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        {...input}
      />
      {help ? (
        <span id={helpId} className={styles.help}>
          {help}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className={styles.error} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/** Radio pills: one choice of a few, shown side by side. */
export function Choices<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  help,
  font,
}: {
  legend: ReactNode;
  name: string;
  options: readonly { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  help?: ReactNode;
  font?: 'mono';
}) {
  const helpId = `${name}-help`;
  return (
    <fieldset className={styles.field} aria-describedby={help ? helpId : undefined}>
      <legend className={styles.label}>{legend}</legend>
      <div className={styles.choices}>
        {options.map((option) => (
          <label key={option.value} className={styles.choice} data-mono={font === 'mono'}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => {
                onChange(option.value);
              }}
            />
            {option.label}
          </label>
        ))}
      </div>
      {help ? (
        <span id={helpId} className={styles.help}>
          {help}
        </span>
      ) : null}
    </fieldset>
  );
}

/** The season timeline: one dot per snapshot along the games of the season. */
export function Timeline({
  games,
  snapshots,
}: {
  games: number;
  snapshots: readonly { game: number; label: string }[];
}) {
  const span = Math.max(games, 1);
  const at = (game: number) => `${(Math.min(game, span) / span) * 100}%`;
  return (
    <div className={styles.timeline}>
      <span className={styles.timelineTrack} aria-hidden="true" />
      {snapshots.map((snapshot) => (
        <span key={snapshot.game}>
          <span className={styles.timelineLabel} style={{ left: at(snapshot.game) }}>
            {snapshot.label}
          </span>
          <span
            className={styles.timelineDot}
            style={{ left: at(snapshot.game) }}
            aria-hidden="true"
          />
        </span>
      ))}
      <span className={styles.timelineTick} style={{ left: 0 }}>
        G1
      </span>
      <span className={styles.timelineTick} style={{ left: '50%', transform: 'translateX(-50%)' }}>
        G{Math.round(span / 2)}
      </span>
      <span className={styles.timelineTick} style={{ right: 0 }}>
        G{span}
      </span>
    </div>
  );
}
