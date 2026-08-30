import { test, expect, type Page } from '@playwright/test';

/**
 * Auto Loan calculator — R11C1 task-first migration (finance complex-form). Wraps the UNCHANGED
 * calculateAutoLoan / @lib/finance engine; the complete-result guard lives in the binding's
 * resultValue (NaN sentinel — NO isUsableResult). Task-first: empty personal fields, term 60 +
 * "Finance taxes and fees" checked as structural defaults, "Calculate Auto Loan Payment" for the first
 * result, live-after-first. Sales tax is on the FULL price (no trade-in credit); negative trade-in
 * equity is supported and shown signed; a zero financed balance is a valid informational result.
 */
const ROUTE = '/finance/auto-loan-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#al-result');
const primary = (page: Page) => page.locator('#al-result [data-result-value]');
const financedAmt = (page: Page) => page.locator('[data-al-financed]');
const tax = (page: Page) => page.locator('[data-al-tax]');
const interest = (page: Page) => page.locator('[data-al-interest]');
const top = (page: Page) => page.locator('[data-al-top]');
const upfront = (page: Page) => page.locator('[data-al-upfront]');
const totalCost = (page: Page) => page.locator('[data-al-total]');
const interpretation = (page: Page) => page.locator('[data-al-interpretation]');
const toggleNote = (page: Page) => page.locator('[data-al-toggle-note]');
const equityRow = (page: Page) => page.locator('[data-al-equity-row]');
const equityVal = (page: Page) => page.locator('[data-al-equity]');
const equityNote = (page: Page) => page.locator('[data-al-equity-note]');
const live = (page: Page) => page.locator('#al-live');
const submit = (page: Page) => page.locator('[data-al-submit]');
const finance = (page: Page) => page.locator('[name="includeTaxesFeesInLoan"]');
const term = (page: Page) => page.locator('[name="loanTermMonths"]');
const region = (page: Page, when: string) => page.locator(`#al-result [data-result-when~="${when}"]`);

const calc = async (page: Page, price: string, rate: string, opts: { down?: string; tax?: string } = {}) => {
  await page.fill('[name="autoPrice"]', price);
  await page.fill('[name="interestRatePct"]', rate);
  if (opts.down !== undefined) await page.fill('[name="downPayment"]', opts.down);
  if (opts.tax !== undefined) await page.fill('[name="salesTaxRatePct"]', opts.tax);
  await submit(page).click();
};

/**
 * Trade-in, tax and fees live behind a labelled disclosure so Calculate lands on
 * the first screen. Open it for the suite, so every test sees the same fields it
 * always did; the disclosure's own behaviour is asserted separately below.
 */
const openMore = async (page: Page) => {
  const more = page.locator('[data-al-more]');
  if (await more.count()) await more.locator('summary').click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await openMore(page);
});

test.describe('the optional fields fold away', () => {
  test('it starts closed, with the fields that decide the payment still visible', async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' }); // fresh, before openMore
    await expect(page.locator('[data-al-more]')).not.toHaveAttribute('open', /.*/);
    for (const name of ['autoPrice', 'loanTermMonths', 'interestRatePct', 'downPayment', 'tradeInValue']) {
      await expect(page.locator(`[name="${name}"]`)).toBeVisible();
    }
    for (const name of ['salesTaxRatePct', 'fees', 'includeTaxesFeesInLoan']) {
      await expect(page.locator(`[name="${name}"]`)).not.toBeVisible();
    }
    await expect(submit(page)).toBeInViewport();
  });

  test('opening it reveals the rest, and they still reach the answer', async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await openMore(page);
    await expect(page.locator('[name="salesTaxRatePct"]')).toBeVisible();
    await calc(page, '50000', '6', { tax: '7' });
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(tax(page)).not.toHaveText('—');
  });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: blank personal fields, term 60, finance unchecked, empty result, no auto-calc', async ({ page }) => {
  await expect(page.locator('[name="autoPrice"]')).toHaveValue('');
  await expect(page.locator('[name="interestRatePct"]')).toHaveValue('');
  await expect(page.locator('[name="downPayment"]')).toHaveValue('');
  await expect(term(page)).toHaveValue('60');
  await expect(finance(page)).not.toBeChecked(); // taxes and fees are due upfront by default
  await expect(submit(page)).toHaveText('Calculate Auto Loan Payment');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  // The example fills this calculator's OWN valid region, so it is visible on load.
  await expect(region(page, 'valid')).toBeVisible();
  await expect(live(page)).toHaveText('');
});

