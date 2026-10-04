import { useState, type ReactNode } from 'react';

import { ArrowMark, DiamondMark, PlusIcon, SlidersIcon, UploadIcon } from '../ui/icons.tsx';
import {
  Badge,
  Button,
  Card,
  Chip,
  Choices,
  CoverageBadge,
  CoverageLayers,
  Field,
  LeagueTag,
  LinkButton,
  Locked,
  MatrixCell,
  Panel,
  Steps,
  Timeline,
  Trend,
} from '../ui/primitives.tsx';
import styles from './Sheet.module.css';

const SWATCHES: [string, string][] = [
  ['--color-bg', 'navy, the base'],
  ['--color-surface', 'slate, panels'],
  ['--color-surface-sunken', 'drawers, inputs, drop zones'],
  ['--color-text', 'chalk, text'],
  ['--color-text-body', 'body text on dark'],
  ['--color-text-secondary', 'secondary text'],
  ['--color-text-tertiary', 'tertiary text'],
  ['--color-accent', 'gold: actions and attention'],
  ['--color-positive', 'emerald ▲'],
  ['--color-negative', 'crimson ▼'],
  ['--color-negative-text', 'crimson for small text'],
  ['--color-on-file', '“on file” cells'],
];

const TYPE_SIZES = [10, 11, 12, 13, 14, 15, 16, 17, 19, 20, 22, 32, 36, 44];

/**
 * The component sheet: every primitive next to its token names, to check against the canvas.
 * Reachable at /sheet; nothing on it reads data.
 */
