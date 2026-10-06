import type { CoverageLevel } from '@ootp/core';
import { Link, useNavigate } from 'react-router';

import {
  ArrowMark,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
  SlidersIcon,
  UploadIcon,
} from '../ui/icons.tsx';
import { Menu, MenuAction, MenuGroup, MenuLink, MenuSeparator } from '../ui/menu.tsx';
import { Button, CoverageBadge, LeagueTag } from '../ui/primitives.tsx';
import { modulePath, type ModuleId } from './modules.ts';
import styles from './Shell.module.css';

export interface TeamSummary {
  id: string;
  name: string;
  league: string;
}

export interface SnapshotSummary {
  id: string;
  label: string;
}

export type AdvisorStatus = 'online' | 'offline';

/**
 * The top bar from the canvas: team menu, snapshot selector, data-coverage badge (not the
 * estimate confidence), DH and advisor status. It reads nothing itself, so the sheet can show it.
 */
export function TopBar({
  team,
  teams,
  dh,
  snapshots,
  current,
  tab,
  coverage,
  advisor,
  onSignOut,
}: {
  team: TeamSummary;
  teams: TeamSummary[];
  dh: boolean;
  /** Oldest first. */
  snapshots: SnapshotSummary[];
  current: string;
  tab: ModuleId;
  /** Null while the snapshot is still being read. */
  coverage: CoverageLevel | null;
  advisor: AdvisorStatus;
  onSignOut: () => void;
}) {
  const navigate = useNavigate();
  const index = snapshots.findIndex((snapshot) => snapshot.id === current);
  const previous = snapshots[index - 1];
  const next = snapshots[index + 1];
  const latest = snapshots.at(-1);
  const to = (snapshotId: string) => modulePath(team.id, snapshotId, tab);

  return (
    <header className={styles.topBar}>
      <div className={styles.identity}>
        <Link to="/teams" className={styles.mark} aria-label="Your teams">
          <ArrowMark />
        </Link>
        <Menu
          label={
            <>
              <span className={styles.teamName}>{team.name}</span>
              <LeagueTag>{team.league}</LeagueTag>
            </>
          }
        >
          <MenuGroup label="Your teams">
            {teams.map((other) => (
              <MenuLink
                key={other.id}
                to={`/t/${other.id}`}
                aria-current={other.id === team.id ? 'true' : undefined}
              >
                {other.name} <LeagueTag>{other.league}</LeagueTag>
              </MenuLink>
            ))}
          </MenuGroup>
          <MenuSeparator />
          <MenuLink to={modulePath(team.id, current, 'clubhouse')} state={{ addData: true }}>
            <UploadIcon /> Add or update exports
          </MenuLink>
          <MenuLink to="/teams/new">
            <PlusIcon /> Create a team
          </MenuLink>
          <MenuLink to={`/t/${team.id}/settings`}>
            <SlidersIcon /> Team settings
          </MenuLink>
          <MenuSeparator />
          <MenuAction onClick={onSignOut}>Sign out</MenuAction>
        </Menu>
      </div>
      <div className={styles.status}>
        <div className={styles.snapshot}>
          <label htmlFor="snapshot" className={styles.snapshotLabel}>
            Snapshot
          </label>
          <SnapshotStep to={previous ? to(previous.id) : null} label="Previous snapshot">
            <ChevronLeftIcon />
          </SnapshotStep>
          <select
            id="snapshot"
            className={styles.select}
            value={current}
            onChange={(event) => {
              void navigate(to(event.target.value));
            }}
          >
            {snapshots.map((snapshot) => (
              <option key={snapshot.id} value={snapshot.id}>
                {snapshot.label}
                {snapshot.id === latest?.id ? ' (latest)' : ''}
              </option>
            ))}
          </select>
          <SnapshotStep to={next ? to(next.id) : null} label="Next snapshot">
            <ChevronRightIcon />
          </SnapshotStep>
        </div>
        {coverage ? (
          <Link to={modulePath(team.id, current, 'clubhouse')} className={styles.coverageLink}>
            <CoverageBadge level={coverage} prefix="Data coverage" />
          </Link>
        ) : (
          <span className={styles.fact} role="status">
            Data coverage…
          </span>
        )}
        <span className={styles.fact}>
          DH <strong>{dh ? 'on' : 'off'}</strong>
        </span>
        <span className={styles.fact}>
          <span
            className={styles.advisorDot}
            data-online={advisor === 'online'}
            aria-hidden="true"
          />
          Advisor {advisor}
        </span>
      </div>
    </header>
  );
}

/** Previous or next: a link while there is one, a disabled button at the ends. */
function SnapshotStep({
  to,
  label,
  children,
}: {
  to: string | null;
  label: string;
  children: React.ReactNode;
}) {
  return to ? (
    <Link to={to} className={styles.step} aria-label={label}>
      {children}
    </Link>
  ) : (
    <Button variant="ghost" className={styles.step} aria-label={label} disabled>
      {children}
    </Button>
  );
}
