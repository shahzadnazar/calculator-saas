import { test, expect, type Page } from '@playwright/test';

/**
 * Grade calculator — R16B2 task-first migration (Academic family follow-on, 2 of 2; MULTI-MODE).
 * Wraps the UNCHANGED weightedGrade / finalScoreNeeded via its OWN grade-form.ts binding. Two modes of
 * one coherent tool, chosen by a native radio group inside the form (the runtime recomputes on its
 * structural `input`):
 *   • Weighted average — calculator-owned dynamic score/weight rows (default; one blank row);
 *   • Final grade needed — current / final-weight / target → the score required on the final.
 * The binding reads ONLY the active mode, so hidden-mode fields never validate. The required-final-score
 * is a finite number even when already-met (≤0) or unreachable (>100) — shown as a clear STATUS. The
 * complete-result guard lives in resultValue (NaN sentinel — NO isUsableResult). Live-after-first per
 * mode; a switch blanks the stale mode-owned result so no value shows under the new mode.
 */
const ROUTE = '/everyday/grade-calculator';
const DEBOUNCE = 300;

const shell = (page: Page) => page.locator('#grade-result');
const primary = (page: Page) => page.locator('#grade-result [data-result-value]');
const summaryLabel = (page: Page) => page.locator('#grade-result [data-result-summary-label]');
const secondaryLabel = (page: Page) => page.locator('[data-grade-secondary-label]');
const secondaryValue = (page: Page) => page.locator('[data-grade-secondary-value]');
const interpretation = (page: Page) => page.locator('[data-grade-interpretation]');
const live = (page: Page) => page.locator('#grade-live');
const submit = (page: Page) => page.locator('[data-grade-submit]');
const addBtn = (page: Page) => page.locator('[data-grade-add]');
const rows = (page: Page) => page.locator('[data-grade-row]');
const avgPanel = (page: Page) => page.locator('[data-grade-average]');
const finalPanel = (page: Page) => page.locator('[data-grade-final]');
const region = (page: Page, when: string) => page.locator(`#grade-result [data-result-when~="${when}"]`);
const invalidMsg = (page: Page) => page.locator('#grade-result [data-result-invalid-message]');

const toFinal = (page: Page) => page.check('[name="gmode"][value="final"]');
const toAverage = (page: Page) => page.check('[name="gmode"][value="average"]');

const rowAt = (page: Page, i: number) => rows(page).nth(i);
const setRow = async (page: Page, i: number, score: string, weight: string) => {
  await rowAt(page, i).locator('[data-grade-score]').fill(score);
  await rowAt(page, i).locator('[data-grade-weight]').fill(weight);
};
/** Grow to `items.length` rows (the page starts with one), then fill each [score, weight]. */
const fillItems = async (page: Page, items: Array<[string, string]>) => {
  for (let k = 1; k < items.length; k++) await addBtn(page).click();
  for (let i = 0; i < items.length; i++) await setRow(page, i, items[i][0], items[i][1]);
};
/** Final mode must be visible before its fields are actionable. */
const setFinal = async (page: Page, current: string, finalWeight: string, target: string) => {
  await page.locator('[name="current"]').fill(current);
  await page.locator('[name="finalWeight"]').fill(finalWeight);
  await page.locator('[name="target"]').fill(target);
};

