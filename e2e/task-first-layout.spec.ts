import { test, expect, type Page } from '@playwright/test';

/**
 * Task-first layout contract — asserted on every migrated pilot, one per
 * interaction structure (keypad, form, equation, generator). Order must be:
 * breadcrumb → H1 → short intro → calculator → supporting content →
 * review/reference metadata. Nothing (eyebrow, review date, reference,
 * methodology) may appear above the calculator.
 */
const PILOTS = [
  { route: '/math/scientific-calculator', structure: 'keypad' },
  { route: '/health/bmi-calculator', structure: 'form' },
  { route: '/health/bmr-calculator', structure: 'form (generalization pilot)' },
  { route: '/health/ideal-weight-calculator', structure: 'form (multi-formula)' },
  { route: '/health/protein-calculator', structure: 'form (weight + goal)' },
  { route: '/health/body-fat-calculator', structure: 'form (conditional inputs)' },
  { route: '/health/calorie-calculator', structure: 'form (activity + goal)' },
  { route: '/health/target-heart-rate-calculator', structure: 'form (optional field + zones)' },
  { route: '/health/fat-intake-calculator', structure: 'form (single input → range)' },
  { route: '/health/pace-calculator', structure: 'form (composite time + converting unit)' },
  { route: '/health/due-date-calculator', structure: 'form (gestational; date input; clock-free due-date result + past-due; island-owned disclaimer)' },
  { route: '/health/pregnancy-calculator', structure: 'form (gestational; date input; gestational-age result + progress bar + trimester timeline + past-due; island-owned disclaimer)' },
  { route: '/finance/loan-calculator', structure: 'form (financial schedule; fixed-rate loan; yearly amortization disclosure; own binding mirroring amortization)' },
  { route: '/finance/home-equity-loan-calculator', structure: 'form (financial; equity + LTV-capped max-borrow secondary; over-limit shown-not-rejected; island-owned borrowing disclaimer; own binding)' },
  { route: '/finance/interest-rate-calculator', structure: 'form (financial; bisection rate solver; months term; annual-rate primary + monthly-rate secondary; infeasible-payment rejected; island-owned disclaimer; own binding)' },
  { route: '/everyday/gpa-calculator', structure: 'form (academic; calculator-owned dynamic course rows; per-row + form-level validation; letter→point via GRADE_POINTS; valid 0.0/4.0; own binding, runtime unchanged)' },
  { route: '/everyday/grade-calculator', structure: 'form (academic; MULTI-MODE: weighted-average dynamic score/weight rows + final-grade-needed; native radio mode group; hidden-mode fields excluded from validation; final status reachable/met/unreachable; own binding, runtime unchanged)' },
  { route: '/finance/sales-tax-calculator', structure: 'form (multi-mode: add/remove tax)' },
  { route: '/finance/payment-calculator', structure: 'form (multi-mode: payment/payoff time)' },
  { route: '/finance/credit-card-payoff-calculator', structure: 'form (multi-mode: payoff/required payment + breakdown)' },
  { route: '/finance/savings-calculator', structure: 'form (multi-mode: project/goal + breakdown)' },
  { route: '/finance/simple-interest-calculator', structure: 'form (single mode, currency)' },
  { route: '/finance/tip-calculator', structure: 'form (single mode + preset quick-set group)' },
  { route: '/finance/inflation-calculator', structure: 'form (single mode; deflation-safe; mixed-unit result)' },
  { route: '/everyday/square-footage-calculator', structure: 'form (geometry; converting input unit; optional cost)' },
  { route: '/everyday/concrete-calculator', structure: 'form (geometry; converting radio unit; bag table; no cost)' },
  { route: '/math/triangle-calculator', structure: 'form (geometry; cross-field domain validation; area primary)' },
  { route: '/math/area-calculator', structure: 'form (geometry shape-picker; conditional per-shape fields; interpretive unit)' },
  { route: '/math/volume-calculator', structure: 'form (geometry shape-picker; 3D conditional per-shape fields; interpretive cubic unit)' },
  { route: '/math/statistics-calculator', structure: 'form (descriptive statistics; multiline data-set textarea; strict token validation; full multi-stat grid)' },
  { route: '/math/standard-deviation-calculator', structure: 'form (descriptive statistics; shared island via primary prop; sample/population SD hero)' },
  { route: '/finance/amortization-calculator', structure: 'form (financial schedule; 360-row table; yearly/monthly view)' },
  { route: '/finance/auto-loan-calculator', structure: 'form (complex-form; term select + finance checkbox; negative equity)' },
  { route: '/finance/investment-calculator', structure: 'form (complex-form; collective funding; nominal projection; negative growth)' },
  { route: '/finance/mortgage-calculator', structure: 'form (complex-form; PMI schedule; optional-cost + yearly-schedule disclosures; zero-mortgage)' },
  { route: '/math/fraction-calculator', structure: 'form (math; two fractions + operation <select> parameter; strict integer fields; simplified-fraction dominant + mixed/decimal secondaries; own binding, runtime unchanged)' },
  { route: '/everyday/hours-calculator', structure: 'form (everyday; two type=time fields + whole-minute break; overnight-aware; valid zero duration; total hours+minutes dominant + decimal-hours secondary; own binding, runtime unchanged)' },
  { route: '/everyday/time-calculator', structure: 'form (everyday; two d/h/m/s duration operands + native add/subtract radio; SIGNED result — negative subtraction shown, valid zero; whole non-negative components; normalized duration dominant + total-seconds secondary; own binding, runtime unchanged)' },
  { route: '/finance/income-tax-calculator', structure: 'form (finance; complex-form + MULTI-MODE filing status — single/married native radio; gross income + optional pre-tax deductions; 2024-bracket estimated-tax dominant + taxable/after-tax/effective/marginal breakdown; valid $0 tax at/below the deduction; own binding, runtime unchanged)' },
  { route: '/finance/retirement-calculator', structure: 'form (finance; complex-form; wraps the SHARED compound engine via its OWN binding; whole-year age horizon (no upper cap) with cross-field retirement>current; optional savings/contribution — zero-funded projection valid (R18B3.1); nest-egg dominant + estimated retirement income + contributions/growth breakdown; latent yearly series NOT rendered; annual return >=0; own binding, runtime unchanged)' },
  { route: '/everyday/age-calculator', structure: 'form (everyday; date/duration; two civil-date fields — DOB empty + "age at" defaulting to client TODAY (hydration-safe, empty result SSR==hydrated); strict round-trip calendar validation + DOB<=as-of cross-field; wraps the R18C0-repaired calculateAge UNCHANGED; exact-age y/m/d dominant + total months/weeks/days + next-birthday; same-date valid 0y0m0d; own binding, runtime unchanged)' },
  { route: '/everyday/date-calculator', structure: 'form (everyday; date/duration; ONE route, MULTI-MODE structural <select> — difference + add/subtract; every field empty (SSR==hydrated, no auto-calc); strict round-trip calendar validation; difference order-independent with a shown direction (reverse valid, same-date valid 0y0m0d) — calendar breakdown dominant + total days/weeks; add/subtract structural op + whole non-negative days — resulting date dominant; wraps UNCHANGED diffDates/addDays; own binding, runtime unchanged)' },
  { route: '/math/percent-calculator', structure: 'equation' },
  { route: '/everyday/password-generator', structure: 'generator' },
  { route: '/math/random-number-generator', structure: 'generator (random-data; min/max/count/no-repeats settings → explicit Generate Numbers; inclusive integer range; min>max rejected, min==max valid; unique cap preserved + noted; NO output before Generate, NO live regeneration; own binding on the UNCHANGED generator runtime)' },
];

