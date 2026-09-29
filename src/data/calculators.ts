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
      'Plan loans, mortgages, savings, investments, taxes and retirement with fast, accurate financial calculators — free, with every formula shown.',
    icon: 'wallet',
    order: 1,
  },
  {
    slug: 'health',
    name: 'Health & Fitness Calculators',
    shortName: 'Health',
    description:
      'Understand your body with BMI, BMR, calorie, body-fat, protein and pregnancy calculators, each built on an established, published formula.',
    icon: 'heart-pulse',
    order: 2,
  },
  {
    slug: 'math',
    name: 'Math Calculators',
    shortName: 'Math',
    description:
      'Solve everyday and advanced math — a full scientific calculator plus fractions, percentages, statistics, geometry and a random number generator.',
    icon: 'ruler',
    order: 3,
  },
  {
    slug: 'everyday',
    name: 'Everyday Calculators & Tools',
    shortName: 'Everyday',
    description:
      'Practical calculators for dates, time, grades, conversions, square footage and concrete — the everyday numbers you reach for and need right.',
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
      'Calculate the monthly payment, total interest and payoff date on any fixed-rate loan, with a full amortization schedule and the saving from paying extra.',
    keywords: ['loan calculator', 'monthly payment calculator', 'loan interest'],
  },
  {
    slug: 'auto-loan-calculator',
    title: 'Auto Loan Calculator',
    category: 'finance',
    status: 'live',
    description:
      'Work out your car payment from the price, down payment, trade-in, sales tax and fees, with the total interest and a full schedule for the whole term.',
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
      "See how every payment splits between principal and interest over a loan's life, with the full schedule, the total interest and the effect of paying extra.",
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
      'Calculate simple interest and the end balance, or solve back for the principal, rate or term, using I = P x r x t with every step of the working shown.',
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
    description:
      'Find the interest rate you are actually paying on a loan, worked back from the amount borrowed, the monthly payment and the term of the loan.',
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
    description:
      'Project whether your savings and contributions will fund the retirement you want, the income they would provide, and the shortfall if there is one.',
    keywords: ['retirement calculator', 'retirement savings', '401k'],
    aliases: ['401k calculator', 'retirement savings calculator'],
    phrases: ['can i retire', 'retirement planning', 'save for retirement'],
  },
  {
    slug: 'savings-calculator',
    title: 'Savings Calculator',
    category: 'finance',
    status: 'live',
    description:
      'Project how regular deposits and interest can grow your savings, or calculate the monthly deposit needed to reach a savings goal.',
    keywords: ['savings calculator', 'savings goal'],
  },
  {
    slug: 'inflation-calculator',
    title: 'Inflation Calculator',
    category: 'finance',
    status: 'live',
    description:
      'Convert an amount between any two months since 1913 using published U.S. CPI data, or project its future value at a flat rate, to see what money is worth.',
    keywords: ['inflation calculator', 'purchasing power', 'cpi calculator', 'consumer price index', 'value of a dollar'],
  },
  {
    slug: 'payment-calculator',
    title: 'Payment Calculator',
    category: 'finance',
    status: 'live',
    description:
      'Calculate the monthly payment on a fixed-rate loan, or how long a balance takes to clear at a payment you choose, with the total interest either way.',
    keywords: ['payment calculator', 'loan payment'],
  },
  {
    slug: 'credit-card-payoff-calculator',
    title: 'Credit Card Payoff Calculator',
    category: 'finance',
    status: 'live',
    description:
      'Build a debt-avalanche plan across several credit cards from one monthly budget: what to pay on each card, when each one clears, and the total interest.',
    keywords: ['credit card payoff calculator', 'debt payoff', 'debt avalanche calculator', 'multiple credit cards'],
    aliases: ['debt payoff calculator', 'debt avalanche calculator', 'credit cards payoff calculator'],
    phrases: [
      'pay off credit card',
      'how long to pay off credit card',
      'how to pay off credit card debt',
      'credit card debt',
      'get out of debt',
      'pay off multiple credit cards',
      'which credit card should i pay off first',
      'which card to pay first',
      'pay off a credit card with another card',
      'when to pay my credit card',
      'does paying off a credit card hurt my credit',
    ],
  },
  {
    slug: 'home-equity-loan-calculator',
    title: 'Home Equity Loan Calculator',
    category: 'finance',
    status: 'live',
    description: "See how much you can borrow against your home's equity and what it would cost each month, from your property value and remaining mortgage balance.",
    keywords: ['home equity loan calculator', 'HELOC'],
    aliases: ['heloc calculator'],
    phrases: ['borrow against my home', 'home equity'],
  },
  {
    slug: 'salary-calculator',
    title: 'Salary Calculator',
    category: 'finance',
    status: 'live',
    description:
      'Convert your pay between hourly, daily, weekly, monthly and annual, before and after holidays and unpaid leave, to compare offers on the same basis.',
    keywords: ['salary calculator', 'hourly to salary', 'pay frequency', 'annual salary', 'hourly rate'],
    aliases: ['pay calculator', 'wage calculator'],
    phrases: ['hourly to salary', 'salary to hourly', 'annual salary', 'yearly income'],
  },
  {
    slug: 'sales-tax-calculator',
    title: 'Sales Tax Calculator',
    category: 'finance',
    status: 'live',
    description:
      'Fill in any two of before-tax price, tax rate and after-tax price and the third is worked out — add sales tax to a price, or strip it back out of a total.',
    keywords: ['sales tax calculator', 'reverse sales tax', 'price before tax', 'tax rate from receipt', 'after tax price'],
  },
  {
    slug: 'vat-calculator',
    title: 'VAT Calculator',
    category: 'finance',
    status: 'live',
    description:
      'Add VAT to a net price or work it out backwards from a gross total. Fill in any two of rate, net, gross and VAT amount and the other two are calculated.',
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
    description:
      'Estimate your 2025 or 2026 federal refund or amount owed, line by line, from income, filing status, deductions and credits, with your effective tax rate.',
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
      'Calculate the tip and the total, then split the bill between any number of people. Pick a percentage or round to a figure and see what each person pays.',
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
    description:
      'Estimate your Basal Metabolic Rate, the calories your body burns at complete rest, with the Mifflin-St Jeor equation and your needs at each activity level.',
    keywords: ['bmr calculator', 'basal metabolic rate', 'calories at rest'],
  },
  {
    slug: 'calorie-calculator',
    title: 'Calorie Calculator',
    category: 'health',
    status: 'live',
    description:
      'Find your daily calorie needs for maintaining, losing or gaining weight, from your age, height, weight and activity level, with a macro breakdown.',
    keywords: ['calorie calculator', 'daily calories', 'tdee'],
    aliases: ['tdee calculator', 'maintenance calorie calculator'],
    phrases: ['how many calories', 'daily calorie needs', 'calories to lose weight'],
  },
  {
    slug: 'body-fat-calculator',
    title: 'Body Fat Calculator',
    category: 'health',
    status: 'live',
    description:
      'Estimate your body fat percentage from tape measurements using the U.S. Navy method, with your fat and lean mass, the category you fall in and a BMI estimate.',
    keywords: ['body fat calculator', 'navy method body fat', 'body fat percentage', 'lean body mass', 'body fat category'],
  },
  {
    slug: 'ideal-weight-calculator',
    title: 'Ideal Weight Calculator',
    category: 'health',
    status: 'live',
    description:
      'Find a healthy target weight range for your height using the Devine, Hamwi, Robinson and Miller formulas, alongside the healthy BMI range for comparison.',
    keywords: ['ideal weight calculator', 'healthy weight range'],
    phrases: ['what should i weigh', 'healthy weight range', 'ideal body weight'],
  },
  {
    slug: 'protein-calculator',
    title: 'Protein Calculator',
    category: 'health',
    status: 'live',
    description:
      'Estimate your daily protein intake in grams from body weight, activity level and goal, with the range for building muscle, losing fat or maintaining.',
    keywords: ['protein calculator', 'protein intake calculator', 'daily protein intake'],
    aliases: ['daily protein calculator', 'protein needs calculator'],
    phrases: ['how much protein do i need', 'protein per day', 'protein for muscle gain'],
  },
  {
    slug: 'fat-intake-calculator',
    title: 'Fat Intake Calculator',
    category: 'health',
    status: 'live',
    description:
      'Estimate how much fat to eat each day within your calorie target, split into saturated and unsaturated grams, using established dietary guidelines.',
    keywords: ['fat intake calculator', 'daily fat grams'],
  },
  {
    slug: 'target-heart-rate-calculator',
    title: 'Target Heart Rate Calculator',
    category: 'health',
    status: 'live',
    description:
      'Find your five training heart-rate zones from your age and resting heart rate using the Karvonen method, with the beats per minute for each zone.',
    keywords: ['target heart rate calculator', 'heart rate zones'],
  },
  {
    slug: 'pace-calculator',
    title: 'Pace Calculator',
    category: 'health',
    status: 'live',
    description:
      'Calculate running pace and speed from distance and elapsed time, with equivalent finish times for common race distances.',
    keywords: ['pace calculator', 'running pace'],
    aliases: ['running pace calculator'],
    phrases: ['running pace', 'race pace', 'minutes per mile'],
  },
  {
    slug: 'due-date-calculator',
    title: 'Due Date Calculator',
    category: 'health',
    status: 'live',
    description: "Estimate your due date from your last menstrual period, conception date or cycle length, with each trimester's dates and how many weeks along you are.",
    keywords: ['due date calculator', 'pregnancy due date'],
    aliases: ['pregnancy due date calculator'],
    phrases: ['when is my baby due', 'baby due date'],
  },
  {
    slug: 'pregnancy-calculator',
    title: 'Pregnancy Calculator',
    category: 'health',
    status: 'live',
    description:
      'Track your pregnancy week by week from your due date or last period, with the trimester you are in, key milestones, and how far along you are today.',
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
    description:
      'Work out a percentage of a number, what percent one number is of another, and percentage increase or decrease — three calculators, each showing its steps.',
    keywords: ['percentage calculator', 'percent change', 'percent of'],
    aliases: ['percent calculator'],
    phrases: ['percent of a number', 'percentage change', 'what percent', 'percent increase'],
  },
  {
    slug: 'fraction-calculator',
    title: 'Fraction Calculator',
    category: 'math',
    status: 'live',
    description:
      'Add, subtract, multiply and divide fractions, with the answer simplified, as a mixed number and as a decimal, and every step of the working shown.',
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
    description:
      'Calculate the population and sample standard deviation, variance, mean and range of any data set, with each step of the working shown alongside the result.',
    keywords: ['standard deviation calculator', 'variance calculator', 'population standard deviation', 'sample standard deviation'],
    aliases: ['sd calculator', 'std dev calculator'],
    phrases: ['how to calculate standard deviation', 'standard deviation step by step', 'mean and standard deviation'],
  },
  {
    slug: 'triangle-calculator',
    title: 'Triangle Calculator',
    category: 'math',
    status: 'live',
    description:
      'Solve a triangle from three known sides: its area, perimeter, all three angles, and whether it is right, acute or obtuse, with the working shown.',
    keywords: ['triangle calculator', 'triangle solver'],
  },
  {
    slug: 'random-number-generator',
    title: 'Random Number Generator',
    category: 'math',
    status: 'live',
    description: "Generate random numbers in any range, with or without repeats, singly or as a list. Drawn from the browser's cryptographic source, never a seeded formula.",
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
      'Calculate the area of a rectangle, square, triangle, circle, trapezoid, parallelogram, ellipse or sector, in any units, with the formula shown for each.',
    keywords: ['area calculator', 'area of a shape', 'area of circle', 'area of triangle'],
  },
  {
    slug: 'volume-calculator',
    title: 'Volume Calculator',
    category: 'math',
    status: 'live',
    description:
      'Calculate the volume of a cube, box, sphere, cylinder, cone, pyramid, capsule or tank in any units, with the formula and the working shown for each shape.',
    keywords: ['volume calculator', 'volume of a cylinder', 'volume of a sphere', 'volume of a cone'],
  },

  /* -- Everyday ---------------------------------------------------- */
  {
    slug: 'age-calculator',
    title: 'Age Calculator',
    category: 'everyday',
    status: 'live',
    description:
      'Calculate your exact age in years, months and days from your date of birth, plus total weeks, days and hours lived, and the time to your next birthday.',
    keywords: ['age calculator', 'how old am i'],
    aliases: ['birthday calculator'],
    phrases: ['how old am i', 'calculate my age', 'age from date of birth'],
  },
  {
    slug: 'date-calculator',
    title: 'Date Calculator',
    category: 'everyday',
    status: 'live',
    description:
      'Add or subtract days, weeks, months or years from any date, or count the days between two dates, with business days and public holidays handled.',
    keywords: ['date calculator', 'days between dates'],
  },
  {
    slug: 'time-calculator',
    title: 'Time Calculator',
    category: 'everyday',
    status: 'live',
    description:
      'Add or subtract hours, minutes and seconds, or convert between time units, with the answer in both hh:mm:ss and decimal hours for timesheets.',
    keywords: ['time calculator', 'add time'],
  },
  {
    slug: 'hours-calculator',
    title: 'Hours Calculator',
    category: 'everyday',
    status: 'live',
    description:
      'Work out hours worked between two times, minus unpaid breaks, in decimal hours and hh:mm. Add several shifts for a daily or weekly timesheet total.',
    keywords: ['hours calculator', 'work hours'],
    aliases: ['work hours calculator', 'timesheet calculator'],
    phrases: ['hours worked', 'hours between two times'],
  },
  {
    slug: 'gpa-calculator',
    title: 'GPA Calculator',
    category: 'everyday',
    status: 'live',
    description:
      'Calculate your weighted GPA from course grades and credit hours, for a single semester or cumulatively, on the standard 4.0 scale with honours weighting.',
    keywords: ['gpa calculator', 'weighted gpa calculator', 'gpa calculator college', 'grade point average'],
    aliases: ['grade point average calculator', 'semester gpa calculator', 'cumulative gpa calculator'],
    phrases: ['calculate my gpa', 'what is my gpa', 'gpa for this semester'],
  },
  {
    slug: 'grade-calculator',
    title: 'Grade Calculator',
    category: 'everyday',
    status: 'live',
    description:
      'Work out your weighted course average, or the final grade you need to reach a target. Enter each score and its weight to see exactly where you stand.',
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
    description:
      'Work out how much concrete you need for a slab, footing, column or step, in cubic yards, metres and bags, from measurements in feet, inches or metres.',
    keywords: [
      'concrete calculator',
      'concrete slab calculator',
      'concrete volume',
      'concrete calculator yards',
      'concrete slab thickness',
    ],
    aliases: [
      'cement calculator',
      'cubic yards of concrete calculator',
      'slab calculator',
      'fence post concrete calculator',
    ],
    phrases: [
      'how much concrete do i need',
      'how much concrete per fence post',
      'concrete for fence posts',
      'how thick should a concrete slab be',
      'how many yards of concrete do i need',
      'how much does concrete weigh',
      'concrete for a slab',
      'cubic yards of concrete',
      'bags of concrete',
    ],
  },
  {
    slug: 'conversion-calculator',
    title: 'Unit Conversion Calculator',
    category: 'everyday',
    status: 'live',
    description:
      'Convert length, weight, volume, temperature, area and speed between metric and imperial units. Enter a value once and every equivalent updates with it.',
    keywords: ['conversion calculator', 'unit converter'],
    aliases: ['unit converter', 'measurement converter'],
    phrases: ['kg to pounds', 'kilograms to pounds', 'cm to inches', 'celsius to fahrenheit', 'miles to km', 'lbs to kg'],
  },
  {
    slug: 'password-generator',
    title: 'Password Generator',
    category: 'everyday',
    status: 'live',
    description:
      'Create strong random passwords with the length and character sets you choose. Generated in your browser with Web Crypto and never sent or stored anywhere.',
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
      'Calculate the square footage of a room, wall or plot from its measurements, in feet, inches or metres, with a materials cost estimate for flooring or paint.',
    keywords: ['square footage calculator', 'sq ft calculator', 'room area', 'flooring calculator'],
    aliases: [
      'square foot calculator',
      'wall square footage calculator',
      'area of a room calculator',
      'sqft calculator',
    ],
    phrases: [
      'how to calculate square footage',
      'how to measure square footage of a room',
      'how to figure square footage',
      'square footage of a room',
      'square footage of a wall',
      'how to calculate square footage of a house',
      'how to measure a room for flooring',
      'square footage to square yards',
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

/*
 * Related calculators live in `src/lib/related.ts`, not here. Ranking them needs
 * the task groups and topic clusters, and those layers are built on top of this
 * registry — importing them back into it would invert the dependency. The
 * registry stays the base layer that knows nothing about the IA above it.
 */

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
