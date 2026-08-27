import { test, expect, type Page } from '@playwright/test';

/**
 * Retirement calculator — the four retirement questions on one form.
 *
 * Task-first: personal fields start EMPTY behind a labelled worked example, the
 * visitor presses "Calculate Retirement" for the first result, live-after-first
 * thereafter. Mode is a native radio group INSIDE the form, so the shared runtime
 * recomputes on a mode change like any other input and mode state stays ephemeral.
 * The complete-result guard lives in the binding's resultValue (a NaN sentinel —
 * NO isUsableResult).
 *
 * The figures asserted here are the published reference case: age 35, retiring at
 * 67, life expectancy 85, $70,000 income rising 3% a year, 75% of it wanted in
 * retirement, 6% return, 3% inflation, $30,000 saved and 10% of income saved from
 * here. The engine's own tests pin the same case to the cent.
 */
const ROUTE = '/finance/retirement-calculator';
const DEBOUNCE = 350;

const shell = (page: Page) => page.locator('#ret-result');
const primary = (page: Page) => page.locator('#ret-result [data-result-when~="valid"] [data-result-value]');
const region = (page: Page, when: string) => page.locator(`#ret-result [data-result-when~="${when}"]`);
const live = (page: Page) => page.locator('#ret-live');
const submit = (page: Page) => page.locator('[data-ret-submit]');
const fieldError = (page: Page, name: string) => page.locator(`[data-error-for="${name}"]`);
const panel = (page: Page, mode: string) => page.locator(`[data-ret-panel="${mode}"]`);
const field = (page: Page, name: string) => page.locator(`[data-field="${name}"]`);

const REFERENCE = {
  currentAge: '35',
  retirementAge: '67',
  lifeExpectancy: '85',
  currentIncome: '70000',
  currentSavings: '30000',
};
const fillReference = async (page: Page) => {
  for (const [name, value] of Object.entries(REFERENCE)) await page.fill(`[name="${name}"]`, value);
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads with empty personal fields, the planning assumptions filled, and a labelled example', async ({ page }) => {
  for (const name of ['currentAge', 'retirementAge', 'lifeExpectancy', 'currentIncome', 'currentSavings', 'otherMonthlyIncome']) {
    await expect(page.locator(`[name="${name}"]`)).toHaveValue('');
  }
  // Assumptions are not the visitor's figures — an empty expected return is unanswerable.
  await expect(page.locator('[name="annualReturnPct"]')).toHaveValue('6');
  await expect(page.locator('[name="inflationPct"]')).toHaveValue('3');
  await expect(page.locator('[name="incomeIncreasePct"]')).toHaveValue('3');
  await expect(page.locator('[name="incomeNeededPct"]')).toHaveValue('75');
  await expect(page.locator('[name="futureSavingsPct"]')).toHaveValue('10');
  await expect(page.locator('[name="mode"][value="plan"]')).toBeChecked();
  await expect(submit(page)).toHaveText('Calculate Retirement');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  await expect(region(page, 'valid')).toBeVisible();
  await expect(live(page)).toHaveText('');
});

