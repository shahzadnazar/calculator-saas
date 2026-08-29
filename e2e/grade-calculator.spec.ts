import { test, expect, type Page } from '@playwright/test';

/**
 * Grade — the reference's TWO calculators: the Grade Calculator over a table of assignments, with
 * its optional Final Grade Planning block, and the Final Grade Calculator over three fields.
 *
 * The figures are the reference's own worked examples. Homework 1 at 90 (5%), Project at B (20%)
 * and Midterm exam at 88 (20%) give B+ (3.21) over 45%; and a current grade of 88 wanting 85 with a
 * final worth 40% needs 80.5.
 */
const ROUTE = '/everyday/grade-calculator';

const grade = (page: Page) => page.locator('[data-grade]');
const final = (page: Page) => page.locator('[data-final]');
const shell = (page: Page) => page.locator('#grade-result');
const finalShell = (page: Page) => page.locator('#final-result');
const rows = (page: Page) => page.locator('[data-grade-row]');
const submit = (page: Page) => page.locator('[data-grade-submit]');
const finalSubmit = (page: Page) => page.locator('[data-final-submit]');
const average = (page: Page) => page.locator('#grade-result [data-result-value]');
const sentence = (page: Page) => page.locator('[data-final-sentence]');

const ITEMS: [string, string, string][] = [
  ['Homework 1', '90', '5'],
  ['Project', 'B', '20'],
  ['Midterm exam', '88', '20'],
];

async function fillRow(page: Page, index: number, [name, score, weight]: [string, string, string]) {
  const row = rows(page).nth(index);
  await row.locator('[data-grade-name]').fill(name);
  await row.locator('[data-grade-score]').fill(score);
  await row.locator('[data-grade-weight]').fill(weight);
}

async function calculate(page: Page, items = ITEMS) {
  for (let i = 0; i < items.length; i += 1) await fillRow(page, i, items[i]);
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
}

async function calculateFinal(page: Page, values: Record<string, string>) {
  for (const [name, v] of Object.entries(values)) await final(page).locator(`[name="${name}"]`).fill(v);
  await finalSubmit(page).click();
}

const reportRows = (page: Page) =>
  page.locator('[data-grade-breakdown] tr').evaluateAll((trs) =>
    trs.map((tr) => Array.from(tr.children).map((c) => (c.textContent ?? '').trim())),
  );

test.beforeEach(async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
});

/* ---- Two separate calculators ------------------------------------------- */

test('offers both calculators, each with its own form, button and result', async ({ page }) => {
  await expect(grade(page)).toHaveCount(1);
  await expect(final(page)).toHaveCount(1);
  await expect(page.locator('#grade-heading')).toHaveText('Grade Calculator');
  await expect(page.locator('#final-heading')).toHaveText('Final Grade Calculator');
  await expect(submit(page)).toHaveText('Calculate');
  await expect(finalSubmit(page)).toHaveText('Calculate');
});

test('loads task-first: five blank rows, empty fields, no result in either', async ({ page }) => {
  await expect(rows(page)).toHaveCount(5);
  const values = await page.locator('[data-grade-page] input').evaluateAll((els) =>
    (els as HTMLInputElement[]).map((e) => e.value),
  );
  expect(values.every((v) => v === '')).toBe(true);
  await expect(shell(page)).toHaveAttribute('data-result-state', 'example');
  await expect(finalShell(page)).toHaveAttribute('data-result-state', 'example');
});

test('calculating one leaves the other untouched', async ({ page }) => {
  await calculate(page);
  await expect(finalShell(page)).toHaveAttribute('data-result-state', 'example');
});

test('each result sits in the same row as its own inputs on a wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await calculate(page);
  const form = (await grade(page).locator('form').boundingBox())!;
  const result = (await shell(page).boundingBox())!;
  expect(result.x).toBeGreaterThan(form.x + form.width - 2); // beside it, not below
});

