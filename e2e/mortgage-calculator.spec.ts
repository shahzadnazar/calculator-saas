import { test, expect, type Page } from '@playwright/test';

/**
 * Mortgage calculator — R11E1 task-first migration (finance complex-form; the fourth and final). Wraps
 * the UNCHANGED DEDICATED calculateMortgage / toYearlySchedule engine (its OWN PMI-aware schedule — NOT
 * @lib/finance / the Amortization binding); the complete-result guard lives in the binding's resultValue
 * (a NaN sentinel — NO isUsableResult). Task-first: empty fields, "Calculate Mortgage" for the first
 * result, live-after-first. The estimated monthly payment (PITI + HOA) is dominant; the yearly schedule
 * is a closed <details> disclosure; a down payment equal to the price is a valid zero-mortgage.
 */
const ROUTE = '/finance/mortgage-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#mc-result');
const primary = (page: Page) => page.locator('#mc-result [data-result-value]');
const interpretation = (page: Page) => page.locator('[data-mc-interpretation]');
const downPct = (page: Page) => page.locator('[data-mc-down-pct]');
const disclosure = (page: Page) => page.locator('[data-mc-disclosure]');
const scheduleBlock = (page: Page) => page.locator('[data-mc-schedule-block]');
const rows = (page: Page) => page.locator('[data-mc-rows] tr');
const live = (page: Page) => page.locator('#mc-live');
const submit = (page: Page) => page.locator('[data-mc-submit]');
const region = (page: Page, when: string) => page.locator(`#mc-result [data-result-when~="${when}"]`);
const fieldError = (page: Page, name: string) => page.locator(`[data-error-for="${name}"]`);
const downInput = (page: Page) => page.locator('[name="downPayment"]');
// Scoped to the DOWN PAYMENT group — three groups now share the form, so an unscoped
// [data-unit] selector is ambiguous by design.
const unitBtn = (page: Page, unit: 'amount' | 'percent') =>
  page.locator(`[data-unit-group="downPayment"] [data-unit="${unit}"]`);
const affix = (page: Page, unit: 'amount' | 'percent') =>
  page.locator(`[data-unit-group="downPayment"] [data-group="${unit}"]`);
const loanAmount = (page: Page) => page.locator('[data-mc-loan]');
const taxInput = (page: Page) => page.locator('[name="propertyTaxAnnual"]');
const pmiInput = (page: Page) => page.locator('[name="pmiAnnualRate"]');
/** A unit button INSIDE one group — the whole point is that groups do not share buttons. */
const groupUnit = (page: Page, group: string, unit: 'amount' | 'percent') =>
  page.locator(`[data-unit-group="${group}"] [data-unit="${unit}"]`);
const groupAffix = (page: Page, group: string, unit: 'amount' | 'percent') =>
  page.locator(`[data-unit-group="${group}"] [data-group="${unit}"]`);

const fillCore = async (
  page: Page,
  price: string,
  down: string,
  term: string,
  rate: string,
) => {
  await page.fill('[name="homePrice"]', price);
  if (down !== '') await page.fill('[name="downPayment"]', down);
  await page.selectOption('[name="loanTermYears"]', term);
  await page.fill('[name="annualInterestRate"]', rate);
};

const openCosts = (page: Page) => page.locator('summary', { hasText: 'Taxes, insurance' }).click();

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: blank fields, term defaults to 30, empty result, Calculate Mortgage, no auto-calc', async ({ page }) => {
  await expect(page.locator('[name="homePrice"]')).toHaveValue('');
  await expect(page.locator('[name="downPayment"]')).toHaveValue('');
  await expect(page.locator('[name="annualInterestRate"]')).toHaveValue('');
  await expect(page.locator('[name="loanTermYears"]')).toHaveValue('30');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(submit(page)).toHaveText('Calculate Mortgage Payment');
  await expect(downPct(page)).toBeHidden();
  // Initial: no schedule rows, no result, no announcement.
  await expect(rows(page)).toHaveCount(0);
  await expect(live(page)).toHaveText('');
});

test('the primary action has the exact accessible name "Calculate Mortgage Payment"', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Calculate Mortgage Payment' })).toBeVisible();
});

test('keyboard submission (Enter from a field) computes with the corrected action', async ({ page }) => {
  await page.fill('[name="homePrice"]', '360000');
  await page.fill('[name="downPayment"]', '72000');
  await page.selectOption('[name="loanTermYears"]', '30');
  const rate = page.locator('[name="annualInterestRate"]');
  await rate.fill('6.5');
  await rate.press('Enter');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$1,820.36');
});

