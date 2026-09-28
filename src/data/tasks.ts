/**
 * Task groups — the site's PRIMARY, task-first information architecture.
 *
 * People don't wake up wanting a "financial calculator"; they want to know what
 * a loan will cost, whether they can retire, or how much flooring to buy. This
 * registry organises every calculator around that real-world intent — the job
 * the visitor is trying to get done — instead of the tool taxonomy
 * (finance/health/math/everyday), which remains only as a secondary "browse by
 * type" view.
 *
 * It is the single source of truth for the task navigation, the task hub pages
 * (/tasks/[slug]), the homepage entry points and the "what am I doing here"
 * framing on each calculator. Tool URLs are unchanged — this is an additive
 * navigational layer, so no redirects and no SEO migration.
 *
 * COVERAGE CONTRACT: every live calculator belongs to exactly one task group
 * (verified by tasks.test.ts). A tool with no home, or two homes, is a bug —
 * the task IA must be a clean partition, or the "primary" navigation lies.
 */

export interface TaskMember {
  /** "category/slug" reference into the calculator registry. */
  readonly ref: string;
  /** Task-framed one-liner: the job this tool does, in the user's words. */
  readonly use: string;
}

export interface TaskSection {
  /** Sub-heading used to group members within a large hub. */
  readonly title: string;
  /** Member refs shown under this sub-heading, in order. */
  readonly refs: readonly string[];
}

export interface TaskGroup {
  /** URL segment under /tasks/, e.g. 'borrow-repay' -> /tasks/borrow-repay. */
  readonly slug: string;
  /** H1 / <title> stem, e.g. 'Borrow & Repay'. */
  readonly title: string;
  /** Compact label for navigation and cards. */
  readonly shortName: string;
  /** The user-intent question this group answers — the task-first headline. */
  readonly question: string;
  /** Icon name (see Icon.astro). */
  readonly icon: string;
  /** Meta description + card blurb. */
  readonly description: string;
  /** Lead paragraph on the hub page. */
  readonly intro: string;
  /** Members, in display order, each with a task-framed note. */
  readonly members: readonly TaskMember[];
  /** Optional sub-groupings for large hubs; when present, drives the layout. */
  readonly sections?: readonly TaskSection[];
  /** Related guide ids (filenames in src/content/guides, without extension). */
  readonly guides: readonly string[];
  /** Related topic-pillar slugs (/topics/*) for a "go deeper" link. */
  readonly pillars?: readonly string[];
  /** Display/sort order in navigation and directory. */
  readonly order: number;
}