test('does not calculate before the first submission', async ({ page }) => {
  await page.fill('[name="currentAge"]', '35');
  await page.fill('[name="retirementAge"]', '67');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

test('offers the four retirement questions and names the selected one', async ({ page }) => {
  for (const mode of ['plan', 'save', 'withdraw', 'lasts']) {
    await expect(page.locator(`[name="mode"][value="${mode}"]`)).toHaveCount(1);
  }
  await expect(page.locator('[data-ret-mode-question]')).toHaveText('How much do you need to retire?');
  await page.check('[name="mode"][value="lasts"]');
  await expect(page.locator('[data-ret-mode-question]')).toHaveText('How long can your money last?');
});

/* ---- 1. How much do you need to retire? -------------------------------- */

test('the plan reproduces the published reference figures', async ({ page }) => {
  await fillReference(page);
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$1.88M');
  await expect(page.locator('[data-ret-need]')).toHaveText('$1.88M');
  await expect(page.locator('[data-ret-have]')).toHaveText('$1.10M');
  await expect(page.locator('[data-ret-readiness]')).toHaveText('58%');
  // The income each pot buys, in the dollars of the day and in today's money.
  await expect(page.locator('[data-ret-need-income]')).toHaveText('$11,266');
  await expect(page.locator('[data-ret-need-income-today]')).toHaveText('$4,375');
  await expect(page.locator('[data-ret-have-income]')).toHaveText('$6,589');
  await expect(page.locator('[data-ret-have-income-today]')).toHaveText('$2,559');
  expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
});

test('the plan says what reaching the target would take, three ways', async ({ page }) => {
  await fillReference(page);
  await submit(page).click();
  await expect(page.locator('[data-ret-save-block]')).toBeVisible();
  await expect(page.locator('[data-ret-save-heading]')).toHaveText('How can you save $1.88M?');
  await expect(page.locator('[data-ret-save-monthly]')).toHaveText('$1,504');
  await expect(page.locator('[data-ret-save-annual]')).toHaveText('$18,534');
  await expect(page.locator('[data-ret-save-pct]')).toHaveText('18.62%');
});

test('the balance-by-age chart draws both plans with a legend and a text alternative', async ({ page }) => {
  await fillReference(page);
  await submit(page).click();
  await expect(page.locator('[data-ret-chart] polyline')).toHaveCount(2);
  const svg = page.locator('[data-ret-chart] svg');
  await expect(svg).toHaveAttribute('role', 'img');
  await expect(svg).toHaveAttribute('aria-label', /Year-end balance by age/);
  // Identity never rests on colour alone.
  await expect(page.locator('[data-ret-panel="plan"] .ret-legend')).toContainText('If you save what you will have');
  await expect(page.locator('[data-ret-panel="plan"] .ret-legend')).toContainText('If you save what you need');
});

test('a plan that already covers the target says so instead of asking for more', async ({ page }) => {
  await fillReference(page);
  await page.fill('[name="currentSavings"]', '3000000');
  await submit(page).click();
  await expect(page.locator('[data-ret-ontrack]')).toBeVisible();
  await expect(page.locator('[data-ret-save-block]')).toBeHidden();
});

test('other retirement income lowers what the pot must fund, leaving the plan itself alone', async ({ page }) => {
  await fillReference(page);
  await submit(page).click();
  const have = await page.locator('[data-ret-have]').innerText();
  await page.fill('[name="otherMonthlyIncome"]', '3000');
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator('[data-ret-need]')).not.toHaveText('$1.88M');
  await expect(page.locator('[data-ret-have]')).toHaveText(have);
});

test('a dollar target and the equivalent percent reach the same answer', async ({ page }) => {
  await fillReference(page);
  await submit(page).click();
  const need = await page.locator('[data-ret-need]').innerText();
  // 75% of the income at retirement, entered as dollars a year.
  await page.selectOption('[name="incomeNeededUnit"]', 'amount');
  await page.fill('[name="incomeNeededPct"]', String(70000 * Math.pow(1.03, 32) * 0.75));
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator('[data-ret-need]')).toHaveText(need);
});

/* ---- The other three questions ----------------------------------------- */

test('switching question swaps the fields, and only the selected one is answered', async ({ page }) => {
  // Plan mode reads the income fields; "how long does it last" does not.
  await expect(field(page, 'currentIncome')).toBeVisible();
  await expect(field(page, 'potAmount')).toBeHidden();
  await page.check('[name="mode"][value="lasts"]');
  await expect(field(page, 'currentIncome')).toBeHidden();
  await expect(field(page, 'potAmount')).toBeVisible();
  await expect(field(page, 'monthlyWithdrawal')).toBeVisible();
  await expect(field(page, 'annualReturnPct')).toBeVisible(); // shared by every question
});

