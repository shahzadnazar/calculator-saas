import { test, expect, type Page } from '@playwright/test';

/**
 * Credit cards payoff — one budget, several cards, the debt-avalanche plan.
 *
 * Task-first: the budget and every card row start EMPTY, the visitor presses
 * "Calculate Payoff" for the first result, live-after-first thereafter. The card rows are
 * island-owned dynamic DOM (the GPA precedent) with per-field error slots the shared runtime
 * targets; there is no generic repeater abstraction.
 *
 * The published reference case is pinned here end to end: $500 a month against $4,600 at 18.99%,
 * $3,900 at 19.99% and $6,000 at 15.99% clears in 38 months for $18,971.20, of which $4,471.20 is
 * interest — a 76% / 24% split — with each card's payment schedule spelled out to the cent.
 *
 * A budget that cannot outrun the interest is the informational "Never" result (valid shell via
 * isUsableResult, ratified decision 8): its financial rows are OMITTED, never shown as zero,
 * Infinity or a dash. A budget below the minimums is a different thing entirely — a real input
 * error, reported against the budget field.
 */
const ROUTE = '/finance/credit-card-payoff-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#cc-result');
const primary = (page: Page) => page.locator('#cc-result [data-result-value]');
const summary = (page: Page) => page.locator('[data-cc-summary]');
const totalPaid = (page: Page) => page.locator('[data-cc-total-paid]');
const totalInterest = (page: Page) => page.locator('[data-cc-total-interest]');
const donut = (page: Page) => page.locator('[data-cc-donut-figure]');
const planFigure = (page: Page) => page.locator('[data-cc-plan-figure]');
const planRows = (page: Page) => page.locator('[data-cc-plan-body] tr');
const live = (page: Page) => page.locator('#cc-live');
const submit = (page: Page) => page.locator('[data-cc-submit]');
const rows = (page: Page) => page.locator('[data-cc-row]');
const region = (page: Page, when: string) => page.locator(`#cc-result [data-result-when~="${when}"]`);

interface Card {
  name?: string;
  balance: string;
  min: string;
  apr: string;
}
/** The published reference case. */
const REF: Card[] = [
  { name: 'Card 1', balance: '4600', min: '100', apr: '18.99' },
  { name: 'Card 2', balance: '3900', min: '90', apr: '19.99' },
  { name: 'Card 3', balance: '6000', min: '120', apr: '15.99' },
];

/** Fill row `i` (0-based); the island seeds three, so the reference needs no Add. */
const fillRow = async (page: Page, i: number, card: Card) => {
  const row = rows(page).nth(i);
  if (card.name !== undefined) await row.locator('[data-cc-name]').fill(card.name);
  await row.locator('[data-cc-balance]').fill(card.balance);
  await row.locator('[data-cc-min]').fill(card.min);
  await row.locator('[data-cc-apr]').fill(card.apr);
};

const enter = async (page: Page, budget: string, cards: Card[]) => {
  await page.fill('[name="budget"]', budget);
  for (let i = 0; i < cards.length; i++) await fillRow(page, i, cards[i]);
};
const calc = async (page: Page, budget = '500', cards = REF) => {
  await enter(page, budget, cards);
  await submit(page).click();
};

