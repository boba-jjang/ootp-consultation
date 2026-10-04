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
