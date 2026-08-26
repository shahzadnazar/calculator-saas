import { test, expect, type Page } from '@playwright/test';

/**
 * The fleet-wide labelled-example contract, in ONE table.
 *
 * Every calculator except the Basic/Scientific keypad opens with its input
 * controls EMPTY and a clearly-labelled worked example in the result panel,
 * rendered by the shared runtimes into that calculator's own result markup.
 *
 * Testing this per-spec would mean the same four assertions duplicated 47 times,
 * so the contract lives here and each calculator's own spec keeps covering its
 * own maths, validation and result content.
 */
const ROUTES: Array<[string, string]> = [
  ['amortization', '/finance/amortization-calculator'],
  ['auto-loan', '/finance/auto-loan-calculator'],
  ['compound-interest', '/finance/compound-interest-calculator'],
  ['credit-card-payoff', '/finance/credit-card-payoff-calculator'],
  ['home-equity-loan', '/finance/home-equity-loan-calculator'],
  ['income-tax', '/finance/income-tax-calculator'],
  ['inflation', '/finance/inflation-calculator'],
  ['interest', '/finance/interest-calculator'],
  ['interest-rate', '/finance/interest-rate-calculator'],
  ['investment', '/finance/investment-calculator'],
  ['loan', '/finance/loan-calculator'],
  ['mortgage', '/finance/mortgage-calculator'],
  ['payment', '/finance/payment-calculator'],
  ['retirement', '/finance/retirement-calculator'],
  ['salary', '/finance/salary-calculator'],
  ['sales-tax', '/finance/sales-tax-calculator'],
  ['savings', '/finance/savings-calculator'],
  ['simple-interest', '/finance/simple-interest-calculator'],
  ['tip', '/finance/tip-calculator'],
  ['bmi', '/health/bmi-calculator'],
  ['bmr', '/health/bmr-calculator'],
  ['body-fat', '/health/body-fat-calculator'],
  ['calorie', '/health/calorie-calculator'],
  ['due-date', '/health/due-date-calculator'],
  ['fat-intake', '/health/fat-intake-calculator'],
  ['ideal-weight', '/health/ideal-weight-calculator'],
  ['pace', '/health/pace-calculator'],
  ['pregnancy', '/health/pregnancy-calculator'],
  ['protein', '/health/protein-calculator'],
  ['target-heart-rate', '/health/target-heart-rate-calculator'],
  ['area', '/math/area-calculator'],
  ['fraction', '/math/fraction-calculator'],
  ['percent', '/math/percent-calculator'],
  ['random-number', '/math/random-number-generator'],
  ['standard-deviation', '/math/standard-deviation-calculator'],
  ['statistics', '/math/statistics-calculator'],
  ['triangle', '/math/triangle-calculator'],
  ['volume', '/math/volume-calculator'],
  ['age', '/everyday/age-calculator'],
  ['concrete', '/everyday/concrete-calculator'],
  ['conversion', '/everyday/conversion-calculator'],
  ['date', '/everyday/date-calculator'],
  ['gpa', '/everyday/gpa-calculator'],
  ['grade', '/everyday/grade-calculator'],
  ['hours', '/everyday/hours-calculator'],
  ['password-generator', '/everyday/password-generator'],
  ['square-footage', '/everyday/square-footage-calculator'],
  ['time', '/everyday/time-calculator'],
];

const shells = (page: Page) => page.locator('[data-result-shell]');

/**
 * Field names that legitimately carry a NON-personal structural default, and why.
 * These pre-date the example work and are deliberate product behaviour — a
 * client-today date, a documented assumption, or the ratified converter-family
 * neutral value. They are never the visitor's own figures, so the example rule
 * ("the visitor's inputs load empty") does not apply to them.
 */
const STRUCTURAL_DEFAULTS: Record<string, string> = {
  startMonth: 'mortgage: repayment start defaults to the current month',
  startYear: 'mortgage: repayment start defaults to the current year',
  withdrawalRatePct: 'retirement: the documented 4% safe-withdrawal assumption',
  hoursPerWeek: 'salary: documented work-week assumption',
  daysPerWeek: 'salary: documented work-week assumption',
  weeksPerYear: 'salary: documented work-week assumption',
  min: 'random number: generator range default',
  max: 'random number: generator range default',
  count: 'random number: generator count default',
  at: 'age: the "age at" date defaults to today',
  today: 'date-based tools: the reference date defaults to today',
  value: 'conversion: the ratified converter-family neutral value 1',
  quantity: 'square footage: a single area by default',
  people: 'tip: a bill splits one way by default',
};

/** Values in controls the visitor would type their OWN figures into. */
const personalEntryValues = (page: Page) =>
  page
    .locator('form input[type="number"], form input[type="text"], form input[type="date"], form textarea')
    .evaluateAll(
      (els, structural) =>
        els
          .filter((el) => !(structural as string[]).includes((el as HTMLInputElement).name))
          .map((el) => (el as HTMLInputElement).value),
      Object.keys(STRUCTURAL_DEFAULTS),
    );

test.describe('fleet-wide labelled example', () => {
  for (const [name, route] of ROUTES) {
    test(`${name}: opens with EMPTY inputs and a labelled example result`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const shell = shells(page).first();
      await expect(shell).toHaveAttribute('data-result-state', 'example');

      // 1. Every value the visitor would type is empty.
      for (const v of await personalEntryValues(page)) expect(v).toBe('');

      // 2. The example is labelled in WORDS, not by colour alone.
      const notice = page.locator('[data-result-when~="example"]').first();
      await expect(notice).toBeVisible();
      await expect(notice).toContainText(/example/i);
      await expect(notice).toContainText(/not your calculation/i);

      // 3. It shows real figures, never a placeholder or a broken number.
      await expect(shell).not.toContainText(/NaN|Infinity|undefined/);

      // 4. It is never announced — the visitor did not ask for it.
      const live = page.locator('[data-result-live]').first();
      if (await live.count()) await expect(live).toHaveText('');
    });

    test(`${name}: "Start with my values" hands the panel to the visitor`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      const shell = shells(page).first();
      await expect(shell).toHaveAttribute('data-result-state', 'example');
      await page.locator('[data-example-dismiss]').first().click();
      await expect(shell).toHaveAttribute('data-result-state', 'empty');
      await expect(page.locator('[data-result-when~="example"]').first()).toBeHidden();
      // Still empty and ready — dismissing never fills anything in.
      for (const v of await personalEntryValues(page)) expect(v).toBe('');
    });
  }
});