export const TASK_GROUPS: readonly TaskGroup[] = [
  {
    slug: 'borrow-repay',
    title: 'Borrow & Repay',
    shortName: 'Borrow',
    question: 'What will borrowing really cost me?',
    icon: 'landmark',
    description:
      'Work out the true cost of a mortgage, car loan, personal loan or credit-card balance — the monthly payment, the total interest, and how fast you can be debt-free.',
    intro:
      "Whatever you're borrowing for, the maths underneath is the same: an amount, a rate and a term give a monthly payment and a total interest cost. Pick the situation that matches yours — the tools share one amortization engine, so they all read the same way.",
    members: [
      { ref: 'finance/mortgage-calculator', use: 'Buying a home — full payment with tax, insurance, PMI and a schedule.' },
      { ref: 'finance/loan-calculator', use: 'Any fixed-rate loan — payment, total interest and payoff date.' },
      { ref: 'finance/auto-loan-calculator', use: 'Buying a car — with down payment, trade-in, tax and fees.' },
      { ref: 'finance/amortization-calculator', use: 'See how each payment splits between principal and interest.' },
      { ref: 'finance/payment-calculator', use: 'Solve for the payment, or how long a set payment takes to clear.' },
      { ref: 'finance/interest-rate-calculator', use: 'Only quoted a monthly payment? Find the rate hidden inside it.' },
      { ref: 'finance/credit-card-payoff-calculator', use: 'Clear card debt — payoff time and the interest it costs you.' },
      { ref: 'finance/home-equity-loan-calculator', use: 'Borrow against your home — borrowing power and payment.' },
    ],
    guides: ['how-loans-and-interest-work', 'how-much-house-can-you-afford', 'getting-the-best-auto-loan', 'rent-vs-buy-a-home'],
    pillars: ['loan-calculators'],
    order: 1,
  },
  {
    slug: 'save-invest',
    title: 'Save & Invest',
    shortName: 'Save',
    question: 'How much will my money grow?',
    icon: 'piggy-bank',
    description:
      'See how savings and investments grow over time — compound interest, monthly contributions, retirement projections and what inflation does to it all.',
    intro:
      'Borrowing and saving are the same maths pointed in opposite directions: here compounding works for you. These tools show how consistent deposits and time turn small amounts into large balances — and why starting early usually beats saving more later.',
    members: [
      { ref: 'finance/compound-interest-calculator', use: 'The core of growth — compounding with regular contributions.' },
      { ref: 'finance/investment-calculator', use: 'Project an investment with monthly contributions over time.' },
      { ref: 'finance/savings-calculator', use: 'Reach a savings goal, or project where deposits will take you.' },
      { ref: 'finance/retirement-calculator', use: 'Project your nest egg and the income it could provide.' },
      { ref: 'finance/interest-calculator', use: 'Compare simple and compound interest side by side.' },
      { ref: 'finance/simple-interest-calculator', use: 'Straight-line interest with the I = P × r × t formula.' },
      { ref: 'finance/inflation-calculator', use: "See what your money will really be worth in future." },
    ],
    guides: ['understanding-compound-interest', 'simple-interest-explained', 'investing-for-beginners'],
    pillars: ['savings-investment-calculators'],
    order: 2,
  },
  {
    slug: 'income-tax',
    title: 'Income & Tax',
    shortName: 'Income',
    question: "What's my real pay, tax and price?",
    icon: 'receipt',
    description:
      'Understand the money that moves every day — convert a salary between hourly and yearly, estimate income tax, add or remove sales tax, and split a bill with tip.',
    intro:
      'The everyday money maths that quietly adds up: what a wage really works out to, how much tax comes off, and what a price becomes after tax or tip. Quick answers to the questions you hit at work, at the checkout and at dinner.',
    members: [
      { ref: 'finance/salary-calculator', use: 'Convert pay between hourly, weekly, monthly and yearly.' },
      { ref: 'finance/income-tax-calculator', use: 'Estimate the income tax owed on your earnings.' },
      { ref: 'finance/sales-tax-calculator', use: 'Add sales tax to a price, or back it out of a total.' },
      { ref: 'finance/vat-calculator', use: 'Add VAT to a net price, or strip it out of a gross one.' },
      { ref: 'finance/tip-calculator', use: 'Work out the tip and split a bill any number of ways.' },
    ],
    guides: ['how-to-calculate-sales-tax', 'how-vat-works'],
    order: 3,
  },
  {
    slug: 'health-fitness',
    title: 'Health & Fitness',
    shortName: 'Health',
    question: 'Where do my body, diet and training stand?',
    icon: 'heart-pulse',
    description:
      'Turn a few measurements into the numbers that guide health decisions — BMI, body fat, ideal weight, calories, protein, fat, heart-rate zones, running pace and pregnancy milestones.',
    intro:
      'A few measurements become the numbers that guide health and nutrition decisions: how your weight compares, how much energy you burn, what to eat, how hard to train — each from an established, published formula. None is a diagnosis; they are starting points, not substitutes for a professional.',
    members: [
      { ref: 'health/bmi-calculator', use: 'A quick weight-to-height screen and your healthy range.' },
      { ref: 'health/body-fat-calculator', use: 'Estimate body-fat percentage with a tape measure.' },
      { ref: 'health/ideal-weight-calculator', use: 'A healthy target-weight range from four formulas.' },
      { ref: 'health/bmr-calculator', use: 'Calories your body burns at complete rest.' },
      { ref: 'health/calorie-calculator', use: 'Daily calories to maintain, lose or gain weight.' },
      { ref: 'health/protein-calculator', use: 'Daily protein target for your weight and goal.' },
      { ref: 'health/fat-intake-calculator', use: 'Daily fat range within your calorie target.' },
      { ref: 'health/target-heart-rate-calculator', use: 'Your training heart-rate zones by age.' },
      { ref: 'health/pace-calculator', use: 'Running pace, time or distance for training and races.' },
      { ref: 'health/due-date-calculator', use: 'Estimate a pregnancy due date from the last period.' },
      { ref: 'health/pregnancy-calculator', use: 'Track pregnancy weeks and key milestones.' },
    ],
    sections: [
      { title: 'Body & weight', refs: ['health/bmi-calculator', 'health/body-fat-calculator', 'health/ideal-weight-calculator'] },
      { title: 'Energy & diet', refs: ['health/bmr-calculator', 'health/calorie-calculator', 'health/protein-calculator', 'health/fat-intake-calculator'] },
      { title: 'Fitness & training', refs: ['health/target-heart-rate-calculator', 'health/pace-calculator'] },
      { title: 'Pregnancy', refs: ['health/due-date-calculator', 'health/pregnancy-calculator'] },
    ],
    guides: ['bmi-bmr-and-calories-explained', 'complete-guide-to-healthy-weight', 'healthy-weight-for-your-height', 'body-fat-percentage-explained', 'how-much-protein-do-you-need'],
    pillars: ['body-and-diet-calculators'],
    order: 4,
  },
  {
    slug: 'dates-time',
    title: 'Dates & Time',
    shortName: 'Dates',
    question: 'How much time is between these?',
    icon: 'calendar-days',
    description:
      'Dates and durations done exactly — your precise age, the days between two dates, adding or subtracting time, and hours worked between two clock times.',
    intro:
      'Dates and time are deceptively hard by hand: months vary in length, leap years add a day, and the clock counts in base 60. These tools handle all of it, so the answer is always exact and never off by one.',
    members: [
      { ref: 'everyday/age-calculator', use: 'Exact age in years, months and days from a birth date.' },
      { ref: 'everyday/date-calculator', use: 'Days between two dates, or add/subtract days from a date.' },
      { ref: 'everyday/time-calculator', use: 'Add or subtract durations in days, hours, minutes, seconds.' },
      { ref: 'everyday/hours-calculator', use: 'Hours worked between two clock times, minus breaks.' },
    ],
    guides: ['calculating-days-between-dates', 'how-to-calculate-your-exact-age', 'how-to-calculate-hours-worked'],
    pillars: ['time-and-date-calculators'],
    order: 5,
  },
  {
    slug: 'measure-convert',
    title: 'Measure & Convert',
    shortName: 'Measure',
    question: 'How much space or material do I need?',
    icon: 'ruler',
    description:
      'From a home project to a homework problem — square footage, area, volume, triangles and concrete, plus a unit converter for length, weight, volume and temperature.',
    intro:
      'Measuring a room, estimating materials, or solving a shape: these tools find area, volume, square footage and triangle values from the standard formulas, and convert between units so the numbers line up before you buy or build.',
    members: [
      { ref: 'everyday/square-footage-calculator', use: 'Measure a room for flooring, paint, turf — with a cost estimate.' },
      { ref: 'math/area-calculator', use: 'Area of a rectangle, circle, triangle, trapezoid and more.' },
      { ref: 'math/volume-calculator', use: 'Volume of a box, sphere, cylinder, cone, pyramid or capsule.' },
      { ref: 'math/triangle-calculator', use: 'Solve a triangle from three sides — angles, area, type.' },
      { ref: 'everyday/concrete-calculator', use: 'Estimate concrete for a slab or footing, in yards or metres.' },
      { ref: 'everyday/conversion-calculator', use: 'Convert length, weight, volume, temperature and more.' },
    ],
    guides: [],
    pillars: ['geometry-calculators'],
    order: 6,
  },
  {
    slug: 'math-school-tools',
    title: 'Math, School & Tools',
    shortName: 'Math',
    question: 'Can you crunch this number for me?',
    icon: 'graduation-cap',
    description:
      'Everyday and advanced math plus a few handy utilities — a scientific calculator, percentages, fractions, statistics, GPA and grades, a random number generator and a password maker.',
    intro:
      'The number-crunchers you reach for at school, at a desk or in a pinch: a full scientific calculator, percentages and fractions, descriptive statistics, GPA and grade planning, and a couple of everyday utilities.',
    members: [
      { ref: 'math/scientific-calculator', use: 'Trig, logs, powers, roots, memory and constants.' },
      { ref: 'math/percent-calculator', use: 'Percentages, percentage change and percent-of.' },
      { ref: 'math/fraction-calculator', use: 'Add, subtract, multiply and divide fractions with steps.' },
      { ref: 'math/statistics-calculator', use: 'Mean, median, mode, quartiles — a full summary of a data set.' },
      { ref: 'math/standard-deviation-calculator', use: 'Population and sample standard deviation and variance.' },
      { ref: 'everyday/gpa-calculator', use: 'Grade point average from grades and credit hours.' },
      { ref: 'everyday/grade-calculator', use: 'The grade you need, and your weighted course average.' },
      { ref: 'math/random-number-generator', use: 'Random numbers in a range, with optional uniqueness.' },
      { ref: 'everyday/password-generator', use: 'Strong, random passwords with configurable rules.' },
    ],
    sections: [
      { title: 'Everyday math', refs: ['math/scientific-calculator', 'math/percent-calculator', 'math/fraction-calculator'] },
      { title: 'Statistics', refs: ['math/statistics-calculator', 'math/standard-deviation-calculator'] },
      { title: 'School & grades', refs: ['everyday/gpa-calculator', 'everyday/grade-calculator'] },
      { title: 'Handy tools', refs: ['math/random-number-generator', 'everyday/password-generator'] },
    ],
    guides: ['how-to-calculate-percentages', 'how-to-work-with-fractions', 'standard-deviation-explained', 'how-to-use-a-scientific-calculator', 'how-to-create-a-strong-password'],
    order: 7,
  },
] as const;

