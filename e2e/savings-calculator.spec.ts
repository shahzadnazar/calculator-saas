import { test, expect, type Page } from '@playwright/test';

/**
 * Savings calculator — R8D1 standard-form wave (calculator #16; product family MULTI-MODE,
 * on the standard-form runtime UNCHANGED — no isUsableResult). Two modes ("Project savings"
 * / "Reach a savings goal") swap ONE conditional field. Project carries a total-deposited +
 * interest breakdown; goal is single-value; a goal already reached by the grown starting
 * balance is a VALID $0 result. SUMMARY-ONLY — the yearly series is never rendered.
 */
const ROUTE = '/finance/savings-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#sv-result');
const primary = (page: Page) => page.locator('#sv-result [data-result-value]');
const summaryLabel = (page: Page) => page.locator('#sv-result [data-result-summary-label]');
const contrib = (page: Page) => page.locator('#sv-result [data-sv-contrib]');
const interest = (page: Page) => page.locator('#sv-result [data-sv-interest]');
const interpretation = (page: Page) => page.locator('#sv-result [data-sv-interpretation]');
const breakdown = (page: Page) => page.locator('#sv-result [data-sv-breakdown]');
const liveRegion = (page: Page) => page.locator('#sv-live');
const submit = (page: Page) => page.locator('[data-sv-submit]');
const region = (page: Page, when: string) => page.locator(`#sv-result [data-result-when~="${when}"]`);

const calcProject = async (page: Page, start: string, rate: string, years: string, monthly: string) => {
  await page.fill('[name="startingAmount"]', start);
  await page.fill('[name="annualRatePct"]', rate);
  await page.fill('[name="years"]', years);
  await page.fill('[name="monthlyContribution"]', monthly);
  await submit(page).click();
};