test('how can you save: a target, and what it takes to reach it', async ({ page }) => {
  await page.check('[name="mode"][value="save"]');
  await page.fill('[name="currentAge"]', '35');
  await page.fill('[name="retirementAge"]', '67');
  await page.fill('[name="amountNeeded"]', '600000');
  await page.fill('[name="currentSavings"]', '30000');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(panel(page, 'save')).toBeVisible();
  await expect(panel(page, 'plan')).toBeHidden();
  await expect(primary(page)).toHaveText('$363');
  await expect(page.locator('[data-ret-save2-annual]')).toHaveText('$4,471');
  await expect(page.locator('[data-ret-save2-alone]')).toHaveText('$194K');
  await expect(page.locator('[data-ret-save2-years]')).toHaveText('32');
});

test('how much can you withdraw: the pot, and the income it supports', async ({ page }) => {
  await page.check('[name="mode"][value="withdraw"]');
  await page.fill('[name="currentAge"]', '35');
  await page.fill('[name="retirementAge"]', '67');
  await page.fill('[name="lifeExpectancy"]', '85');
  await page.fill('[name="currentSavings"]', '30000');
  await page.fill('[name="monthlyContribution"]', '500');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(panel(page, 'withdraw')).toBeVisible();
  await expect(primary(page)).toHaveText('$4,521');
  await expect(page.locator('[data-ret-w-annual]')).toHaveText('$54,257');
  await expect(page.locator('[data-ret-w-years]')).toHaveText('18');
  await expect(page.locator('[data-ret-chart-w] polyline')).toHaveCount(1);
});

test('how long can your money last: a duration, and the case where it never runs out', async ({ page }) => {
  await page.check('[name="mode"][value="lasts"]');
  await page.fill('[name="potAmount"]', '600000');
  await page.fill('[name="monthlyWithdrawal"]', '5000');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(panel(page, 'lasts')).toBeVisible();
  await expect(primary(page)).toHaveText('15 years 3 months');
  await expect(page.locator('[data-ret-l-months]')).toHaveText('183');
  await expect(page.locator('[data-ret-l-never]')).toBeHidden();

  // $2,000 a month is below the hold point, so the balance grows and never runs out.
  await page.fill('[name="monthlyWithdrawal"]', '2000');
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).toHaveText('Indefinitely');
  await expect(page.locator('[data-ret-l-never]')).toBeVisible();
  await expect(page.locator('[data-ret-l-limit]')).toBeHidden();
  expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
});

/**
 * The band between the true hold point (B·rm/(1+rm) = $2,985.07 here) and the
 * naive B·rm ($3,000) is where a wrong threshold promises money that runs out.
 * $2,990 sits inside it: the balance falls, slowly, so the calculator must NOT
 * say "Indefinitely" — it says how long, and why.
 */
test('a withdrawal just above the hold point is never sold as permanent', async ({ page }) => {
  await page.check('[name="mode"][value="lasts"]');
  await page.fill('[name="potAmount"]', '600000');
  await page.fill('[name="monthlyWithdrawal"]', '2990');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('Over 100 years');
  await expect(page.locator('[data-ret-l-never]')).toBeHidden();
  await expect(page.locator('[data-ret-l-limit]')).toBeVisible();
  await expect(page.locator('[data-ret-l-limit]')).toContainText('still falling');

  // $2,995 is barely higher again, and empties the account inside the projection.
  await page.fill('[name="monthlyWithdrawal"]', '2995');
  await page.waitForTimeout(DEBOUNCE);
  await expect(primary(page)).toHaveText('95 years 5 months');
  await expect(page.locator('[data-ret-l-never]')).toBeHidden();
  await expect(page.locator('[data-ret-l-limit]')).toBeHidden();
});

test('the total withdrawn is the real sum, including a short final month', async ({ page }) => {
  await page.check('[name="mode"][value="lasts"]');
  await page.fill('[name="potAmount"]', '600000');
  await page.fill('[name="monthlyWithdrawal"]', '5000');
  await submit(page).click();
  // 183 months at $5,000 would be $915,000; the last month pays only what is left.
  await expect(page.locator('[data-ret-l-total]')).toHaveText('$911,128.18');
  await expect(page.locator('[data-ret-l-months]')).toHaveText('183');
});