/* ---- The reference result ------------------------------------------------ */

test('reproduces the reference grade report', async ({ page }) => {
  await calculate(page);
  await expect(average(page)).toHaveText('B+ (3.21)');
  expect(await reportRows(page)).toEqual([
    ['Homework 1', '90', '5%'],
    ['Project', 'B', '20%'],
    ['Midterm exam', '88', '20%'],
  ]);
  await expect(page.locator('[data-grade-total-weight]')).toHaveText('45%');
  await expect(page.locator('[data-grade-average]')).toHaveText('B+ (3.21)');
  await expect(page.locator('#grade-live')).toHaveText('Average grade: B+ (3.21) over 45% of the course.');
});

test('a percentage and a letter are averaged as the same kind of thing', async ({ page }) => {
  // 90 is an A- (3.7); entering A- instead must give the identical answer.
  await calculate(page, [['One', '90', '10']]);
  await expect(average(page)).toHaveText('A- (3.7)');
  await rows(page).first().locator('[data-grade-score]').fill('A-');
  await expect(average(page)).toHaveText('A- (3.7)');
});

test('the grade shown in the report is the one that was typed', async ({ page }) => {
  await calculate(page, [['Essay', 'b+', '30']]);
  expect((await reportRows(page))[0]).toEqual(['Essay', 'b+', '30%']);
  await expect(average(page)).toHaveText('B+ (3.3)');
});

/* ---- Final Grade Planning (optional) ------------------------------------- */

test('the planning block is hidden until it is filled in, then says what is needed', async ({ page }) => {
  await calculate(page);
  await expect(page.locator('[data-grade-plan-row]')).toBeHidden();

  await page.locator('[name="goal"]').fill('A-');
  await page.locator('[name="remainingWeight"]').fill('55');
  await expect(page.locator('[data-grade-plan-row]')).toBeVisible();
  await expect(page.locator('[data-grade-plan]')).toHaveText(
    'To finish on A- (3.7), the remaining 55% needs to average A (4.1) or better.',
  );
});

test('the planning block says when a goal is secured, and when it is out of reach', async ({ page }) => {
  await calculate(page);
  await page.locator('[name="remainingWeight"]').fill('55');
  await page.locator('[name="goal"]').fill('D');
  await expect(page.locator('[data-grade-plan]')).toContainText('already secured');

  await page.locator('[name="goal"]').fill('A+');
  await page.locator('[name="remainingWeight"]').fill('5');
  await expect(page.locator('[data-grade-plan]')).toContainText('out of reach');
  await expect(page.locator('[data-grade-plan]')).toContainText('4.3');
});

test('half a planning block asks for the other half', async ({ page }) => {
  await calculate(page);
  await page.locator('[name="goal"]').fill('A-');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(page.locator('[data-error-for="remainingWeight"]')).toBeVisible();
});

/* ---- Rows ---------------------------------------------------------------- */

test('add more rows appends one and keeps the result live', async ({ page }) => {
  await calculate(page);
  await page.locator('[data-grade-add]').click();
  await expect(rows(page)).toHaveCount(6);
  await expect(average(page)).toHaveText('B+ (3.21)');
  await rows(page).last().locator('[data-grade-remove]').click();
  await expect(rows(page)).toHaveCount(5);
});

test('removing a row recalculates without it', async ({ page }) => {
  await calculate(page);
  await rows(page).nth(2).locator('[data-grade-remove]').click();
  await expect(page.locator('[data-grade-total-weight]')).toHaveText('25%');
});

test('the last remaining row cannot be removed', async ({ page }) => {
  for (let i = 0; i < 4; i += 1) await rows(page).last().locator('[data-grade-remove]').click();
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first().locator('[data-grade-remove]')).toBeDisabled();
});

/* ---- Validation ---------------------------------------------------------- */

