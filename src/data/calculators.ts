/**
 * The calculator registry — the single source of truth for every calculator
 * and category on the site.
 *
 * Navigation, category landing pages, the sitemap, internal linking, related
 * tools and structured data are all *derived* from this data. Adding a new
 * calculator is therefore: (1) add an entry here, (2) add its page + logic.
 * Nothing else needs to change.
 *
 * `status: 'live'` calculators have a built page and appear in navigation,
 * the sitemap and category listings. `status: 'planned'` entries are the
 * public roadmap: they document breadth and intent without shipping thin,
 * empty pages that would harm SEO.
 */

export type CalculatorStatus = 'live' | 'planned';

export interface Category {
  /** URL segment, e.g. 'finance' -> /finance */
  readonly slug: string;
  /** Full display name, e.g. 'Financial Calculators' */
  readonly name: string;
  /** Compact label for nav/breadcrumbs, e.g. 'Finance' */
  readonly shortName: string;
  /** One-line description used on the category landing page + meta. */
  readonly description: string;
  /** Emoji glyph used as a lightweight, dependency-free icon. */
  readonly icon: string;
  /** Display/sort order in navigation. */
  readonly order: number;
}

export interface Calculator {
  /** URL segment within its category, e.g. 'mortgage-calculator'. */
  readonly slug: string;
  /** Human title, also the default H1 and <title> stem. */
  readonly title: string;
  /** Category slug this calculator belongs to. */
  readonly category: string;
  readonly status: CalculatorStatus;
  /** SEO meta description + card blurb (~120-155 chars ideal). */
  readonly description: string;
  /** Target search terms; informs internal copy, not stuffed into markup. */
  readonly keywords: readonly string[];
  /**
   * Optional curated search aliases — alternative names and common
   * abbreviations. Added ONLY where they improve discovery; never forced onto
   * every calculator. Consumed by the search index (src/lib/search.ts).
   */
  readonly aliases?: readonly string[];
  /**
   * Optional natural-language phrases people actually type ("how old am i").
   * Added ONLY where the phrasing differs from the title/keywords.
   */
  readonly phrases?: readonly string[];
}

/* ------------------------------------------------------------------ */
/* Categories                                                          */
/* ------------------------------------------------------------------ */

export const CATEGORIES: readonly Category[] = [
  {
    slug: 'finance',
    name: 'Financial Calculators',
    shortName: 'Finance',
    description:
      'Plan loans, mortgages, savings, investments, taxes and retirement with fast, accurate financial calculators.',
    icon: 'wallet',
    order: 1,
  },
  {
    slug: 'health',
    name: 'Health & Fitness Calculators',
    shortName: 'Health',
    description:
      'Understand your body with BMI, BMR, calorie, body-fat and pregnancy calculators built on established formulas.',
    icon: 'heart-pulse',
    order: 2,
  },
  {
    slug: 'math',
    name: 'Math Calculators',
    shortName: 'Math',
    description:
      'Solve everyday and advanced math — from a full scientific calculator to fractions, percentages and statistics.',
    icon: 'ruler',
    order: 3,
  },
  {
    slug: 'everyday',
    name: 'Everyday Calculators & Tools',
    shortName: 'Everyday',
    description:
      'Practical calculators and tools for dates, time, grades, conversions and more that you reach for in daily life.',
    icon: 'wrench',
    order: 4,
  },
] as const;

/* ------------------------------------------------------------------ */
/* Calculators                                                         */
/* ------------------------------------------------------------------ */