test('the schedule disclosure is labelled "View year-by-year amortization schedule"', async ({ page }) => {
  await fillCore(page, '360000', '72000', '30', '6.5');
  await submit(page).click();
  await expect(disclosure(page).locator('summary')).toContainText('View year-by-year amortization schedule');
});

test('does not calculate before the first submission', async ({ page }) => {
  await fillCore(page, '360000', '72000', '30', '6.5');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- Ordinary results --------------------------------------------------- */

test('P&I-only mortgage: the monthly total is the principal & interest, with a loan summary', async ({ page }) => {
  await fillCore(page, '360000', '72000', '30', '6.5');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$1,820.36'); // no taxes/insurance/PMI entered
  await expect(page.locator('[data-mc-pi]')).toHaveText('$1,820.36');
  await expect(page.locator('[data-mc-tax]')).toHaveText('$0.00');
  await expect(page.locator('[data-mc-pmi]')).toHaveText('$0.00');
  await expect(page.locator('[data-mc-loan]')).toHaveText('$288,000');
});

test('full PITI: taxes, insurance and HOA add into the monthly total', async ({ page }) => {
  await fillCore(page, '360000', '72000', '30', '6.5');
  await openCosts(page);
  await page.fill('[name="propertyTaxAnnual"]', '3600');
  await page.fill('[name="homeInsuranceAnnual"]', '1200');
  await submit(page).click();
  await expect(primary(page)).toHaveText('$2,220.36'); // 1820.36 + 300 tax + 100 insurance
  await expect(page.locator('[data-mc-tax]')).toHaveText('$300.00');
  await expect(page.locator('[data-mc-ins]')).toHaveText('$100.00');
});

test('the announcement states the dominant monthly payment', async ({ page }) => {
  await fillCore(page, '360000', '72000', '30', '6.5');
  await submit(page).click();
  await expect(live(page)).toContainText('estimated monthly payment is 1820 dollars and 36 cents');
});

test('the term select drives the schedule length', async ({ page }) => {
  await fillCore(page, '360000', '72000', '15', '6.5');
  await submit(page).click();
  await disclosure(page).locator('summary').click();
  await expect(rows(page)).toHaveCount(15);
  // Switch to 30 years live and re-open.
  await page.selectOption('[name="loanTermYears"]', '30');
  await page.waitForTimeout(DEBOUNCE);
  await expect(rows(page)).toHaveCount(30);
});

test('a live "% down" readout appears beside the down payment', async ({ page }) => {
  await page.fill('[name="homePrice"]', '360000');
  await page.fill('[name="downPayment"]', '72000');
  await expect(downPct(page)).toBeVisible();
  await expect(downPct(page)).toHaveText('20% down');
});

/* ---- PMI ---------------------------------------------------------------- */

test('under 20% down applies PMI and the interpretation explains it', async ({ page }) => {
  await fillCore(page, '400000', '40000', '30', '6'); // 10% down
  await openCosts(page);
  await page.fill('[name="pmiAnnualRate"]', '0.5');
  await submit(page).click();
  await expect(page.locator('[data-mc-pmi]')).toHaveText('$150.00');
  await expect(interpretation(page)).toContainText('PMI');
  await expect(interpretation(page)).toContainText('20% down removes it');
});

test('at 20% down there is no PMI', async ({ page }) => {
  await fillCore(page, '400000', '80000', '30', '6'); // exactly 20%
  await openCosts(page);
  await page.fill('[name="pmiAnnualRate"]', '0.5');
  await submit(page).click();
  await expect(page.locator('[data-mc-pmi]')).toHaveText('$0.00');
  await expect(interpretation(page)).toContainText('no PMI');
});

/* ---- Zero mortgage ------------------------------------------------------ */

test('a down payment equal to the price is a valid zero-mortgage with the schedule hidden', async ({ page }) => {
  await fillCore(page, '300000', '300000', '30', '6');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$0.00');
  await expect(interpretation(page)).toContainText('no mortgage'); // no-cost branch: "…no mortgage and no ongoing monthly cost…"
  await expect(page.locator('[data-mc-loan]')).toHaveText('$0');
  await expect(scheduleBlock(page)).toBeHidden();
});

/* ---- Schedule disclosure ------------------------------------------------ */

test('the schedule is a disclosure, closed by default, revealing Year/Principal/Interest/Balance rows', async ({ page }) => {
  await fillCore(page, '360000', '72000', '30', '6.5');
  await submit(page).click();
  await expect(disclosure(page)).not.toHaveAttribute('open', '');
  await expect(rows(page).first()).toBeHidden(); // collapsed
  await disclosure(page).locator('summary').click();
  await expect(rows(page)).toHaveCount(30);
  // First yearly row is Year 1 with a decreasing balance below the loan amount.
  await expect(rows(page).first().locator('th')).toHaveText('1');
});

test('no NaN / Infinity / undefined leaks into the rendered result', async ({ page }) => {
  await fillCore(page, '360000', '72000', '30', '6.5');
  await openCosts(page);
  await page.fill('[name="propertyTaxAnnual"]', '3600');
  await submit(page).click();
  await disclosure(page).locator('summary').click();
  expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
});

test('the result states its PITI / USD assumptions', async ({ page }) => {
  await fillCore(page, '360000', '72000', '30', '6.5');
  await submit(page).click();
  await expect(region(page, 'valid')).toContainText('PITI');
  await expect(region(page, 'valid')).toContainText('USD');
});

/* ---- Validation --------------------------------------------------------- */

test('an empty home price is a field error on submit', async ({ page }) => {
  await page.fill('[name="annualInterestRate"]', '6');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(fieldError(page, 'homePrice')).toBeVisible();
  await expect(page.locator('[name="homePrice"]')).toBeFocused();
});

test('a down payment above the home price is a field error on the down payment', async ({ page }) => {
  await fillCore(page, '300000', '400000', '30', '6');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(fieldError(page, 'downPayment')).toContainText('no greater than the home price');
});

test('a negative interest rate is a field error; 0% is valid', async ({ page }) => {
  await fillCore(page, '360000', '72000', '30', '-1');
  await submit(page).click();
  await expect(fieldError(page, 'annualInterestRate')).toBeVisible();

  // The first submit failed, so live-after-first is not yet active — an explicit re-submit is needed.
  await page.fill('[name="annualInterestRate"]', '0');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$800.00'); // 288000 / 360, principal only
});

test('an invalid live edit clears the stale schedule rows', async ({ page }) => {
  await fillCore(page, '360000', '72000', '30', '6.5');
  await submit(page).click();
  await disclosure(page).locator('summary').click();
  await expect(rows(page)).toHaveCount(30);
  // Break the price live → invalid → the observer drops the rows.
  await page.fill('[name="homePrice"]', '0');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(rows(page)).toHaveCount(0);
});

/* ---- Interaction -------------------------------------------------------- */

test('after the first result, editing updates live and keeps focus on the edited field', async ({ page }) => {
  await fillCore(page, '360000', '72000', '30', '6.5');
  await submit(page).click();
  await expect(primary(page)).toHaveText('$1,820.36');
  const rate = page.locator('[name="annualInterestRate"]');
  await rate.focus();
  await rate.fill('7');
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).not.toHaveText('$1,820.36');
  await expect(rate).toBeFocused();
});

test('reset closes BOTH disclosures, removes rows, clears result/announcement/live-note, restores term 30, clears fields, and does not calculate', async ({ page }) => {
  const costs = page.locator('[data-mc-costs]');
  const liveNote = page.locator('[data-live-note]');
  // Open the optional-cost disclosure, fill everything, calculate, then open the schedule.
  await costs.locator('summary').click();
  await fillCore(page, '360000', '72000', '15', '6.5');
  await page.fill('[name="propertyTaxAnnual"]', '3600');
  await submit(page).click();
  await disclosure(page).locator('summary').click();
  await expect(disclosure(page)).toHaveAttribute('open', '');
  await expect(costs).toHaveAttribute('open', '');
  await expect(rows(page)).toHaveCount(15);
  await expect(liveNote).toBeVisible();

  await page.locator('[data-reset]').click();

  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty'); // did NOT calculate
  await expect(page.locator('[name="homePrice"]')).toHaveValue('');
  await expect(page.locator('[name="downPayment"]')).toHaveValue('');
  await expect(page.locator('[name="propertyTaxAnnual"]')).toHaveValue('');
  await expect(page.locator('[name="loanTermYears"]')).toHaveValue('30'); // default restored
  await expect(disclosure(page)).not.toHaveAttribute('open', ''); // schedule disclosure closed
  await expect(costs).not.toHaveAttribute('open', ''); // optional-cost disclosure closed
  await expect(rows(page)).toHaveCount(0); // rows removed
  await expect(live(page)).toHaveText(''); // announcement cleared
  await expect(liveNote).toBeHidden(); // live-update note removed
  await expect(downPct(page)).toBeHidden();
});

/* ---- Yearly-schedule + disclosure lifecycle (R11E1.1) ------------------- */

test.describe('yearly-schedule lifecycle', () => {
  test('first positive-loan success: summary visible, rows prepared, disclosure stays closed, rows not announced', async ({ page }) => {
    await fillCore(page, '360000', '72000', '30', '6.5');
    await submit(page).click();
    await expect(region(page, 'valid')).toBeVisible();
    await expect(primary(page)).toHaveText('$1,820.36');
    // Rows are prepared in the DOM even while the disclosure is collapsed.
    await expect(disclosure(page)).not.toHaveAttribute('open', '');
    await expect(rows(page)).toHaveCount(30);
    // The announcement is the dominant payment only — never the schedule rows.
    await expect(live(page)).toContainText('estimated monthly payment');
    await expect(live(page)).not.toContainText('Balance');
  });

  test('open disclosure: caption + scoped headers + bounded overflow; opening does not announce', async ({ page }) => {
    await fillCore(page, '360000', '72000', '30', '6.5');
    await submit(page).click();
    const announced = await live(page).textContent();
    await disclosure(page).locator('summary').click();

    const table = page.locator('.mc-table');
    await expect(table.locator('caption')).toHaveText(/year-by-year|end of each year|amortization schedule/i);
    // Every column header carries scope="col".
    await expect(table.locator('thead th')).toHaveCount(4);
    for (let i = 0; i < 4; i++) await expect(table.locator('thead th').nth(i)).toHaveAttribute('scope', 'col');
    // Row headers (year) carry scope="row".
    await expect(rows(page).first().locator('th')).toHaveAttribute('scope', 'row');
    // The table lives inside a bounded, scrollable container on BOTH axes.
    const of = await page.locator('.mc-table-wrap').evaluate((el) => {
      const s = getComputedStyle(el);
      return { x: s.overflowX, y: s.overflowY, maxH: s.maxHeight };
    });
    expect(of.x).toBe('auto');
    expect(of.y).toBe('auto');
    expect(of.maxH).not.toBe('none'); // bounded vertical height
    // Opening the disclosure emits no new announcement.
    await expect(live(page)).toHaveText(announced ?? '');
  });

  test('valid live update: preserves the open disclosure, replaces rows, keeps focus, one announcement', async ({ page }) => {
    await fillCore(page, '360000', '72000', '30', '6.5');
    await submit(page).click();
    await disclosure(page).locator('summary').click();
    const firstBalance = await rows(page).first().locator('td').last().textContent();

    const rate = page.locator('[name="annualInterestRate"]');
    await rate.focus();
    await rate.fill('7');
    await page.waitForTimeout(DEBOUNCE);

    await expect(disclosure(page)).toHaveAttribute('open', ''); // stayed open
    await expect(rows(page)).toHaveCount(30); // rows replaced, still all present
    expect(await rows(page).first().locator('td').last().textContent()).not.toBe(firstBalance); // new numbers
    // Focus preserved on the edited field ⇒ the runtime did NOT run revealResult (its only scroll path,
    // which focuses the shell): a live update never scrolls or moves focus.
    await expect(rate).toBeFocused();
  });

  test('invalid live update: clears the summary + all rows, keeps focus, does not scroll', async ({ page }) => {
    await fillCore(page, '360000', '72000', '30', '6.5');
    await submit(page).click();
    await disclosure(page).locator('summary').click();
    await expect(rows(page)).toHaveCount(30);

    const price = page.locator('[name="homePrice"]');
    await price.focus();
    await price.fill('0'); // invalid
    await page.waitForTimeout(DEBOUNCE);

    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(region(page, 'valid')).toBeHidden(); // stale summary not visible
    await expect(rows(page)).toHaveCount(0); // rows cleared
    // Focus preserved on the edited field ⇒ the runtime did NOT run revealResult (its only scroll path):
    // an invalid live update never scrolls or moves focus.
    await expect(price).toBeFocused();
  });

  test('valid → invalid → valid keeps the schedule coherent (no stale rows survive)', async ({ page }) => {
    await fillCore(page, '360000', '72000', '30', '6.5');
    await submit(page).click();
    await disclosure(page).locator('summary').click();
    await page.fill('[name="homePrice"]', '0'); // invalid
    await page.waitForTimeout(DEBOUNCE);
    await expect(rows(page)).toHaveCount(0);
    await page.fill('[name="homePrice"]', '400000'); // valid again
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(rows(page)).toHaveCount(30);
  });

  test('zero-mortgage: no schedule disclosure, no empty table rendered, ongoing-cost result valid', async ({ page }) => {
    await fillCore(page, '300000', '300000', '30', '6');
    await openCosts(page);
    await page.fill('[name="propertyTaxAnnual"]', '3600');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(scheduleBlock(page)).toBeHidden(); // disclosure hidden
    await expect(rows(page)).toHaveCount(0); // no empty table body rows
    await expect(page.locator('[data-mc-tax]')).toHaveText('$300.00'); // ongoing cost still valid
  });
});

/* ---- Responsive / theme / embed / guide / monetization ------------------ */

test('desktop shows the dominant result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await fillCore(page, '360000', '72000', '30', '6.5');
  await submit(page).click();
  await expect(primary(page)).toBeInViewport();
});

