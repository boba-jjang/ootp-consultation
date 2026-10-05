import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

import { deleteTeamsNamed, signIn, withSession, type Session } from './auth.ts';
import { expectAccessible, expectTargets } from './checks.ts';
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
const TEAM_NAME = `${PREFIX} ${process.env.GITHUB_RUN_ID ?? 'local'}`;

/**
 * The plan's end-to-end check: Create a Team from the fixtures yields a Game 42 snapshot with
 * High coverage, and the locked states render. It needs the staging test user, so it skips
 * where that isn't set.
 */
test.describe('Create a Team from the fixtures', () => {
  test.skip(
    !env || !user,
    'needs VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, E2E_EMAIL and E2E_PASSWORD',
  );
  test.describe.configure({ mode: 'serial' });

  let session: Session | undefined;

  test.beforeAll(async () => {
    const { env, user } = required();
    session = await signIn(env, user);
    await deleteTeamsNamed(env, session, PREFIX);
  });

  test.afterAll(async () => {
    if (session) {
      await deleteTeamsNamed(required().env, session, PREFIX);
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

    const files = readdirSync(FIXTURES)
      .filter((name) => name.endsWith('.csv'))
      .map((name) => `${FIXTURES}${name}`);
    await page.locator('input[type="file"][multiple]').setInputFiles(files);
    await expect(page.getByRole('heading', { level: 2, name: 'Seattle Arrows' })).toBeVisible();
    await expect(page.getByText('11 views recognized')).toBeVisible();
    await expectAccessible(page);
    await expectTargets(page);

    await page.getByRole('button', { name: 'Continue' }).click();
    const name = page.getByLabel('Team name');
    await expect(name).toHaveValue('Seattle Arrows');
    await expect(page.getByLabel('League')).toHaveValue('RSL');
    await name.fill(TEAM_NAME);
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
    await expectAccessible(page);
    await expectTargets(page);

    await page.getByRole('link', { name: 'Dev lab (locked)' }).click();
    await expect(page.getByText('Dev lab arrives in Phase 4')).toBeVisible();
    await expectAccessible(page);
    await expectTargets(page);
  });
});