/* ------------------------------------------------------------------ */
/* Derived helpers (framework-agnostic, pure)                          */
/* ------------------------------------------------------------------ */

const TASK_BY_SLUG = new Map(TASK_GROUPS.map((t) => [t.slug, t]));

export const TASK_GROUPS_ORDERED: readonly TaskGroup[] = [...TASK_GROUPS].sort(
  (a, b) => a.order - b.order,
);

export function getTaskGroup(slug: string): TaskGroup | undefined {
  return TASK_BY_SLUG.get(slug);
}

/** Canonical path for a task hub, e.g. '/tasks/borrow-repay'. */
export function taskPath(group: Pick<TaskGroup, 'slug'>): string {
  return `/tasks/${group.slug}`;
}

/**
 * The task group a calculator belongs to (by "category/slug"). Every live
 * calculator has exactly one — this is the reverse link for the "task" context
 * shown on each calculator page. Returns undefined only for unmapped tools.
 */
export function getTaskGroupForCalculator(categorySlug: string, slug: string): TaskGroup | undefined {
  const ref = `${categorySlug}/${slug}`;
  return TASK_GROUPS_ORDERED.find((group) => group.members.some((m) => m.ref === ref));
}

/** The task-framed "use" note for a calculator within its group, if any. */
export function getTaskUse(categorySlug: string, slug: string): string | undefined {
  const ref = `${categorySlug}/${slug}`;
  for (const group of TASK_GROUPS) {
    const m = group.members.find((mem) => mem.ref === ref);
    if (m) return m.use;
  }
  return undefined;
}
