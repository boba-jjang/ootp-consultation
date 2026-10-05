import { expect, test } from '@playwright/test';

import { expectAccessible, expectTargets } from './checks.ts';

test.describe('the component sheet', () => {
  test('shows every primitive and passes the accessibility checks', async ({ page }) => {
    await page.goto('/sheet');
    await expect(page.getByRole('heading', { level: 1, name: 'Component sheet' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create team' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Setup steps' })).toBeVisible();
    await expectAccessible(page);
    await expectTargets(page);
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
    // GitHub itself is out of reach here: the authorize request gets a stub page instead.
    await page.route('**/auth/v1/authorize**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<title>GitHub stub</title>' }),
    );
    await page.goto('/t/abc/settings?tab=x');
    await expect(page).toHaveURL(/\/sign-in$/);
    const button = page.getByRole('button', { name: 'Sign in with GitHub' });
    test.skip(!(await button.isVisible()), 'needs Supabase settings in .env.local');
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