test('mobile does not overflow horizontally', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await fillCore(page, '360000', '72000', '30', '6.5');
  await submit(page).click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await fillCore(page, '360000', '72000', '30', '6.5');
  await submit(page).click();
  await expect(primary(page)).toBeVisible();
});

test('the generated embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/finance/mortgage-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="homePrice"]', '360000');
  await page.fill('[name="downPayment"]', '72000');
  await page.selectOption('[name="loanTermYears"]', '30');
  await page.fill('[name="annualInterestRate"]', '6.5');
  await page.locator('[data-mc-submit]').click();
  await expect(page.locator('#mc-result [data-result-value]')).toHaveText('$1,820.36');
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});

/* ---- Guide-embedded regressions ----------------------------------------- */

for (const GUIDE of ['/guides/rent-vs-buy-a-home', '/guides/how-much-house-can-you-afford']) {
  test.describe(`guide embed (${GUIDE})`, () => {
    test('embeds one task-first calculator, empty with no stale result', async ({ page }) => {
      await page.goto(GUIDE, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('[data-mortgage]')).toHaveCount(1);
      await expect(page.locator('[name="homePrice"]')).toHaveValue('');
      await expect(page.locator('#mc-result')).toHaveAttribute('data-result-state', 'empty');
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1); // no duplicated H1
    });

    test('the guide-embedded calculator computes a valid result', async ({ page }) => {
      await page.goto(GUIDE, { waitUntil: 'domcontentloaded' });
      await page.fill('[name="homePrice"]', '360000');
      await page.fill('[name="downPayment"]', '72000');
      await page.selectOption('[name="loanTermYears"]', '30');
      await page.fill('[name="annualInterestRate"]', '6.5');
      await page.locator('[data-mc-submit]').click();
      await expect(page.locator('#mc-result')).toHaveAttribute('data-result-state', 'valid');
      await expect(page.locator('#mc-result [data-result-value]')).toHaveText('$1,820.36');
    });
  });
}

