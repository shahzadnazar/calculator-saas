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
  { route: '/finance/amortization-calculator', structure: 'form (financial schedule; 360-row table; yearly/monthly view)' },
  { route: '/math/percent-calculator', structure: 'equation' },
  { route: '/everyday/password-generator', structure: 'generator' },
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
