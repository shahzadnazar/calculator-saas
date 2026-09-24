/**
 * Credit-cards payoff binding — one budget, several cards, the debt-avalanche plan.
 *
 * Wraps the pure `planAvalanchePayoff` (frozen by credit-cards-payoff.test.ts against
 * the published reference case) and layers the visitor-facing contract: strict parsing
 * of every field (never `Number(v) || 0`), per-row validation targeted at the row that
 * is wrong, a form-level "enter at least one card" error, the complete-result guard,
 * and the presentation.
 *
 * WHY THIS SHAPE. The old binding solved ONE card two ways. But card debt is rarely one
 * card, and the question that actually costs people money is which card to attack first
 * — a question a single-card tool cannot even ask. So the fields are a monthly budget
 * and a row per card, and the result is the plan: when the whole thing is clear, what it
 * costs, how that splits between principal and interest, and per card the payoff length,
 * the interest, and the payment schedule with each step-up spelled out. A single card is
 * simply a plan with one row, so nothing that was answerable before is unanswerable now.
 *
 * ROWS are read from island-owned DOM by `[data-cc-row]`, exactly as GPA does; there is
 * still no generic repeater abstraction. A wholly-blank row is IGNORED rather than
 * rejected, so a visitor with two cards is not nagged about the third empty row.
 *
 * THE "NEVER" RESULT is informational and VALID (ratified decision 8, and the precedent
 * this calculator already set): a budget that cannot outrun the interest is a true and
 * important answer, not a typo. It renders through `isUsableResult`, and its financial
 * rows are omitted rather than shown as zero, Infinity or a dash.
 */
import { planAvalanchePayoff, type PayoffCard, type PayoffPlan } from './credit-cards-payoff';
import { formatCurrency, formatCurrencyRounded } from '@lib/format';
import { presentDuration } from '@lib/format-duration';
import { drawDonut, percentLabel, share } from '@lib/result/loan-schedule';
import type {
  FormCalculatorBinding,
  FormRenderContext,
  ResetMode,
  ValidationResult,
} from '@lib/result/form-runtime';

/** How many cards a visitor may plan at once. */
export const MAX_CARDS = 10;
/** How many blank rows the island seeds — card debt is a plural problem. */
export const INITIAL_CARDS = 3;

export interface CreditCardRowValue {
  /** Island-assigned stable id, so an error can name the row it belongs to. */
  id: string;
  name: string;
  balance: string;
  minPayment: string;
  aprPct: string;
}

export interface CreditCardValues {
  budget: string;
  rows: CreditCardRowValue[];
}

export interface CreditCardComputed {
  plan: PayoffPlan;
  /** The cards that actually went into the plan, in ENTERED order. */
  cards: PayoffCard[];
  budget: number;
}

export const MSG = {
  budgetRequired: 'Enter the amount you can put toward your cards each month.',
  budgetPositive: 'Enter a monthly budget greater than zero.',
  balanceRequired: 'Enter this card’s balance.',
  balancePositive: 'Enter a balance greater than zero.',
  minRequired: 'Enter this card’s minimum payment.',
  minPositive: 'Enter a minimum payment greater than zero.',
  aprRequired: 'Enter this card’s interest rate.',
  aprRange: 'Enter an interest rate between 0 and 100.',
  noCards: 'Add at least one card with a balance, a minimum payment and an interest rate.',
  tooManyCards: `Plan up to ${MAX_CARDS} cards at a time.`,
} as const;

/** The budget has to cover every minimum before any plan is possible. */
export const budgetBelowMinimums = (totalMinimum: number): string =>
  `Your monthly budget must cover every minimum payment, which come to ${formatCurrency(totalMinimum)}.`;

const MAX_APR = 100;
const FAIL = Number.NaN;
/** Guard tolerances: a cent for money, a hair for the identities. */
const MONEY_TOL = 0.01;
const EXACT_TOL = 1e-6;

/* ------------------------------------------------------------------ */
/* Strict parsing                                                      */
/* ------------------------------------------------------------------ */

type NumParse = 'empty' | 'invalid' | number;

const parsePositive = (raw: string): NumParse => {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : 'invalid';
};

/** A rate: finite, 0 ≤ r ≤ 100. A 0% promotional card is perfectly real. */
const parseRate = (raw: string): NumParse => {
  const t = raw.trim();
  if (t === '') return 'empty';
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n <= MAX_APR ? n : 'invalid';
};

