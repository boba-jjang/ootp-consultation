import { expect, test } from '@playwright/test';

import { expectAccessible, expectNoSideScroll, expectTargets } from './checks.ts';
import { supabaseEnv } from './env.ts';

test.describe('the component sheet', () => {
  test('shows every primitive and passes the accessibility checks', async ({ page }) => {
    await page.goto('/sheet');
    await expect(page.getByRole('heading', { level: 1, name: 'Component sheet' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create team' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Setup steps' })).toBeVisible();
    await expectAccessible(page);
    await expectTargets(page);
    await expectNoSideScroll(page);
  });

  test('shows the app shell, with a team menu the keyboard can work', async ({ page }) => {
    await page.goto('/sheet');
    await expect(page.getByRole('navigation', { name: 'Modules' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Dev lab (locked)' })).toBeVisible();
    const trigger = page.getByRole('button', { name: 'Seattle Arrows RSL' });
    await trigger.click();
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Seattle Arrows RSL' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Portland Pines RSL' })).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.getByRole('menuitem', { name: 'Sign out' })).toBeFocused();
    await expectAccessible(page);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await page.keyboard.press('ArrowUp');
    await expect(page.getByRole('menuitem', { name: 'Team settings' })).toBeFocused();
    await page.keyboard.press(' ');
    await expect(page).not.toHaveURL(/\/sheet$/);
  });
});

test.describe('updating exports, on the sheet', () => {
  test('Best first upload lists the stats views without the bio view', async ({ page }) => {
    await page.goto('/sheet');
    // The sheet nests each panel in a section of its own; the innermost is the panel.
    const best = page
      .locator('section', {
        has: page.getByRole('heading', { name: 'Best first upload', exact: true }),
      })
      .last();
    await expect(best.getByText('batting_stats_1', { exact: true })).toBeVisible();
    await expect(best.getByText('default', { exact: true })).toHaveCount(0);
  });

  test('a stored file asks before it is removed, and the pieces pass the checks', async ({
    page,
  }) => {
    await page.goto('/sheet');
    const log = page
      .locator('section', {
        has: page.getByRole('heading', { name: 'Import log', exact: true }),
      })
      .last();
    const file = 'seattle_arrows_lineups_-_overview_default.csv';
    await log.getByRole('button', { name: `Remove ${file}`, exact: true }).click();
    await expect(log.getByText('Remove this file from the snapshot?')).toBeVisible();
    await expect(log.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await expect(log.getByRole('alert')).toHaveText(
      'This file is batting_stats_1, not pitching_superstats_2.',
    );
    await expectAccessible(page);
    await expectTargets(page);
    await log.getByRole('button', { name: 'Cancel' }).click();
    await expect(log.getByRole('button', { name: `Remove ${file}`, exact: true })).toBeVisible();
  });
});

test.describe('sign-in', () => {
  test('is where a visitor without a session lands', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expectAccessible(page);
    await expectTargets(page);
  });

  test('offers GitHub when the build has Supabase settings', async ({ page }) => {
    await page.goto('/sign-in');
    const button = page.getByRole('button', { name: 'Sign in with GitHub' });
    const unconfigured = page.getByRole('alert');
    await expect(button.or(unconfigured)).toBeVisible();
  });

  test('remembers where sign-in started, survives Back from GitHub, forgets on return', async ({
    page,
  }) => {
    test.skip(!supabaseEnv(), 'needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY');
    // GitHub itself is out of reach here: the authorize request gets a stub page instead.
    await page.route('**/auth/v1/authorize**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<title>GitHub stub</title>' }),
    );
    await page.goto('/t/abc/settings?tab=x');
    await expect(page).toHaveURL(/\/sign-in$/);
    const button = page.getByRole('button', { name: 'Sign in with GitHub' });
    // The sign-in screen renders just after the URL changes, so wait for the button.
    await expect(button).toBeVisible();
    await button.click();
    await expect(page).toHaveTitle('GitHub stub');
    await page.goBack();
    await expect(button).toBeEnabled();
    expect(await page.evaluate(() => sessionStorage.getItem('ootp.return-to'))).toBe(
      '/t/abc/settings?tab=x',
    );
    await page.goto('/');
    await expect(page).toHaveURL(/\/sign-in$/);
    expect(await page.evaluate(() => sessionStorage.getItem('ootp.return-to'))).toBeNull();
  });
});

test.describe('not found', () => {
  test('names the path and offers a way back', async ({ page }) => {
    await page.goto('/nothing-here');
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
    await expect(page.getByText('/nothing-here')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Go to your teams' })).toBeVisible();
    await expectAccessible(page);
  });
});