export const CALCULATORS: readonly Calculator[] = [
  /* -- Finance ----------------------------------------------------- */
  {
    slug: 'mortgage-calculator',
    title: 'Mortgage Calculator',
    category: 'finance',
    status: 'live',
    description:
      'Estimate your monthly mortgage payment including principal, interest, property tax, insurance and PMI, and a year-by-year amortization schedule.',
    keywords: ['mortgage calculator', 'monthly mortgage payment', 'home loan calculator', 'amortization schedule'],
    aliases: ['home loan calculator', 'house loan calculator', 'home mortgage calculator'],
    phrases: ['house loan', 'home loan', 'monthly house payment', 'buy a house', 'mortgage payment'],
  },
  {
    slug: 'loan-calculator',
    title: 'Loan Calculator',
    category: 'finance',
    status: 'live',
    description:
      'Calculate the monthly payment, total interest and payoff timeline for any fixed-rate loan.',
    keywords: ['loan calculator', 'monthly payment calculator', 'loan interest'],
  },
  {
    slug: 'auto-loan-calculator',
    title: 'Auto Loan Calculator',
    category: 'finance',
    status: 'live',
    description:
      'Work out car payments including down payment, trade-in, sales tax and fees.',
    keywords: ['auto loan calculator', 'car payment calculator', 'car loan'],
    aliases: ['car loan calculator', 'car payment calculator', 'vehicle loan calculator'],
    phrases: ['car payment', 'car loan payment', 'finance a car', 'monthly car payment'],
  },
  {
    slug: 'amortization-calculator',
    title: 'Amortization Calculator',
    category: 'finance',
    status: 'live',
    description:
      'See how each payment splits between principal and interest across the life of a loan.',
    keywords: ['amortization calculator', 'amortization schedule', 'loan payoff'],
  },
  {
    slug: 'compound-interest-calculator',
    title: 'Compound Interest Calculator',
    category: 'finance',
    status: 'live',
    description:
      'Convert an interest rate between compounding periods — APR to APY and back — so two quotes can be compared on equal terms.',
    keywords: ['compound interest calculator', 'apr to apy', 'apy calculator', 'interest compounding', 'effective annual rate'],
    aliases: ['apr to apy calculator', 'effective annual rate calculator'],
    phrases: ['convert apr to apy', 'what is my apy', 'compare interest rates'],
  },
  {
    slug: 'simple-interest-calculator',
    title: 'Simple Interest Calculator',
    category: 'finance',
    status: 'live',
    description:
      'Calculate simple interest and the end balance, or solve back for the principal, term or rate — with the working shown.',
    keywords: ['simple interest calculator', 'interest formula', 'I = Prt', 'solve for principal', 'solve for rate'],
    aliases: ['simple interest formula calculator'],
    phrases: ['calculate simple interest', 'interest on a loan', 'what rate do I need'],
  },
  {
    slug: 'interest-calculator',
    title: 'Interest Calculator',
    category: 'finance',
    status: 'live',
    description:
      'Work out the compound interest and final balance on a lump sum plus regular contributions, allowing for tax and inflation.',
    keywords: ['interest calculator', 'savings interest', 'compound interest accumulation'],
  },
  {
    slug: 'interest-rate-calculator',
    title: 'Interest Rate Calculator',
    category: 'finance',
    status: 'live',
    description: 'Find the effective interest rate on a loan or investment.',
    keywords: ['interest rate calculator', 'effective rate'],
  },
  {
    slug: 'investment-calculator',
    title: 'Investment Calculator',
    category: 'finance',
    status: 'live',
    description:
      'Project what a starting amount and regular contributions grow to, with the accumulation schedule year by year and month by month.',
    keywords: ['investment calculator', 'return on investment', 'future value', 'accumulation schedule', 'compound growth'],
    aliases: ['roi calculator'],
    phrases: ['investment growth', 'how my investment grows', 'future value of investment'],
  },
  {
    slug: 'retirement-calculator',
    title: 'Retirement Calculator',
    category: 'finance',
    status: 'live',
    description: 'Estimate whether your savings and contributions will fund your retirement goals.',
    keywords: ['retirement calculator', 'retirement savings', '401k'],
    aliases: ['401k calculator', 'retirement savings calculator'],
    phrases: ['can i retire', 'retirement planning', 'save for retirement'],
  },
  {
    slug: 'savings-calculator',
    title: 'Savings Calculator',
    category: 'finance',
    status: 'live',
    description: 'Project how regular deposits and interest can grow your savings, or calculate the monthly deposit needed to reach a savings goal.',
    keywords: ['savings calculator', 'savings goal'],
  },
  {
    slug: 'inflation-calculator',
    title: 'Inflation Calculator',
    category: 'finance',
    status: 'live',
    description: 'Convert an amount between any two months since 1913 with published U.S. CPI data, or project it at a flat rate.',
    keywords: ['inflation calculator', 'purchasing power', 'cpi calculator', 'consumer price index', 'value of a dollar'],
  },
  {
    slug: 'payment-calculator',
    title: 'Payment Calculator',
    category: 'finance',
    status: 'live',
    description: 'Calculate the monthly payment or payoff term for a fixed loan.',
    keywords: ['payment calculator', 'loan payment'],
  },
  {
    slug: 'credit-card-payoff-calculator',
    title: 'Credit Card Payoff Calculator',
    category: 'finance',
    status: 'live',
    description: 'Build a debt-avalanche payoff plan for several credit cards from one monthly budget — when each card clears, what it costs, and what to pay on each card every month.',
    keywords: ['credit card payoff calculator', 'debt payoff', 'debt avalanche calculator', 'multiple credit cards'],
    aliases: ['debt payoff calculator', 'debt avalanche calculator', 'credit cards payoff calculator'],
    phrases: [
      'pay off credit card',
      'how long to pay off credit card',
      'credit card debt',
      'get out of debt',
      'pay off multiple credit cards',
      'which card to pay first',
    ],
  },
  {
    slug: 'home-equity-loan-calculator',
    title: 'Home Equity Loan Calculator',
    category: 'finance',
    status: 'live',
    description: 'Estimate borrowing power and payments against your home equity.',
    keywords: ['home equity loan calculator', 'HELOC'],
    aliases: ['heloc calculator'],
    phrases: ['borrow against my home', 'home equity'],
  },
  {
    slug: 'salary-calculator',
    title: 'Salary Calculator',
    category: 'finance',
    status: 'live',
    description: 'Convert pay between eight frequencies, before and after holidays and vacation days.',
    keywords: ['salary calculator', 'hourly to salary', 'pay frequency', 'annual salary', 'hourly rate'],
    aliases: ['pay calculator', 'wage calculator'],
    phrases: ['hourly to salary', 'salary to hourly', 'annual salary', 'yearly income'],
  },
  {
    slug: 'sales-tax-calculator',
    title: 'Sales Tax Calculator',
    category: 'finance',
    status: 'live',
    description: 'Fill in any two of before-tax price, tax rate and after-tax price to get the third.',
    keywords: ['sales tax calculator', 'reverse sales tax', 'price before tax', 'tax rate from receipt', 'after tax price'],
  },
  {
    slug: 'vat-calculator',
    title: 'VAT Calculator',
    category: 'finance',
    status: 'live',
    description: 'Fill in any two of VAT rate, net price, gross price and tax amount to get the other two.',
    keywords: ['vat calculator', 'add vat', 'remove vat', 'reverse vat calculator', 'vat inclusive price', 'net to gross'],
    aliases: ['vat calculator uk', 'value added tax calculator', 'gst calculator'],
    phrases: [
      'how much vat do i pay',
      'how much is vat',
      'how to work out vat',
      'price excluding vat',
      'work out vat backwards',
    ],
  },
  {
    slug: 'income-tax-calculator',
    title: 'Income Tax Calculator',
    category: 'finance',
    status: 'live',
    description: 'Estimate the refund or amount owed on a 2025 or 2026 federal return, line by line.',
    keywords: ['income tax calculator', 'federal tax estimate', 'tax refund calculator', 'tax brackets', 'tax return estimator'],
    aliases: ['tax calculator'],
    phrases: ['how much tax will i pay', 'income tax owed'],
  },

  {
    slug: 'tip-calculator',
    title: 'Tip Calculator',
    category: 'finance',
    status: 'live',
    description:
      'Calculate the tip, total bill, and amount per person when splitting a bill.',
    keywords: ['tip calculator', 'gratuity calculator', 'split the bill', 'tip table', 'shared bill tip'],
    aliases: ['gratuity calculator'],
    phrases: ['tip split', 'split the bill', 'how much to tip', 'restaurant tip'],
  },

  /* -- Health ------------------------------------------------------ */
  {
    slug: 'bmi-calculator',
    title: 'BMI Calculator',
    category: 'health',
    status: 'live',
    description:
      'Calculate your Body Mass Index (BMI) from height and weight, see your WHO weight category, and your healthy weight range.',
    keywords: ['bmi calculator', 'body mass index', 'healthy weight', 'bmi chart'],
    aliases: ['body mass index calculator', 'check my bmi'],
    phrases: ['body mass', 'am i overweight', 'healthy weight'],
  },
  {
    slug: 'bmr-calculator',
    title: 'BMR Calculator',
    category: 'health',
    status: 'live',
    description: 'Estimate your Basal Metabolic Rate — the calories you burn at rest.',
    keywords: ['bmr calculator', 'basal metabolic rate', 'calories at rest'],
  },
  {
    slug: 'calorie-calculator',
    title: 'Calorie Calculator',
    category: 'health',
    status: 'live',
    description: 'Find your daily calorie needs for maintaining, losing or gaining weight.',
    keywords: ['calorie calculator', 'daily calories', 'tdee'],
    aliases: ['tdee calculator', 'maintenance calorie calculator'],
    phrases: ['how many calories', 'daily calorie needs', 'calories to lose weight'],
  },
  {
    slug: 'body-fat-calculator',
    title: 'Body Fat Calculator',
    category: 'health',
    status: 'live',
    description: 'Estimate body fat from tape measurements with the U.S. Navy method, plus mass, category and a BMI estimate.',
    keywords: ['body fat calculator', 'navy method body fat', 'body fat percentage', 'lean body mass', 'body fat category'],
  },
  {
    slug: 'ideal-weight-calculator',
    title: 'Ideal Weight Calculator',
    category: 'health',
    status: 'live',
    description: 'Find a healthy target weight range for your height using established formulas.',
    keywords: ['ideal weight calculator', 'healthy weight range'],
    phrases: ['what should i weigh', 'healthy weight range', 'ideal body weight'],
  },
  {
    slug: 'protein-calculator',
    title: 'Protein Calculator',
    category: 'health',
    status: 'live',
    description: 'Estimate daily protein needs based on body weight and activity.',
    keywords: ['protein calculator', 'protein intake calculator', 'daily protein intake'],
    aliases: ['daily protein calculator', 'protein needs calculator'],
    phrases: ['how much protein do i need', 'protein per day', 'protein for muscle gain'],
  },
  {
    slug: 'fat-intake-calculator',
    title: 'Fat Intake Calculator',
    category: 'health',
    status: 'live',
    description: 'Estimate recommended daily fat intake within your calorie target.',
    keywords: ['fat intake calculator', 'daily fat grams'],
  },
  {
    slug: 'target-heart-rate-calculator',
    title: 'Target Heart Rate Calculator',
    category: 'health',
    status: 'live',
    description: 'Find your training heart-rate zones from age and resting heart rate.',
    keywords: ['target heart rate calculator', 'heart rate zones'],
  },
  {
    slug: 'pace-calculator',
    title: 'Pace Calculator',
    category: 'health',
    status: 'live',
    description: 'Calculate running pace and speed from distance and elapsed time, with equivalent finish times for common race distances.',
    keywords: ['pace calculator', 'running pace'],
    aliases: ['running pace calculator'],
    phrases: ['running pace', 'race pace', 'minutes per mile'],
  },
  {
    slug: 'due-date-calculator',
    title: 'Due Date Calculator',
    category: 'health',
    status: 'live',
    description: 'Estimate a pregnancy due date from the last menstrual period.',
    keywords: ['due date calculator', 'pregnancy due date'],
    aliases: ['pregnancy due date calculator'],
    phrases: ['when is my baby due', 'baby due date'],
  },
  {
    slug: 'pregnancy-calculator',
    title: 'Pregnancy Calculator',
    category: 'health',
    status: 'live',
    description: 'Track pregnancy weeks and key milestones.',
    keywords: ['pregnancy calculator', 'pregnancy weeks'],
  },

  /* -- Math -------------------------------------------------------- */
  {
    slug: 'scientific-calculator',
    title: 'Scientific Calculator',
    category: 'math',
    status: 'live',
    description:
      'A free online scientific calculator with trigonometry, logarithms, powers, roots, factorials, memory and constants — works on any device.',
    keywords: ['scientific calculator', 'online calculator', 'trigonometry calculator', 'log calculator'],
    aliases: ['sci calc', 'advanced calculator'],
    phrases: ['online calculator', 'trig calculator'],
  },
  {
    slug: 'percent-calculator',
    title: 'Percentage Calculator',
    category: 'math',
    status: 'live',
    description: 'Calculate percentages, percentage change and percent-of quickly.',
    keywords: ['percentage calculator', 'percent change', 'percent of'],
    aliases: ['percent calculator'],
    phrases: ['percent of a number', 'percentage change', 'what percent', 'percent increase'],
  },
  {
    slug: 'fraction-calculator',
    title: 'Fraction Calculator',
    category: 'math',
    status: 'live',
    description: 'Add, subtract, multiply and divide fractions with steps.',
    keywords: ['fraction calculator', 'add fractions'],
  },
  {
    slug: 'statistics-calculator',
    title: 'Statistics Calculator',
    category: 'math',
    status: 'live',
    description:
      'Calculate mean, median, mode, range, variance, standard deviation and quartiles from a data set, with a full five-number summary.',
    keywords: ['statistics calculator', 'mean median mode calculator', 'descriptive statistics', 'mean median mode range'],
    aliases: ['mean median mode calculator', 'average calculator'],
    phrases: ['mean median mode', 'find the average'],
  },
  {
    slug: 'standard-deviation-calculator',
    title: 'Standard Deviation Calculator',
    category: 'math',
    status: 'live',
    description: 'Compute the population and sample standard deviation, variance and mean of a data set, step by step.',
    keywords: ['standard deviation calculator', 'variance calculator', 'population standard deviation', 'sample standard deviation'],
    aliases: ['sd calculator', 'std dev calculator'],
    phrases: ['how to calculate standard deviation', 'standard deviation step by step', 'mean and standard deviation'],
  },
  {
    slug: 'triangle-calculator',
    title: 'Triangle Calculator',
    category: 'math',
    status: 'live',
    description: "Calculate a triangle's area, perimeter, angles and classification from three side lengths.",
    keywords: ['triangle calculator', 'triangle solver'],
  },
  {
    slug: 'random-number-generator',
    title: 'Random Number Generator',
    category: 'math',
    status: 'live',
    description: 'Generate random numbers within a range, with options for uniqueness.',
    keywords: ['random number generator', 'rng'],
    aliases: ['rng', 'random number picker'],
    phrases: ['pick a random number', 'roll a dice'],
  },

  {
    slug: 'area-calculator',
    title: 'Area Calculator',
    category: 'math',
    status: 'live',
    description:
      'Calculate the area of a rectangle, square, triangle, circle, trapezoid, parallelogram or ellipse.',
    keywords: ['area calculator', 'area of a shape', 'area of circle', 'area of triangle'],
  },
  {
    slug: 'volume-calculator',
    title: 'Volume Calculator',
    category: 'math',
    status: 'live',
    description:
      'Calculate the volume of a cube, box, sphere, cylinder, cone, pyramid or capsule.',
    keywords: ['volume calculator', 'volume of a cylinder', 'volume of a sphere', 'volume of a cone'],
  },

  /* -- Everyday ---------------------------------------------------- */
  {
    slug: 'age-calculator',
    title: 'Age Calculator',
    category: 'everyday',
    status: 'live',
    description: 'Calculate exact age in years, months and days from a birth date.',
    keywords: ['age calculator', 'how old am i'],
    aliases: ['birthday calculator'],
    phrases: ['how old am i', 'calculate my age', 'age from date of birth'],
  },
  {
    slug: 'date-calculator',
    title: 'Date Calculator',
    category: 'everyday',
    status: 'live',
    description: 'Add or subtract days from a date, or find the days between two dates.',
    keywords: ['date calculator', 'days between dates'],
  },
  {
    slug: 'time-calculator',
    title: 'Time Calculator',
    category: 'everyday',
    status: 'live',
    description: 'Add, subtract and convert units of time.',
    keywords: ['time calculator', 'add time'],
  },
  {
    slug: 'hours-calculator',
    title: 'Hours Calculator',
    category: 'everyday',
    status: 'live',
    description: 'Calculate hours worked between two times, minus breaks.',
    keywords: ['hours calculator', 'work hours'],
    aliases: ['work hours calculator', 'timesheet calculator'],
    phrases: ['hours worked', 'hours between two times'],
  },
  {
    slug: 'gpa-calculator',
    title: 'GPA Calculator',
    category: 'everyday',
    status: 'live',
    description: 'Compute grade point average from course grades and credit hours.',
    keywords: ['gpa calculator', 'weighted gpa calculator', 'gpa calculator college', 'grade point average'],
    aliases: ['grade point average calculator', 'semester gpa calculator', 'cumulative gpa calculator'],
    phrases: ['calculate my gpa', 'what is my gpa', 'gpa for this semester'],
  },
  {
    slug: 'grade-calculator',
    title: 'Grade Calculator',
    category: 'everyday',
    status: 'live',
    description: 'Find the grade you need and your weighted course average.',
    keywords: ['grade calculator', 'final grade calculator', 'final grade'],
    aliases: ['final grade calculator', 'test grade calculator', 'exam grade calculator'],
    phrases: [
      'what grade do i need',
      'what grade do i need on my final',
      'weighted grade average',
      'grade i need to pass',
    ],
  },
  {
    slug: 'concrete-calculator',
    title: 'Concrete Calculator',
    category: 'everyday',
    status: 'live',
    description: 'Estimate concrete volume in cubic yards or metres for slabs and footings.',
    keywords: ['concrete calculator', 'concrete slab calculator', 'concrete volume', 'concrete calculator yards'],
    aliases: ['cement calculator', 'cubic yards of concrete calculator', 'slab calculator'],
    phrases: ['how much concrete do i need', 'concrete for a slab', 'cubic yards of concrete', 'bags of concrete'],
  },
  {
    slug: 'conversion-calculator',
    title: 'Unit Conversion Calculator',
    category: 'everyday',
    status: 'live',
    description: 'Convert length, weight, volume, temperature and more.',
    keywords: ['conversion calculator', 'unit converter'],
    aliases: ['unit converter', 'measurement converter'],
    phrases: ['kg to pounds', 'kilograms to pounds', 'cm to inches', 'celsius to fahrenheit', 'miles to km', 'lbs to kg'],
  },
  {
    slug: 'password-generator',
    title: 'Password Generator',
    category: 'everyday',
    status: 'live',
    description: 'Create strong, random passwords with configurable length and characters.',
    keywords: ['password generator', 'strong password'],
    aliases: ['random password generator'],
    phrases: ['create a strong password', 'generate a password'],
  },
  {
    slug: 'square-footage-calculator',
    title: 'Square Footage Calculator',
    category: 'everyday',
    status: 'live',
    description:
      'Calculate the square footage of a room or area for flooring, paint or landscaping, with a cost estimate.',
    keywords: ['square footage calculator', 'sq ft calculator', 'room area', 'flooring calculator'],
    aliases: ['square foot calculator', 'area of a room calculator', 'sqft calculator'],
    phrases: [
      'how to calculate square footage',
      'how to measure square footage of a room',
      'how to figure square footage',
      'square footage of a room',
      'how is square footage calculated',
    ],
  },
] as const;