/** A row nobody has touched. Its name alone does not make it a card. */
export const isBlankRow = (r: CreditCardRowValue): boolean =>
  [r.balance, r.minPayment, r.aprPct].every((v) => v.trim() === '');

/* ------------------------------------------------------------------ */
/* Read / validate / compute                                           */
/* ------------------------------------------------------------------ */

export function readCreditCardValues(root: HTMLElement): CreditCardValues {
  const rows: CreditCardRowValue[] = [];
  root.querySelectorAll<HTMLElement>('[data-cc-row]').forEach((row) => {
    const read = (sel: string) => row.querySelector<HTMLInputElement>(sel)?.value ?? '';
    rows.push({
      id: row.dataset.rowId ?? '',
      name: read('[data-cc-name]'),
      balance: read('[data-cc-balance]'),
      minPayment: read('[data-cc-min]'),
      aprPct: read('[data-cc-apr]'),
    });
  });
  return {
    budget: root.querySelector<HTMLInputElement>('[name="budget"]')?.value ?? '',
    rows,
  };
}

/** The cards a set of values describes, skipping rows nobody filled in. */
export function enteredCards(values: CreditCardValues): PayoffCard[] {
  const cards: PayoffCard[] = [];
  values.rows.forEach((r, i) => {
    if (isBlankRow(r)) return;
    cards.push({
      name: r.name.trim() || `Card ${i + 1}`,
      balance: Number(r.balance),
      minPayment: Number(r.minPayment),
      aprPct: Number(r.aprPct),
    });
  });
  return cards;
}

export function validateCreditCard(values: CreditCardValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};
  let formError = '';

  const budget = parsePositive(values.budget);
  if (budget === 'empty') fieldErrors.budget = MSG.budgetRequired;
  else if (budget === 'invalid') fieldErrors.budget = MSG.budgetPositive;

  // Each filled row is validated on its own, so an error points at the card that has
  // it rather than at the form.
  let filled = 0;
  let totalMinimum = 0;
  let minimumsKnown = true;
  for (const r of values.rows) {
    if (isBlankRow(r)) continue;
    filled++;

    const balance = parsePositive(r.balance);
    if (balance === 'empty') fieldErrors[`balance-${r.id}`] = MSG.balanceRequired;
    else if (balance === 'invalid') fieldErrors[`balance-${r.id}`] = MSG.balancePositive;

    const min = parsePositive(r.minPayment);
    if (min === 'empty') fieldErrors[`min-${r.id}`] = MSG.minRequired;
    else if (min === 'invalid') fieldErrors[`min-${r.id}`] = MSG.minPositive;
    if (typeof min === 'number') totalMinimum += min;
    else minimumsKnown = false;

    const apr = parseRate(r.aprPct);
    if (apr === 'empty') fieldErrors[`apr-${r.id}`] = MSG.aprRequired;
    else if (apr === 'invalid') fieldErrors[`apr-${r.id}`] = MSG.aprRange;
  }

  if (filled === 0) formError = MSG.noCards;
  else if (filled > MAX_CARDS) formError = MSG.tooManyCards;

  // Cross-field: no plan exists at all if the budget cannot pay the minimums. Only
  // worth saying once every minimum is actually known.
  if (
    typeof budget === 'number' &&
    minimumsKnown &&
    filled > 0 &&
    !Object.keys(fieldErrors).length &&
    budget + EXACT_TOL < totalMinimum
  ) {
    fieldErrors.budget = budgetBelowMinimums(totalMinimum);
  }

  if (Object.keys(fieldErrors).length || formError) {
    return {
      ok: false,
      ...(Object.keys(fieldErrors).length ? { fieldErrors } : {}),
      ...(formError ? { formError } : {}),
    };
  }
  return { ok: true };
}

export function computeCreditCard(values: CreditCardValues): CreditCardComputed {
  const cards = enteredCards(values);
  const budget = Number(values.budget);
  return { plan: planAvalanchePayoff(budget, cards), cards, budget };
}

/* ------------------------------------------------------------------ */
/* Guards                                                              */
/* ------------------------------------------------------------------ */

/**
 * The informational "never" outcome is a real answer, so the shell stays VALID for it.
 * Everything else must be a plan that fully reconciles.
 */
