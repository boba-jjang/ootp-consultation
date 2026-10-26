import { useState } from 'react';

import { useLineupCard } from '../lineup/query.ts';
import { useShell } from '../shell/context.ts';
import { modulePath } from '../shell/modules.ts';
import { download } from '../ui/download.ts';
import { cardFileName, managersCardText } from './card.ts';
import { HEADING, downloadedText, lede, type BoardCard } from './copy.ts';
import { StrategyBoard, type BoardStatus } from './pieces.tsx';
import { useStrategyCard } from './query.ts';
import styles from './StrategyView.module.css';

/**
 * Bullpen & tactics: the strategy view, the week's team set from the strategy rules engine,
 * worked out in a Web Worker from the Dugout's cached lineup card. The module's Gate has let
 * it through, so the hitters' stats and ratings are on file; what the models still lack shows
 * as a state inside the screen.
 */
export function StrategyView() {
  const { team, snapshotId, snapshot } = useShell();
  const lineup = useLineupCard(snapshot, snapshotId, team);
  const strategy = useStrategyCard(snapshot, snapshotId, team, lineup.data);
  const [downloaded, setDownloaded] = useState<string | null>(null);
  const status: BoardStatus = strategy.data
    ? { kind: 'ready' }
    : lineup.isError && !lineup.isFetching
      ? {
          kind: 'failed',
          stage: 'lineup',
          message: lineup.error.message,
          onRetry: () => {
            void lineup.refetch();
          },
        }
      : strategy.isError && !strategy.isFetching
        ? {
            kind: 'failed',
            stage: 'strategy',
            message: strategy.error.message,
            onRetry: () => {
              void strategy.refetch();
            },
          }
        : { kind: 'working', stage: lineup.data ? 'strategy' : 'lineup' };
  const save = (card: BoardCard) => {
    const name = cardFileName(team.name, card.snapshot);
    download(
      new TextEncoder().encode(managersCardText(card, team.name)),
      name,
      'text/plain;charset=utf-8',
    );
    setDownloaded(downloadedText(name));
  };
  return (
    <main id="main" className={styles.main}>
      <div className={styles.intro}>
        <h1 className={styles.title}>{HEADING}</h1>
        <p className={styles.lead}>{lede(snapshot.label)}</p>
      </div>
      <StrategyBoard
        card={strategy.data ?? null}
        status={status}
        clubhouse={modulePath(team.id, snapshotId, 'clubhouse')}
        onDownload={save}
        downloaded={downloaded}
      />
    </main>
  );
}
