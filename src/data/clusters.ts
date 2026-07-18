/**
 * Topic clusters — editorial hub ("pillar") pages that group tightly related
 * calculators around a theme, with a short decision guide for choosing between
 * them and links to the relevant explainer guides.
 *
 * This is the pillar–cluster model: each hub links down to its member
 * calculators (spokes) and each calculator links back up to its hub, forming
 * bidirectional internal linking that builds topical authority. Hubs are
 * derived from this single registry — add a cluster here and its page, nav,
 * sitemap entry and reverse links all follow.
 *
 * A hub must earn its place: the intro, body and per-tool "use when" notes give
 * it genuine navigational value beyond the broad category page — never a thin
 * list of links.
 */

export interface ClusterMember {
  /** "category/slug" reference into the calculator registry. */
  readonly ref: string;
  /** One line: when to reach for this tool rather than its siblings. */
  readonly use: string;
}

export interface Cluster {
  /** URL segment under /topics/. */
  readonly slug: string;
  /** H1 and <title> stem. */
  readonly title: string;
  /** Compact label for nav/cards. */
  readonly shortName: string;
  readonly icon: string;
  /** Meta description + card blurb. */
  readonly description: string;
  /** Lead paragraph on the hub page. */
  readonly intro: string;
  /** Editorial pillar content — a few short paragraphs framing the topic. */
  readonly body: readonly string[];
  /** Member calculators, in the order they should appear. */
  readonly members: readonly ClusterMember[];
  /** Related guide ids (filenames in src/content/guides, without extension). */
  readonly guides: readonly string[];
  /** Display/sort order. */
  readonly order: number;
}