const tool = (page: Page) => page.locator('section[aria-label$=" tool"]');

for (const { route, structure } of PILOTS) {
  test.describe(`task-first (${structure}): ${route}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
    });

    test('order: H1 → tool → About; tool within the first viewport', async ({ page }) => {
      const h1 = await page.getByRole('heading', { level: 1 }).boundingBox();
      const t = await tool(page).boundingBox();
      const about = await page.getByRole('heading', { name: 'About this calculator' }).boundingBox();
      expect(h1!.y).toBeLessThan(t!.y); // calculator sits below the heading/intro
      expect(t!.y).toBeLessThan(about!.y); // review/reference metadata is below the tool
      expect(t!.y).toBeLessThan(800); // the complete tool begins in the first desktop viewport
    });

    test('no eyebrow, review date, reference or methodology above the tool', async ({ page }) => {
      // The page header holds only the H1 + one-sentence intro — no eyebrow links.
      await expect(page.locator('header:has(h1) a')).toHaveCount(0);
      const t = await tool(page).boundingBox();
      // Review date renders in the "About" block, strictly below the tool.
      const review = await page.getByText(/Method reviewed for accuracy on/).boundingBox();
      expect(review!.y).toBeGreaterThan(t!.y);
      // The methodology link is below the tool too.
      const method = await page.getByRole('link', { name: /how we build our calculators/i }).boundingBox();
      expect(method!.y).toBeGreaterThan(t!.y);
    });
  });
}
