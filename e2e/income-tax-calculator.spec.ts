import { test, expect, type Page } from '@playwright/test';

/**
 * Income tax — the reference's full return estimator.
 *
 * The published reference return is frozen here end to end: a single filer aged 30 with
 * $80,000 of wages and $9,000 withheld, for 2025, owes $49 — and every one of the eleven
 * lines behind that figure.
 */
const ROUTE = '/finance/income-tax-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#it-result');
const primary = (page: Page) => shell(page).locator('[data-result-when~="valid"] [data-result-value]').first();
const summaryLabel = (page: Page) => shell(page).locator('[data-result-when~="valid"] [data-result-summary-label]');
const row = (page: Page, key: string) => shell(page).locator(`[data-it-row="${key}"]`);
const submit = (page: Page) => page.getByRole('button', { name: 'Calculate' });
const clearBtn = (page: Page) => page.getByRole('button', { name: 'Clear' });

/** The published table, line for line. */
const REFERENCE: [string, string][] = [
  ['totalIncome', '$80,000'],
  ['totalDeductions', '$15,750'],
  ['taxableIncome', '$64,250'],
  ['regularTax', '$9,049'],
  ['alternativeMinimumTax', '$0'],
  ['netInvestmentIncomeTax', '$0'],
  ['totalCredits', '$0'],
  ['totalTaxWithCredits', '$9,049'],
  ['marginalRate', '22%'],
  ['prepayments', '$9,000'],
  ['amountOwed', '$49'],
];

/**
 * Other income and the itemised deductions live behind labelled disclosures so
 * Calculate lands closer to the first screen. Open whichever holds the field
 * before filling it, so these tests drive the same sheet they always did.
 */
const fill = async (page: Page, name: string, value: string) => {
  const field = page.locator(`[name="${name}"]`);
  await field.evaluate((el) => {
    const d = el.closest('details');
    if (d && !d.open) d.open = true;
  });
  await field.fill(value);
};

const calcReference = async (page: Page) => {
  await page.locator('[data-example-dismiss]').click();
  await fill(page, 'wages', '80000');
  await fill(page, 'federalWithheld', '9000');
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE);
});

test.describe('the optional parts of the sheet fold away', () => {
  test('they start closed, with the W-2 fields still visible', async ({ page }) => {
    const groups = page.locator('[data-it-more]');
    expect(await groups.count()).toBe(2);
    for (let i = 0; i < 2; i++) await expect(groups.nth(i)).not.toHaveAttribute('open', /.*/);
    for (const name of ['wages', 'federalWithheld', 'filingStatus']) {
      await expect(page.locator(`[name="${name}"]`)).toBeVisible();
    }
    await expect(page.locator('[name="longTermGains"]')).not.toBeVisible();
    await expect(page.locator('[name="mortgageInterest"]')).not.toBeVisible();
  });

  test('a folded field still counts once it is filled', async ({ page }) => {
    await page.locator('[data-example-dismiss]').click();
    await fill(page, 'wages', '80000');
    await submit(page).click();
    const plain = await primary(page).textContent();
    await fill(page, 'interestIncome', '5000');   // inside "Other income"
    await submit(page).click();
    await expect(primary(page)).not.toHaveText(plain!);
  });
});

/* ------------------------------------------------------------------ */
/* The reference return                                                */
/* ------------------------------------------------------------------ */

test.describe('the published reference return', () => {
  test('reproduces every line of the published table', async ({ page }) => {
    await calcReference(page);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    for (const [key, value] of REFERENCE) {
      await expect(row(page, key)).toHaveText(value);
    }
  });

  test('leads with what is owed, headed by the tax year', async ({ page }) => {
    await calcReference(page);
    await expect(summaryLabel(page)).toHaveText('Tax Amount Owe for 2025');
    await expect(primary(page)).toHaveText('$49');
  });

  test('explains the return in a sentence', async ({ page }) => {
    await calcReference(page);
    await expect(shell(page).locator('[data-it-interpretation]')).toContainText(
      'taking the $15,750 standard deduction',
    );
  });
});

/* ------------------------------------------------------------------ */
/* The reference field set                                             */
/* ------------------------------------------------------------------ */