test('does not calculate before the first submission', async ({ page }) => {
  await page.fill('[name="autoPrice"]', '30000');
  await page.fill('[name="interestRatePct"]', '5');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

test('trade-in, fees and incentives are first-class fields, not hidden behind a disclosure', async ({ page }) => {
  for (const name of ['tradeInValue', 'amountOwedOnTradeIn', 'fees', 'cashIncentives']) {
    await expect(page.locator(`[name="${name}"]`)).toBeVisible();
  }
});

/* ---- Ordinary result ---------------------------------------------------- */

test('ordinary financed loan: payment, financed amount, sales tax, interest, total of payments, announcement', async ({ page }) => {
  await page.fill('[name="autoPrice"]', '30000');
  await page.fill('[name="interestRatePct"]', '5');
  await page.fill('[name="downPayment"]', '3000');
  await page.fill('[name="salesTaxRatePct"]', '7');
  await page.fill('[name="fees"]', '300');
  await finance(page).check();
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$554.81');
  await expect(financedAmt(page)).toHaveText('$29,400.00');
  await expect(tax(page)).toHaveText('$2,100.00');
  await expect(interest(page)).toHaveText('$3,888.86');
  await expect(top(page)).toHaveText('$33,288.86');
  await expect(upfront(page)).toHaveText('$3,000.00');
  await expect(totalCost(page)).toHaveText('$36,288.86');
  await expect(interpretation(page)).toContainText('$554.81 per month for 60 months');
  await expect(live(page)).toHaveText('Your estimated monthly payment is 554 dollars and 81 cents.');
});

test('a zero interest rate is valid (payment = financed / months, no interest)', async ({ page }) => {
  await finance(page).check();
  await calc(page, '30000', '0', { down: '3000', tax: '7' });
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$485.00'); // (30000 + 2100 tax − 3000 down) / 60, no fees
  await expect(interest(page)).toHaveText('$0.00');
});

test('no NaN / Infinity / undefined for an ordinary result', async ({ page }) => {
  await calc(page, '30000', '5', { down: '3000' });
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
});

test('the result states USD and the tax-jurisdiction assumption', async ({ page }) => {
  await calc(page, '30000', '5');
  await expect(shell(page)).toContainText('US dollars (USD)');
  await expect(shell(page)).toContainText('applies the entered sales-tax rate to the full vehicle price and does not apply a trade-in tax credit');
});

/* ---- Finance-taxes-and-fees toggle -------------------------------------- */

test('toggling finance ON before the first calculation does not calculate', async ({ page }) => {
  await finance(page).check();
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

test('after the first result, toggling finance recalculates live, keeps focus on the checkbox, one announcement', async ({ page }) => {
  await page.fill('[name="autoPrice"]', '30000');
  await page.fill('[name="interestRatePct"]', '5');
  await page.fill('[name="downPayment"]', '3000');
  await page.fill('[name="salesTaxRatePct"]', '7');
  await page.fill('[name="fees"]', '300');
  await finance(page).check();
  await submit(page).click();
  await expect(primary(page)).toHaveText('$554.81');
  await expect(toggleNote(page)).toContainText('includes the entered sales tax and fees');

  await finance(page).uncheck();
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).toHaveText('$509.52'); // taxes/fees no longer financed
  await expect(financedAmt(page)).toHaveText('$27,000.00');
  await expect(upfront(page)).toHaveText('$5,400.00');
  await expect(toggleNote(page)).toContainText('excludes the entered sales tax and fees');
  await expect(finance(page)).toBeFocused(); // focus stays on the checkbox
});

test('changing the loan term recalculates after the first result (shorter term → higher payment)', async ({ page }) => {
  await calc(page, '30000', '5', { down: '3000', tax: '7' });
  const num = async () => parseFloat((await primary(page).textContent())!.replace(/[$,]/g, ''));
  const p60 = await num();
  await term(page).fill('36');
  await page.waitForTimeout(DEBOUNCE);
  const p36 = await num();
  expect(p36).toBeGreaterThan(p60);
});

/* ---- Trade-in / negative equity ----------------------------------------- */

test('negative trade-in equity is supported and shown as a signed value, not a positive credit', async ({ page }) => {
  await page.fill('[name="autoPrice"]', '30000');
  await page.fill('[name="interestRatePct"]', '5');
  await page.fill('[name="downPayment"]', '3000');
  await page.fill('[name="salesTaxRatePct"]', '7');
  await page.fill('[name="tradeInValue"]', '10000');
  await page.fill('[name="amountOwedOnTradeIn"]', '14000');
  await page.fill('[name="fees"]', '300');
  await finance(page).check();
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(financedAmt(page)).toHaveText('$33,400.00'); // negative equity increased the loan
  await expect(equityRow(page)).toBeVisible();
  await expect(equityVal(page)).toHaveText('−$4,000.00'); // signed, not positive
  await expect(equityNote(page)).toContainText('$4,000.00 of negative equity');
});

test('a positive / no trade-in shows no negative-equity row', async ({ page }) => {
  await calc(page, '30000', '5', { down: '3000' });
  await expect(equityRow(page)).toBeHidden();
  await expect(equityNote(page)).toBeHidden();
});

/* ---- Zero financed balance (informational) ------------------------------ */

test('a zero financed balance is a VALID informational result, not an error', async ({ page }) => {
  await calc(page, '30000', '5', { down: '35000' }); // credits exceed the base
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid'); // NOT invalid
  await expect(primary(page)).toHaveText('$0.00');
  await expect(financedAmt(page)).toHaveText('$0.00');
  await expect(interest(page)).toHaveText('$0.00');
  await expect(interpretation(page)).toContainText('no auto-loan balance remains');
  await expect(live(page)).toHaveText('No auto-loan balance remains based on the entered values.');
});

/* ---- Validation --------------------------------------------------------- */

test('an empty submission focuses the vehicle price first and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const price = page.locator('[name="autoPrice"]');
  await expect(price).toBeFocused();
  await expect(price).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-error-for="autoPrice"]')).toHaveText('Enter a vehicle price.');
});

test('a zero vehicle price and a negative rate are field errors', async ({ page }) => {
  await calc(page, '0', '5');
  await expect(page.locator('[data-error-for="autoPrice"]')).toHaveText('Enter a vehicle price greater than zero.');
  await calc(page, '30000', '-2');
  await expect(page.locator('[data-error-for="interestRatePct"]')).toHaveText('Enter an interest rate of zero or more.');
});

test('a negative optional amount is a field error; empty optionals are fine', async ({ page }) => {
  await page.fill('[name="autoPrice"]', '30000');
  await page.fill('[name="interestRatePct"]', '5');
  await page.fill('[name="downPayment"]', '-500');
  await submit(page).click();
  await expect(page.locator('[data-error-for="downPayment"]')).toHaveText('Enter a down payment of zero or more.');
});

/* ---- Reset -------------------------------------------------------------- */

test('reset clears fields and restores term 60 + finance unchecked, emptying the result', async ({ page }) => {
  await calc(page, '30000', '5', { down: '3000' });
  await term(page).fill('72');
  await finance(page).check();
  await page.click('[data-reset]');
  await expect(page.locator('[name="autoPrice"]')).toHaveValue('');
  await expect(page.locator('[name="downPayment"]')).toHaveValue('');
  await expect(term(page)).toHaveValue('60');
  await expect(finance(page)).not.toBeChecked(); // taxes and fees are due upfront by default
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(live(page)).toHaveText('');
});

test('keyboard submission works from a field', async ({ page }) => {
  await page.fill('[name="autoPrice"]', '30000');
  await page.locator('[name="interestRatePct"]').fill('0');
  await page.locator('[name="interestRatePct"]').press('Enter');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
});

/* ---- Responsive / theme / embed / guide / monetization ------------------ */

test('desktop shows the dominant result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calc(page, '30000', '5', { down: '3000' });
  await expect(primary(page)).toBeInViewport();
});