test.describe('grade: task-first (multi-mode)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  });

  /* ---- initial state ---- */

  test('loads in Weighted-average mode: one blank row, empty result, "Calculate Weighted Grade", remove disabled, final panel hidden', async ({ page }) => {
    await expect(page.locator('[name="gmode"][value="average"]')).toBeChecked();
    await expect(avgPanel(page)).toBeVisible();
    await expect(finalPanel(page)).toBeHidden();
    await expect(rows(page)).toHaveCount(1);
    await expect(rowAt(page, 0).locator('[data-grade-score]')).toHaveValue('');
    await expect(rowAt(page, 0).locator('[data-grade-weight]')).toHaveValue('');
    await expect(submit(page)).toHaveText('Calculate Weighted Grade');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(region(page, 'valid')).toBeHidden();
    await expect(live(page)).toHaveText('');
    await expect(rowAt(page, 0).locator('[data-grade-remove]')).toBeDisabled();
  });

  test('does not calculate before the first submission', async ({ page }) => {
    await setRow(page, 0, '90', '20');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  /* ---- weighted average ---- */

  test('Add item / Remove item grow and shrink the row set (min one row)', async ({ page }) => {
    await addBtn(page).click();
    await expect(rows(page)).toHaveCount(2);
    await expect(rowAt(page, 0).locator('[data-grade-remove]')).toBeEnabled();
    await rowAt(page, 1).locator('[data-grade-remove]').click();
    await expect(rows(page)).toHaveCount(1);
    await expect(rowAt(page, 0).locator('[data-grade-remove]')).toBeDisabled();
  });

  test('ordinary weighted grade: 80/20 + 75/30 + 90/50 = 83.5%, total weight 100, announcement, no NaN', async ({ page }) => {
    await fillItems(page, [['80', '20'], ['75', '30'], ['90', '50']]);
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(summaryLabel(page)).toHaveText('Weighted grade');
    await expect(primary(page)).toHaveText('83.5%');
    await expect(secondaryLabel(page)).toHaveText('Total weight');
    await expect(secondaryValue(page)).toHaveText('100');
    await expect(interpretation(page)).toContainText('weighted by each item');
    await expect(live(page)).toHaveText('Weighted grade: 83.5 percent.');
    const primarySize = await primary(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const metricSize = await secondaryValue(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(primarySize).toBeGreaterThan(metricSize * 1.5);
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('weights that do not total 100 normalize, with a note (90/25 + 70/25 = 80%, Σw 50)', async ({ page }) => {
    await fillItems(page, [['90', '25'], ['70', '25']]);
    await submit(page).click();
    await expect(primary(page)).toHaveText('80%');
    await expect(secondaryValue(page)).toHaveText('50');
    await expect(interpretation(page)).toContainText('normalized');
  });

  test('a single item is that score normalized by its own weight (90/20 = 90%)', async ({ page }) => {
    await setRow(page, 0, '90', '20');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('90%');
    await expect(secondaryValue(page)).toHaveText('20');
  });

  test('a partial row (score, no weight) is a weight error and focuses the weight field', async ({ page }) => {
    await rowAt(page, 0).locator('[data-grade-score]').fill('90');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(rowAt(page, 0).locator('[data-error-for^="weight-"]')).toHaveText('Enter a weight for this item.');
    await expect(rowAt(page, 0).locator('[data-grade-weight]')).toBeFocused();
  });

  test('a partial row (weight, no score) is a score error', async ({ page }) => {
    await rowAt(page, 0).locator('[data-grade-weight]').fill('20');
    await submit(page).click();
    await expect(rowAt(page, 0).locator('[data-error-for^="score-"]')).toHaveText('Enter a score for this item.');
  });

  test('a negative weight is a weight error', async ({ page }) => {
    await setRow(page, 0, '90', '-20');
    await submit(page).click();
    await expect(rowAt(page, 0).locator('[data-error-for^="weight-"]')).toHaveText('Enter a weight of zero or more.');
  });

  test('all-zero weights are a form-level error (no contributing weight), focusing the first score', async ({ page }) => {
    await fillItems(page, [['90', '0'], ['80', '0']]);
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(invalidMsg(page)).toHaveText('Add at least one item with a score and a weight greater than zero.');
    await expect(rowAt(page, 0).locator('[data-grade-score]')).toBeFocused();
  });

  test('an all-empty weighted form is a form-level error, focusing the first score', async ({ page }) => {
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(invalidMsg(page)).toHaveText('Add at least one item with a score and a weight greater than zero.');
    await expect(rowAt(page, 0).locator('[data-grade-score]')).toBeFocused();
  });

  /* ---- mode switch ---- */

  test('switching to Final mode before any calc swaps the panel + label and does not calculate', async ({ page }) => {
    await toFinal(page);
    await expect(finalPanel(page)).toBeVisible();
    await expect(avgPanel(page)).toBeHidden();
    await expect(submit(page)).toHaveText('Calculate Final Grade Needed');
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
  });

  /* ---- final grade needed ---- */

  test('final: an ordinary reachable target (80 now, final worth 40%, target 85) needs 92.5%', async ({ page }) => {
    await toFinal(page);
    await setFinal(page, '80', '40', '85');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(summaryLabel(page)).toHaveText('Required final score');
    await expect(primary(page)).toHaveText('92.5%');
    await expect(secondaryLabel(page)).toHaveText('Target grade');
    await expect(secondaryValue(page)).toHaveText('85%');
    await expect(interpretation(page)).toContainText('Score at least');
    await expect(live(page)).toHaveText('Required final score: 92.5 percent.');
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined/);
  });

  test('final: the exact 0 boundary (target already sits at the no-lift point) renders 0%', async ({ page }) => {
    await toFinal(page);
    await setFinal(page, '100', '20', '80'); // (80 − 0.8·100)/0.2 = 0
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('0%');
  });

  test('final: the exact 100 boundary (a perfect final exactly reaches target) renders 100%', async ({ page }) => {
    await toFinal(page);
    await setFinal(page, '80', '50', '90'); // (90 − 0.5·80)/0.5 = 100
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('100%');
  });

  test('final: an already-met target shows "Already met", not a negative percentage', async ({ page }) => {
    await toFinal(page);
    await setFinal(page, '90', '20', '70'); // (70 − 0.8·90)/0.2 = −10
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(summaryLabel(page)).toHaveText('Final grade needed');
    await expect(primary(page)).toHaveText('Already met');
    await expect(live(page)).toHaveText('You have already reached your target.');
    expect(await region(page, 'valid').innerText()).not.toMatch(/NaN|Infinity|undefined|-\d/);
  });

  test('final: an unreachable target shows "Not reachable", not a >100 percentage', async ({ page }) => {
    await toFinal(page);
    await setFinal(page, '85', '30', '90'); // (90 − 0.7·85)/0.3 ≈ 101.67
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(summaryLabel(page)).toHaveText('Final grade needed');
    await expect(primary(page)).toHaveText('Not reachable');
    await expect(live(page)).toHaveText('That target is not reachable with the final alone.');
  });

  test('final: a final weight of 0, negative or over 100 is a range error; 100 is accepted', async ({ page }) => {
    await toFinal(page);
    for (const bad of ['0', '-10', '150']) {
      await setFinal(page, '80', bad, '90');
      await submit(page).click();
      await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
      await expect(invalidMsg(page)).toHaveText('Enter a final weight greater than 0 and up to 100 percent.');
    }
    await setFinal(page, '80', '100', '90'); // w = 1 → needed = target = 90
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('90%');
  });

  test('final: current and target are required', async ({ page }) => {
    await toFinal(page);
    await page.locator('[name="finalWeight"]').fill('30');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(page.locator('[data-error-for="current"]')).toHaveText('Enter your current grade.');
    await expect(page.locator('[data-error-for="target"]')).toHaveText('Enter your target grade.');
  });

  test('hidden average rows do not block Final validation (an invalid weighted row is ignored in Final mode)', async ({ page }) => {
    await rowAt(page, 0).locator('[data-grade-score]').fill('90'); // partial (no weight) — would be invalid in weighted mode
    await toFinal(page);
    await setFinal(page, '80', '40', '85');
    await submit(page).click();
    await expect(shell(page)).toHaveAttribute('data-result-state', 'valid');
    await expect(primary(page)).toHaveText('92.5%');
  });

  test('switching mode after a result does not expose the stale result under the new mode', async ({ page }) => {
    await fillItems(page, [['80', '20'], ['75', '30'], ['90', '50']]);
    await submit(page).click();
    await expect(primary(page)).toHaveText('83.5%');
    await toFinal(page); // final fields are empty → recompute must go invalid, not keep the weighted value
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).not.toHaveAttribute('data-result-state', 'valid');
    await expect(region(page, 'valid')).toBeHidden();
  });

  test('mode values persist across a switch; switching back recomputes each mode from its kept entries', async ({ page }) => {
    await setRow(page, 0, '90', '50'); // weighted entry (not yet submitted)
    await toFinal(page);
    await setFinal(page, '80', '40', '85');
    await submit(page).click();
    await expect(primary(page)).toHaveText('92.5%'); // first result: Final
    await toAverage(page);
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('90%'); // kept weighted entry recomputes (90/50 normalized)
    await toFinal(page);
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('92.5%'); // kept final entries recompute
  });

  /* ---- live update / invalidate / reset ---- */

  test('after the first weighted result, adding an item recalculates live', async ({ page }) => {
    await setRow(page, 0, '90', '50');
    await submit(page).click();
    await expect(primary(page)).toHaveText('90%');
    await addBtn(page).click();
    await setRow(page, 1, '70', '50');
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('80%'); // (90·50 + 70·50)/100
    await expect(secondaryValue(page)).toHaveText('100');
  });

  test('after the first final result, editing the target recalculates live', async ({ page }) => {
    await toFinal(page);
    await setFinal(page, '80', '40', '85');
    await submit(page).click();
    await expect(primary(page)).toHaveText('92.5%');
    await page.locator('[name="target"]').fill('89'); // (89 − 0.6·80)/0.4 = 102.5 → unreachable
    await page.waitForTimeout(DEBOUNCE);
    await expect(primary(page)).toHaveText('Not reachable');
  });

  test('an invalid live edit clears the stale weighted result, keeping focus', async ({ page }) => {
    await setRow(page, 0, '90', '50');
    await submit(page).click();
    await expect(region(page, 'valid')).toBeVisible();
    await rowAt(page, 0).locator('[data-grade-weight]').fill(''); // now partial
    await page.waitForTimeout(DEBOUNCE);
    await expect(shell(page)).toHaveAttribute('data-result-state', 'invalid');
    await expect(region(page, 'valid')).toBeHidden();
    await expect(rowAt(page, 0).locator('[data-grade-weight]')).toBeFocused();
  });

  test('reset restores Weighted mode, one blank row, cleared final fields, empty result + announcement', async ({ page }) => {
    await toFinal(page);
    await setFinal(page, '80', '40', '85');
    await submit(page).click();
    await expect(primary(page)).not.toHaveText('—');
    await page.click('[data-reset]');
    await expect(page.locator('[name="gmode"][value="average"]')).toBeChecked();
    await expect(avgPanel(page)).toBeVisible();
    await expect(finalPanel(page)).toBeHidden();
    await expect(rows(page)).toHaveCount(1);
    await expect(rowAt(page, 0).locator('[data-grade-score]')).toHaveValue('');
    await expect(rowAt(page, 0).locator('[data-grade-weight]')).toHaveValue('');
    await expect(shell(page)).toHaveAttribute('data-result-state', 'empty');
    await expect(live(page)).toHaveText('');
    await toFinal(page);
    await expect(page.locator('[name="current"]')).toHaveValue('');
    await expect(page.locator('[name="finalWeight"]')).toHaveValue('');
    await expect(page.locator('[name="target"]')).toHaveValue('');
  });

  /* ---- keyboard / responsive / theme / embed / monetization ---- */

  test('keyboard submission works in both modes', async ({ page }) => {
    await setRow(page, 0, '90', '20');
    await rowAt(page, 0).locator('[data-grade-weight]').press('Enter');
    await expect(primary(page)).toHaveText('90%');
    await toFinal(page);
    await setFinal(page, '80', '40', '85');
    await page.locator('[name="target"]').press('Enter');
    await expect(primary(page)).toHaveText('92.5%');
  });

  test('desktop shows the weighted grade within the first viewport at 1366×768', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await setRow(page, 0, '90', '20');
    await submit(page).click();
    await expect(primary(page)).toBeInViewport();
  });

  test('mobile does not overflow horizontally in either mode', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await fillItems(page, [['80', '20'], ['90', '80']]);
    await submit(page).click();
    let overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await toFinal(page);
    await setFinal(page, '80', '40', '85');
    await submit(page).click();
    overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test('renders in dark scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await setRow(page, 0, '90', '20');
    await submit(page).click();
    await expect(primary(page)).toBeVisible();
  });

  test('the generated embed mounts the same island and computes both modes', async ({ page }) => {
    await page.goto('/embed/everyday/grade-calculator', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-grade-row]')).toHaveCount(1);
    await page.locator('[data-grade-row]').nth(0).locator('[data-grade-score]').fill('90');
    await page.locator('[data-grade-row]').nth(0).locator('[data-grade-weight]').fill('20');
    await page.locator('[data-grade-submit]').click();
    await expect(page.locator('#grade-result')).toHaveAttribute('data-result-state', 'valid');
    await expect(page.locator('#grade-result [data-result-value]')).toHaveText('90%');
    await page.check('[name="gmode"][value="final"]');
    await page.locator('[name="current"]').fill('80');
    await page.locator('[name="finalWeight"]').fill('40');
    await page.locator('[name="target"]').fill('85');
    await page.locator('[data-grade-submit]').click();
    await expect(page.locator('#grade-result [data-result-value]')).toHaveText('92.5%');
  });

  test('the live page carries no monetization output', async ({ page }) => {
    await expect(page.locator('[data-mon-region]')).toHaveCount(0);
    expect(await page.content()).not.toContain('data-mon-');
  });
});
