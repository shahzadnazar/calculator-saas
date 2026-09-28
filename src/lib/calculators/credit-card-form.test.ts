import { describe, it, expect } from 'vitest';
import {
  CREDIT_CARD_EXAMPLE_VALUES,
  MAX_CARDS,
  MSG,
  budgetBelowMinimums,
  completeCreditCardValue,
  computeCreditCard,
  creditCardBinding,
  describeCreditCard,
  enteredCards,
  isBlankRow,
  isUsableCreditCardResult,
  payoffLengthLabel,
  presentCreditCard,
  scheduleSentences,
  validateCreditCard,
  type CreditCardComputed,
  type CreditCardRowValue,
  type CreditCardValues,
} from './credit-card-form';

/**
 * The payoff binding — the visitor-facing contract over the avalanche planner.
 *
 * The planner itself is frozen in credit-cards-payoff.test.ts. What matters here is
 * everything the pure function has no opinion about: which row an error lands on, which
 * rows count as cards at all, that a plan is never shown unless it fully reconciles, and
 * that the words match the published reference.
 */

const row = (over: Partial<CreditCardRowValue> = {}): CreditCardRowValue => ({
  id: 'r1',
  name: '',
  balance: '1000',
  minPayment: '50',
  aprPct: '20',
  ...over,
});
const BLANK: CreditCardRowValue = { id: 'blank', name: '', balance: '', minPayment: '', aprPct: '' };

const REF: CreditCardValues = CREDIT_CARD_EXAMPLE_VALUES;
const at = (over: Partial<CreditCardValues> = {}): CreditCardValues => ({ ...REF, ...over });
const errs = (v: CreditCardValues): Record<string, string> => {
  const r = validateCreditCard(v);
  return r.ok ? {} : (r.fieldErrors ?? {});
};
const formErr = (v: CreditCardValues): string | undefined => {
  const r = validateCreditCard(v);
  return r.ok ? undefined : r.formError;
};
const money = (n: number) => Math.round(n * 100) / 100;

describe('validation — the monthly budget', () => {
  it('accepts the reference entry', () => {
    expect(validateCreditCard(REF)).toEqual({ ok: true });
  });

  it('requires a budget greater than zero', () => {
    expect(errs(at({ budget: '' })).budget).toBe(MSG.budgetRequired);
    for (const bad of ['0', '-50', 'abc']) {
      expect(errs(at({ budget: bad })).budget).toBe(MSG.budgetPositive);
    }
  });

  it('rejects a budget that cannot cover the minimum payments, naming the total', () => {
    // The reference cards demand $310 a month before any progress is possible.
    expect(errs(at({ budget: '200' })).budget).toBe(budgetBelowMinimums(310));
    expect(budgetBelowMinimums(310)).toContain('$310.00');
  });

  it('accepts a budget exactly equal to the minimums', () => {
    expect(validateCreditCard(at({ budget: '310' }))).toEqual({ ok: true });
  });

  it('does not claim the budget is too small while a minimum is still unknown', () => {
    const e = errs(at({ budget: '200', rows: [row({ minPayment: '' })] }));
    expect(e['min-r1']).toBe(MSG.minRequired);
    expect(e.budget).toBeUndefined();
  });
});

