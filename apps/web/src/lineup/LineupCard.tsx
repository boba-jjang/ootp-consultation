import { useShell } from '../shell/context.ts';
import { modulePath } from '../shell/modules.ts';
import { HEADING, lede } from './copy.ts';
import styles from './LineupCard.module.css';
import { LineupBoard, type BoardStatus } from './pieces.tsx';
import { useLineupCard } from './query.ts';

/**
 * The Lineup card: the Dugout's defensive alignment and batting order for the snapshot, worked
 * out in a Web Worker, with the Season / vs RHP / vs LHP selector. The module's Gate has let it
 * through, so the hitters' stats and ratings are on file; what the models still lack shows as
 * a state inside the screen.
 */
export function LineupCard() {
  const { team, snapshotId, snapshot } = useShell();
  const query = useLineupCard(snapshot, snapshotId, team);
  const status: BoardStatus = query.data
    ? { kind: 'ready' }
    : query.isError && !query.isFetching
      ? {
          kind: 'failed',
          message: query.error.message,
          onRetry: () => {
            void query.refetch();
          },
        }
      : { kind: 'working' };
  return (
    <main id="main" className={styles.main}>
      <div className={styles.intro}>
        <h1 className={styles.title}>{HEADING}</h1>
        <p className={styles.lead}>{lede(snapshot.label)}</p>
      </div>
      <LineupBoard
        card={query.data ?? null}
        status={status}
        clubhouse={modulePath(team.id, snapshotId, 'clubhouse')}
      />
    </main>
  );
}