test('a blank row is not an error, but a half-filled one is', async ({ page }) => {
  await calculate(page); // two blank rows remain and it is valid
  await rows(page).nth(3).locator('[data-grade-weight]').fill('10');
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(rows(page).nth(3).locator('[data-error-for^="grade-"]')).toBeVisible();
});

test('a grade that is not a percentage or a letter is refused, with an example', async ({ page }) => {
  await fillRow(page, 0, ['Quiz', 'Z', '10']);
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(rows(page).first().locator('[data-error-for^="grade-"]')).toContainText('B+');
});

test('an empty submission asks for at least one weighted row', async ({ page }) => {
  await submit(page).click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(shell(page)).toContainText('at least one graded row');
});

test('never renders NaN, Infinity or a raw error', async ({ page }) => {
  await calculate(page, [['All wrong', 'F', '100']]);
  await expect(average(page)).toHaveText('F (0)');
  await expect(shell(page)).not.toContainText(/NaN|Infinity|undefined/);
});

test('Clear empties the rows, the planning block and the result', async ({ page }) => {
  await calculate(page);
  await page.locator('[name="goal"]').fill('A-');
  await page.locator('[name="remainingWeight"]').fill('55');
  await grade(page).locator('[data-reset]').click();
  await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  await expect(rows(page)).toHaveCount(5);
  const values = await grade(page).locator('input').evaluateAll((els) =>
    (els as HTMLInputElement[]).map((e) => e.value),
  );
  expect(values.every((v) => v === '')).toBe(true);
});

/* ---- The final grade calculator ------------------------------------------ */

test('reproduces the reference final-grade sentence', async ({ page }) => {
  await calculateFinal(page, { current: '88', want: '85', weight: '40' });
  await expect(finalShell(page)).toHaveAttribute('data-result-state', 'valid');
  await expect(sentence(page)).toHaveText('You will need a grade of 80.5 or higher on the final.');
  await expect(page.locator('#final-live')).toContainText('80.5');
});

test('answers in grade points when both grades were letters', async ({ page }) => {
  await calculateFinal(page, { current: 'B', want: 'B+', weight: '40' });
  await expect(sentence(page)).toContainText('A- (3.75)');
});

test('says when the final is already secured, and when the target is out of reach', async ({ page }) => {
  await calculateFinal(page, { current: '88', want: '50', weight: '40' });
  await expect(sentence(page)).toContainText('already secured');

  await calculateFinal(page, { current: '88', want: '99', weight: '10' });
  await expect(sentence(page)).toContainText('out of reach');
  await expect(sentence(page)).toContainText('100');
});

test('holds the final weight to a real share of the course', async ({ page }) => {
  await calculateFinal(page, { current: '88', want: '85', weight: '0' });
  await expect(finalShell(page)).toHaveAttribute('data-result-state', 'invalid');
  await expect(final(page).locator('[data-error-for="weight"]')).toBeVisible();
});

test('Clear empties the final grade fields', async ({ page }) => {
  await calculateFinal(page, { current: '88', want: '85', weight: '40' });
  await final(page).locator('[data-reset]').click();
  await expect(finalShell(page)).toHaveAttribute('data-result-state', 'empty');
  const values = await final(page).locator('input').evaluateAll((els) =>
    (els as HTMLInputElement[]).map((e) => e.value),
  );
  expect(values.every((v) => v === '')).toBe(true);
});

/* ---- Workspace / responsive ---------------------------------------------- */

test('desktop first viewport shows H1, the table and its action', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(submit(page)).toBeInViewport();
});

test('mobile keeps the rows tappable and does not scroll the page sideways', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  const box = await rows(page).first().locator('[data-grade-score]').boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await calculate(page);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('each calculator has exactly one live region', async ({ page }) => {
  await expect(page.locator('[aria-live]')).toHaveCount(2);
});

test('the live page carries no monetization output', async ({ page }) => {
  await expect(page.locator('[data-mon-region]')).toHaveCount(0);
  expect(await page.content()).not.toContain('data-mon-');
});