describe('validation — the card rows', () => {
  it('reports each problem against the row that has it', () => {
    const e = errs(
      at({
        rows: [
          { id: 'a', name: '', balance: '0', minPayment: '50', aprPct: '20' },
          { id: 'b', name: '', balance: '1000', minPayment: '', aprPct: '20' },
          { id: 'c', name: '', balance: '1000', minPayment: '50', aprPct: '150' },
        ],
      }),
    );
    expect(e['balance-a']).toBe(MSG.balancePositive);
    expect(e['min-b']).toBe(MSG.minRequired);
    expect(e['apr-c']).toBe(MSG.aprRange);
    // A row that is fine is not flagged.
    expect(e['balance-b']).toBeUndefined();
  });

  it('requires each of the three numbers once a row is started', () => {
    expect(errs(at({ rows: [row({ balance: '' })] }))['balance-r1']).toBe(MSG.balanceRequired);
    expect(errs(at({ rows: [row({ aprPct: '' })] }))['apr-r1']).toBe(MSG.aprRequired);
    expect(errs(at({ rows: [row({ minPayment: '-5' })] }))['min-r1']).toBe(MSG.minPositive);
  });

  it('accepts a 0% card but not a negative or absurd rate', () => {
    expect(validateCreditCard(at({ budget: '100', rows: [row({ aprPct: '0' })] }))).toEqual({ ok: true });
    expect(errs(at({ rows: [row({ aprPct: '-1' })] }))['apr-r1']).toBe(MSG.aprRange);
    expect(errs(at({ rows: [row({ aprPct: '101' })] }))['apr-r1']).toBe(MSG.aprRange);
  });

  it('ignores a wholly blank row instead of nagging about it', () => {
    expect(isBlankRow(BLANK)).toBe(true);
    expect(validateCreditCard(at({ rows: [...REF.rows, BLANK, BLANK] }))).toEqual({ ok: true });
  });

  it('a name alone does not make a row into a card', () => {
    expect(isBlankRow({ ...BLANK, name: 'Store card' })).toBe(true);
    expect(formErr(at({ rows: [{ ...BLANK, name: 'Store card' }] }))).toBe(MSG.noCards);
  });

  it('needs at least one card', () => {
    expect(formErr(at({ rows: [] }))).toBe(MSG.noCards);
    expect(formErr(at({ rows: [BLANK] }))).toBe(MSG.noCards);
  });

  it(`plans at most ${MAX_CARDS} cards`, () => {
    const many = Array.from({ length: MAX_CARDS + 1 }, (_, i) => row({ id: `r${i}` }));
    expect(formErr(at({ budget: '2000', rows: many }))).toBe(MSG.tooManyCards);
    expect(formErr(at({ budget: '2000', rows: many.slice(0, MAX_CARDS) }))).toBeUndefined();
  });
});

describe('reading the cards out of the rows', () => {
  it('takes only the filled rows, in the entered order', () => {
    const cards = enteredCards(at({ rows: [BLANK, row({ id: 'x', name: 'Visa' }), BLANK] }));
    expect(cards).toHaveLength(1);
    expect(cards[0]).toEqual({ name: 'Visa', balance: 1000, minPayment: 50, aprPct: 20 });
  });

  it('names an unnamed card by its position in the form', () => {
    const cards = enteredCards(at({ rows: [BLANK, row({ id: 'x' })] }));
    // Second row on the form, so "Card 2" — the visitor can find it again.
    expect(cards[0].name).toBe('Card 2');
  });

  it('trims a name rather than carrying the whitespace into the result', () => {
    expect(enteredCards(at({ rows: [row({ name: '  Amex  ' })] }))[0].name).toBe('Amex');
  });
});

