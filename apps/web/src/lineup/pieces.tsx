import type {
  CardBench,
  CardOrder,
  CardSlot,
  CardViewKind,
  HandView,
  LineupSlot,
  SeasonView,
  Split,
} from '@ootp/core';
import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';

import type { ClubhouseState } from '../clubhouse/Clubhouse.tsx';
import { classes } from '../ui/classes.ts';
import { Button, Choices, Locked } from '../ui/primitives.tsx';
import {
  BOOK_SUMMARY,
  CHANGED,
  ESTIMATE_LEGEND,
  LEAGUE_SETTINGS_NOTE,
  LOCK_LINK,
  LOCK_TITLE,
  NOBODY_TEXT,
  NO_DH_TEXT,
  NO_NINE_TEXT,
  SELECTOR_LEGEND,
  TRY_AGAIN,
  VIEW_KINDS,
  VIEW_LABELS,
  WORKING_TEXT,
  backupText,
  band,
  bookText,
  errorText,
  exchangeText,
  handGainText,
  handStatus,
  lockTarget,
  lockText,
  orderMeta,
  percent,
  ratingText,
  runs,
  seasonGainText,
  slotMark,
  sourcesText,
  spotMark,
  startsText,
  surname,
  whole,
  woba,
  type BoardCard,
} from './copy.ts';
import styles from './LineupCard.module.css';

/**
 * The Lineup card's pieces, which read nothing themselves, so the sheet can show them on mock
 * data: the Season / vs RHP / vs LHP selector, the Dugout's alignment and batting order for one
 * view, the bench, where the numbers come from, and the locked, notice, working and failed
 * states. Every number comes formatted from copy.ts; nothing here computes.
 */

export type BoardStatus =
  | { kind: 'ready' }
  | { kind: 'working' }
  | { kind: 'failed'; message: string; onRetry: () => void };

/** The field cards' places on the diamond, as the Dugout board draws them. */
const PLACES: Partial<Record<LineupSlot, CSSProperties>> = {
  C: { left: '50%', top: '92.5%' },
  '1B': { left: '70%', top: '66%' },
  '2B': { left: '62%', top: '52%' },
  '3B': { left: '30%', top: '66%' },
  SS: { left: '38%', top: '52%' },
  LF: { left: '20%', top: '39%' },
  CF: { left: '50%', top: '21%' },
  RF: { left: '80%', top: '39%' },
  DH: { left: '13%', top: '92.5%' },
  C2: { left: '87%', top: '92.5%' },
};

/** Scorebook order, the backup last: the grid's order on a narrow panel. */
const SCOREBOOK: readonly LineupSlot[] = [
  'C',
  '1B',
  '2B',
  '3B',
  'SS',
  'LF',
  'CF',
  'RF',
  'DH',
  'C2',
];

const HAND_SHORT: Record<Split, string> = { L: 'LHP', R: 'RHP' };

type View = SeasonView | HandView;

/**
 * The selector and, for the chosen view, the alignment, the order, the bench and the notes.
 * Season is the default and the state is local: a new snapshot mounts a new board.
 */
export function LineupBoard({
  card,
  status,
  clubhouse,
}: {
  card: BoardCard | null;
  status: BoardStatus;
  /** The Clubhouse tab's route, where the splits are uploaded. */
  clubhouse: string;
}) {
  const id = useId();
  const [view, setView] = useState<CardViewKind>('season');
  const hand: Split | null = view === 'season' ? null : view;
  const options = VIEW_KINDS.map((kind) => ({
    value: kind,
    label:
      kind === 'season' || card === null ? (
        VIEW_LABELS[kind]
      ) : (
        <>
          {VIEW_LABELS[kind]}{' '}
          <span className={styles.optionStatus}>{handStatus(card.hands, kind)}</span>
        </>
      ),
  }));
  return (
    <div className={styles.board}>
      <div className={styles.selector}>
        <Choices
          legend={SELECTOR_LEGEND}
          name={`${id}-view`}
          options={options}
          value={view}
          onChange={setView}
        />
      </div>
      {card && hand && card.startsVsLeft ? (
        <p className={styles.note}>{startsText(card.startsVsLeft)}</p>
      ) : null}
      {card && hand && card.hands.kind === 'views' && card.platoon === 'settings' ? (
        <p className={styles.note}>{LEAGUE_SETTINGS_NOTE}</p>
      ) : null}
      <Body card={card} status={status} hand={hand} clubhouse={clubhouse} />
    </div>
  );
}