test.describe('credit cards payoff: task-first', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  test('loads empty: three blank card rows, blank budget, "Calculate Payoff"', async ({ page }) => {
    await expect(page.locator('[name="budget"]')).toHaveValue('');
    await expect(rows(page)).toHaveCount(3);
    for (const hook of ['[data-cc-name]', '[data-cc-balance]', '[data-cc-min]', '[data-cc-apr]']) {
      for (let i = 0; i < 3; i++) await expect(rows(page).nth(i).locator(hook)).toHaveValue('');
    }
    await expect(submit(page)).toHaveText('Calculate Payoff');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
    await expect(region(page, 'empty')).toBeHidden();
    await expect(live(page)).toHaveText('');
  });

  test('does not calculate before the first submission', async ({ page }) => {
    await enter(page, '500', REF);
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  /* ---- the reference result ---- */

  test('the reference case reproduces every published figure', async ({ page }) => {
    await calc(page);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('38 months');
    await expect(page.locator('[data-cc-headline-detail]')).toHaveText('3 years and 2 months');
    await expect(summary(page)).toHaveText(
      'You can pay off your credit cards in 38 months (3 years and 2 months) if you pay back $500.00 every month. ' +
        'To pay off, you will need to pay a total of $18,971.20, within which interest is $4,471.20.',
    );
    await expect(totalPaid(page)).toHaveText('$18,971.20');
    await expect(totalInterest(page)).toHaveText('$4,471.20');
    await expect(page.locator('[data-cc-total-principal]')).toHaveText('$14,500.00');
    await expect(live(page)).toHaveText('Paid off in 38 months, with $4,471.20 of interest.');
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('the payment breakdown ring splits the total 76% / 24%', async ({ page }) => {
    await calc(page);
    await expect(donut(page)).toBeVisible();

    const svg = page.locator('.cc-donut__svg');
    await expect(svg).toHaveCount(1);
    await expect(svg).toHaveAttribute('role', 'img');
    const label = await svg.getAttribute('aria-label');
    expect(label).toContain('$18,971.20');
    expect(label).toContain('$14,500.00');
    expect(label).toContain('$4,471.20');

    await expect(page.locator('.cc-donut__arc--principal')).toHaveCount(1);
    await expect(page.locator('.cc-donut__arc--interest')).toHaveCount(1);
    await expect(page.locator('[data-cc-share-principal]')).toHaveText('76%');
    await expect(page.locator('[data-cc-share-interest]')).toHaveText('24%');
    await expect(page.locator('[data-cc-share-principal-amt]')).toHaveText('$14,500');
    await expect(page.locator('[data-cc-share-interest-amt]')).toHaveText('$4,471');
  });

  test('the per-card plan lists the cards highest-rate first, with each schedule spelled out', async ({ page }) => {
    await calc(page);
    await expect(planFigure(page)).toBeVisible();
    await expect(planRows(page)).toHaveCount(3);

    // Avalanche order: 19.99%, then 18.99%, then 15.99% — each labelled by its own entry row.
    await expect(planRows(page).nth(0).locator('th')).toHaveText('#2: Card 2');
    await expect(planRows(page).nth(1).locator('th')).toHaveText('#1: Card 1');
    await expect(planRows(page).nth(2).locator('th')).toHaveText('#3: Card 3');

    const cells = (i: number) => planRows(page).nth(i).locator('td');
    await expect(cells(0).nth(0)).toHaveText('16 months (1 year and 4 months)');
    await expect(cells(0).nth(1)).toHaveText('$574.33');
    await expect(cells(0).nth(2)).toHaveText('$4,474.33');

    await expect(cells(1).nth(0)).toHaveText('28 months (2 years and 4 months)');
    await expect(cells(1).nth(1)).toHaveText('$1,541.21');
    await expect(cells(1).nth(2)).toHaveText('$6,141.21');

    await expect(cells(2).nth(0)).toHaveText('38 months (3 years and 2 months)');
    await expect(cells(2).nth(1)).toHaveText('$2,355.66');
    await expect(cells(2).nth(2)).toHaveText('$8,355.66');

    // The step-ups are the whole point of the plan — pin them.
    const schedule = (i: number) => planRows(page).nth(i).locator('.cc-plan__schedule p');
    await expect(schedule(0)).toHaveText(['pay $280.00 until month #15.', 'pay $274.33 at month #16 to pay off.']);
    await expect(schedule(1)).toHaveText([
      'pay $100.00 until month #15.',
      'then pay $105.67 until month #16.',
      'then pay $380.00 until month #27.',
      'pay $355.54 at month #28 to pay off.',
    ]);
    await expect(schedule(2)).toHaveText([
      'pay $120.00 until month #27.',
      'then pay $144.46 until month #28.',
      'then pay $500.00 until month #37.',
      'pay $471.20 at month #38 to pay off.',
    ]);
  });

  test('the plan table has a real header row for each column', async ({ page }) => {
    await calc(page);
    await expect(planFigure(page).locator('thead th')).toHaveText([
      'Credit card',
      'Payoff length',
      'Total interest',
      'Total payments',
      'Payment schedule',
    ]);
  });

  /* ---- rows ---- */

  test('a blank row is ignored, so two cards need no tidying up', async ({ page }) => {
    await page.fill('[name="budget"]', '400');
    await fillRow(page, 0, REF[0]);
    await fillRow(page, 1, REF[1]);
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(planRows(page)).toHaveCount(2);
  });

  test('cards can be added and removed, and the last row cannot be removed', async ({ page }) => {
    await expect(rows(page)).toHaveCount(3);
    await page.click('[data-cc-add]');
    await expect(rows(page)).toHaveCount(4);

    await rows(page).nth(3).locator('[data-cc-remove]').click();
    await expect(rows(page)).toHaveCount(3);

    for (let i = 0; i < 2; i++) await rows(page).nth(0).locator('[data-cc-remove]').click();
    await expect(rows(page)).toHaveCount(1);
    await expect(rows(page).nth(0).locator('[data-cc-remove]')).toBeDisabled();
  });

  test('a fourth card is planned alongside the rest', async ({ page }) => {
    await page.click('[data-cc-add]');
    await calc(page, '700', [...REF, { name: 'Store', balance: '800', min: '25', apr: '24.99' }]);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(planRows(page)).toHaveCount(4);
    // The 24.99% store card is the most expensive, so it is attacked first.
    await expect(planRows(page).nth(0).locator('th')).toHaveText('#4: Store');
  });

  test('adding or removing a card recalculates live after the first result', async ({ page }) => {
    await calc(page);
    await expect(planRows(page)).toHaveCount(3);
    await rows(page).nth(2).locator('[data-cc-remove]').click();
    await page.waitForTimeout(DEBOUNCE);
    await expect(planRows(page)).toHaveCount(2);
    await expect(primary(page)).not.toHaveText('38 months');
  });

  test('a card left unnamed is identified by its row number', async ({ page }) => {
    await calc(page, '500', REF.map((c) => ({ ...c, name: '' })));
    await expect(planRows(page).nth(0).locator('th')).toHaveText('#2: Card 2');
  });

  /* ---- validation ---- */

  test('the budget must be present, positive, and cover every minimum payment', async ({ page }) => {
    await calc(page, '');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="budget"]')).toHaveText(
      'Enter the amount you can put toward your cards each month.',
    );

    await calc(page, '0');
    await expect(page.locator('[data-error-for="budget"]')).toHaveText('Enter a monthly budget greater than zero.');

    await calc(page, '200');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="budget"]')).toHaveText(
      'Your monthly budget must cover every minimum payment, which come to $310.00.',
    );
    await expect(region(page, 'valid')).toBeHidden();
  });

  test('a problem is reported against the card row that has it', async ({ page }) => {
    await enter(page, '500', REF);
    const bad = rows(page).nth(1);
    await bad.locator('[data-cc-apr]').fill('150');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');

    const rowId = await bad.getAttribute('data-row-id');
    await expect(page.locator(`[data-error-for="apr-${rowId}"]`)).toHaveText(
      'Enter an interest rate between 0 and 100.',
    );
    await expect(bad.locator('[data-cc-apr]')).toHaveAttribute('aria-invalid', 'true');
    // The rows that are fine are not flagged.
    await expect(rows(page).nth(0).locator('[data-cc-apr]')).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('a half-filled row asks for the missing numbers', async ({ page }) => {
    await page.fill('[name="budget"]', '500');
    await rows(page).nth(0).locator('[data-cc-balance]').fill('4600');
    await submit(page).click();
    const rowId = await rows(page).nth(0).getAttribute('data-row-id');
    await expect(page.locator(`[data-error-for="min-${rowId}"]`)).toHaveText('Enter this card’s minimum payment.');
    await expect(page.locator(`[data-error-for="apr-${rowId}"]`)).toHaveText('Enter this card’s interest rate.');
  });

  test('an empty submission asks for at least one card and moves focus into the form', async ({ page }) => {
    await page.fill('[name="budget"]', '500');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(region(page, 'valid')).toBeHidden();
    await expect(rows(page).nth(0).locator('[data-cc-balance]')).toBeFocused();
  });

  /* ---- the informational "never" plan ---- */

  test('a budget that cannot outrun the interest is an informational result, not an error', async ({ page }) => {
    // $100 a month against $20,000 at 29.99%: the minimums are covered, the interest is not.
    await calc(page, '100', [{ name: 'Runaway', balance: '20000', min: '100', apr: '29.99' }]);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('Never');
    await expect(summary(page)).toContainText('$499.83');
    await expect(live(page)).toHaveText('These cards are never paid off at this monthly amount.');

    // Its financial rows are omitted rather than shown as zero, Infinity or a dash.
    await expect(page.locator('[data-cc-figures]')).toBeHidden();
    await expect(donut(page)).toBeHidden();
    await expect(planFigure(page)).toBeHidden();
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined|\$0\.00/);
  });

  /* ---- live update / reset ---- */

  test('a valid live update recomputes without moving focus', async ({ page }) => {
    await calc(page);
    await page.fill('[name="budget"]', '800');
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('22 months');
    await expect(page.locator('[name="budget"]')).toBeFocused();
  });

  test('an invalid live edit removes the stale plan, keeping focus', async ({ page }) => {
    await calc(page);
    await expect(region(page, 'valid')).toBeVisible();
    const apr = rows(page).nth(0).locator('[data-cc-apr]');
    await apr.fill('999');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(region(page, 'valid')).toBeHidden();
    await expect(apr).toBeFocused();
  });

  test('clear empties every field and collapses back to three blank rows', async ({ page }) => {
    await page.click('[data-cc-add]');
    await calc(page, '500', REF);
    await page.click('[data-reset]');
    await expect(rows(page)).toHaveCount(3);
    await expect(page.locator('[name="budget"]')).toHaveValue('');
    for (let i = 0; i < 3; i++) {
      await expect(rows(page).nth(i).locator('[data-cc-balance]')).toHaveValue('');
      await expect(rows(page).nth(i).locator('[data-cc-name]')).toHaveValue('');
    }
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(live(page)).toHaveText('');
  });

  /* ---- keyboard / responsive / theme / embed / monetization ---- */

  test('keyboard submission works from a card field', async ({ page }) => {
    await enter(page, '500', REF);
    await rows(page).nth(2).locator('[data-cc-apr]').press('Enter');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('38 months');
  });

  test('desktop shows the form, the primary action and the headline at 1366×768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[name="budget"]')).toBeInViewport();
    await expect(submit(page)).toBeInViewport();
    await calc(page);
    await expect(primary(page)).toBeInViewport();
  });

  test('the card fields stay usable rather than being squeezed by their affixes', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    for (const hook of ['[data-cc-balance]', '[data-cc-min]', '[data-cc-apr]']) {
      const box = await rows(page).nth(0).locator(hook).boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
  });

  test('mobile stacks each card row so no field collapses to a sliver', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    // Five columns at this width would leave each number a few pixels wide.
    for (const hook of ['[data-cc-balance]', '[data-cc-min]', '[data-cc-apr]']) {
      const box = await rows(page).nth(0).locator(hook).boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(90);
    }
    // The column headers step aside and each field carries its own label instead.
    await expect(page.locator('.cc-head')).toBeHidden();
    await expect(rows(page).nth(0).locator('.cc-cell__label')).toHaveText([
      'Balance',
      'Minimum payment',
      'Interest rate',
    ]);
  });

  test('mobile does not overflow horizontally; the plan table scrolls inside its own box', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await calc(page);
    await expect(planFigure(page)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    const scrolls = await page
      .locator('.cc-plan__scroll')
      .evaluate((el) => el.scrollWidth > el.clientWidth && getComputedStyle(el).overflowX === 'auto');
    expect(scrolls).toBe(true);
  });

  test('renders in dark scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await calc(page);
    await expect(primary(page)).toBeVisible();
    await expect(donut(page)).toBeVisible();
  });

  test('the generated embed mounts the same island, rows and charts and all', async ({ page }) => {
    await page.goto('/embed/finance/credit-card-payoff-calculator', { waitUntil: 'domcontentloaded' });
    await expect(rows(page)).toHaveCount(3);
    await calc(page);
    await expect(page.locator('#cc-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('38 months');
    await expect(page.locator('.cc-donut__svg')).toHaveCount(1);
    await expect(planRows(page)).toHaveCount(3);
  });

  test('the live page carries no monetization output', async ({ page }) => {
    await expect(page.locator('[data-mon-region]')).toHaveCount(0);
    expect(await page.content()).not.toContain('data-mon-');
  });
});
