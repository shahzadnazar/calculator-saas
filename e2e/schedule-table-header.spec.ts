import { test, expect } from '@playwright/test';

/**
 * Sticky schedule headers stay opaque and stay on top.
 *
 * Ten calculators print a long schedule inside a fixed-height scroller under a
 * `position: sticky` header row. Each island used to carry its own copy of that header's
 * CSS and seven of the copies had drifted to `background: var(--surface)`, a property the
 * project never defined — so the declaration was invalid at computed-value time, the
 * header painted transparent, and on a phone the rows scrolled straight through the
 * column names. The treatment now lives once, in `.calc-schedule-table` in global.css.
 *
 * Two properties are checked because either one alone leaves the header unreadable:
 * the background, and a `z-index`. Table cells paint in document order, so a sticky `th`
 * left at `z-index: auto` is painted BEFORE every tbody cell and ends up underneath them
 * even when it does have a background of its own.
 */

const SCHEDULES = [
  ['/finance/amortization-calculator', '.am-table'],
  ['/finance/auto-loan-calculator', '.al-table'],
  ['/finance/home-equity-loan-calculator', '.he-table'],
  ['/finance/interest-calculator', '.int-table'],
  ['/finance/investment-calculator', '.inv-table'],
  ['/finance/loan-calculator', '.loan-table'],
  ['/finance/mortgage-calculator', '.mc-table'],
  ['/finance/payment-calculator', '.pay-table'],
  ['/finance/savings-calculator', '.sv-table'],
  ['/finance/simple-interest-calculator', '.si-table'],
] as const;

const TRANSPARENT = 'rgba(0, 0, 0, 0)';

test.describe('scrollable schedule tables', () => {
  for (const [route, table] of SCHEDULES) {
    test(`${route} — the sticky header is opaque and above the rows`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(route, { waitUntil: 'domcontentloaded' });

      const header = page.locator(`${table} thead th`).first();
      await expect(header).toHaveCount(1);

      const style = await header.evaluate((th) => {
        const cs = getComputedStyle(th);
        return { background: cs.backgroundColor, position: cs.position, zIndex: cs.zIndex };
      });

      expect(style.position).toBe('sticky');
      expect(style.background).not.toBe(TRANSPARENT);
      expect(Number(style.zIndex)).toBeGreaterThan(0);
    });

    test(`${route} — opts into the shared treatment rather than its own copy`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page.locator(`${table}.calc-schedule-table`)).toHaveCount(1);
    });
  }

  test('every schedule header resolves to the same treatment', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const seen = new Set<string>();
    for (const [route, table] of SCHEDULES) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      seen.add(
        await page.locator(`${table} thead th`).first().evaluate((th) => {
          const cs = getComputedStyle(th);
          return [cs.backgroundColor, cs.color, cs.fontWeight, cs.zIndex].join(' | ');
        }),
      );
    }
    // One definition, one result — the drift that caused the bug cannot recur quietly.
    expect([...seen]).toHaveLength(1);
  });
});

/**
 * The dynamic-row family's column headings must not print on top of each other.
 *
 * GPA and Grade lay their rows out with `table-layout: fixed`: the three trailing columns
 * are sized in rem and the name column takes whatever is left. Both headers also carried
 * `white-space: nowrap`, so on a phone — where "whatever is left" is about 100px — the
 * first heading simply overflowed its cell and painted over the next one.
 */
const DYNAMIC_ROWS = [
  ['/everyday/gpa-calculator', '.gpa-input-table'],
  ['/everyday/grade-calculator', '.grade-input-table'],
] as const;

test.describe('dynamic-row column headings', () => {
  for (const [route, table] of DYNAMIC_ROWS) {
    for (const width of [320, 360, 390, 414]) {
      test(`${route} — headings stay inside their own column at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await page.goto(route, { waitUntil: 'domcontentloaded' });

        const headers = page.locator(`${table} thead th`);
        await expect(headers).toHaveCount(4);

        // Overflowing its cell is what put one heading on top of the next.
        const overflow = await headers.evaluateAll((cells) =>
          cells.map((th) => th.scrollWidth - Math.round(th.getBoundingClientRect().width)),
        );
        expect(overflow.every((px) => px <= 0)).toBe(true);

        // And the page itself must not start scrolling sideways to accommodate them.
        const sideways = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        expect(sideways).toBeLessThanOrEqual(0);
      });
    }

    test(`${route} — the remove button is never clipped by its column`, async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 844 });
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const button = page.locator(`${table} tbody button`).first();
      const box = await button.boundingBox();
      // 2.75rem — the doctrine's 44px tap target, which the narrow-width column matches exactly.
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    });
  }
});