function Body({
  card,
  status,
  hand,
  clubhouse,
}: {
  card: BoardCard | null;
  status: BoardStatus;
  hand: Split | null;
  clubhouse: string;
}) {
  if (status.kind === 'failed') {
    return (
      <Frames>
        <p role="alert" className={styles.error}>
          {errorText(status.message)}
        </p>
        <Button variant="outline" onClick={status.onRetry}>
          {TRY_AGAIN}
        </Button>
      </Frames>
    );
  }
  if (status.kind === 'working' || card === null) {
    return (
      <Frames>
        <p role="status" aria-live="polite" className={styles.working}>
          {WORKING_TEXT}
        </p>
      </Frames>
    );
  }
  if (hand === null) {
    return <ViewPanels card={card} view={card.season} clubhouse={clubhouse} />;
  }
  switch (card.hands.kind) {
    case 'views':
      return <ViewPanels card={card} view={card.hands[hand]} clubhouse={clubhouse} />;
    case 'locked':
      return (
        <Locked
          title={LOCK_TITLE}
          unlocks={
            <>
              {lockText(card.inputs.team)}{' '}
              <Link
                to={clubhouse}
                state={{ split: lockTarget(card.inputs.team) } satisfies ClubhouseState}
              >
                {LOCK_LINK}
              </Link>
              .
            </>
          }
        />
      );
    case 'no-season-loop':
      return (
        <Frames>
          <p className={styles.notice}>
            {card.hands.reason === 'no-dh' ? NO_DH_TEXT : NO_NINE_TEXT}
          </p>
        </Frames>
      );
  }
}

/** The two panels' frames, with something in the first: the card frame shows at once. */
function Frames({ children }: { children: ReactNode }) {
  return (
    <div className={styles.panels}>
      <PanelFrame title="Defensive alignment">{children}</PanelFrame>
      <PanelFrame title="Batting order" />
    </div>
  );
}