/* ---- Validation --------------------------------------------------------- */

test('validation is scoped to the selected question', async ({ page }) => {
  // A blank age blocks the plan...
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(fieldError(page, 'currentAge')).toBeVisible();

  // ...but must not block a question that never reads it.
  await page.check('[name="mode"][value="lasts"]');
  await page.fill('[name="potAmount"]', '600000');
  await page.fill('[name="monthlyWithdrawal"]', '5000');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
});

test('ages must run forwards, and the messages say which way', async ({ page }) => {
  await fillReference(page);
  await page.fill('[name="retirementAge"]', '30');
  await submit(page).click();
  await expect(fieldError(page, 'retirementAge')).toContainText('greater than your current age');
  await page.fill('[name="retirementAge"]', '67');
  await page.fill('[name="lifeExpectancy"]', '60');
  await submit(page).click();
  await expect(fieldError(page, 'lifeExpectancy')).toContainText('greater than your retirement age');
});

test('a fractional or out-of-range age is rejected, never rounded', async ({ page }) => {
  await fillReference(page);
  for (const bad of ['35.5', '-1', '121']) {
    await page.fill('[name="currentAge"]', bad);
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(fieldError(page, 'currentAge')).toBeVisible();
  }
});

test('a 0% return is valid; a negative one is not', async ({ page }) => {
  await fillReference(page);
  await page.fill('[name="annualReturnPct"]', '0');
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await page.fill('[name="annualReturnPct"]', '-1');
  await submit(page).click();
  await expect(fieldError(page, 'annualReturnPct')).toContainText('zero or more');
});

/* ---- Live update / reset ------------------------------------------------ */

test('after the first result, edits update live and keep focus on the field', async ({ page }) => {
  await fillReference(page);
  await submit(page).click();
  await page.fill('[name="currentSavings"]', '100000');
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator('[data-ret-have]')).not.toHaveText('$1.10M');
  await expect(page.locator('[name="currentSavings"]')).toBeFocused();
});

test('reset clears the personal fields, restores the assumptions and the default question', async ({ page }) => {
  await page.check('[name="mode"][value="lasts"]');
  await page.fill('[name="potAmount"]', '600000');
  await page.fill('[name="monthlyWithdrawal"]', '5000');
  await submit(page).click();
  await page.fill('[name="annualReturnPct"]', '9');
  await page.click('[data-reset]');
  await expect(page.locator('[name="potAmount"]')).toHaveValue('');
  await expect(page.locator('[name="monthlyWithdrawal"]')).toHaveValue('');
  await expect(page.locator('[name="annualReturnPct"]')).toHaveValue('6');
  await expect(page.locator('[name="mode"][value="plan"]')).toBeChecked();
  await expect(field(page, 'currentIncome')).toBeVisible();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(live(page)).toHaveText('');
});

/* ---- Keyboard / responsive / theme / monetization ----------------------- */

test('keyboard submission works from a field', async ({ page }) => {
  await fillReference(page);
  await page.locator('[name="currentSavings"]').press('Enter');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
});

test('the question radios are reachable and operable from the keyboard', async ({ page }) => {
  await page.locator('[name="mode"][value="plan"]').focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('[name="mode"][value="save"]')).toBeChecked();
});

test('desktop shows the dominant result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await fillReference(page);
  await submit(page).click();
  await expect(primary(page)).toBeInViewport();
});

test('mobile does not overflow horizontally', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await fillReference(page);
  await submit(page).click();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await fillReference(page);
  await submit(page).click();
  await expect(primary(page)).toBeVisible();
});

test('the generated embed mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/finance/retirement-calculator', { waitUntil: 'domcontentloaded' });
  await fillReference(page);
  await page.locator('[data-ret-submit]').click();
  await expect(page.locator('#ret-result [data-result-when~="valid"] [data-result-value]')).toHaveText('$1.88M');
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