const calcGoal = async (page: Page, start: string, rate: string, years: string, goal: string) => {
  await page.check('[name="mode"][value="goal"]');
  await page.fill('[name="startingAmount"]', start);
  await page.fill('[name="annualRatePct"]', rate);
  await page.fill('[name="years"]', years);
  await page.fill('[name="goal"]', goal);
  await submit(page).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Initial state ------------------------------------------------------ */

test('loads empty: Project mode, blank fields, result empty, Project Savings action, no live note', async ({ page }) => {
  await expect(page.locator('[name="mode"][value="project"]')).toBeChecked();
  await expect(page.locator('[name="startingAmount"]')).toHaveValue('');
  await expect(page.locator('[name="monthlyContribution"]')).toHaveValue('');
  await expect(submit(page)).toHaveText('Project Savings');
  await expect(page.locator('[data-sv-project]')).toBeVisible();
  await expect(page.locator('[data-sv-goal]')).toBeHidden();
  await expect(page.locator('[name="goal"]')).toBeDisabled();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(region(page, 'empty')).toBeVisible();
  await expect(region(page, 'valid')).toBeHidden();
  await expect(page.locator('[data-live-note]')).toBeHidden();
  await expect(liveRegion(page)).toHaveText('');
});

test('does not calculate before the first submission', async ({ page }) => {
  await page.fill('[name="startingAmount"]', '1000');
  await page.fill('[name="annualRatePct"]', '4');
  await page.fill('[name="years"]', '10');
  await page.fill('[name="monthlyContribution"]', '300');
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

/* ---- Project savings ---------------------------------------------------- */

test('valid Project result: projected balance dominant, deposited + interest breakdown', async ({ page }) => {
  await calcProject(page, '10000', '5', '10', '300');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(summaryLabel(page)).toHaveText('Projected savings balance');
  await expect(primary(page)).toHaveText('$63,054.78');
  await expect(breakdown(page)).toBeVisible();
  await expect(contrib(page)).toHaveText('$46,000');
  await expect(interest(page)).toHaveText('$17,055');
  await expect(interpretation(page)).toBeHidden();
  await expect(liveRegion(page)).toHaveText('Your projected savings balance is 63054 dollars and 78 cents.');
  // The dominant balance is visually larger than the breakdown figures.
  const primarySize = await primary(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const cellSize = await contrib(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(primarySize).toBeGreaterThan(cellSize * 1.5);
});

test('an entered 0% return is valid (deposits only)', async ({ page }) => {
  await calcProject(page, '0', '0', '2', '100'); // 100 × 24 = 2,400
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$2,400.00');
  await expect(contrib(page)).toHaveText('$2,400');
  await expect(interest(page)).toHaveText('$0');
});

test('a zero start AND zero deposit is a valid $0 projection with an explanation', async ({ page }) => {
  await calcProject(page, '0', '5', '10', '0');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$0.00');
  await expect(interpretation(page)).toBeVisible();
  await expect(interpretation(page)).toContainText('the projected balance remains $0');
});

/* ---- Reach a goal + already reached ------------------------------------- */

test('valid Goal result: required monthly deposit, no breakdown', async ({ page }) => {
  await calcGoal(page, '0', '0', '1', '12000'); // 12,000 / 12 = 1,000
  await expect(summaryLabel(page)).toHaveText('Required monthly deposit');
  await expect(primary(page)).toHaveText('$1,000.00');
  await expect(breakdown(page)).toBeHidden();
  await expect(interpretation(page)).toBeHidden();
  await expect(liveRegion(page)).toHaveText('You need to deposit 1000 dollars per month to reach your goal.');
});

test('goal already reached by growth is a VALID $0 result, not an error', async ({ page }) => {
  await calcGoal(page, '5000', '5', '5', '1000'); // 5,000 grows past a 1,000 goal
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid'); // NOT invalid
  await expect(summaryLabel(page)).toHaveText('Required monthly deposit');
  await expect(primary(page)).toHaveText('$0.00');
  await expect(interpretation(page)).toBeVisible();
  await expect(interpretation(page)).toContainText('no monthly deposit is required');
  await expect(breakdown(page)).toBeHidden();
  await expect(page.locator('[name="goal"]')).not.toHaveAttribute('aria-invalid', 'true');
  await expect(liveRegion(page)).toHaveText(
    'No monthly deposit is required because your starting balance is projected to reach the goal within the selected period.',
  );
});

/* ---- Summary-only: the yearly series is never rendered ------------------ */

test('no year-by-year table, chart or schedule is rendered (summary-only)', async ({ page }) => {
  await calcProject(page, '10000', '5', '10', '300');
  await expect(page.locator('#sv-result table')).toHaveCount(0);
  await expect(shell(page)).not.toContainText(/Year 1|Year-by-year|Schedule/i);
});

/* ---- Mode switching + conditional field --------------------------------- */

test('switching mode before the first calc swaps the field + label, does not calculate, preserves entries', async ({ page }) => {
  await page.fill('[name="startingAmount"]', '1000');
  await page.fill('[name="monthlyContribution"]', '300');
  await page.check('[name="mode"][value="goal"]');
  await expect(submit(page)).toHaveText('Calculate Required Deposit');
  await expect(page.locator('[data-sv-goal]')).toBeVisible();
  await expect(page.locator('[name="monthlyContribution"]')).toBeDisabled();
  await expect(page.locator('[data-sv-project]')).toBeHidden();
  await expect(page.locator('[name="startingAmount"]')).toHaveValue('1000'); // preserved
  await expect(page.locator('[name="monthlyContribution"]')).toHaveValue('300'); // preserved for switch-back
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
});

test('after a result, switching to an empty-field mode asks for it live; switching back restores the preserved value', async ({ page }) => {
  await calcGoal(page, '1000', '4', '10', '50000');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await page.check('[name="mode"][value="project"]'); // monthly deposit empty
  await page.waitForTimeout(DEBOUNCE);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="monthlyContribution"]')).toHaveText('Enter a monthly deposit.');
  await page.check('[name="mode"][value="goal"]'); // goal (50000) preserved
  await page.waitForTimeout(DEBOUNCE);
  await expect(page.locator('[name="goal"]')).toHaveValue('50000');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(summaryLabel(page)).toHaveText('Required monthly deposit');
});

/* ---- Validation --------------------------------------------------------- */

test('an empty explicit submission focuses the starting balance and associates the error', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  const start = page.locator('[name="startingAmount"]');
  await expect(start).toBeFocused();
  await expect(start).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-error-for="startingAmount"]')).toHaveText('Enter a starting balance.');
});

test('an entered 0 starting balance is valid; a negative return is invalid', async ({ page }) => {
  await calcProject(page, '0', '4', '5', '200'); // 0 start is valid
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await calcProject(page, '1000', '-1', '5', '200');
  await expect(page.locator('[data-error-for="annualRatePct"]')).toHaveText('Enter an annual return of zero or more.');
});

test('years must be a whole number of at least 1 (fractional rejected, never rounded)', async ({ page }) => {
  await calcProject(page, '1000', '4', '2.5', '200');
  await expect(page.locator('[data-error-for="years"]')).toHaveText('Enter a whole number of years (1 or more).');
  await page.fill('[name="years"]', '0');
  await submit(page).click();
  await expect(page.locator('[data-error-for="years"]')).toHaveText('Enter a whole number of years (1 or more).');
});

test('keyboard submission works from a field', async ({ page }) => {
  await page.fill('[name="startingAmount"]', '0');
  await page.fill('[name="annualRatePct"]', '0');
  await page.fill('[name="monthlyContribution"]', '100');
  await page.locator('[name="years"]').fill('2');
  await page.locator('[name="years"]').press('Enter');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(primary(page)).toHaveText('$2,400.00');
});

/* ---- Reset -------------------------------------------------------------- */

test('reset restores Project mode + label, clears fields, returns to empty', async ({ page }) => {
  await calcGoal(page, '1000', '4', '10', '50000');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
  await page.click('[data-reset]');
  await expect(page.locator('[name="mode"][value="project"]')).toBeChecked();
  await expect(submit(page)).toHaveText('Project Savings');
  await expect(page.locator('[data-sv-project]')).toBeVisible();
  await expect(page.locator('[data-sv-goal]')).toBeHidden();
  await expect(page.locator('[name="startingAmount"]')).toHaveValue('');
  await expect(page.locator('[name="goal"]')).toHaveValue('');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(liveRegion(page)).toHaveText('');
});

/* ---- Integrity / responsive / theme / embed / monetization ------------- */

test('renders no NaN / Infinity / undefined for an ordinary result', async ({ page }) => {
  await calcProject(page, '10000', '5', '10', '300');
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
});

test('desktop shows the dominant result within the first viewport at 1366×768', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await calcProject(page, '10000', '5', '10', '300');
  await expect(primary(page)).toBeInViewport();
});

test('mobile stacks inputs → result and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const formBox = (await page.locator('form[data-form]').boundingBox())!;
  const resultTop = (await shell(page).boundingBox())!.y;
  expect(resultTop).toBeGreaterThanOrEqual(formBox.y + formBox.height - 1);
  await calcProject(page, '10000', '5', '10', '300');
  await expect(primary(page)).toHaveText('$63,054.78');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('renders in dark scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await calcProject(page, '10000', '5', '10', '300');
  await expect(primary(page)).toBeVisible();
});

test('the embed route mounts the same interactive island', async ({ page }) => {
  await page.goto('/embed/finance/savings-calculator', { waitUntil: 'domcontentloaded' });
  await page.fill('[name="startingAmount"]', '0');
  await page.fill('[name="annualRatePct"]', '0');
  await page.fill('[name="years"]', '2');
  await page.fill('[name="monthlyContribution"]', '100');
  await page.locator('[data-sv-submit]').click();
  await expect(page.locator('#sv-result [data-result-value]')).toHaveText('$2,400.00');
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