export function Sheet() {
  const [scale, setScale] = useState<'1-10' | '20-80'>('1-10');
  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <h1 className={styles.title}>Component sheet</h1>
        <p className={styles.lead}>
          The design system from <code>docs/design-handoff.md</code>, as built. Compare it with the
          canvas boards; nothing here reads data.
        </p>
      </header>

      <Section title="Colors" note="Semantic tokens over the primitives in styles/tokens.css">
        <ul className={styles.swatches}>
          {SWATCHES.map(([token, meaning]) => (
            <li key={token} className={styles.swatch}>
              <span className={styles.swatchColor} style={{ background: `var(${token})` }} />
              <code>{token}</code>
              <span className={styles.muted}>{meaning}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Type"
        note="Chakra Petch for UI text, IBM Plex Mono for numbers and file names"
      >
        <p className={styles.display}>Seattle Arrows</p>
        <p className={styles.mono}>
          <span className={styles.accent}>12</span> hitters and{' '}
          <span className={styles.accent}>13</span> pitchers, through game{' '}
          <span className={styles.accent}>42</span>.
        </p>
        <ul className={styles.sizes}>
          {TYPE_SIZES.map((size) => (
            <li key={size} style={{ fontSize: `var(--text-${size})` }}>
              <code className={styles.sizeName}>--text-{size}</code> The quick brown fox jumps over
              the lazy dog
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Buttons" note="One gold action per screen; every control is at least 44 px">
        <div className={styles.row}>
          <Button variant="primary">Create team</Button>
          <Button variant="primary" disabled>
            Continue
          </Button>
          <Button variant="secondary">Back</Button>
          <Button variant="outline">Choose files</Button>
          <Button variant="accent">Upload this view</Button>
          <Button variant="ghost">Edit</Button>
          <LinkButton variant="link" href="#top">
            Start over
          </LinkButton>
        </div>
      </Section>

      <Section title="Chips and badges">
        <div className={styles.row}>
          <Chip>batting_stats_1</Chip>
          <Chip>custom_bat_pot</Chip>
          <Badge label="Team column:" value="Seattle" />
          <Badge label="Game 42: most games played by any hitter" />
          <span className={styles.teamName}>
            Seattle Arrows <LeagueTag>RSL</LeagueTag>
          </span>
        </div>
      </Section>

      <Section
        title="Trends"
        note="Always with the arrow, so color never carries the meaning alone"
      >
        <div className={styles.row}>
          <Trend direction="up">+.018 xwOBA</Trend>
          <Trend direction="down">−0.6 ERA</Trend>
          <Trend direction="down" size="small">
            regressing
          </Trend>
        </div>
      </Section>

      <Section
        title="Data coverage"
        note="The top-bar badge: Low, Moderate, High. Not the estimate confidence band."
      >
        <div className={styles.row}>
          <CoverageBadge level="low" />
          <CoverageBadge level="moderate" />
          <CoverageBadge level="high" />
        </div>
        <div className={styles.layersRow}>
          <CoverageLayers stats superstats={false} ratings={false} />
          <CoverageLayers stats superstats ratings={false} />
          <CoverageLayers stats superstats ratings />
        </div>
      </Section>

      <Section
        title="Coverage matrix cells"
        note="A dashed gold outline means empty, upload to fill"
      >
        <div className={styles.row}>
          <MatrixCell label="Bio" on />
          <MatrixCell label="Ratings" on={false} />
        </div>
      </Section>

      <Section title="Panels and cards">
        <Panel title="Hitters on file" meta="12 players, 4 of 5 data sets">
          <Card>
            <h3 className={styles.cardTitle}>Hitter ratings and potentials</h3>
            <p className={styles.cardText}>
              Batting stats are in for all 12 hitters, but defense and potentials are empty. This
              view unlocks the defensive alignment and the shift and steal settings.
            </p>
            <Button variant="accent">Upload this view</Button>
          </Card>
        </Panel>
      </Section>

      <Section title="Steps">
        <Steps steps={['Add exports', 'Team and league', 'Review']} current={1} />
      </Section>

      <Section title="Locked state" note="Stays visible, with a lock, and names what unlocks it">
        <Locked
          title="Dev Lab is locked"
          unlocks="Upload custom_bat_pot and cus_pitch_pot, the two ratings views, to unlock it."
        />
      </Section>

      <Section title="Fields">
        <div className={styles.fields}>
          <Field
            id="sheet-team"
            name="team"
            autoComplete="off"
            label="Team name"
            help="From your file names"
            defaultValue="Seattle Arrows"
          />
          <Field
            id="sheet-league"
            name="league"
            autoComplete="off"
            label="League"
            help="From the league column in your exports"
            defaultValue="RSL"
            font="mono"
          />
          <Field
            id="sheet-games"
            name="games"
            type="number"
            inputMode="numeric"
            min={1}
            autoComplete="off"
            label="Games per season"
            error="Use a whole number of games."
            defaultValue="161.5"
          />
        </div>
        <Choices
          legend="Rating scale your league uses"
          name="sheet-scale"
          font="mono"
          value={scale}
          onChange={setScale}
          options={[
            { value: '1-10', label: '1–10' },
            { value: '20-80', label: '20–80' },
          ]}
          help={
            scale === '20-80'
              ? 'Already on the 20–80 scale, so ratings are used as they are.'
              : 'Converted to 20–80 for analysis. The conversion is approximate.'
          }
        />
      </Section>

      <Section title="Timeline">
        <Timeline games={162} snapshots={[{ game: 42, label: 'Game 42, 16 files' }]} />
      </Section>

      <Section title="Icons" note="Decorative by default; an icon-only control names itself">
        <div className={styles.row}>
          <ArrowMark style={{ color: 'var(--color-accent)' }} />
          <DiamondMark style={{ color: 'var(--color-accent)' }} />
          <UploadIcon style={{ color: 'var(--color-text-secondary)' }} />
          <PlusIcon style={{ color: 'var(--color-accent)' }} />
          <SlidersIcon style={{ color: 'var(--color-text-secondary)' }} />
        </div>
      </Section>
    </main>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  const id = `sheet-${title.toLowerCase().replaceAll(/[^a-z]+/g, '-')}`;
  return (
    <section className={styles.section} aria-labelledby={id}>
      <div className={styles.sectionHead}>
        <h2 id={id} className={styles.sectionTitle}>
          {title}
        </h2>
        {note ? <p className={styles.muted}>{note}</p> : null}
      </div>
      {children}
    </section>
  );
}
