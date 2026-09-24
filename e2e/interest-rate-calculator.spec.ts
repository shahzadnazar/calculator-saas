import { test, expect, type Page } from '@playwright/test';

/**
 * Interest Rate calculator — solve for the rate a loan implies.
 *
 * Wraps the UNCHANGED solveAnnualRate (a bisection over the shared @lib/finance `pmt`) via its OWN
 * interest-rate-form.ts binding. Task-first: empty start, "Calculate Interest Rate" for the first
 * result, live-after-first.
 *
 * The rate is the dominant answer; beneath it the result carries what the loan COSTS — the total of
 * every payment and the interest inside it — a PAYMENT BREAKDOWN ring splitting that total, and a
 * LOAN AMORTIZATION GRAPH of the balance falling while interest and payments rise. All three come
 * from one schedule computed at the SOLVED rate with the visitor's own payment.
 *
 * Term is two boxes but one quantity (years + months), capped at 30 years. A monthly payment too low
 * to ever repay the loan is rejected (the pure solver would floor to a misleading 0%). The estimator
 * disclaimer is island-owned (once on page + once in embed) — the page copy must not repeat it.
 * The complete-result guard lives in the binding's resultValue (NaN sentinel — NO isUsableResult);
 * a valid 0% rate is a finite 0 the default gate accepts.
 */
const ROUTE = '/finance/interest-rate-calculator';
const DEBOUNCE = 300;
const INFEASIBLE =
  'This monthly payment is too low to repay the loan over the term. Enter a higher payment or a shorter term.';

const shell = (page: Page) => page.locator('#ir-result');
const primary = (page: Page) => page.locator('#ir-result [data-result-value]');
const summaryLabel = (page: Page) => page.locator('#ir-result [data-result-summary-label]');
const monthly = (page: Page) => page.locator('[data-ir-monthly]');
const paymentsLabel = (page: Page) => page.locator('[data-ir-payments-label]');
const total = (page: Page) => page.locator('[data-ir-total]');
const interest = (page: Page) => page.locator('[data-ir-interest]');
const interpretation = (page: Page) => page.locator('[data-ir-interpretation]');
const donut = (page: Page) => page.locator('[data-ir-donut-figure]');
const chart = (page: Page) => page.locator('[data-ir-chart-figure]');
const live = (page: Page) => page.locator('#ir-live');
const submit = (page: Page) => page.locator('[data-ir-submit]');
const region = (page: Page, when: string) => page.locator(`#ir-result [data-result-when~="${when}"]`);
const disclaimer = (page: Page) => page.locator('.ir-disclaimer');

const FIELDS = ['amount', 'payment', 'termYears', 'termMonths'] as const;
type Fields = Record<(typeof FIELDS)[number], string>;

/**
 * The published reference case: $32,000 repaid at $960 a month for 3 years implies 5.065% a year,
 * $34,560.00 across 36 payments, $2,560.00 of it interest — a 93% / 7% split.
 */
const BASE: Fields = { amount: '32000', payment: '960', termYears: '3', termMonths: '0' };

const calc = async (page: Page, over: Partial<Fields> = {}) => {
  const v = { ...BASE, ...over };
  for (const name of FIELDS) await page.fill(`[name="${name}"]`, v[name]);
  await submit(page).click();
};
const rateOf = async (page: Page) => parseFloat((await primary(page).textContent())!.replace('%', ''));