describe('the reference plan, end to end', () => {
  const c = computeCreditCard(REF);
  const p = presentCreditCard(c);

  it('produces the published plan', () => {
    expect(c.plan.status).toBe('paid');
    if (c.plan.status !== 'paid') throw new Error('unreachable');
    expect(c.plan.months).toBe(38);
    expect(money(c.plan.totalPaid)).toBe(18971.2);
  });

  it('leads with the payoff length and its plain-language span', () => {
    expect(p.headline).toBe('38 months');
    expect(p.headlineDetail).toBe('3 years and 2 months');
  });

  it('says the whole answer in the reference’s own sentence', () => {
    expect(p.summary).toBe(
      'You can pay off your credit cards in 38 months (3 years and 2 months) if you pay back $500.00 every month. ' +
        'To pay off, you will need to pay a total of $18,971.20, within which interest is $4,471.20.',
    );
  });

  it('splits the total into principal and interest', () => {
    expect(p.totalPaid).toBe('$18,971.20');
    expect(p.totalInterest).toBe('$4,471.20');
    expect(p.totalPrincipal).toBe('$14,500.00');
    expect(p.principalShare).toBe('76%');
    expect(p.interestShare).toBe('24%');
  });

  it('lists the cards highest-rate first, each labelled by its own row', () => {
    expect(p.rows.map((r) => r.label)).toEqual(['#2: Card 2', '#1: Card 1', '#3: Card 3']);
    expect(p.rows.map((r) => r.payoffLength)).toEqual([
      '16 months (1 year and 4 months)',
      '28 months (2 years and 4 months)',
      '38 months (3 years and 2 months)',
    ]);
    expect(p.rows.map((r) => r.totalInterest)).toEqual(['$574.33', '$1,541.21', '$2,355.66']);
    expect(p.rows.map((r) => r.totalPayments)).toEqual(['$4,474.33', '$6,141.21', '$8,355.66']);
  });

  it('spells out each payment schedule as the reference words it', () => {
    expect(p.rows[0].schedule).toEqual([
      'pay $280.00 until month #15.',
      'pay $274.33 at month #16 to pay off.',
    ]);
    expect(p.rows[1].schedule).toEqual([
      'pay $100.00 until month #15.',
      'then pay $105.67 until month #16.',
      'then pay $380.00 until month #27.',
      'pay $355.54 at month #28 to pay off.',
    ]);
    expect(p.rows[2].schedule).toEqual([
      'pay $120.00 until month #27.',
      'then pay $144.46 until month #28.',
      'then pay $500.00 until month #37.',
      'pay $471.20 at month #38 to pay off.',
    ]);
  });

  it('announces the answer in one line', () => {
    expect(describeCreditCard(c)).toBe('Paid off in 38 months, with $4,471.20 of interest.');
  });

  it('never leaks a NaN, an Infinity or an empty figure into the words', () => {
    const text = [p.headline, p.headlineDetail, p.summary, ...p.rows.flatMap((r) => [r.label, r.payoffLength, r.totalInterest, r.totalPayments, ...r.schedule])].join(' ');
    expect(text).not.toMatch(/NaN|Infinity|undefined|\$\s|—/);
  });
});

describe('wording at the edges', () => {
  it('drops the parenthetical under a year, and gets singulars right', () => {
    expect(payoffLengthLabel(11)).toBe('11 months');
    expect(payoffLengthLabel(1)).toBe('1 month');
    expect(payoffLengthLabel(12)).toBe('12 months (1 year)');
    expect(payoffLengthLabel(13)).toBe('13 months (1 year and 1 month)');
  });

  it('a card paid one flat amount throughout is one plain sentence', () => {
    expect(scheduleSentences([{ amount: 100, throughMonth: 10 }])).toEqual([
      'pay $100.00 until month #10.',
    ]);
  });

  it('a card cleared in a single month says so', () => {
    expect(scheduleSentences([{ amount: 50.2, throughMonth: 1 }])).toEqual([
      'pay $50.20 at month #1 to pay off.',
    ]);
  });

  it('a single-card plan reads naturally', () => {
    const p = presentCreditCard(
      computeCreditCard({ budget: '280', rows: [row({ id: 'only', name: 'Card 2', balance: '3900', minPayment: '90', aprPct: '19.99' })] }),
    );
    expect(p.headline).toBe('16 months');
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0].label).toBe('#1: Card 2');
  });
});

describe('the informational "never" plan', () => {
  // Minimums are covered, but they are far below what the card charges each month.
  const stuck = computeCreditCard({
    budget: '100',
    rows: [row({ id: 'z', name: 'Runaway', balance: '20000', minPayment: '100', aprPct: '29.99' })],
  });

  it('is a usable result, not an input error', () => {
    expect(stuck.plan.status).toBe('never');
    expect(isUsableCreditCardResult(stuck)).toBe(true);
  });

  it('explains why, and what would change it', () => {
    const p = presentCreditCard(stuck);
    expect(p.status).toBe('never');
    expect(p.headline).toBe('Never');
    expect(p.summary).toContain('$100.00 a month');
    expect(p.summary).toContain('$499.83'); // the first month's interest alone
    expect(p.summary).toContain('above the interest');
  });

  it('shows no financial rows at all rather than zeroes or dashes', () => {
    const p = presentCreditCard(stuck);
    expect(p.rows).toEqual([]);
    for (const v of [p.totalPaid, p.totalInterest, p.totalPrincipal, p.principalShare, p.interestShare]) {
      expect(v).toBe('');
    }
  });

  it('announces itself without a number', () => {
    expect(describeCreditCard(stuck)).toBe('These cards are never paid off at this monthly amount.');
  });
});