export const CLUSTERS: readonly Cluster[] = [
  {
    slug: 'loan-calculators',
    title: 'Loan & Mortgage Calculators',
    shortName: 'Loans',
    icon: 'landmark',
    description:
      'Every calculator for borrowing — mortgages, car loans, personal loans, credit cards and home equity — plus how to choose between them.',
    intro:
      'Whatever you are borrowing for, the maths is the same underneath: an amount, a rate and a term produce a monthly payment and a total interest cost. These calculators handle each borrowing situation, and this page helps you pick the right one.',
    body: [
      'The single most useful habit when borrowing is to compare the <strong>total interest</strong>, not just the monthly payment. A lower payment stretched over a longer term almost always costs more overall — the tools here make that trade-off visible so a comfortable payment does not hide an expensive loan.',
      'Start with the calculator that matches your situation below. They share the same amortization engine, so once you understand one, the rest read the same way — and the guides at the end explain the concepts in depth.',
    ],
    members: [
      { ref: 'finance/mortgage-calculator', use: 'Buying a home — full payment with tax, insurance, PMI and a schedule.' },
      { ref: 'finance/loan-calculator', use: 'Any fixed-rate loan — payment, total interest and payoff.' },
      { ref: 'finance/auto-loan-calculator', use: 'Buying a car — includes down payment, trade-in, tax and fees.' },
      { ref: 'finance/amortization-calculator', use: 'See how each payment splits between principal and interest.' },
      { ref: 'finance/payment-calculator', use: 'Solve for the payment, or how long a set payment takes to clear.' },
      { ref: 'finance/interest-rate-calculator', use: 'Only quoted a monthly payment? Find the interest rate hidden in it.' },
      { ref: 'finance/credit-card-payoff-calculator', use: 'Clearing card debt — payoff time and the interest it costs.' },
      { ref: 'finance/home-equity-loan-calculator', use: 'Borrowing against your home — borrowing power and payment.' },
    ],
    guides: ['how-loans-and-interest-work', 'how-much-house-can-you-afford', 'getting-the-best-auto-loan', 'rent-vs-buy-a-home'],
    order: 1,
  },
  {
    slug: 'savings-investment-calculators',
    title: 'Savings & Investment Calculators',
    shortName: 'Saving',
    icon: 'trending-up',
    description:
      'Grow money over time — compound interest, savings goals, investing and retirement — and see how much of the result is earnings versus deposits.',
    intro:
      'Borrowing and saving are the same maths pointed in opposite directions: with debt, compounding works against you; with savings, it works for you. These calculators show how consistent deposits and time turn small amounts into large balances.',
    body: [
      'The lesson every tool here reinforces is that <strong>time</strong> matters more than the amount. Because interest earns interest, starting early usually beats saving more later — and over long horizons the growth from compounding comes to dwarf the money you actually put in.',
      'Pick the calculator that matches your question below, from a simple interest estimate to a full retirement projection. The guides then explain compounding, simple versus compound interest, and how to start investing.',
    ],
    members: [
      { ref: 'finance/compound-interest-calculator', use: 'The core of growth — compounding with regular contributions.' },
      { ref: 'finance/investment-calculator', use: 'Project an investment with monthly contributions over time.' },
      { ref: 'finance/savings-calculator', use: 'Reach a savings goal, or project where deposits will take you.' },
      { ref: 'finance/retirement-calculator', use: 'Project your nest egg and the income it could provide.' },
      { ref: 'finance/interest-calculator', use: 'Compare simple and compound interest side by side.' },
      { ref: 'finance/simple-interest-calculator', use: 'Straight-line interest with the I = P × r × t formula.' },
      { ref: 'finance/inflation-calculator', use: 'See what your money will really be worth over time.' },
    ],
    guides: ['understanding-compound-interest', 'simple-interest-explained', 'investing-for-beginners'],
    order: 2,
  },
  {
    slug: 'body-and-diet-calculators',
    title: 'Body & Diet Calculators',
    shortName: 'Body',
    icon: 'heart-pulse',
    description:
      'Understand your body and nutrition — BMI, BMR, body fat, ideal weight, calories, protein and fat — built on established formulas.',
    intro:
      'These calculators translate a few measurements into the numbers that guide health and nutrition decisions: how your weight compares, how much energy you burn, and how much of each nutrient to aim for. Each uses an established, published formula.',
    body: [
      'They build on one another. Your <strong>BMR</strong> (calories burned at rest) feeds your <strong>calorie</strong> target, which in turn sets your <strong>protein</strong> and <strong>fat</strong> ranges — while <strong>BMI</strong>, <strong>body fat</strong> and <strong>ideal weight</strong> describe where you are now. Reading them together gives a fuller picture than any single number.',
      'None of these is a diagnosis. They are screening and planning estimates — useful starting points to discuss with a healthcare professional, not substitutes for one.',
    ],
    members: [
      { ref: 'health/bmi-calculator', use: 'A quick weight-to-height screen and your healthy weight range.' },
      { ref: 'health/bmr-calculator', use: 'Calories your body burns at complete rest.' },
      { ref: 'health/calorie-calculator', use: 'Daily calories to maintain, lose or gain weight.' },
      { ref: 'health/body-fat-calculator', use: 'Estimate body fat percentage with a tape measure.' },
      { ref: 'health/ideal-weight-calculator', use: 'A healthy target-weight range from four formulas.' },
      { ref: 'health/protein-calculator', use: 'Daily protein target for your weight and goal.' },
      { ref: 'health/fat-intake-calculator', use: 'Daily fat range within your calorie target.' },
    ],
    guides: ['bmi-bmr-and-calories-explained', 'complete-guide-to-healthy-weight', 'healthy-weight-for-your-height', 'body-fat-percentage-explained', 'how-much-protein-do-you-need'],
    order: 3,
  },
  {
    slug: 'time-and-date-calculators',
    title: 'Time & Date Calculators',
    shortName: 'Time',
    icon: 'calendar-days',
    description:
      'Work with dates and durations — exact age, days between dates, adding or subtracting time, and hours worked between two clock times.',
    intro:
      'Dates and time are deceptively hard to compute by hand, because months vary in length, leap years add a day, and clock time counts in base 60. These calculators handle all of that so the answer is always exact.',
    body: [
      'Each tool answers a different question: a span between two calendar dates, an exact age broken down, a duration added or subtracted, or hours worked with breaks. Choosing the right one below avoids the classic off-by-one mistakes.',
      'The guides walk through the methods — counting days between dates, and calculating hours worked — if you want to reproduce the results yourself.',
    ],
    members: [
      { ref: 'everyday/age-calculator', use: 'Exact age in years, months and days from a birth date.' },
      { ref: 'everyday/date-calculator', use: 'Days between two dates, or add/subtract days from a date.' },
      { ref: 'everyday/time-calculator', use: 'Add or subtract durations in days, hours, minutes, seconds.' },
      { ref: 'everyday/hours-calculator', use: 'Hours worked between two clock times, minus breaks.' },
    ],
    guides: ['calculating-days-between-dates', 'how-to-calculate-your-exact-age', 'how-to-calculate-hours-worked'],
    order: 4,
  },
  {
    slug: 'geometry-calculators',
    title: 'Geometry Calculators',
    shortName: 'Geometry',
    icon: 'shapes',
    description:
      'Calculate area, volume and triangles — plus real-world square footage — with the formulas and worked examples for each shape.',
    intro:
      'From a homework problem to a home-improvement estimate, these calculators find the area of a flat shape, the volume of a solid, or every part of a triangle — each using the standard geometric formulas, with worked examples on every page.',
    body: [
      'Reach for <strong>area</strong> for flat shapes, <strong>volume</strong> for 3D solids, and the <strong>triangle</strong> solver when you know three sides and need the angles and area. For a room or plot measured in feet, the <strong>square footage</strong> calculator adds a materials-and-cost angle on top of the same area maths.',
      'Every page lists the formula it uses and a worked example, so the calculator doubles as a way to check work done by hand.',
    ],
    members: [
      { ref: 'math/area-calculator', use: 'Area of a rectangle, circle, triangle, trapezoid and more.' },
      { ref: 'math/volume-calculator', use: 'Volume of a box, sphere, cylinder, cone, pyramid or capsule.' },
      { ref: 'math/triangle-calculator', use: 'Solve a triangle from three sides — angles, area, type.' },
      { ref: 'everyday/square-footage-calculator', use: 'Room or area square footage for flooring, paint or cost.' },
    ],
    guides: [],
    order: 5,
  },
] as const;

/* ------------------------------------------------------------------ */
/* Derived helpers                                                     */
/* ------------------------------------------------------------------ */

const CLUSTER_BY_SLUG = new Map(CLUSTERS.map((c) => [c.slug, c]));

export const CLUSTERS_ORDERED: readonly Cluster[] = [...CLUSTERS].sort((a, b) => a.order - b.order);

export function getCluster(slug: string): Cluster | undefined {
  return CLUSTER_BY_SLUG.get(slug);
}

/** Canonical path for a cluster hub, e.g. '/topics/loan-calculators'. */
export function clusterPath(cluster: Pick<Cluster, 'slug'>): string {
  return `/topics/${cluster.slug}`;
}

/**
 * Clusters that contain a given calculator (by "category/slug"), for the
 * reverse "Part of" links on calculator pages. Usually one, occasionally none.
 */
export function getClustersForCalculator(categorySlug: string, slug: string): Cluster[] {
  const ref = `${categorySlug}/${slug}`;
  return CLUSTERS_ORDERED.filter((cluster) => cluster.members.some((m) => m.ref === ref));
}