test.describe('interest rate: task-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  test('loads empty: blank fields, "Calculate Interest Rate", disclaimer shown', async ({ page }) => {
    for (const name of FIELDS) await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
    await expect(submit(page)).toHaveText('Calculate Interest Rate');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    // The empty placeholder is replaced by the labelled example on load.
    await expect(region(page, 'empty')).toBeHidden();
    await expect(region(page, 'valid')).toBeVisible();
    await expect(live(page)).toHaveText('');
    await expect(disclaimer(page)).toHaveCount(1);
    await expect(disclaimer(page)).toBeVisible();
  });

  test('the two term boxes are whole counts of zero or more', async ({ page }) => {
    for (const name of ['termYears', 'termMonths'] as const) {
      const box = page.locator(`[name="${name}"]`);
      await expect(box).toHaveAttribute('min', '0');
      await expect(box).toHaveAttribute('step', '1');
    }
    await expect(page.locator('[name="termYears"]')).toHaveAttribute('max', '30');
  });

  test('does not calculate before the first submission', async ({ page }) => {
    for (const name of FIELDS) await page.fill(`[name="${name}"]`, BASE[name]);
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  /* ---- the reference result ---- */

  test('the reference case prints every figure the reference reports', async ({ page }) => {
    await calc(page);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(summaryLabel(page)).toHaveText('Interest rate');
    await expect(primary(page)).toHaveText('5.065%');
    await expect(paymentsLabel(page)).toHaveText('Total of 36 monthly payments');
    await expect(total(page)).toHaveText('$34,560.00');
    await expect(interest(page)).toHaveText('$2,560.00');
    await expect(monthly(page)).toHaveText('0.422%');
    await expect(interpretation(page)).toContainText('the implied interest rate is about 5.065% a year');

    const announcement = await live(page).textContent();
    expect(announcement).toBe('Estimated annual interest rate: 5.065 percent.');

    // dominant rate visually larger than the supporting metrics
    const primarySize = await primary(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const metricSize = await monthly(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(primarySize).toBeGreaterThan(metricSize * 1.5);
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('the payment breakdown ring splits the total repaid 93% / 7%', async ({ page }) => {
    await calc(page);
    await expect(donut(page)).toBeVisible();

    const svg = page.locator('.ir-donut__svg');
    await expect(svg).toHaveCount(1);
    await expect(svg).toHaveAttribute('role', 'img');
    // The accessible description carries the same numbers the ring draws.
    const label = await svg.getAttribute('aria-label');
    expect(label).toContain('$34,560.00');
    expect(label).toContain('$32,000.00');
    expect(label).toContain('$2,560.00');

    await expect(page.locator('.ir-donut__arc--principal')).toHaveCount(1);
    await expect(page.locator('.ir-donut__arc--interest')).toHaveCount(1);

    await expect(page.locator('[data-ir-share-principal]')).toHaveText('93%');
    await expect(page.locator('[data-ir-share-interest]')).toHaveText('7%');
    await expect(page.locator('[data-ir-share-principal-amt]')).toHaveText('$32,000');
    await expect(page.locator('[data-ir-share-interest-amt]')).toHaveText('$2,560');
  });

  test('the loan amortization graph plots balance, interest and payment over the term', async ({ page }) => {
    await calc(page);
    await expect(chart(page)).toBeVisible();

    const svg = page.locator('.ir-chart__svg');
    await expect(svg).toHaveCount(1);
    await expect(svg).toHaveAttribute('role', 'img');
    expect(await svg.getAttribute('aria-label')).toContain('$32,000.00');

    for (const series of ['balance', 'interest', 'paid']) {
      await expect(page.locator(`.ir-chart__line--${series}`)).toHaveCount(1);
    }

    // Only the two ends of the term are labelled on the x axis.
    await expect(page.locator('.ir-chart__tick', { hasText: 'Start' })).toHaveCount(1);
    await expect(page.locator('.ir-chart__tick', { hasText: '3 years' })).toHaveCount(1);

    // The balance line ends lower than it starts; the paid line ends higher.
    const ends = await page.evaluate(() => {
      const read = (cls: string) => {
        const points = document
          .querySelector(`.ir-chart__line--${cls}`)!
          .getAttribute('points')!
          .trim()
          .split(/\s+/)
          .map((p) => parseFloat(p.split(',')[1]));
        return { first: points[0], last: points[points.length - 1], count: points.length };
      };
      return { balance: read('balance'), paid: read('paid') };
    });
    expect(ends.balance.count).toBe(36); // one point per scheduled payment
    // SVG y grows downward, so a falling balance ends with a LARGER y.
    expect(ends.balance.last).toBeGreaterThan(ends.balance.first);
    expect(ends.paid.last).toBeLessThan(ends.paid.first);
  });

  test('both charts are hidden again while the result is not valid', async ({ page }) => {
    await calc(page);
    await expect(donut(page)).toBeVisible();
    await page.fill('[name="payment"]', '0');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(donut(page)).toBeHidden();
    await expect(chart(page)).toBeHidden();
  });

  test('the zero-interest boundary (payment × months = principal) resolves to 0%', async ({ page }) => {
    await calc(page, { amount: '12000', payment: '1000', termYears: '1', termMonths: '0' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('0%');
    await expect(total(page)).toHaveText('$12,000.00');
    await expect(interest(page)).toHaveText('$0.00');
    await expect(live(page)).toHaveText('Estimated annual interest rate: 0 percent.');
    // A zero slice is dropped rather than drawn, so only the principal arc remains.
    await expect(page.locator('.ir-donut__arc--interest')).toHaveCount(0);
    await expect(page.locator('.ir-donut__arc--principal')).toHaveCount(1);
  });

  test('an infeasible payment (too low to ever repay the loan) is rejected, not shown as 0%', async ({ page }) => {
    await calc(page, { amount: '20000', payment: '100', termYears: '1', termMonths: '0' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(region(page, 'valid')).toBeHidden();
    await expect(page.locator('[data-error-for="payment"]')).toHaveText(INFEASIBLE);
  });

  /* ---- validation ---- */

  test('field validation: amount > 0, payment > 0, a whole term of at least a month', async ({ page }) => {
    await calc(page, { amount: '0' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="amount"]')).toHaveText('Enter a loan amount greater than zero.');

    await calc(page, { payment: '0' });
    await expect(page.locator('[data-error-for="payment"]')).toHaveText('Enter a monthly payment greater than zero.');

    await calc(page, { termYears: '2.5' });
    await expect(page.locator('[data-error-for="termYears"]')).toHaveText('Enter a whole number of years.');

    await calc(page, { termMonths: '2.5' });
    await expect(page.locator('[data-error-for="termMonths"]')).toHaveText('Enter a whole number of months.');

    await calc(page, { termYears: '0', termMonths: '0' });
    await expect(page.locator('[data-error-for="termYears"]')).toHaveText('Enter a loan term of at least one month.');

    await calc(page, { termYears: '31' });
    await expect(page.locator('[data-error-for="termYears"]')).toHaveText('Enter a loan term of 30 years or less.');
  });

  test('the term is one quantity in two boxes: either alone is a valid term', async ({ page }) => {
    await calc(page, { termYears: '', termMonths: '36' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('5.065%');

    await calc(page, { termYears: '3', termMonths: '' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('5.065%');

    // Both boxes together — $32,000 over 30 months needs more than $1,066 a month.
    await calc(page, { payment: '1200', termYears: '2', termMonths: '6' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(paymentsLabel(page)).toHaveText('Total of 30 monthly payments');
    await expect(total(page)).toHaveText('$36,000.00');
  });

  test('an empty explicit submission focuses the loan amount and associates the error', async ({ page }) => {
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    const amt = page.locator('[name="amount"]');
    await expect(amt).toBeFocused();
    await expect(amt).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('[data-error-for="amount"]')).toHaveText('Enter the loan amount.');
  });

  /* ---- live update / invalidate / reset ---- */

  test('a valid live update recomputes without moving focus', async ({ page }) => {
    await calc(page);
    const before = await rateOf(page);
    await page.fill('[name="payment"]', '1000');
    await page.waitForTimeout(DEBOUNCE);
    expect(await rateOf(page)).toBeGreaterThan(before); // a higher payment ⇒ a higher implied rate
    await expect(page.locator('[name="payment"]')).toBeFocused();
  });

  test('an invalid live edit removes the stale valid result, keeping focus', async ({ page }) => {
    await calc(page);
    await expect(region(page, 'valid')).toBeVisible();
    await page.fill('[name="termMonths"]', '2.5');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(region(page, 'valid')).toBeHidden();
    await expect(page.locator('[name="termMonths"]')).toBeFocused();
  });

  test('reset clears fields, empties result + announcement; the disclaimer stays', async ({ page }) => {
    await calc(page);
    await page.click('[data-reset]');
    for (const name of FIELDS) await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(live(page)).toHaveText('');
    await expect(disclaimer(page)).toBeVisible();
  });

  /* ---- keyboard / responsive / theme / disclaimer-once / embed / monetization ---- */

  test('keyboard submission works from a field', async ({ page }) => {
    for (const name of FIELDS) await page.fill(`[name="${name}"]`, BASE[name]);
    await page.locator('[name="termMonths"]').press('Enter');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('5.065%');
  });

  test('desktop shows the dominant result within the first viewport at 1366×768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await calc(page);
    await expect(primary(page)).toBeInViewport();
  });

  test('the term boxes stay readable beside their unit affixes', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    for (const name of ['termYears', 'termMonths'] as const) {
      const box = page.locator(`[name="${name}"]`).first();
      expect((await box.boundingBox())!.width).toBeGreaterThanOrEqual(48);
    }
  });

  test('mobile does not overflow horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await calc(page);
    await expect(chart(page)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('renders in dark scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await calc(page);
    await expect(primary(page)).toBeVisible();
    await expect(donut(page)).toBeVisible();
  });

  test('the estimator disclaimer appears exactly once on the full page', async ({ page }) => {
    await expect(disclaimer(page)).toHaveCount(1);
    await expect(page.getByText(/not financial advice/i)).toHaveCount(1);
  });

  test('the generated embed mounts the same island, charts and all', async ({ page }) => {
    await page.goto('/embed/finance/interest-rate-calculator', { waitUntil: 'domcontentloaded' });
    await expect(disclaimer(page)).toHaveCount(1);
    for (const name of FIELDS) await page.fill(`[name="${name}"]`, BASE[name]);
    await page.locator('[data-ir-submit]').click();
    await expect(page.locator('#ir-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('#ir-result [data-result-value]')).toHaveText('5.065%');
    await expect(page.locator('[data-ir-total]')).toHaveText('$34,560.00');
    await expect(page.locator('.ir-donut__svg')).toHaveCount(1);
    await expect(page.locator('.ir-chart__svg')).toHaveCount(1);
  });

  test('the live page carries no monetization output', async ({ page }) => {
    await expect(page.locator('[data-mon-region]')).toHaveCount(0);
    expect(await page.content()).not.toContain('data-mon-');
  });
});
