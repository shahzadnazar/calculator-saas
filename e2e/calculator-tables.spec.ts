import { test, expect, type Page } from '@playwright/test';

/**
 * Every table inside a calculator wears one header.
 *
 * Thirty-odd tables print inside the calculators, and each island used to carry its own
 * copy of its header's CSS. Three looks had grown out of that — a banded header, a small
 * uppercase muted micro-label, and a plain small bold one — and the copies had drifted
 * outright: seven painted the background with `var(--surface)`, a property this project
 * has never defined, which makes the declaration invalid at computed-value time and
 * resolves the header to `transparent`. In the scrolling ones the rows then ran straight
 * through the column names on a phone.
 *
 * `.calc-table` is now the single definition of that header and `.calc-schedule-table`
 * adds the two properties a sticky one needs. These tests hold the fleet to it: every
 * table opts in, every header resolves to the same treatment, and the three deliberate
 * opt-outs stay opted out rather than drifting back by accident.
 */

/** The scrolling schedules — a sticky header over a fixed-height body. */
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

/** The static result tables — same header, nothing to stick to. */
const STATIC = [
  ['/everyday/gpa-calculator', '.gpa-report', 1],
  ['/everyday/grade-calculator', '.grade-report', 1],
  ['/finance/credit-card-payoff-calculator', '.cc-plan__table', 1],
  ['/finance/retirement-calculator', '.ret-table', 1],
  ['/finance/salary-calculator', '.sal-table', 1],
  ['/finance/tip-calculator', '.tpeq-table', 1],
  ['/health/bmr-calculator', '.bmr-activity', 1],
  ['/health/calorie-calculator', '.cal-zigzag', 2],
  ['/health/due-date-calculator', '.dd-timeline', 1],
  ['/health/fat-intake-calculator', '.fi-bases', 1],
  ['/health/ideal-weight-calculator', '.iw-formulas', 1],
  ['/health/pace-calculator', '.pc-equiv', 1],
  ['/health/pregnancy-calculator', '.pg-schedule', 1],
  ['/health/protein-calculator', '.pr-bases', 1],
  ['/health/target-heart-rate-calculator', '.thr-zones', 1],
  ['/math/standard-deviation-calculator', '.sd-table', 2],
] as const;

/**
 * Three tables are deliberately NOT calculator data tables, and are asserted as opt-outs so
 * that staying out is a decision rather than an oversight. The GPA and grade INPUT tables
 * head columns of form fields, so a filled band would announce a table that is not one and
 * detach the labels from the inputs below. `.ci-rate` is a bar chart marked up as a table.
 */
const OPT_OUTS = [
  ['/everyday/gpa-calculator', '.gpa-input-table'],
  ['/everyday/grade-calculator', '.grade-input-table'],
  ['/finance/compound-interest-calculator', '.ci-rate'],
] as const;

const TRANSPARENT = 'rgba(0, 0, 0, 0)';

const headerStyle = (page: Page, selector: string) =>
  page.locator(`${selector} thead th`).first().evaluate((th) => {
    const cs = getComputedStyle(th);
    return {
      background: cs.backgroundColor,
      color: cs.color,
      fontWeight: cs.fontWeight,
      textTransform: cs.textTransform,
      position: cs.position,
      zIndex: cs.zIndex,
    };
  });

test.describe('calculator tables — the shared header', () => {
  for (const [route, table] of [...SCHEDULES, ...STATIC.map(([r, t]) => [r, t] as const)]) {
    test(`${route} ${table} — opts into the shared treatment`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const expected = STATIC.find(([r, t]) => r === route && t === table)?.[2] ?? 1;
      await expect(page.locator(`table${table}.calc-table`)).toHaveCount(expected);
    });

    test(`${route} ${table} — the header is banded, not transparent`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const style = await headerStyle(page, table);
      expect(style.background).not.toBe(TRANSPARENT);
      // The band is what tells a header from its rows — not shouting it in capitals.
      expect(style.textTransform).toBe('none');
    });
  }

  for (const [route, table] of SCHEDULES) {
    test(`${route} ${table} — the sticky header stays above the rows`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const style = await headerStyle(page, table);
      expect(style.position).toBe('sticky');
      // Table cells paint in document order, so `z-index: auto` puts a sticky header
      // UNDER every tbody cell however opaque it is.
      expect(Number(style.zIndex)).toBeGreaterThan(0);
    });
  }

  test('every calculator table resolves to the same header', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const seen = new Map<string, string[]>();
    for (const [route, table] of [...SCHEDULES, ...STATIC.map(([r, t]) => [r, t] as const)]) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const s = await headerStyle(page, table);
      // Font-size and alignment stay with the island — density and numeric columns
      // legitimately differ. The treatment itself must not.
      const key = `${s.background} | ${s.color} | ${s.fontWeight} | ${s.textTransform}`;
      seen.set(key, [...(seen.get(key) ?? []), `${route}${table}`]);
    }
    expect([...seen.keys()]).toHaveLength(1);
  });

  for (const [route, table] of OPT_OUTS) {
    test(`${route} ${table} — stays out of the shared treatment on purpose`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await expect(page.locator(`${table}.calc-table`)).toHaveCount(0);
      const style = await headerStyle(page, table);
      expect(style.background).toBe(TRANSPARENT);
      expect(style.textTransform).toBe('uppercase');
    });
  }

  for (const width of [320, 390]) {
    test(`no calculator table overflows a container that cannot scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      const offenders: string[] = [];
      for (const [route, table] of [...SCHEDULES, ...STATIC.map(([r, t]) => [r, t] as const)]) {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        const over = await page.locator(`table${table}`).evaluateAll((tables) =>
          tables
            .map((t) => {
              const scrolls = (el: Element | null) =>
                !!el && ['auto', 'scroll'].includes(getComputedStyle(el).overflowX);
              if (scrolls(t) || scrolls(t.parentElement)) return 0;
              return t.scrollWidth - Math.ceil(t.getBoundingClientRect().width);
            })
            .filter((px) => px > 1),
        );
        if (over.length) offenders.push(`${route}${table} +${over.join(',')}px`);
        const sideways = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
        if (sideways > 0) offenders.push(`${route} page +${sideways}px`);
      }
      expect(offenders).toEqual([]);
    });
  }
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