export function isUsableCreditCardResult(c: CreditCardComputed): boolean {
  if (!c.cards.length) return false;
  if (c.plan.status === 'never') return Number.isFinite(c.plan.monthlyBudget) && c.plan.monthlyBudget > 0;
  return Number.isFinite(completeCreditCardValue(c));
}

/**
 * Returns the payoff length in months ONLY when the whole plan reconciles: a positive
 * whole term inside the cap, one row per entered card, every card cleared, each card's
 * payments equal to its balance plus the interest it accrued, the totals equal to the
 * sums of their parts, and no month paying out more than the budget. A plan that fails
 * any of these is not shown at all.
 */
export function completeCreditCardValue(c: CreditCardComputed): number {
  const { plan } = c;
  if (plan.status !== 'paid') return FAIL;
  const { months, totalPaid, totalInterest, totalPrincipal, cards, monthlyBudget } = plan;

  if (!Number.isInteger(months) || months < 1) return FAIL;
  if (!Number.isFinite(monthlyBudget) || monthlyBudget <= 0) return FAIL;
  if (cards.length !== c.cards.length) return FAIL;
  if (![totalPaid, totalInterest, totalPrincipal].every(Number.isFinite)) return FAIL;
  if (totalInterest < -EXACT_TOL || totalPrincipal <= 0) return FAIL;

  // The identity that makes the split trustworthy.
  if (Math.abs(totalPrincipal + totalInterest - totalPaid) > MONEY_TOL) return FAIL;

  let sumPaid = 0;
  let sumInterest = 0;
  let last = 0;
  const perMonth = new Array<number>(months).fill(0);
  for (const card of cards) {
    if (!Number.isInteger(card.months) || card.months < 1 || card.months > months) return FAIL;
    if (![card.balance, card.interest, card.paid, card.aprPct].every(Number.isFinite)) return FAIL;
    if (card.balance <= 0 || card.interest < -EXACT_TOL) return FAIL;
    // Each card is paid its balance plus exactly the interest it accrued.
    if (Math.abs(card.paid - (card.balance + card.interest)) > MONEY_TOL) return FAIL;
    if (!card.runs.length) return FAIL;

    let m = 0;
    for (const run of card.runs) {
      if (!Number.isFinite(run.amount) || run.amount <= 0) return FAIL;
      if (!Number.isInteger(run.throughMonth) || run.throughMonth <= m) return FAIL;
      while (m < run.throughMonth) perMonth[m++] += run.amount;
    }
    // The runs have to describe exactly the months this card was being paid.
    if (m !== card.months) return FAIL;

    sumPaid += card.paid;
    sumInterest += card.interest;
    last = Math.max(last, card.months);
  }
  if (last !== months) return FAIL;
  if (Math.abs(sumPaid - totalPaid) > MONEY_TOL) return FAIL;
  if (Math.abs(sumInterest - totalInterest) > MONEY_TOL) return FAIL;
  // No month may spend more than the budget.
  for (const spent of perMonth) if (spent > monthlyBudget + MONEY_TOL) return FAIL;

  return months;
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

export interface CardRowPresentation {
  /** "#2: Card 2" — the entry number keeps the visitor's own row findable. */
  label: string;
  payoffLength: string;
  totalInterest: string;
  totalPayments: string;
  /** One sentence per step in the payment schedule. */
  schedule: string[];
}

export interface CreditCardPresentation {
  status: 'paid' | 'never';
  /** "38 months" — the dominant answer. */
  headline: string;
  /** "3 years and 2 months", or '' under a year. */
  headlineDetail: string;
  summary: string;
  totalPaid: string;
  totalInterest: string;
  totalPrincipal: string;
  principalShare: string;
  interestShare: string;
  rows: CardRowPresentation[];
}

const monthsLabel = (n: number) => `${n} month${n === 1 ? '' : 's'}`;

/** "16 months (1 year and 4 months)"; under a year the parenthetical adds nothing. */
export function payoffLengthLabel(months: number): string {
  const detail = months >= 12 ? presentDuration(months).spoken : '';
  return detail ? `${monthsLabel(months)} (${detail})` : monthsLabel(months);
}

/**
 * The payment schedule as the reference words it: a run is "pay $X until month #N",
 * every run after the first is prefixed "then", and the single final payment says what
 * it is for. A card paid one flat amount throughout gets one plain sentence.
 */
export function scheduleSentences(runs: readonly { amount: number; throughMonth: number }[]): string[] {
  return runs.map((run, i) => {
    const amount = formatCurrency(run.amount);
    const startsAt = i === 0 ? 1 : runs[i - 1].throughMonth + 1;
    // The last run is a single payment whenever it covers exactly one month. It reads
    // as its own instruction rather than a continuation, so it drops the "then".
    if (i === runs.length - 1 && startsAt === run.throughMonth) {
      return `pay ${amount} at month #${run.throughMonth} to pay off.`;
    }
    return `${i === 0 ? 'pay' : 'then pay'} ${amount} until month #${run.throughMonth}.`;
  });
}

const EMPTY_PRESENTATION = {
  totalPaid: '',
  totalInterest: '',
  totalPrincipal: '',
  principalShare: '',
  interestShare: '',
  rows: [] as CardRowPresentation[],
};

export function presentCreditCard(c: CreditCardComputed): CreditCardPresentation {
  const { plan } = c;
  if (plan.status === 'never') {
    const budget = formatCurrency(plan.monthlyBudget);
    return {
      status: 'never',
      headline: 'Never',
      headlineDetail: '',
      summary:
        `At ${budget} a month these cards are never paid off — the interest they charge ` +
        `(${formatCurrency(plan.firstMonthInterest)} in the first month alone) grows the balance ` +
        `faster than the payments shrink it. Raising the monthly amount above the interest is what ` +
        `starts the balance falling.`,
      ...EMPTY_PRESENTATION,
    };
  }

  const detail = plan.months >= 12 ? presentDuration(plan.months).spoken : '';
  return {
    status: 'paid',
    headline: monthsLabel(plan.months),
    headlineDetail: detail,
    summary:
      `You can pay off your credit cards in ${monthsLabel(plan.months)}` +
      `${detail ? ` (${detail})` : ''} if you pay back ${formatCurrency(plan.monthlyBudget)} every month. ` +
      `To pay off, you will need to pay a total of ${formatCurrency(plan.totalPaid)}, within which ` +
      `interest is ${formatCurrency(plan.totalInterest)}.`,
    totalPaid: formatCurrency(plan.totalPaid),
    totalInterest: formatCurrency(plan.totalInterest),
    totalPrincipal: formatCurrency(plan.totalPrincipal),
    principalShare: percentLabel(share(plan.totalPrincipal, plan.totalPaid)),
    interestShare: percentLabel(share(plan.totalInterest, plan.totalPaid)),
    rows: plan.cards.map((card) => ({
      label: `#${card.entryNumber}: ${card.name}`,
      payoffLength: payoffLengthLabel(card.months),
      totalInterest: formatCurrency(card.interest),
      totalPayments: formatCurrency(card.paid),
      schedule: scheduleSentences(card.runs),
    })),
  };
}

export function describeCreditCard(c: CreditCardComputed): string {
  if (c.plan.status === 'never') {
    return 'These cards are never paid off at this monthly amount.';
  }
  const { months, totalInterest } = c.plan;
  return `Paid off in ${monthsLabel(months)}, with ${formatCurrency(totalInterest)} of interest.`;
}

function donutLabel(plan: Extract<PayoffPlan, { status: 'paid' }>): string {
  return (
    `Of ${formatCurrency(plan.totalPaid)} paid in total, ` +
    `${formatCurrency(plan.totalPrincipal)} (${percentLabel(share(plan.totalPrincipal, plan.totalPaid))}) ` +
    `is the balances themselves and ${formatCurrency(plan.totalInterest)} ` +
    `(${percentLabel(share(plan.totalInterest, plan.totalPaid))}) is interest.`
  );
}

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

/** One schedule cell: a sentence per line, so a long plan stays readable. */
function scheduleCell(sentences: readonly string[]): HTMLTableCellElement {
  const td = document.createElement('td');
  td.className = 'cc-plan__schedule';
  for (const line of sentences) {
    const p = document.createElement('p');
    p.textContent = line;
    td.append(p);
  }
  return td;
}

function planRow(row: CardRowPresentation): HTMLTableRowElement {
  const tr = document.createElement('tr');
  const th = document.createElement('th');
  th.scope = 'row';
  th.textContent = row.label;
  tr.append(th);
  for (const value of [row.payoffLength, row.totalInterest, row.totalPayments]) {
    const td = document.createElement('td');
    td.textContent = value;
    tr.append(td);
  }
  tr.append(scheduleCell(row.schedule));
  return tr;
}

export function renderCreditCardResult(result: CreditCardComputed, context: FormRenderContext): void {
  const p = presentCreditCard(result);
  const scope = context.result;
  const q = (sel: string) => scope.querySelector<HTMLElement>(sel);
  const setText = (sel: string, value: string) => {
    const el = q(sel);
    if (el) el.textContent = value;
  };
  const show = (sel: string, visible: boolean) => {
    const el = q(sel);
    if (el) el.hidden = !visible;
  };

  setText('[data-result-when~="valid"] [data-result-value]', p.headline);
  setText('[data-cc-headline-detail]', p.headlineDetail);
  show('[data-cc-headline-detail]', p.headlineDetail !== '');
  setText('[data-cc-summary]', p.summary);

  // A "never" plan has no figures to show, so its rows are omitted rather than
  // rendered as zeroes or dashes.
  const paid = p.status === 'paid';
  show('[data-cc-figures]', paid);
  show('[data-cc-plan-figure]', paid);
  show('[data-cc-donut-figure]', false);

  const tbody = q('[data-cc-plan-body]');
  if (tbody) tbody.replaceChildren();
  if (!paid) return;

  setText('[data-cc-total-paid]', p.totalPaid);
  setText('[data-cc-total-interest]', p.totalInterest);
  setText('[data-cc-total-principal]', p.totalPrincipal);

  const plan = result.plan as Extract<PayoffPlan, { status: 'paid' }>;
  const charted = drawDonut(
    q('[data-cc-donut]'),
    [
      { key: 'principal', value: plan.totalPrincipal },
      { key: 'interest', value: plan.totalInterest },
    ],
    { prefix: 'cc', label: donutLabel(plan) },
  );
  show('[data-cc-donut-figure]', charted);
  if (charted) {
    setText('[data-cc-share-principal]', p.principalShare);
    setText('[data-cc-share-interest]', p.interestShare);
    setText('[data-cc-share-principal-amt]', formatCurrencyRounded(plan.totalPrincipal));
    setText('[data-cc-share-interest-amt]', formatCurrencyRounded(plan.totalInterest));
  }

  if (tbody) for (const row of p.rows) tbody.append(planRow(row));
}

/* ------------------------------------------------------------------ */
/* Reset + binding                                                     */
/* ------------------------------------------------------------------ */

/** Clear the budget and every card, collapsing back to the seeded blank rows. */
export function resetCreditCardValues(root: HTMLElement, _mode: ResetMode): void {
  const budget = root.querySelector<HTMLInputElement>('[name="budget"]');
  if (budget) budget.value = '';
  const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-cc-row]'));
  rows.slice(INITIAL_CARDS).forEach((r) => r.remove());
  for (const row of rows.slice(0, INITIAL_CARDS)) {
    for (const sel of ['[data-cc-name]', '[data-cc-balance]', '[data-cc-min]', '[data-cc-apr]']) {
      const input = row.querySelector<HTMLInputElement>(sel);
      if (input) input.value = '';
    }
  }
}

export const creditCardBinding: FormCalculatorBinding<CreditCardValues, CreditCardComputed> = {
  readValues: readCreditCardValues,
  validate: validateCreditCard,
  compute: computeCreditCard,
  describeResult: describeCreditCard,
  renderResult: renderCreditCardResult,
  resetValues: resetCreditCardValues,
  resultValue: completeCreditCardValue,
  // The informational "never" plan is a real answer, so it widens the default gate.
  isUsableResult: isUsableCreditCardResult,
};

/* ------------------------------------------------------------------ */
/* Worked example (labelled; the visitor's own fields stay EMPTY)      */
/* ------------------------------------------------------------------ */

/** The published reference case, pinned to the cent by the tests. */
export const CREDIT_CARD_EXAMPLE_VALUES: CreditCardValues = {
  budget: '500',
  rows: [
    { id: 'ex1', name: 'Card 1', balance: '4600', minPayment: '100', aprPct: '18.99' },
    { id: 'ex2', name: 'Card 2', balance: '3900', minPayment: '90', aprPct: '19.99' },
    { id: 'ex3', name: 'Card 3', balance: '6000', minPayment: '120', aprPct: '15.99' },
  ],
};