test.describe('the reference field set', () => {
  test('offers the filing fields, structural choices set and typed fields blank', async ({ page }) => {
    await expect(page.locator('[name="filingStatus"]')).toHaveValue('single');
    await expect(page.locator('[name="taxYear"][value="2025"]')).toBeChecked();
    await expect(page.locator('[name="hasSelfEmployment"][value="no"]')).toBeChecked();
    for (const n of ['age', 'youngDependents', 'otherDependents']) {
      await expect(page.locator(`[name="${n}"]`)).toHaveValue('');
    }
  });

  test('offers the five filing statuses', async ({ page }) => {
    const opts = await page.locator('[name="filingStatus"] option').allTextContents();
    expect(opts.map((o) => o.trim())).toEqual([
      'Single', 'Married Filing Jointly', 'Married Filing Separately', 'Head of Household', 'Qualified Widow(er)',
    ]);
  });

  test('offers both tax years, each naming when the return is filed', async ({ page }) => {
    await expect(page.getByText('2026 (return filed in 2027)')).toBeVisible();
    await expect(page.getByText('2025 (return filed in 2026)')).toBeVisible();
  });

  test('carries every income field the reference carries, blank behind a 0 placeholder', async ({ page }) => {
    for (const name of [
      'wages', 'federalWithheld', 'stateWithheld', 'localWithheld', 'socialSecurityIncome',
      'interestIncome', 'ordinaryDividends', 'qualifiedDividends', 'passiveIncome',
      'shortTermGains', 'longTermGains', 'otherIncome', 'stateLocalRatePct',
    ]) {
      const box = page.locator(`[name="${name}"]`);
      await expect(box).toHaveValue('');
      await expect(box).toHaveAttribute('placeholder', '0');
    }
  });

  test('carries every deduction and credit field the reference carries', async ({ page }) => {
    for (const name of [
      'tipsIncome', 'overtimeIncome', 'carLoanInterest', 'iraContributions', 'realEstateTax',
      'mortgageInterest', 'charitableDonations', 'studentLoanInterest', 'childCareExpense',
      'college1', 'college2', 'college3', 'college4', 'otherDeductibles',
    ]) {
      await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
    }
  });

  test('labels the W-2 boxes and the credit limits, as the reference does', async ({ page }) => {
    const form = page.locator('form[data-form]');
    // The credit limits sit inside the optional disclosures; open them to read the labels.
    await page.locator('[data-it-more]').evaluateAll((els) => els.forEach((d) => ((d as HTMLDetailsElement).open = true)));
    for (const hint of [
      'W-2 box 1', 'W-2 box 2', 'W-2 box 17', 'W-2 box 19',
      'Max $10,000 for qualified vehicle purchase', 'Max $2,500/Person',
      'Max $3,000/Person, $6,000 total, up to age 13', 'Age 0-16', 'Age 17 or older',
      'SSA-1099, RRB-1099', '1099-INT', '1099-DIV',
    ]) {
      await expect(form.getByText(hint, { exact: true })).toBeVisible();
    }
  });

  test('lays money fields out two to a row', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    const wages = await page.locator('[name="wages"]').boundingBox();
    const withheld = await page.locator('[name="federalWithheld"]').boundingBox();
    // Same row: side by side, sharing a top edge.
    expect(Math.abs(wages!.y - withheld!.y)).toBeLessThan(4);
    expect(withheld!.x).toBeGreaterThan(wages!.x + wages!.width - 1);
  });
});

/* ------------------------------------------------------------------ */
/* Business income                                                     */
/* ------------------------------------------------------------------ */

test.describe('business income', () => {
  test('the amount box appears only once the filer says they have some', async ({ page }) => {
    const block = page.locator('[data-se-only]');
    await expect(block).toBeHidden();
    await page.locator('[name="hasSelfEmployment"][value="yes"]').check();
    await expect(block).toBeVisible();
  });

  test('saying no again empties the hidden box rather than leaving it to act invisibly', async ({ page }) => {
    await page.locator('[name="hasSelfEmployment"][value="yes"]').check();
    await fill(page, 'selfEmploymentIncome', '50000');
    await page.locator('[name="hasSelfEmployment"][value="no"]').check();
    await expect(page.locator('[name="selfEmploymentIncome"]')).toHaveValue('');
  });

  test('business income adds self-employment tax', async ({ page }) => {
    await page.locator('[data-example-dismiss]').click();
    await page.locator('[name="hasSelfEmployment"][value="yes"]').check();
    await fill(page, 'selfEmploymentIncome', '60000');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(row(page, 'totalIncome')).toHaveText('$60,000');
    // The bill is larger than income tax alone would be.
    await expect(row(page, 'totalTaxWithCredits')).not.toHaveText(await row(page, 'regularTax').innerText());
  });
});

/* ------------------------------------------------------------------ */
/* The rest of the return                                              */
/* ------------------------------------------------------------------ */