/* ---- Down-payment unit ($ / %) ------------------------------------------- */

/**
 * The down payment may be entered as dollars OR as a percent of the home price. Both feed the SAME
 * engine: the binding normalises a percent to absolute dollars before calculateMortgage runs, so
 * equivalent entries must agree exactly. Dollars is the structural default.
 *
 * These cover the DOM half of the feature — the unit switch, the affix, the per-unit input step and
 * the conversion wiring — which the node-environment unit tests deliberately do not reach (the pure
 * arithmetic lives in convertDownPayment / downPaymentAmount and is tested directly there).
 */
test.describe('down-payment unit toggle', () => {
  test('starts empty with $ selected, the $ affix showing and the dollar step', async ({ page }) => {
    await expect(page.locator('[name="homePrice"]')).toHaveValue('');
    await expect(downInput(page)).toHaveValue('');
    await expect(unitBtn(page, 'amount')).toHaveClass(/is-active/);
    await expect(unitBtn(page, 'amount')).toHaveAttribute('aria-checked', 'true');
    await expect(unitBtn(page, 'percent')).toHaveAttribute('aria-checked', 'false');
    await expect(affix(page, 'amount')).toBeVisible();
    await expect(affix(page, 'percent')).toBeHidden();
    await expect(downInput(page)).toHaveAttribute('step', '1000');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  test('$80,000 on a $400,000 home gives a $320,000 loan', async ({ page }) => {
    await fillCore(page, '400000', '80000', '30', '6.5');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(loanAmount(page)).toContainText('320,000');
  });

  test('20% on a $400,000 home gives the SAME loan and monthly payment as $80,000', async ({ page }) => {
    await fillCore(page, '400000', '80000', '30', '6.5');
    await submit(page).click();
    const dollarLoan = await loanAmount(page).textContent();
    const dollarPayment = await primary(page).textContent();

    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await page.fill('[name="homePrice"]', '400000');
    await unitBtn(page, 'percent').click();
    await page.fill('[name="downPayment"]', '20');
    await page.selectOption('[name="loanTermYears"]', '30');
    await page.fill('[name="annualInterestRate"]', '6.5');
    await submit(page).click();

    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(loanAmount(page)).toHaveText(dollarLoan!);
    await expect(primary(page)).toHaveText(dollarPayment!);
    await expect(loanAmount(page)).toContainText('320,000');
  });

  test('switching $ → % converts $80,000 to 20 and swaps the affix + step', async ({ page }) => {
    await page.fill('[name="homePrice"]', '400000');
    await page.fill('[name="downPayment"]', '80000');
    await unitBtn(page, 'percent').click();

    await expect(downInput(page)).toHaveValue('20');
    await expect(unitBtn(page, 'percent')).toHaveClass(/is-active/);
    await expect(affix(page, 'percent')).toBeVisible();
    await expect(affix(page, 'amount')).toBeHidden();
    await expect(downInput(page)).toHaveAttribute('step', '0.1');
  });

  test('switching % → $ converts 20 back to 80000 and restores the affix + step', async ({ page }) => {
    await page.fill('[name="homePrice"]', '400000');
    await unitBtn(page, 'percent').click();
    await page.fill('[name="downPayment"]', '20');
    await unitBtn(page, 'amount').click();

    await expect(downInput(page)).toHaveValue('80000');
    await expect(affix(page, 'amount')).toBeVisible();
    await expect(affix(page, 'percent')).toBeHidden();
    await expect(downInput(page)).toHaveAttribute('step', '1000');
  });

  test('a $ → % → $ round trip returns the original amount', async ({ page }) => {
    await page.fill('[name="homePrice"]', '400000');
    await page.fill('[name="downPayment"]', '80000');
    await unitBtn(page, 'percent').click();
    await expect(downInput(page)).toHaveValue('20');
    await unitBtn(page, 'amount').click();
    await expect(downInput(page)).toHaveValue('80000');
  });

  test('the live readout shows the OTHER unit in each mode', async ({ page }) => {
    await page.fill('[name="homePrice"]', '400000');
    await page.fill('[name="downPayment"]', '80000');
    await expect(downPct(page)).toHaveText('20% down');
    await unitBtn(page, 'percent').click();
    await expect(downPct(page)).toContainText('$80,000');
  });

  test('150% is rejected as a field error and does not calculate', async ({ page }) => {
    await page.fill('[name="homePrice"]', '400000');
    await unitBtn(page, 'percent').click();
    await page.fill('[name="downPayment"]', '150');
    await page.selectOption('[name="loanTermYears"]', '30');
    await page.fill('[name="annualInterestRate"]', '6.5');
    await submit(page).click();

    await expect(fieldError(page, 'downPayment')).toBeVisible();
    await expect(fieldError(page, 'downPayment')).toContainText('100%');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  });

  test('100% down is a valid zero mortgage in percent mode', async ({ page }) => {
    await page.fill('[name="homePrice"]', '400000');
    await unitBtn(page, 'percent').click();
    await page.fill('[name="downPayment"]', '100');
    await page.selectOption('[name="loanTermYears"]', '30');
    await page.fill('[name="annualInterestRate"]', '6.5');
    await submit(page).click();

    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(rows(page)).toHaveCount(0);
  });

  test('Reset restores the $ default, its step and an empty field', async ({ page }) => {
    await fillCore(page, '400000', '80000', '30', '6.5');
    await submit(page).click();
    await unitBtn(page, 'percent').click();
    await expect(downInput(page)).toHaveAttribute('step', '0.1');

    await page.locator('[data-reset]').click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(downInput(page)).toHaveValue('');
    await expect(unitBtn(page, 'amount')).toHaveClass(/is-active/);
    await expect(affix(page, 'amount')).toBeVisible();
    await expect(downInput(page)).toHaveAttribute('step', '1000');
  });
});

/* ---- Worked example (below the tool) ------------------------------------- */

/**
 * The example is clearly-labelled educational content BELOW the calculator — the visitor's own fields
 * stay empty (ratified product decision #1). Every figure is computed at build time by the same
 * calculateMortgage the calculator uses, so these assertions fail if the prose is ever hardcoded away
 * from the engine.
 */
test('the worked example renders engine-computed figures and leaves the fields empty', async ({ page }) => {
  const body = page.locator('body');
  await expect(body).toContainText('A worked example');
  await expect(body).toContainText('$400,000'); // home price
  await expect(body).toContainText('$80,000'); // 20% down, derived
  await expect(body).toContainText('$320,000'); // loan amount, derived
  await expect(body).toContainText('$2,022.62'); // monthly P&I from calculateMortgage
  await expect(body).toContainText('$408,142'); // total interest from calculateMortgage

  // The example never leaks into the visitor's own inputs or result.
  await expect(page.locator('[name="homePrice"]')).toHaveValue('');
  await expect(downInput(page)).toHaveValue('');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- Property tax + PMI units, and group independence -------------------- */

/**
 * Three INDEPENDENT unit groups share one form: down payment and property tax against the home
 * price, PMI against the loan. Each has its own active unit, its own affix, its own step and its own
 * reset default, and switching one must never disturb another — the property the scoped
 * `[data-unit-group]` runtime axis exists to guarantee.
 */
test.describe('multiple unit groups', () => {
  test('each group starts at its own default unit', async ({ page }) => {
    await openCosts(page);
    await expect(groupUnit(page, 'downPayment', 'amount')).toHaveClass(/is-active/);
    await expect(groupUnit(page, 'propertyTax', 'amount')).toHaveClass(/is-active/);
    await expect(groupUnit(page, 'pmi', 'percent')).toHaveClass(/is-active/); // engine-native
  });

  test('property tax converts $4,800 ↔ 1.2% against the home price', async ({ page }) => {
    await page.fill('[name="homePrice"]', '400000');
    await openCosts(page);
    await taxInput(page).fill('4800');
    await groupUnit(page, 'propertyTax', 'percent').click();
    await expect(taxInput(page)).toHaveValue('1.2');
    await expect(groupAffix(page, 'propertyTax', 'percent')).toBeVisible();
    await expect(taxInput(page)).toHaveAttribute('step', '0.1');

    await groupUnit(page, 'propertyTax', 'amount').click();
    await expect(taxInput(page)).toHaveValue('4800');
    await expect(groupAffix(page, 'propertyTax', 'amount')).toBeVisible();
    await expect(taxInput(page)).toHaveAttribute('step', '100');
  });

  test('PMI converts 1% ↔ $3,200 against the LOAN amount', async ({ page }) => {
    await fillCore(page, '400000', '80000', '30', '6.5');
    await openCosts(page);
    await pmiInput(page).fill('1');
    await groupUnit(page, 'pmi', 'amount').click();
    await expect(pmiInput(page)).toHaveValue('3200'); // 1% of the $320,000 loan
    await groupUnit(page, 'pmi', 'percent').click();
    await expect(pmiInput(page)).toHaveValue('1');
  });

  test('PMI does NOT convert when the loan amount cannot be resolved', async ({ page }) => {
    await openCosts(page);
    await pmiInput(page).fill('1'); // no home price entered yet
    await groupUnit(page, 'pmi', 'amount').click();
    await expect(pmiInput(page)).toHaveValue('1'); // left exactly as typed, never guessed
  });

  test('switching DOWN PAYMENT does not change property tax or PMI', async ({ page }) => {
    await page.fill('[name="homePrice"]', '400000');
    await openCosts(page);
    await page.fill('[name="downPayment"]', '80000');
    await taxInput(page).fill('4800');
    await pmiInput(page).fill('1');

    await groupUnit(page, 'downPayment', 'percent').click();

    await expect(page.locator('[name="downPayment"]')).toHaveValue('20'); // converted
    await expect(taxInput(page)).toHaveValue('4800'); // untouched
    await expect(pmiInput(page)).toHaveValue('1'); // untouched
    await expect(groupUnit(page, 'propertyTax', 'amount')).toHaveClass(/is-active/);
    await expect(groupUnit(page, 'pmi', 'percent')).toHaveClass(/is-active/);
  });

  test('switching PROPERTY TAX does not change down payment or PMI', async ({ page }) => {
    await page.fill('[name="homePrice"]', '400000');
    await openCosts(page);
    await page.fill('[name="downPayment"]', '80000');
    await taxInput(page).fill('4800');
    await pmiInput(page).fill('1');

    await groupUnit(page, 'propertyTax', 'percent').click();

    await expect(taxInput(page)).toHaveValue('1.2'); // converted
    await expect(page.locator('[name="downPayment"]')).toHaveValue('80000'); // untouched
    await expect(pmiInput(page)).toHaveValue('1'); // untouched
    await expect(groupUnit(page, 'downPayment', 'amount')).toHaveClass(/is-active/);
    await expect(groupUnit(page, 'pmi', 'percent')).toHaveClass(/is-active/);
  });

  test('switching PMI does not change down payment or property tax', async ({ page }) => {
    await page.fill('[name="homePrice"]', '400000');
    await openCosts(page);
    await page.fill('[name="downPayment"]', '80000');
    await taxInput(page).fill('4800');
    await pmiInput(page).fill('1');

    await groupUnit(page, 'pmi', 'amount').click();

    await expect(pmiInput(page)).toHaveValue('3200'); // converted
    await expect(page.locator('[name="downPayment"]')).toHaveValue('80000'); // untouched
    await expect(taxInput(page)).toHaveValue('4800'); // untouched
    await expect(groupUnit(page, 'downPayment', 'amount')).toHaveClass(/is-active/);
    await expect(groupUnit(page, 'propertyTax', 'amount')).toHaveClass(/is-active/);
  });

  test('equivalent entries in ALL THREE alternate units give the identical result', async ({ page }) => {
    await fillCore(page, '400000', '80000', '30', '6.5');
    await openCosts(page);
    await taxInput(page).fill('4800');
    await pmiInput(page).fill('1');
    await submit(page).click();
    const nativeTotal = await primary(page).textContent();
    const nativeLoan = await loanAmount(page).textContent();

    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await page.fill('[name="homePrice"]', '400000');
    await groupUnit(page, 'downPayment', 'percent').click();
    await page.fill('[name="downPayment"]', '20');
    await page.selectOption('[name="loanTermYears"]', '30');
    await page.fill('[name="annualInterestRate"]', '6.5');
    await openCosts(page);
    await groupUnit(page, 'propertyTax', 'percent').click();
    await taxInput(page).fill('1.2');
    await groupUnit(page, 'pmi', 'amount').click();
    await pmiInput(page).fill('3200');
    await submit(page).click();

    await expect(primary(page)).toHaveText(nativeTotal!);
    await expect(loanAmount(page)).toHaveText(nativeLoan!);
  });

  test('Reset restores EVERY group to its own default independently', async ({ page }) => {
    await fillCore(page, '400000', '80000', '30', '6.5');
    await openCosts(page);
    await taxInput(page).fill('4800');
    await pmiInput(page).fill('1');
    await submit(page).click();

    await groupUnit(page, 'downPayment', 'percent').click();
    await groupUnit(page, 'propertyTax', 'percent').click();
    await groupUnit(page, 'pmi', 'amount').click();

    await page.locator('[data-reset]').click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(groupUnit(page, 'downPayment', 'amount')).toHaveClass(/is-active/);
    await expect(groupUnit(page, 'propertyTax', 'amount')).toHaveClass(/is-active/);
    await expect(groupUnit(page, 'pmi', 'percent')).toHaveClass(/is-active/); // its OWN default
  });

  test('property tax entered as a percent follows a changed home price', async ({ page }) => {
    await fillCore(page, '400000', '80000', '30', '6.5');
    await openCosts(page);
    await groupUnit(page, 'propertyTax', 'percent').click();
    await taxInput(page).fill('1.2');
    await submit(page).click();
    const at400 = await primary(page).textContent();

    await page.fill('[name="homePrice"]', '500000');
    await expect(primary(page)).not.toHaveText(at400!); // 1.2% of the NEW price, not frozen dollars
    await expect(taxInput(page)).toHaveValue('1.2'); // the entered percent is preserved
  });
});
