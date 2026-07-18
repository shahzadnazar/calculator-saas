/**
 * Reference assets — original, computed reference tables and charts.
 *
 * Each is generated at build time from this site's own unit-tested calculator
 * functions (src/lib/calculators/*), so the numbers are provably accurate rather
 * than transcribed. These are linkable "citable data" assets: the kind of pages
 * people reference and link to (payment tables, a BMI chart, growth tables),
 * which is how the authority/link program earns links.
 *
 * This registry holds the metadata (for the index, nav and schema); each page
 * computes its own table from the tested functions.
 */

export interface ReferenceAsset {
  /** URL segment under /reference/. */
  readonly slug: string;
  /** H1 / <title> stem. */
  readonly title: string;
  /** Compact label for cards/nav. */
  readonly shortName: string;
  /** Meta description + card blurb. */
  readonly description: string;
  /** Grouping category slug. */
  readonly category: string;
  readonly icon: string;
  /** Slug of the related calculator ("category/slug") for cross-linking. */
  readonly relatedCalculator: string;
  readonly order: number;
}

export const REFERENCES: readonly ReferenceAsset[] = [
  {
    slug: 'mortgage-payment-table',
    title: 'Mortgage Payment Table: Monthly Cost per $100,000 Borrowed',
    shortName: 'Mortgage payment table',
    description:
      'Monthly principal-and-interest payment per $100,000 of mortgage, for every interest rate from 3% to 8% across 10, 15, 20 and 30-year terms.',
    category: 'finance',
    icon: '🏦',
    relatedCalculator: 'finance/mortgage-calculator',
    order: 1,
  },
  {
    slug: 'loan-payment-table',
    title: 'Loan Payment Table: Monthly Cost per $1,000 Borrowed',
    shortName: 'Loan payment table',
    description:
      'Monthly payment per $1,000 borrowed for auto and personal loans, across interest rates from 4% to 15% and terms from 12 to 72 months.',
    category: 'finance',
    icon: '💵',
    relatedCalculator: 'finance/loan-calculator',
    order: 2,
  },
  {
    slug: 'savings-growth-table',
    title: 'Compound Interest Growth Table: What $10,000 Becomes',
    shortName: 'Savings growth table',
    description:
      'How $10,000 grows with compound interest across annual returns of 2% to 10% over 5 to 40 years — a reference for the power of compounding.',
    category: 'finance',
    icon: '📈',
    relatedCalculator: 'finance/compound-interest-calculator',
    order: 3,
  },
  {
    slug: 'bmi-chart',
    title: 'BMI Chart: Healthy Weight Ranges by Height',
    shortName: 'BMI chart',
    description:
      'The healthy, overweight and obese weight ranges for each height, based on the WHO BMI thresholds (18.5, 25 and 30) — in pounds and kilograms.',
    category: 'health',
    icon: '⚖️',
    relatedCalculator: 'health/bmi-calculator',
    order: 4,
  },
  {
    slug: 'monthly-investment-table',
    title: 'Monthly Investment Growth Table: What Investing $X a Month Becomes',
    shortName: 'Monthly investment table',
    description:
      'How a recurring monthly investment grows at a 7% annual return over 10 to 40 years — from $100 to $2,000 a month.',
    category: 'finance',
    icon: '💹',
    relatedCalculator: 'finance/investment-calculator',
    order: 5,
  },
  {
    slug: 'salary-conversion-table',
    title: 'Salary to Hourly Conversion Table',
    shortName: 'Salary conversion table',
    description:
      'Common annual salaries converted to hourly, weekly, biweekly and monthly pay, based on a 40-hour, 52-week year.',
    category: 'finance',
    icon: '💼',
    relatedCalculator: 'finance/salary-calculator',
    order: 6,
  },
  {
    slug: 'inflation-purchasing-power-table',
    title: 'Inflation Table: The Shrinking Buying Power of $100',
    shortName: 'Inflation table',
    description:
      'What $100 held as cash will be worth in today’s money after 5 to 50 years at annual inflation rates of 2% to 5%.',
    category: 'finance',
    icon: '📉',
    relatedCalculator: 'finance/inflation-calculator',
    order: 7,
  },
  {
    slug: 'ideal-weight-table',
    title: 'Ideal Weight Chart by Height and Sex',
    shortName: 'Ideal weight chart',
    description:
      'Ideal body weight for each height, for men and women, as a range across the Robinson, Miller, Devine and Hamwi formulas.',
    category: 'health',
    icon: '📊',
    relatedCalculator: 'health/ideal-weight-calculator',
    order: 8,
  },
  {
    slug: 'target-heart-rate-table',
    title: 'Target Heart Rate Chart by Age',
    shortName: 'Target heart rate chart',
    description:
      'Maximum heart rate and the fat-burn, aerobic and anaerobic training zones (in bpm) for every age from 20 to 70.',
    category: 'health',
    icon: '❤️',
    relatedCalculator: 'health/target-heart-rate-calculator',
    order: 9,
  },
  {
    slug: 'tip-table',
    title: 'Tip Chart: How Much to Tip on Any Bill',
    shortName: 'Tip chart',
    description:
      'The tip amount for common bill totals at 15%, 18%, 20% and 25% — a quick gratuity reference for restaurants and services.',
    category: 'everyday',
    icon: '🧾',
    relatedCalculator: 'finance/tip-calculator',
    order: 10,
  },
] as const;

const REFERENCE_BY_SLUG = new Map(REFERENCES.map((r) => [r.slug, r]));

export const REFERENCES_ORDERED: readonly ReferenceAsset[] = [...REFERENCES].sort(
  (a, b) => a.order - b.order,
);

export function getReference(slug: string): ReferenceAsset | undefined {
  return REFERENCE_BY_SLUG.get(slug);
}

/** Canonical path for a reference asset, e.g. '/reference/bmi-chart'. */
export function referencePath(ref: Pick<ReferenceAsset, 'slug'>): string {
  return `/reference/${ref.slug}`;
}

/** Reference assets related to a calculator (by "category/slug"), for reverse links. */
export function getReferencesForCalculator(categorySlug: string, slug: string): ReferenceAsset[] {
  const ref = `${categorySlug}/${slug}`;
  return REFERENCES_ORDERED.filter((r) => r.relatedCalculator === ref);
}