function PanelFrame({
  title,
  meta,
  className,
  children,
}: {
  title: string;
  meta?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const titleId = useId();
  return (
    <section className={classes(styles.panel, className)} aria-labelledby={titleId}>
      <div className={styles.panelHead}>
        <h2 id={titleId} className={styles.panelTitle}>
          {title}
        </h2>
        {meta === undefined ? null : <p className={styles.panelMeta}>{meta}</p>}
      </div>
      {children}
    </section>
  );
}

function ViewPanels({ card, view, clubhouse }: { card: BoardCard; view: View; clubhouse: string }) {
  const hand = view.kind === 'season' ? null : view.hand;
  return (
    <>
      {view.kind !== 'season' ? (
        <p className={styles.gain}>{handGainText(view, card.bars)}</p>
      ) : null}
      <div className={styles.panels}>
        <AlignmentPanel card={card} view={view} />
        <OrderPanel card={card} view={view} />
      </div>
      <div className={styles.panels}>
        <BenchPanel view={view} hand={hand} />
        <PanelFrame title="Where the numbers come from" className={styles.sources}>
          <p className={styles.muted}>{sourcesText(card)}</p>
          {view.kind === 'season' && view.exchanges.length > 0 ? (
            <>
              <h3 className={styles.subtitle}>Exchanges the loop took</h3>
              <ol className={styles.list}>
                {view.exchanges.map((exchange, index) => (
                  <li key={`${String(index)}:${exchange.slot}`}>{exchangeText(exchange)}</li>
                ))}
              </ol>
            </>
          ) : null}
          {card.notes.length > 0 ? (
            <ul className={styles.list}>
              {card.notes.map((note) => (
                <li key={`${note.code}:${note.name ?? ''}`}>{note.message}</li>
              ))}
            </ul>
          ) : null}
          {card.hands.kind === 'locked' && hand === null ? (
            <p className={styles.muted}>
              {lockText(card.inputs.team)}{' '}
              <Link
                to={clubhouse}
                state={{ split: lockTarget(card.inputs.team) } satisfies ClubhouseState}
              >
                {LOCK_LINK}
              </Link>
              .
            </p>
          ) : null}
        </PanelFrame>
      </div>
    </>
  );
}

const slotAt = (view: View, slot: LineupSlot) =>
  view.slots.find((candidate) => candidate.slot === slot);

function AlignmentPanel({ card, view }: { card: BoardCard; view: View }) {
  const season = view.kind === 'season';
  return (
    <PanelFrame
      title="Defensive alignment"
      meta={`Ratings on your league’s ${card.team.rating_scale.replace('-', '–')} scale`}
      className={styles.alignment}
    >
      <div className={styles.fieldWrap}>
        <div className={styles.field}>
          <Diamond />
          {SCOREBOOK.flatMap((slot) => {
            const entry = slotAt(view, slot);
            return entry ? [<SlotCard key={slot} slot={entry} season={season} />] : [];
          })}
        </div>
      </div>
      <p className={styles.legend}>{ESTIMATE_LEGEND}</p>
    </PanelFrame>
  );
}

/** The diamond, from the Dugout board, on the tokens. */
function Diamond() {
  return (
    <svg
      className={styles.diamond}
      viewBox="0 0 800 640"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M400 600 L40 240 A424 424 0 0 1 760 240 Z" className={styles.grass} />
      <path d="M40 240 A424 424 0 0 1 760 240" className={styles.warningTrack} />
      <path d="M400 600 L170 370 A242 242 0 0 1 630 370 Z" className={styles.dirt} />
      <path d="M400 307 L530 437 L400 567 L270 437 Z" className={styles.grass} />
      <circle cx="400" cy="445" r="20" className={styles.dirt} />
      <circle cx="400" cy="594" r="34" className={styles.dirt} />
      <path d="M40 240 L400 600 L760 240" className={styles.foulLine} />
      <path d="M563 429 L571 437 L563 445 L555 437 Z" className={styles.base} />
      <path d="M400 267 L408 275 L400 283 L392 275 Z" className={styles.base} />
      <path d="M237 429 L245 437 L237 445 L229 437 Z" className={styles.base} />
      <path d="M391 593 L409 593 L409 600 L400 607 L391 600 Z" className={styles.base} />
    </svg>
  );
}

const POSITION_LABEL: Record<LineupSlot, string> = {
  C: 'C',
  '1B': '1B',
  '2B': '2B',
  '3B': '3B',
  SS: 'SS',
  LF: 'LF',
  CF: 'CF',
  RF: 'RF',
  DH: 'DH',
  C2: 'Backup C',
};

/** One slot of the alignment: a card on the diamond, dashed gold when nobody is eligible. */
function SlotCard({ slot, season }: { slot: CardSlot; season: boolean }) {
  const empty = slot.name === null;
  const mark = slotMark(slot);
  const ratingLine = ratingText(slot);
  const cost = season && slot.alternativeCost !== null ? runs(-slot.alternativeCost) : null;
  return (
    <article
      className={styles.slot}
      style={PLACES[slot.slot]}
      data-empty={empty}
      data-changed={slot.changed}
      aria-label={`${POSITION_LABEL[slot.slot]}: ${slot.name ?? NOBODY_TEXT}`}
    >
      <span className={styles.slotHead}>
        <span className={styles.slotPosition}>{POSITION_LABEL[slot.slot]}</span>
        <span className={styles.slotName}>
          {slot.name === null ? NOBODY_TEXT : surname(slot.name)}
        </span>
        {slot.changed ? <span className={styles.chip}>{CHANGED}</span> : null}
      </span>
      {empty ? (
        slot.slot === 'C2' ? (
          <span className={styles.slotLine}>{backupText(slot)}</span>
        ) : (
          slot.reasons.map((reason) => (
            <span key={reason} className={styles.slotReason}>
              {reason}.
            </span>
          ))
        )
      ) : (
        <>
          {slot.slot === 'C2' ? (
            <span className={styles.slotLine}>{backupText(slot)}</span>
          ) : slot.slot === 'C' ? (
            <span className={styles.slotLine}>{percent(slot.share)} of games</span>
          ) : null}
          <span className={styles.slotLine}>
            Bat {runs(slot.battingRuns)} {band(slot.battingBand) ?? ''} · Fld{' '}
            {runs(slot.fieldingRuns)}
          </span>
          <span className={styles.slotLine}>
            Total {runs(slot.value)}
            {cost === null ? '' : ` · Alt ${cost}`}
          </span>
          {ratingLine === null ? null : <span className={styles.slotLine}>{ratingLine}</span>}
          {mark === null ? null : <span className={styles.slotMark}>{mark}</span>}
        </>
      )}
    </article>
  );
}

function OrderPanel({ card, view }: { card: BoardCard; view: View }) {
  const { order } = view;
  const hand = view.kind === 'season' ? null : view.hand;
  const noOrder =
    card.hands.kind === 'no-season-loop' && card.hands.reason === 'no-dh'
      ? NO_DH_TEXT
      : NO_NINE_TEXT;
  return (
    <PanelFrame
      title="Batting order"
      meta={order ? orderMeta(order) : undefined}
      className={styles.orderPanel}
    >
      {view.kind === 'season' && view.gain ? (
        <>
          <p className={styles.gain}>{seasonGainText(view.gain, card.bars)}</p>
          <details className={styles.book}>
            <summary>{BOOK_SUMMARY}</summary>
            <p className={styles.muted}>{bookText(view.gain.book)}</p>
          </details>
        </>
      ) : null}
      {order ? (
        <OrderTable order={order} view={view} hand={hand} />
      ) : (
        <p className={styles.notice}>{noOrder}</p>
      )}
    </PanelFrame>
  );
}

function OrderTable({ order, view, hand }: { order: CardOrder; view: View; hand: Split | null }) {
  return (
    <div
      className={styles.tableWrap}
      role="region"
      aria-label="Batting order, by spot"
      tabIndex={0}
    >
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Batter</th>
            <th scope="col">Pos</th>
            <th scope="col">B</th>
            <th scope="col" className={styles.num}>
              PA
            </th>
            <th scope="col" className={styles.num}>
              wOBA
            </th>
            <th scope="col" className={styles.num}>
              Bat ±
            </th>
            {hand === null ? null : (
              <>
                <th scope="col" className={styles.num}>
                  Own split
                </th>
                <th scope="col" className={styles.num}>
                  PA vs {HAND_SHORT[hand]}
                </th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {order.spots.map((spot) => {
            const slot = slotAt(view, spot.slot);
            const moved = spotMark(spot);
            const changed = slot ? slotMark(slot) : null;
            return (
              <tr key={spot.name}>
                <td className={styles.num}>{spot.spot}</td>
                <th scope="row" className={styles.batter}>
                  <span className={styles.batterName}>{spot.name}</span>
                  {slot?.changed ? <span className={styles.chip}>{CHANGED}</span> : null}
                  {changed === null ? null : <span className={styles.rowMark}>{changed}</span>}
                  {moved === null ? null : <span className={styles.rowMark}>{moved}</span>}
                </th>
                <td className={styles.mono}>{spot.slot === 'C2' ? 'C' : spot.slot}</td>
                <td className={styles.mono}>{spot.bats ?? '–'}</td>
                <td className={styles.num}>{whole(spot.pa)}</td>
                <td className={styles.num}>{woba(spot.wOBA)}</td>
                <td className={styles.num}>
                  {runs(spot.battingRuns)} {band(spot.battingBand) ?? ''}
                </td>
                {hand === null ? null : (
                  <>
                    <td className={styles.num}>
                      {spot.weight === null ? '–' : percent(spot.weight)}
                    </td>
                    <td className={styles.num}>{spot.paVs === null ? '–' : whole(spot.paVs)}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BenchPanel({ view, hand }: { view: View; hand: Split | null }) {
  const season = view.kind === 'season';
  return (
    <PanelFrame title="Bench" className={styles.bench}>
      {view.bench.length === 0 ? (
        <p className={styles.muted}>Everyone plays.</p>
      ) : (
        <ul className={styles.benchList}>
          {view.bench.map((entry) => (
            <BenchRow key={entry.name} entry={entry} season={season} hand={hand} />
          ))}
        </ul>
      )}
    </PanelFrame>
  );
}

function BenchRow({
  entry,
  season,
  hand,
}: {
  entry: CardBench;
  season: boolean;
  hand: Split | null;
}) {
  const facts = [
    entry.bats ?? '–',
    entry.wOBA === null ? 'no estimate' : `wOBA ${woba(entry.wOBA)}`,
    ...(season
      ? [
          `Bat ${runs(entry.battingRuns)} ${band(entry.battingBand) ?? ''}`.trim(),
          entry.bestSlot === null || entry.bestValue === null
            ? 'eligible nowhere'
            : `best at ${POSITION_LABEL[entry.bestSlot]} ${runs(entry.bestValue)}`,
        ]
      : []),
    ...(hand === null
      ? []
      : [
          `own split ${entry.weight === null ? '–' : percent(entry.weight)}`,
          `${entry.paVs === null ? '–' : whole(entry.paVs)} PA vs ${HAND_SHORT[hand]}`,
        ]),
  ];
  return (
    <li className={styles.benchRow}>
      <span className={styles.benchName}>{entry.name}</span>
      <span className={styles.benchFacts}>{facts.join(' · ')}</span>
    </li>
  );
}
