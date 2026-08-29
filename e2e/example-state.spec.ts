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
  // Retirement's planning ASSUMPTIONS. These replaced the old 4% safe-withdrawal
  // default when the calculator grew to four questions. None is the visitor's own
  // figure — they are the documented starting assumptions the reference product
  // ships, and a blank expected return is not a neutral state but an unanswerable
  // one. Every personal field on that calculator still loads empty.
  annualReturnPct: 'retirement: the documented expected-return assumption',
  inflationPct: 'retirement: the documented inflation assumption',
  // Interest's inflation assumption, for the same reason and at the same 3%: it is the
  // documented starting assumption, not the visitor's figure, and without it the
  // buying-power line has nothing to say. Every personal field there still loads empty.
  inflationRatePct: 'interest: the documented inflation assumption',
  incomeIncreasePct: 'retirement: the documented income-growth assumption',
  incomeNeededPct: 'retirement: the documented share-of-income-needed assumption',
  futureSavingsPct: 'retirement: the documented share-of-income-saved assumption',
  hoursPerWeek: 'salary: documented work-week assumption',
  daysPerWeek: 'salary: documented work-week assumption',
  // Salary's time-off assumptions, on the same footing as the work-week ones: the
  // reference product's own 10 holidays and 15 vacation days, not the visitor's figures.
  // Without them the adjusted column has nothing to say, and a blank is not a neutral
  // state but an unanswerable one. The salary amount itself still loads empty.
  holidaysPerYear: 'salary: the documented holidays-per-year assumption',
  vacationDaysPerYear: 'salary: the documented vacation-days assumption',
  lower: 'random number: the generator range default',
  upper: 'random number: the generator range default',
  count: 'random number: the generator count default',
  precision: 'random number: the generator precision default',
  at: 'age: the "age at" date defaults to today',
  today: 'date-based tools: the reference date defaults to today',
  value: 'conversion: the ratified converter-family neutral value 1',
  // The Food Energy Converter that sits under the calorie calculator is a converter, so it
  // takes the same ratified family behavior: a neutral 1 and an immediate answer, not an
  // empty box. Every personal field on that page still loads empty.
  feValue: 'food energy: the ratified converter-family neutral value 1',
  quantity: 'square footage: a single area by default',
  people: 'tip: a bill splits one way by default',
  // The customary U.S. rate the product ships, on the same footing as splitting one way:
  // it is the documented starting assumption, not the visitor's own figure, and a blank
  // tip box is not a neutral state but an unanswered one. The price still loads empty.
  tipPct: 'tip: the customary 15% is the documented default rate',
  // Auto loan's term became a free numeric field (54- and 66-month deals exist and a
  // closed select could not express them), so its 60-month default is now visible to
  // this check. It is the standard term the product ships with, not the visitor's own
  // figure — the same kind of default the select carried before.
  loanTermMonths: 'auto loan: the standard 60-month term is the structural default',
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