/* ------------------------------------------------------------------ */
/* Derived helpers (framework-agnostic, pure)                          */
/* ------------------------------------------------------------------ */

const CATEGORY_BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));

export const CATEGORIES_ORDERED: readonly Category[] = [...CATEGORIES].sort(
  (a, b) => a.order - b.order,
);

export function getCategory(slug: string): Category | undefined {
  return CATEGORY_BY_SLUG.get(slug);
}

export function getCalculatorsByCategory(categorySlug: string): Calculator[] {
  return CALCULATORS.filter((c) => c.category === categorySlug).sort((a, b) =>
    a.title.localeCompare(b.title),
  );
}

export function getLiveCalculators(): Calculator[] {
  return CALCULATORS.filter((c) => c.status === 'live');
}

export function getCalculator(categorySlug: string, slug: string): Calculator | undefined {
  return CALCULATORS.find((c) => c.category === categorySlug && c.slug === slug);
}

/** Canonical site path for a calculator, e.g. '/finance/mortgage-calculator'. */
export function calculatorPath(calc: Pick<Calculator, 'category' | 'slug'>): string {
  return `/${calc.category}/${calc.slug}`;
}

/** Canonical site path for a category landing page. */
export function categoryPath(category: Pick<Category, 'slug'>): string {
  return `/${category.slug}`;
}

