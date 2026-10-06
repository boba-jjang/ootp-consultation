import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** No serious or critical axe violation on the page. */
export async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.length} nodes)`);
  expect(serious).toEqual([]);
}

/** Every button and button-styled link is at least 44 px on each side (the design's rule). */
export async function expectTargets(page: Page): Promise<void> {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('button, a[class*="button"]')]
      .map((element) => ({ element, box: element.getBoundingClientRect() }))
      .filter(({ box }) => box.width > 0 && (box.height < 44 || box.width < 44))
      .map(
        ({ element, box }) =>
          `${element.tagName.toLowerCase()} "${element.textContent.trim().slice(0, 40)}" ${Math.round(box.width)}×${Math.round(box.height)}`,
      ),
  );
  expect(small).toEqual([]);
}

/** Nothing makes the page scroll sideways; wide tables scroll inside their own frames. */
export async function expectNoSideScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
}
