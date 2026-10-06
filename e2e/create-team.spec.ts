import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test, type Locator, type Page } from '@playwright/test';

import { deleteStaleTeams, deleteTeamNamed, signIn, withSession, type Session } from './auth.ts';
import { expectAccessible, expectNoSideScroll, expectTargets } from './checks.ts';
import { supabaseEnv, testUser } from './env.ts';

const env = supabaseEnv();
const user = testUser();
/** The settings, once the describe has decided not to skip. */
const settings = env && user ? { env, user } : null;
const required = () => {
  if (!settings) {
    throw new Error('the signed-in tests need the staging settings');
  }
  return settings;
};
const FIXTURES = fileURLToPath(new URL('../fixtures/seattle-g42/', import.meta.url));
const PREFIX = 'E2E Seattle Arrows';
/** One team per run and project: the desktop and phone projects run at the same time. */
const teamName = () =>
  `${PREFIX} ${process.env.GITHUB_RUN_ID ?? 'local'} ${test.info().project.name}`;
/** The second team, set up without files. */
const blankName = () => `${teamName()} blank`;

/** The 16 Seattle game-42 files, as paths. */
const allFiles = () =>
  readdirSync(FIXTURES)
    .filter((name) => name.endsWith('.csv'))
    .map((name) => `${FIXTURES}${name}`);

const STAFF_RATINGS = 'seattle_arrows_lineups_-_overview_cus_pitch_pot.csv';

/** Opens the file picker from a button and chooses files in it. */
async function chooseFiles(page: Page, button: Locator, paths: string[]) {
  const chooser = page.waitForEvent('filechooser');
  await button.click();
  await (await chooser).setFiles(paths);
}

/**
 * The plan's end-to-end check: Create a Team from the fixtures yields a Game 42 snapshot with
 * High coverage, and the locked states render. It needs the staging test user, so it skips
 * where that isn't set. Each project makes its own team and deletes only that one.
 */