describe('the complete-result guard', () => {
  const good = computeCreditCard(REF);
  const clone = (c: CreditCardComputed): CreditCardComputed =>
    JSON.parse(JSON.stringify(c)) as CreditCardComputed;
  const broken = (mutate: (c: CreditCardComputed) => void): CreditCardComputed => {
    const copy = clone(good);
    mutate(copy);
    return copy;
  };
  /** Reach into a paid plan without TypeScript narrowing at every call site. */
  const plan = (c: CreditCardComputed) => {
    if (c.plan.status !== 'paid') throw new Error('expected a paid plan');
    return c.plan;
  };

  it('accepts the real plan and returns its length', () => {
    expect(completeCreditCardValue(good)).toBe(38);
    expect(isUsableCreditCardResult(good)).toBe(true);
  });

  it('rejects totals that do not add up', () => {
    expect(completeCreditCardValue(broken((c) => (plan(c).totalPaid += 100)))).toBeNaN();
    expect(completeCreditCardValue(broken((c) => (plan(c).totalInterest += 100)))).toBeNaN();
    expect(completeCreditCardValue(broken((c) => (plan(c).totalPrincipal += 100)))).toBeNaN();
  });

  it('rejects a card paid more or less than its balance plus its interest', () => {
    expect(completeCreditCardValue(broken((c) => (plan(c).cards[0].paid += 50)))).toBeNaN();
    expect(completeCreditCardValue(broken((c) => (plan(c).cards[1].interest -= 50)))).toBeNaN();
  });

  it('rejects a plan whose months do not match its longest card', () => {
    expect(completeCreditCardValue(broken((c) => (plan(c).months = 40)))).toBeNaN();
    expect(completeCreditCardValue(broken((c) => (plan(c).cards[2].months = 30)))).toBeNaN();
  });

  it('rejects a schedule that does not cover the months the card was paid', () => {
    expect(completeCreditCardValue(broken((c) => plan(c).cards[0].runs.pop()))).toBeNaN();
    expect(completeCreditCardValue(broken((c) => (plan(c).cards[0].runs = [])))).toBeNaN();
    expect(
      completeCreditCardValue(broken((c) => (plan(c).cards[0].runs[0].throughMonth = 20))),
    ).toBeNaN();
  });

  it('rejects a month that spends more than the budget', () => {
    expect(completeCreditCardValue(broken((c) => (plan(c).cards[0].runs[0].amount = 400)))).toBeNaN();
  });

  it('rejects a plan missing one of the cards the visitor entered', () => {
    expect(completeCreditCardValue(broken((c) => plan(c).cards.pop()))).toBeNaN();
  });

  it('rejects a non-finite or impossible figure', () => {
    expect(completeCreditCardValue(broken((c) => (plan(c).totalPaid = Number.NaN)))).toBeNaN();
    expect(completeCreditCardValue(broken((c) => (plan(c).months = 0)))).toBeNaN();
    expect(completeCreditCardValue(broken((c) => (plan(c).monthlyBudget = 0)))).toBeNaN();
    expect(completeCreditCardValue(broken((c) => (plan(c).cards[0].balance = 0)))).toBeNaN();
  });

  it('a plan with no cards is never usable', () => {
    expect(isUsableCreditCardResult({ ...good, cards: [] })).toBe(false);
  });
});

describe('the worked example', () => {
  it('validates, so the example a visitor sees is a real calculation', () => {
    expect(validateCreditCard(CREDIT_CARD_EXAMPLE_VALUES)).toEqual({ ok: true });
  });

  it('is the published reference case and passes the same guard as any other result', () => {
    const c = computeCreditCard(CREDIT_CARD_EXAMPLE_VALUES);
    expect(creditCardBinding.resultValue(c)).toBe(38);
    expect(creditCardBinding.isUsableResult!(c)).toBe(true);
    expect(presentCreditCard(c).summary).toContain('$18,971.20');
  });
});
