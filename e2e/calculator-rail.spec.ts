import { test, expect, type Page } from '@playwright/test';

/**
 * The calculator side rail — a fleet-wide sentinel.
 *
 * Every calculator opts into the rail, so the things that must hold for all of
 * them are asserted here once rather than 49 times: the rail exists, it comes
 * AFTER the tool so screen readers and phones reach the calculator first, it
 * never pushes the page sideways, and the ad's place stays an empty, unstyled
 * reservation for as long as monetization is switched off.
 */
const ROUTES = [
  '/finance/mortgage-calculator',
  '/finance/credit-card-payoff-calculator',
  '/health/bmi-calculator',
  '/math/scientific-calculator',
  '/math/statistics-calculator',
  '/everyday/password-generator',
  '/everyday/grade-calculator',
];

const core = (page: Page) => page.locator('.tool-shell__core');
const rail = (page: Page) => page.locator('.tool-rail');
const slot = (page: Page) => page.locator('.tool-rail__slot');

test.describe('every calculator carries the rail', () => {
  for (const route of ROUTES) {
    test(`${route}: rail present, after the tool, no sideways scroll`, async ({ page }) => {
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.goto(route, { waitUntil: 'domcontentloaded' });

      await expect(core(page)).toHaveCount(1);
      await expect(rail(page)).toHaveCount(1);

      // The rail is a sibling that FOLLOWS the tool in the document, whatever
      // the visual arrangement — that is what puts the calculator first for a
      // screen reader and on a phone.
      const railFollowsTool = await page.evaluate(() => {
        const c = document.querySelector('.tool-shell__core')!;
        const r = document.querySelector('.tool-rail')!;
        return !!(c.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING);
      });
      expect(railFollowsTool).toBe(true);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('the rail beside the tool', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/finance/mortgage-calculator', { waitUntil: 'domcontentloaded' });
  });

  test('leaves the tool wide enough to keep its inputs beside its result', async ({ page }) => {
    const c = (await core(page).boundingBox())!;
    const r = (await rail(page).boundingBox())!;
    expect(Math.round(r.width)).toBe(300);
    expect(c.width).toBeGreaterThanOrEqual(860); // ~900 at our 1280px wrap
    expect(r.x).toBeGreaterThanOrEqual(c.x + c.width - 1); // genuinely beside, not below
  });

  test('the search box and the first related calculators land above the fold', async ({ page }) => {
    const input = page.locator('.tool-rail .calc-search__input');
    await expect(input).toBeInViewport();
    const visible = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.tool-rail__links a')).filter(
        (a) => a.getBoundingClientRect().bottom <= window.innerHeight,
      ).length,
    );
    expect(visible).toBeGreaterThanOrEqual(4);
  });

  test('the search is the shared one and really searches', async ({ page }) => {
    await page.locator('.tool-rail .calc-search__input').fill('mort');
    await expect(page.locator('.tool-rail .calc-search__panel')).toBeVisible();
    await expect(page.locator('.tool-rail .calc-search__result').first()).toContainText(/mortgage/i);
  });

  test('the related and reference links are real, plain links', async ({ page }) => {
    const links = page.locator('.tool-rail__links a');
    expect(await links.count()).toBeGreaterThan(3);
    for (const href of await links.evaluateAll((els) => els.map((e) => e.getAttribute('href')))) {
      expect(href).toMatch(/^\//); // internal, never an off-site or empty link
    }
  });
});

test.describe("the ad's place while monetization is off", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/finance/mortgage-calculator', { waitUntil: 'domcontentloaded' });
  });

  test('is reserved but completely empty — no border, no background, no label', async ({ page }) => {
    await expect(slot(page)).toHaveCount(1);
    const box = (await slot(page).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(280); // held open, so a fill cannot shift the page

    const painted = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector('.tool-rail__slot')!);
      return { borders: [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth], bg: s.backgroundImage, text: document.querySelector('.tool-rail__slot')!.textContent!.trim() };
    });
    for (const w of painted.borders) expect(w).toBe('0px');
    expect(painted.bg).toBe('none');
    expect(painted.text).toBe(''); // no "Advertisement" label, no placeholder copy
  });

  test('renders no monetization output at all', async ({ page }) => {
    await expect(page.locator('[data-mon-region]')).toHaveCount(0);
    expect(await page.content()).not.toContain('data-mon-');
  });
});

test('on a phone the rail becomes a row under the calculator', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/finance/mortgage-calculator', { waitUntil: 'domcontentloaded' });
  const c = (await core(page).boundingBox())!;
  const r = (await rail(page).boundingBox())!;
  expect(r.y).toBeGreaterThanOrEqual(c.y + c.height - 1); // under, never beside
  expect(Math.round(r.width)).toBeGreaterThan(300); // full width, not a 300px column

  // Full size where it is a touch target, not the desktop column's compact size.
  const h = (await page.locator('.tool-rail .calc-search__submit').boundingBox())!.height;
  expect(h).toBeGreaterThanOrEqual(44);
});