test('mobile does not overflow horizontally', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await calc(page, '30000', '5', { down: '3000' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calc(page, '30000', '5', { down: '3000' });
  await expect(primary(page)).toBeVisible();
});

test('the generated embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/finance/auto-loan-calculator', { waitUntil: 'domcontentloaded' });
  await openMore(page);
  await page.fill('[name="autoPrice"]', '30000');
  await page.fill('[name="interestRatePct"]', '0');
  await page.fill('[name="downPayment"]', '3000');
  await page.fill('[name="salesTaxRatePct"]', '7');
  await page.locator('[name="includeTaxesFeesInLoan"]').check();
  await page.locator('[data-al-submit]').click();
  await expect(page.locator('#al-result [data-result-when~="valid"] [data-result-value]')).toHaveText('$485.00');
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});

/* ---- Guide-embedded regression ------------------------------------------ */

test.describe('guide embed (getting-the-best-auto-loan)', () => {
  const GUIDE = '/guides/getting-the-best-auto-loan';

  test('the guide embeds one task-first calculator, empty with no stale result', async ({ page }) => {
    await page.goto(GUIDE, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-autoloan]')).toHaveCount(1);
    await expect(page.locator('[name="autoPrice"]')).toHaveValue('');
    await expect(page.locator('#al-result')).toHaveAttribute('data-result-state', 'example');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1); // no duplicated H1
  });

  test('the guide-embedded calculator computes a valid result', async ({ page }) => {
    await page.goto(GUIDE, { waitUntil: 'domcontentloaded' });
    await openMore(page);
    await page.fill('[name="autoPrice"]', '30000');
    await page.fill('[name="interestRatePct"]', '0');
    await page.fill('[name="downPayment"]', '3000');
    await page.fill('[name="salesTaxRatePct"]', '7');
    await page.locator('[name="includeTaxesFeesInLoan"]').check();
    await page.locator('[data-al-submit]').click();
    await expect(page.locator('#al-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('#al-result [data-result-when~="valid"] [data-result-value]')).toHaveText('$485.00');
  });
});

/* ---- The reference field set, breakdown, chart and schedule ------------- */

/**
 * The published reference case this calculator is expected to reproduce: a $50,000
 * car over 60 months at 5%, $10,000 down, 7% sales tax, $2,000 of fees, taxes and
 * fees paid upfront. Every figure asserted below is that published result.
 */
const REF = { price: '50000', term: '60', rate: '5', down: '10000', tax: '7', fees: '2000' };
const fillReference = async (page: Page) => {
  await page.fill('[name="autoPrice"]', REF.price);
  await page.fill('[name="loanTermMonths"]', REF.term);
  await page.fill('[name="interestRatePct"]', REF.rate);
  await page.fill('[name="downPayment"]', REF.down);
  await page.fill('[name="salesTaxRatePct"]', REF.tax);
  await page.fill('[name="fees"]', REF.fees);
};
const openSchedule = (page: Page) => page.locator('[data-al-schedule-disclosure] > summary').click();
const yearlyRows = (page: Page) => page.locator('[data-al-rows="yearly"] tr');
const monthlyRows = (page: Page) => page.locator('[data-al-rows="monthly"] tr.al-row');
const yearEnds = (page: Page) => page.locator('[data-al-rows="monthly"] tr.al-year-end');

test.describe('auto loan: the reference field set and result', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await openMore(page);
  });

  test('offers every field the reference product does, by name', async ({ page }) => {
    for (const name of [
      'autoPrice', 'loanTermMonths', 'interestRatePct', 'cashIncentives', 'downPayment',
      'tradeInValue', 'amountOwedOnTradeIn', 'stateCode', 'salesTaxRatePct', 'fees',
      'includeTaxesFeesInLoan',
    ]) {
      await expect(page.locator(`[name="${name}"]`)).toHaveCount(1);
    }
    // Taxes and fees are due upfront unless the visitor says otherwise.
    await expect(page.locator('[name="includeTaxesFeesInLoan"]')).not.toBeChecked();
    await expect(page.locator('[name="loanTermMonths"]')).toHaveValue('60');
  });

  test('reproduces the published summary to the cent', async ({ page }) => {
    await fillReference(page);
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('#al-result [data-result-when~="valid"] [data-result-value]')).toHaveText('$754.85');
    await expect(page.locator('[data-al-financed]')).toHaveText('$40,000.00');
    await expect(page.locator('[data-al-tax]')).toHaveText('$3,500.00');
    await expect(page.locator('[data-al-upfront]')).toHaveText('$15,500.00');
    await expect(page.locator('[data-al-top-label]')).toHaveText('Total of 60 loan payments');
    await expect(page.locator('[data-al-top]')).toHaveText('$45,290.96');
    await expect(page.locator('[data-al-interest]')).toHaveText('$5,290.96');
    await expect(page.locator('[data-al-total]')).toHaveText('$60,790.96');
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('the loan breakdown splits 88% principal / 12% interest, labelled not colour-coded', async ({ page }) => {
    await fillReference(page);
    await submit(page).click();
    await expect(page.locator('[data-al-breakdown]')).toBeVisible();
    await expect(page.locator('[data-al-share-principal]')).toHaveText('88%');
    await expect(page.locator('[data-al-share-interest]')).toHaveText('12%');
    await expect(page.locator('[data-al-share-principal-amt]')).toHaveText('$40,000.00');
    await expect(page.locator('[data-al-share-interest-amt]')).toHaveText('$5,290.96');
    // The bar is decoration over the labelled figures, so it is hidden from AT.
    await expect(page.locator('[data-al-breakdown] .al-bar')).toHaveAttribute('aria-hidden', 'true');
    const w = await page.locator('[data-al-seg="principal"]').evaluate((el) => (el as HTMLElement).style.width);
    expect(parseFloat(w)).toBeGreaterThan(85);
  });

  test('the annual schedule reproduces the published rows', async ({ page }) => {
    await fillReference(page);
    await submit(page).click();
    await openSchedule(page);
    await expect(yearlyRows(page)).toHaveCount(5);
    const expected = [
      ['1', '$1,835.98', '$7,222.21', '$32,777.79'],
      ['2', '$1,466.48', '$7,591.71', '$25,186.08'],
      ['3', '$1,078.07', '$7,980.12', '$17,205.96'],
      ['4', '$669.80', '$8,388.40', '$8,817.56'],
      ['5', '$240.63', '$8,817.56', '$0.00'],
    ];
    for (const [i, cells] of expected.entries()) {
      await expect(yearlyRows(page).nth(i)).toHaveText(cells.join(''));
    }
  });

  test('the monthly schedule reproduces the published rows and closes each year', async ({ page }) => {
    await fillReference(page);
    await submit(page).click();
    await openSchedule(page);
    await page.check('[name="al-view"][value="monthly"]');
    await expect(monthlyRows(page)).toHaveCount(60);
    await expect(monthlyRows(page).nth(0)).toHaveText(['1', '$166.67', '$588.18', '$39,411.82'].join(''));
    await expect(monthlyRows(page).nth(11)).toHaveText(['12', '$139.14', '$615.71', '$32,777.79'].join(''));
    await expect(yearEnds(page)).toHaveCount(5);
    await expect(yearEnds(page).first()).toHaveText('End of year 1');
    await expect(yearEnds(page).last()).toHaveText('End of year 5');
  });

  test('Annual/Monthly is one switch over rows already rendered', async ({ page }) => {
    await fillReference(page);
    await submit(page).click();
    await openSchedule(page);
    await expect(page.locator('.al-view__legend')).toHaveText('Schedule');
    await expect(yearlyRows(page).first()).toBeVisible();
    await expect(monthlyRows(page).first()).toBeHidden();
    await page.check('[name="al-view"][value="monthly"]');
    await expect(monthlyRows(page).first()).toBeVisible();
    await expect(yearlyRows(page).first()).toBeHidden();
  });

  test('the balance chart draws three labelled series with a text alternative', async ({ page }) => {
    await fillReference(page);
    await submit(page).click();
    await openSchedule(page);
    await expect(page.locator('[data-al-chart] polyline')).toHaveCount(3);
    const svg = page.locator('[data-al-chart] svg');
    await expect(svg).toHaveAttribute('role', 'img');
    await expect(svg).toHaveAttribute('aria-label', /Balance falls from \$40,000\.00 to zero over 60 months/);
    // Identity never rests on colour alone.
    await expect(page.locator('.al-legend--chart')).toContainText('Balance');
    await expect(page.locator('.al-legend--chart')).toContainText('Interest paid');
    await expect(page.locator('.al-legend--chart')).toContainText('Total paid');
  });

  test('cash incentives lower the loan without touching the sales tax', async ({ page }) => {
    await fillReference(page);
    await submit(page).click();
    await expect(page.locator('[data-al-incentives-row]')).toBeHidden();
    await page.fill('[name="cashIncentives"]', '2000');
    await page.waitForTimeout(DEBOUNCE);
    await expect(page.locator('[data-al-incentives-row]')).toBeVisible();
    await expect(page.locator('[data-al-incentives]')).toHaveText('−$2,000.00');
    await expect(page.locator('[data-al-financed]')).toHaveText('$38,000.00');
    await expect(page.locator('[data-al-tax]')).toHaveText('$3,500.00'); // unchanged
  });

  test('picking a state fills the sales-tax field, which stays the visitor\'s to correct', async ({ page }) => {
    await page.selectOption('[name="stateCode"]', 'CA');
    await expect(page.locator('[name="salesTaxRatePct"]')).toHaveValue('7.25');
    // Typing over the rate releases the state, so the pair never claims a rate it lacks.
    await page.fill('[name="salesTaxRatePct"]', '9');
    await expect(page.locator('[name="stateCode"]')).toHaveValue('');
    await page.selectOption('[name="stateCode"]', 'OR');
    await expect(page.locator('[name="salesTaxRatePct"]')).toHaveValue('0');
  });

  test('an off-list term is accepted; a fractional or over-cap one is rejected', async ({ page }) => {
    await fillReference(page);
    await page.fill('[name="loanTermMonths"]', '54');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('[data-al-top-label]')).toHaveText('Total of 54 loan payments');
    await page.fill('[name="loanTermMonths"]', '121');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="loanTermMonths"]')).toContainText('1 to 120 months');
  });

  test('a zero loan shows no breakdown, chart or schedule to plot', async ({ page }) => {
    await page.fill('[name="autoPrice"]', '20000');
    await page.fill('[name="interestRatePct"]', '5');
    await page.fill('[name="downPayment"]', '25000');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('[data-al-breakdown]')).toBeHidden();
    await expect(page.locator('[data-al-schedule-block]')).toBeHidden();
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('reset restores the term, the checkbox, the Annual view and closes the schedule', async ({ page }) => {
    await fillReference(page);
    await page.check('[name="includeTaxesFeesInLoan"]');
    await page.fill('[name="cashIncentives"]', '1000');
    await submit(page).click();
    await openSchedule(page);
    await page.check('[name="al-view"][value="monthly"]');
    await page.click('[data-reset]');
    await expect(page.locator('[name="loanTermMonths"]')).toHaveValue('60');
    await expect(page.locator('[name="includeTaxesFeesInLoan"]')).not.toBeChecked();
    await expect(page.locator('[name="cashIncentives"]')).toHaveValue('');
    await expect(page.locator('[name="stateCode"]')).toHaveValue('');
    await expect(page.locator('[name="al-view"][value="yearly"]')).toBeChecked();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  test('mobile keeps the schedule scrolling inside its own container', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await openMore(page);
    await fillReference(page);
    await submit(page).click();
    await openSchedule(page);
    await page.check('[name="al-view"][value="monthly"]');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
});