test.describe('the return responds to the sheet', () => {
  test('the 2026 year taxes the same income less', async ({ page }) => {
    await calcReference(page);
    const owed2025 = await row(page, 'taxableIncome').innerText();
    await page.locator('[name="taxYear"][value="2026"]').check();
    await page.waitForTimeout(DEBOUNCE);
    await expect(summaryLabel(page)).toContainText('2026');
    await expect(row(page, 'totalDeductions')).toHaveText('$16,100');
    expect(await row(page, 'taxableIncome').innerText()).not.toBe(owed2025);
  });

  test('a joint filer on the same income owes less', async ({ page }) => {
    await calcReference(page);
    await page.locator('[name="filingStatus"]').selectOption('mfj');
    await page.waitForTimeout(DEBOUNCE);
    await expect(summaryLabel(page)).toHaveText('Tax Refund for 2025');
  });

  test('dependants bring in the child credit', async ({ page }) => {
    await calcReference(page);
    await fill(page, 'youngDependents', '2');
    await page.waitForTimeout(DEBOUNCE);
    await expect(row(page, 'totalCredits')).toHaveText('$4,400');
    await expect(summaryLabel(page)).toHaveText('Tax Refund for 2025');
  });

  test('itemizing takes over once it beats the standard deduction', async ({ page }) => {
    await calcReference(page);
    await fill(page, 'mortgageInterest', '20000');
    await fill(page, 'charitableDonations', '5000');
    await page.waitForTimeout(DEBOUNCE);
    await expect(row(page, 'totalDeductions')).toHaveText('$25,000');
    await expect(shell(page).locator('[data-it-interpretation]')).toContainText('itemised deductions');
  });

  test('a refund is shown as a refund, not as a negative amount owed', async ({ page }) => {
    await page.locator('[data-example-dismiss]').click();
    await fill(page, 'wages', '80000');
    await fill(page, 'federalWithheld', '20000');
    await submit(page).click();
    await expect(summaryLabel(page)).toHaveText('Tax Refund for 2025');
    await expect(primary(page)).not.toContainText('-');
  });

  test('long-term gains are taxed more gently than the same money in wages', async ({ page }) => {
    await page.locator('[data-example-dismiss]').click();
    await fill(page, 'wages', '120000');
    await submit(page).click();
    const allWages = await row(page, 'regularTax').innerText();
    await fill(page, 'wages', '80000');
    await fill(page, 'longTermGains', '40000');
    await page.waitForTimeout(DEBOUNCE);
    const withGains = await row(page, 'regularTax').innerText();
    const toNumber = (s: string) => Number(s.replace(/[^0-9.]/g, ''));
    expect(toNumber(withGains)).toBeLessThan(toNumber(allWages));
  });
});

/* ------------------------------------------------------------------ */
/* Validation and behaviour                                            */
/* ------------------------------------------------------------------ */

test.describe('validation and behaviour', () => {
  test('rejects a negative amount', async ({ page }) => {
    await page.locator('[data-example-dismiss]').click();
    await fill(page, 'wages', '-100');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="wages"]')).toBeVisible();
  });

  test('rejects an impossible age but accepts a blank one', async ({ page }) => {
    await page.locator('[data-example-dismiss]').click();
    await fill(page, 'age', '200');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="age"]')).toBeVisible();
    // Live updates only begin after the first SUCCESSFUL calculation, so this takes a
    // second press — the shared runtime's behaviour, not this calculator's.
    await fill(page, 'age', '');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  });

  test('a blank sheet is a valid return owing nothing', async ({ page }) => {
    await page.locator('[data-example-dismiss]').click();
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(row(page, 'amountOwed')).toHaveText('$0');
  });

  test('updates live after the first calculation', async ({ page }) => {
    await calcReference(page);
    await fill(page, 'wages', '90000');
    await page.waitForTimeout(DEBOUNCE);
    await expect(row(page, 'totalIncome')).toHaveText('$90,000');
  });

  test('Clear empties the whole sheet', async ({ page }) => {
    await calcReference(page);
    await clearBtn(page).click();
    await expect(page.locator('[name="wages"]')).toHaveValue('');
    await expect(page.locator('[name="age"]')).toHaveValue('');
    await expect(page.locator('[name="filingStatus"]')).toHaveValue('single');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  test('no stale figure survives leaving the valid state', async ({ page }) => {
    await calcReference(page);
    await fill(page, 'wages', '-1');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(row(page, 'totalIncome')).toHaveText('—');
  });
});

/* ------------------------------------------------------------------ */
/* Doctrine                                                            */
/* ------------------------------------------------------------------ */

test.describe('doctrine', () => {
  test('never renders NaN, Infinity or a raw error', async ({ page }) => {
    await calcReference(page);
    await fill(page, 'wages', '99999999');
    await page.waitForTimeout(DEBOUNCE);
    const body = await page.locator('main').innerText();
    expect(body).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('announces the bottom line politely', async ({ page }) => {
    await expect(page.locator('#it-live')).toHaveAttribute('aria-live', 'polite');
    await calcReference(page);
    await expect(page.locator('#it-live')).toContainText('$49');
  });

  test('every control clears 44px', async ({ page }) => {
    // A radio's tap target is the label wrapping it, not the 17px dot itself.
    const small = await page.evaluate(
      () =>
        [...document.querySelectorAll('form[data-form] button, form[data-form] select, form[data-form] input')]
          .filter((e) => (e as HTMLElement).offsetParent !== null)
          .map((e) => e.closest('label') ?? e)
          .filter((e) => e.getBoundingClientRect().height < 44).length,
    );
    expect(small).toBe(0);
  });

  test('mobile stacks to one column and does not overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await calcReference(page);
    const { doc, win } = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }));
    expect(doc).toBeLessThanOrEqual(win);
  });

  test('the generated embed mounts the same island', async ({ page }) => {
    await page.goto('/embed/finance/income-tax-calculator');
    await calcReference(page);
    await expect(page.locator('[data-it-row="amountOwed"]')).toHaveText('$49');
  });
});
