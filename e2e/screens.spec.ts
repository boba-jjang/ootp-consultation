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

test.describe('What to upload next, on the sheet', () => {
  test('asks for the batting splits in a card of its own, and passes the checks', async ({
    page,
  }) => {
    await page.goto('/sheet');
    const next = page
      .locator('section', {
        has: page.getByRole('heading', { name: 'What to upload next', exact: true }),
      })
      .last();
    const card = next.getByRole('article').filter({
      has: page.getByRole('heading', { name: 'Batting splits vs left and vs right', exact: true }),
    });
    await expect(card).toBeVisible();
    await expect(
      card.getByText(
        "The lineups by the starter's hand need the team's batting stats exported vs left and vs right. The league's batting stats split the same way set the league's platoon effect; without them the settings stand in. Splits don't change Data coverage.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(card.getByText('batting_stats_1', { exact: true })).toBeVisible();
    // It comes after the coverage cards.
    await expect(next.getByRole('article').last()).toContainText(
      'Batting splits vs left and vs right',
    );
    await expect(card.getByRole('button', { name: 'Go to the split windows' })).toBeVisible();
    await expectAccessible(page);
    await expectTargets(page);
    await expectNoSideScroll(page);
  });
});

test.describe('How columns were read, on the sheet', () => {
  test('offers the custom team file after the views, with its own notes', async ({ page }) => {
    await page.goto('/sheet');
    const panel = page
      .locator('section', {
        has: page.getByRole('heading', { name: 'How columns were read', exact: true }),
      })
      .last();
    const custom = 'seattle_arrows_lineups_-_overview_batting_stats_1_cust.csv';
    const select = panel.getByRole('combobox', { name: 'View' });
    await expect(select.getByRole('option')).toHaveCount(10);
    await expect(select.getByRole('option').last()).toHaveText(custom);
    await expect(panel.getByText('Relief appearances, not runs allowed')).toBeVisible();

    await select.selectOption({ label: custom });
    await expect(panel.locator('p', { hasText: custom })).toBeVisible();
    await expect(panel.getByText('Rates sent without a leading zero (.174)')).toBeVisible();
    await expect(panel.getByText('Relief appearances, not runs allowed')).toHaveCount(0);
    await expect(panel.getByText('All 30 columns')).toBeVisible();
    await expectAccessible(page);
    await expectTargets(page);
  });
});

test.describe('the Lineup card, on the sheet', () => {
  test('shows every view, switched by keyboard, and passes the checks', async ({ page }) => {
    // Three axe passes over the whole sheet, which the strategy examples made larger.
    test.setTimeout(60_000);
    await page.goto('/sheet');
    const full = page.getByRole('region', { name: 'Game 71 with its splits', exact: true });
    await expect(
      full.getByRole('heading', { name: 'Defensive alignment', exact: true }),
    ).toBeVisible();
    await expect(full.getByRole('heading', { name: 'Batting order', exact: true })).toBeVisible();
    const choices = full.getByRole('group', { name: 'Lineup against', exact: true });
    const season = choices.getByRole('radio', { name: /^Season/ });
    await expect(season).toBeChecked();
    // Nine positions and the backup, each a card; the backup line names his share.
    await expect(full.getByRole('article')).toHaveCount(10);
    await expect(full.getByText(/^Backup C: /)).toBeVisible();
    await expect(
      full.getByText('The best order and The Book’s are equal', { exact: false }),
    ).toBeVisible();
    await expect(full.getByText('Changed', { exact: true })).toHaveCount(0);
    await expectAccessible(page);
    await expectTargets(page);
    await expectNoSideScroll(page);

    // The arrow keys move through the radio group, as a radio group does.
    await season.focus();
    await page.keyboard.press('ArrowRight');
    await expect(choices.getByRole('radio', { name: /^vs RHP/ })).toBeChecked();
    await expect(full.getByText('Against right-handed starters:', { exact: false })).toBeVisible();
    // The catchers changed: both cards and the one order row they bat in carry the chip.
    await expect(full.getByText('Changed', { exact: true })).toHaveCount(3);
    await expect(full.getByText('was Tsumoto', { exact: true }).first()).toBeVisible();
    await expect(full.getByText('New', { exact: true })).toBeVisible();
    await expect(
      full.getByText(/of the team’s starts came against left-handed starters/),
    ).toBeVisible();
    await expectAccessible(page);
    await expectNoSideScroll(page);

    await page.keyboard.press('ArrowRight');
    await expect(choices.getByRole('radio', { name: /^vs LHP/ })).toBeChecked();
    await expect(
      full.getByText('The season lineup stands against left-handed starters', { exact: false }),
    ).toBeVisible();
    await expect(full.getByText('Changed', { exact: true })).toHaveCount(0);

    // The hand views locked on one split, the no-DH notice, the short lineup, loading and an error.
    const locked = page.getByRole('region', { name: 'Hands locked', exact: true });
    await locked.getByRole('radio', { name: /^vs RHP/ }).check();
    await expect(locked.getByText('Lineups by the starter’s hand are locked')).toBeVisible();
    await expect(
      locked.getByText(
        'The team’s batting stats are on file vs left only. Upload the vs-right export to unlock them.',
      ),
    ).toBeVisible();
    await expect(locked.getByRole('link', { name: 'Add batting splits' })).toBeVisible();
    const noDh = page.getByRole('region', { name: 'No DH', exact: true });
    await expect(
      noDh.getByText('Batting orders without the DH aren’t covered yet', { exact: false }),
    ).toBeVisible();
    await expect(noDh.getByRole('radio', { name: /^vs RHP/ })).toHaveAccessibleName(/no DH/);
    const short = page.getByRole('region', { name: 'A short lineup', exact: true });
    await expect(short.getByText('Nobody eligible', { exact: true })).toBeVisible();
    await expect(
      short.getByText("HT is missing, so 1B can't be estimated.", { exact: true }),
    ).toBeVisible();
    await expect(
      short.getByText('No batting order without a full nine.', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Working', exact: true }).getByRole('status'),
    ).toHaveText('Working out the lineup…');
    const failed = page.getByRole('region', { name: 'Failed', exact: true });
    await expect(
      failed.getByText('The lineup couldn’t be worked out:', { exact: false }),
    ).toBeVisible();
    await expect(failed.getByRole('button', { name: 'Try again' })).toBeVisible();
    await expectAccessible(page);
    await expectTargets(page);
    await expectNoSideScroll(page);
  });
});

test.describe('the strategy view, on the sheet', () => {
  test('shows the team set, the drawer and the manager’s card, and passes the checks', async ({
    page,
  }) => {
    // Two axe passes over the whole sheet: the team set, then the drawer and the card open.
    test.setTimeout(90_000);
    await page.goto('/sheet');
    const full = page.getByRole('region', { name: 'Strategy at Game 71', exact: true });
    await expect(
      full.getByRole('heading', { name: 'Team strategy for the week', exact: true }),
    ).toBeVisible();
    await expect(full.getByText('One set for the week', { exact: false })).toBeVisible();
    await expect(full.getByText(/^All 12 situations match/)).toBeVisible();

    // The two running cards, five override chips each, and the borderline runners in the footers.
    const stealing = full.getByRole('article', { name: 'Stealing', exact: true });
    const baserunning = full.getByRole('article', { name: 'Baserunning', exact: true });
    await expect(stealing).toBeVisible();
    await expect(baserunning).toBeVisible();
    const overrides = full.getByRole('list', { name: /^Player Strategy overrides/ });
    await expect(overrides).toHaveCount(2);
    await expect(overrides.getByRole('listitem')).toHaveCount(10);
    await expect(stealing.getByRole('listitem').first()).toHaveText(/^Geng\s*10$/);
    await expect(baserunning.getByRole('listitem').first()).toHaveText(/^Obata\s*10$/);
    const footers = full.getByText(/^◆ Borderline \(stays at the team’s \d+\):/);
    await expect(footers).toHaveCount(2);
    await expect(footers.nth(0)).toContainText('Kamimura (1.93)');
    await expect(footers.nth(1)).toContainText('Ishida (0.45), Shinn (0.08) and Kawasaki (3.52)');

    // Five gated rows with two vs LHP pills, and four rows without a rule.
    const gated = full.getByRole('list', { name: 'Gated on the week’s lineup', exact: true });
    await expect(gated.getByRole('listitem')).toHaveCount(5);
    await expect(gated.getByText(/^vs LHP: /)).toHaveCount(2);
    await expect(gated.getByText('vs LHP: 8 (research rule)', { exact: true })).toBeVisible();
    await expect(gated.getByText('vs LHP: 5 (borderline)', { exact: true })).toBeVisible();
    const noRule = full.getByRole('list', { name: 'At neutral (5), no rule yet', exact: true });
    await expect(noRule.getByRole('listitem')).toHaveCount(4);
    await expect(full.getByText(/[▲▼]/)).toHaveCount(0);
    await expectAccessible(page);
    await expectTargets(page);
    await expectNoSideScroll(page);

    // The situations drawer opens from the keyboard: a select over the sliders and the 3 × 4 grid.
    const drawerButton = full.getByRole('button', { name: 'By situation (3 × 4)', exact: true });
    await expect(drawerButton).toHaveAttribute('aria-expanded', 'false');
    await drawerButton.focus();
    await page.keyboard.press('Enter');
    // The same button, renamed once the drawer is open.
    const hideButton = full.getByRole('button', { name: 'Hide the situations', exact: true });
    await expect(hideButton).toHaveAttribute('aria-expanded', 'true');
    await expect(hideButton).toBeFocused();
    const drawer = full.getByRole('region', { name: 'By situation', exact: true });
    await expect(drawer.getByRole('combobox', { name: 'By situation', exact: true })).toHaveValue(
      'stealing',
    );
    await expect(drawer.locator('[role="cell"][data-band]')).toHaveCount(12);
    await expect(drawer.getByText(/^Grey cells match the slider’s team value/)).toBeVisible();
    await drawer
      .getByRole('combobox', { name: 'By situation', exact: true })
      .selectOption('baserunning');
    await expect(drawer.locator('[role="cell"][data-band]').first()).toHaveText('2');

    // The manager's card opens the same way: eleven Team Strategy rows, six players, a download.
    const cardButton = full.getByRole('button', { name: 'Manager’s card', exact: true });
    await expect(cardButton).toHaveAttribute('aria-expanded', 'false');
    await cardButton.focus();
    await page.keyboard.press('Enter');
    await expect(cardButton).toHaveAttribute('aria-expanded', 'true');
    const card = full.getByRole('region', { name: 'Manager’s card · Game 71', exact: true });
    await expect(card).toBeVisible();
    await expect(
      card.getByRole('table', { name: 'Part 1 · Team Strategy', exact: true }).locator('tbody tr'),
    ).toHaveCount(11);
    await expect(
      card
        .getByRole('table', { name: 'Part 2 · Player Strategy', exact: true })
        .locator('tbody tr'),
    ).toHaveCount(6);
    await expect(card.getByText(/^Borderline, no override: Kamimura \(stealing\)/)).toBeVisible();
    await expect(
      card.getByRole('button', { name: 'Download the card', exact: true }),
    ).toBeVisible();
    await expect(card.getByRole('button', { name: /Mark as applied/ })).toHaveCount(0);
    await expectAccessible(page);
    await expectTargets(page);
    await expectNoSideScroll(page);
  });

  test('shows the fallback without the league’s running columns, and the other states', async ({
    page,
  }) => {
    await page.goto('/sheet');
    const fallback = page.getByRole('region', { name: 'Strategy at Game 53', exact: true });
    await expect(
      fallback.getByText('The league files on this snapshot carry no running columns.', {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      fallback.getByRole('link', { name: 'League files in the Clubhouse', exact: true }),
    ).toBeVisible();
    const stealing = fallback.getByRole('article', { name: 'Stealing', exact: true });
    await expect(stealing.getByRole('listitem')).toHaveCount(1);
    await expect(stealing.getByRole('listitem')).toHaveText(
      /^Yamanaka\s*0\s*·\s*steal rate 9, speed 2$/,
    );
    await expect(stealing.getByText(/^◆ Borderline \(stays at the team’s 2\):/)).toContainText(
      'steal rate',
    );
    const baserunning = fallback.getByRole('article', { name: 'Baserunning', exact: true });
    await expect(baserunning.getByText('No rule yet', { exact: true })).toBeVisible();
    await expect(
      baserunning.getByText('Stays at OOTP’s 5 for every hitter. No overrides.', { exact: true }),
    ).toBeVisible();
    await expect(
      fallback.getByText(
        'The batting splits are missing, so there is no left-handers’ lineup to read.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      fallback.getByRole('link', { name: 'Add batting splits', exact: true }),
    ).toBeVisible();

    await expect(
      page.getByRole('region', { name: 'Strategy working', exact: true }).getByRole('status'),
    ).toHaveText('Working out the strategy…');
    const failed = page.getByRole('region', { name: 'Strategy failed', exact: true });
    await expect(failed.getByRole('alert')).toHaveText(
      'The strategy couldn’t be worked out: the worker stopped',
    );
    await expect(failed.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
    await expectAccessible(page);
    await expectTargets(page);
    await expectNoSideScroll(page);
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