test.describe('Create a Team from the fixtures', () => {
  test.skip(
    !settings,
    'needs VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, E2E_EMAIL and E2E_PASSWORD',
  );
  test.describe.configure({ mode: 'serial' });

  let session: Session | undefined;
  /** The created team's Clubhouse, for the tests that follow. */
  let clubhouse: string | undefined;

  test.beforeAll(async () => {
    const { env: staging, user: tester } = required();
    session = await signIn(staging, tester);
    await deleteTeamNamed(staging, session, teamName());
    await deleteTeamNamed(staging, session, blankName());
    await deleteStaleTeams(staging, session, PREFIX);
  });

  test.afterAll(async () => {
    if (session) {
      await deleteTeamNamed(required().env, session, teamName());
      await deleteTeamNamed(required().env, session, blankName());
    }
  });

  test('yields a Game 42 snapshot with High coverage, and locked tabs that say so', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    if (!session) {
      throw new Error('beforeAll did not sign in');
    }
    await withSession(page, required().env, session);
    await page.goto('/teams/new');
    await expect(page.getByRole('heading', { level: 1, name: 'Create a team' })).toBeVisible();

    await page.locator('input[type="file"][multiple]').setInputFiles(allFiles());
    await expect(page.getByRole('heading', { level: 2, name: 'Seattle Arrows' })).toBeVisible();
    await expect(page.getByText('11 views recognized')).toBeVisible();
    await expectAccessible(page);
    await expectTargets(page);
    await expectNoSideScroll(page);

    await page.getByRole('button', { name: 'Continue' }).click();
    const name = page.getByLabel('Team name');
    await expect(name).toHaveValue('Seattle Arrows');
    await expect(page.getByLabel('League')).toHaveValue('RSL');
    await expect(page.getByLabel('Dev Lab slots')).toHaveCount(0);
    await expect(
      page.getByRole('group', { name: 'Batting and pitching ratings your league shows' }),
    ).toHaveCount(0);
    await name.fill(teamName());
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Review and create' })).toBeVisible();
    await expect(page.getByText('11 views, 25 players')).toBeVisible();
    await expect(page.getByText('Coverage is High')).toBeVisible();
    await page.getByRole('button', { name: 'Create team' }).click();

    await expect(page).toHaveURL(/\/t\/[0-9a-f-]+\/s\/[0-9a-f-]+\/clubhouse$/, {
      timeout: 90_000,
    });
    await expect(page.getByRole('heading', { level: 1, name: 'The Clubhouse' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Data coverage.*High/ })).toBeVisible();
    await expect(page.getByText('12 players, 5 of 5 data sets')).toBeVisible();
    await expect(page.getByText('13 players, 4 of 5 data sets')).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Snapshot' })).toHaveValue(/./);
    clubhouse = page.url();
    await expectAccessible(page);
    await expectTargets(page);
    await expectNoSideScroll(page);

    await page.getByRole('link', { name: 'Dev lab (locked)' }).click();
    await expect(page.getByText('Dev lab arrives in Phase 4')).toBeVisible();
    await expectAccessible(page);
    await expectTargets(page);
  });

  test('updates the team’s exports file by file in the Clubhouse', async ({ page }) => {
    test.setTimeout(180_000);
    if (!session || !clubhouse) {
      throw new Error('the first test did not create the team');
    }
    await withSession(page, required().env, session);
    await page.goto(clubhouse);
    await expect(page.getByRole('heading', { level: 1, name: 'The Clubhouse' })).toBeVisible();
    const log = page
      .locator('section', {
        has: page.getByRole('heading', { name: 'Import log', exact: true }),
      })
      .last();

    // Removing the staff ratings view asks first, then drops the badge to Moderate.
    await log.getByRole('button', { name: `Remove ${STAFF_RATINGS}`, exact: true }).click();
    await expect(log.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await log.getByRole('button', { name: `Yes, remove ${STAFF_RATINGS}`, exact: true }).click();
    await expect(page.getByRole('link', { name: /Data coverage.*Moderate/ })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('13 players, 3 of 5 data sets')).toBeVisible();

    // Adding it back with Add data brings High back.
    await chooseFiles(page, page.getByRole('button', { name: 'Choose files' }), [
      `${FIXTURES}${STAFF_RATINGS}`,
    ]);
    await expect(page.getByText('added as cus_pitch_pot', { exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole('link', { name: /Data coverage.*High/ })).toBeVisible();

    // A replacement has to be the same view: anything else is refused, and nothing changes.
    await chooseFiles(
      page,
      log.getByRole('button', { name: `Replace ${STAFF_RATINGS}`, exact: true }),
      [`${FIXTURES}seattle_arrows_lineups_-_overview_batting_stats_1.csv`],
    );
    await expect(log.getByRole('alert')).toHaveText(
      'This file is batting_stats_1, not cus_pitch_pot.',
    );

    // Everything again: every file is already on file.
    await chooseFiles(page, page.getByRole('button', { name: 'Choose files' }), allFiles());
    await expect(page.getByText('16 files read.', { exact: true })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText('already on file', { exact: true })).toHaveCount(16);
    await expectAccessible(page);
    await expectTargets(page);
    await expectNoSideScroll(page);

    // From another tab, the team menu leads back to Add data.
    await page.getByRole('link', { name: 'Talent radar (locked)' }).click();
    await page.getByRole('button', { name: teamName() }).click();
    await page.getByRole('menuitem', { name: 'Add or update exports' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'The Clubhouse' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Choose files' })).toBeFocused();
  });

  test('takes the first exports of a team set up without files', async ({ page }) => {
    test.setTimeout(120_000);
    if (!session) {
      throw new Error('beforeAll did not sign in');
    }
    await withSession(page, required().env, session);
    await page.goto('/teams/new');
    await page.getByRole('button', { name: 'Set up without files' }).click();
    await page.getByLabel('Team name').fill(blankName());
    await page.getByLabel('League').fill('RSL');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('button', { name: 'Create team' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'No snapshot yet' })).toBeVisible({
      timeout: 30_000,
    });
    await expectAccessible(page);
    await expectTargets(page);
    await expectNoSideScroll(page);
    await chooseFiles(page, page.getByRole('button', { name: 'Choose files' }), allFiles());
    await expect(page).toHaveURL(/\/clubhouse$/, { timeout: 90_000 });
    await expect(page.getByText('16 files read. Started the Game 42 snapshot.')).toBeVisible();
    await expect(page.getByRole('link', { name: /Data coverage.*High/ })).toBeVisible();
  });
});