/**
 * Related calculators for internal linking: prefer live siblings in the same
 * category, then fall back to other live calculators. Never returns `self`.
 */
export function getRelatedCalculators(self: Calculator, limit = 6): Calculator[] {
  const sameCategory = getLiveCalculators().filter(
    (c) => c.category === self.category && c.slug !== self.slug,
  );
  const others = getLiveCalculators().filter(
    (c) => c.category !== self.category && c.slug !== self.slug,
  );
  return [...sameCategory, ...others].slice(0, limit);
}

/**
 * Recently added calculators, newest first, as "<category>/<slug>" registry refs.
 *
 * A new calculator is invisible to anyone already deep in the site: the rail's related list is
 * registry order within a category, so the newest entry sits below the fold on its own
 * category's pages and nowhere at all on the others. This list is the one place that says
 * "surface these everywhere for a while".
 *
 * Keep it SHORT — two or three at most — and drop an entry once it is no longer news. It is
 * an editorial decision, not a ranking signal: nothing here affects search relevance, and it
 * is never derived from commercial value.
 */
export const NEW_CALCULATOR_REFS: readonly string[] = ['finance/vat-calculator'];

/**
 * The recently-added calculators as registry entries, live only, never including `self`.
 * Returns an empty array when there is nothing new to show, so the caller renders nothing.
 */
export function getNewCalculators(self?: Pick<Calculator, 'category' | 'slug'>): Calculator[] {
  return NEW_CALCULATOR_REFS.map((ref) => {
    const [category, slug] = ref.split('/');
    return getCalculator(category, slug);
  }).filter(
    (c): c is Calculator =>
      Boolean(c) &&
      c!.status === 'live' &&
      !(self && c!.category === self.category && c!.slug === self.slug),
  );
}

/** Total counts for use in copy ("X calculators and growing"). */
export const STATS = {
  total: CALCULATORS.length,
  live: CALCULATORS.filter((c) => c.status === 'live').length,
  categories: CATEGORIES.length,
} as const;
