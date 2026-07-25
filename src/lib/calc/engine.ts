/**
 * Shared physical-calculator engine.
 *
 * ONE expression buffer drives both the Basic and Scientific keypads, so the
 * expression, current value, Ans and angle mode all survive a keypad switch
 * (the mode only changes which keys can be entered — it never clears state).
 *
 * The engine holds a token list as the source of truth and derives both the
 * visible expression (`sub`) and the current value/result (`main`) from it.
 * Actual maths is delegated to the audited, no-eval scientific parser
 * (`../calculators/scientific.ts`) for expressions containing scientific
 * tokens; purely basic expressions evaluate left-to-right, the way a physical
 * four-function calculator does.
 *
 * Design rules honoured (see spec): contextual percent, token-aware negate,
 * repeated equals, operator replacement, one-decimal entry, display/precision
 * limits, and human-readable error recovery. Screen-reader announcements are
 * emitted ONLY for a completed result or an error — never per keystroke.
 */
import { evaluate, CalculatorError, type AngleMode } from '../calculators/scientific';

export type { AngleMode };
export type Op = '+' | '-' | '*' | '/' | '^';
export type Feature = 'basic' | 'scientific';

const OP_SYMBOL: Record<Op, string> = { '+': '+', '-': '−', '*': '×', '/': '÷', '^': '^' };
const BASIC_OPS = new Set<Op>(['+', '-', '*', '/']);

/** A number being entered/held; may carry a sign, a percent display, or a resolved percent value. */
interface NumTok {
  t: 'num';
  s: string; // typed digits, no sign, e.g. "12", "0.5", "" (fresh)
  neg?: boolean; // display and value are negated
  pct?: boolean; // display shows "s%"
  resolved?: number; // when pct: the contextual value to use in evaluation
  exact?: number; // full-precision signed value (result of '=' or Ans); overrides s for maths
}
interface OpTok {
  t: 'op';
  s: Op;
}
/** Raw scientific token (function-with-paren, parens, constant, factorial, power). */
interface SciTok {
  t: 'sci';
  s: string;
  display: string;
}
type Tok = NumTok | OpTok | SciTok;

export interface View {
  main: string; // big display: current entry or result (or error text)
  sub: string; // small display: the running expression
  error: string | null;
  announce: string | null; // set ONLY on '=' result or error; consumed by the live region
  ans: number;
  angle: AngleMode;
}

/* -------------------------------------------------------------- formatting */

const SIG_DIGITS = 12;
const DECIMAL_MAX = 1e12; // |x| >= this → exponential
const DECIMAL_MIN = 1e-6; // 0 < |x| < this → exponential

/** Format a number for the display without ever losing the underlying value. */
export function formatDisplay(n: number): string {
  if (Object.is(n, -0) || n === 0) return '0';
  if (!Number.isFinite(n)) return 'Error';
  const abs = Math.abs(n);
  if (abs >= DECIMAL_MAX || abs < DECIMAL_MIN) {
    // Trimmed scientific notation, e.g. 1.23457e+21
    const exp = n.toExponential(SIG_DIGITS - 1);
    return exp.replace(/(\.\d*?)0+e/, '$1e').replace(/\.e/, 'e');
  }
  // Round to SIG_DIGITS significant digits, then let Number drop float artifacts.
  return Number(n.toPrecision(SIG_DIGITS)).toString();
}

function friendlyError(err: unknown): string {
  if (err instanceof CalculatorError) {
    const m = err.message.toLowerCase();
    if (m.includes('paren')) return 'Check the parentheses';
    if (m.includes('factorial')) return 'Factorial needs a whole number ≥ 0';
    if (m.includes('not a number') || m.includes('invalid')) return 'Not a valid calculation';
  }
  return 'Not a valid calculation';
}

/* ------------------------------------------------------------------ engine */

export function createEngine(opts: { feature?: Feature; angle?: AngleMode } = {}) {
  let feature: Feature = opts.feature ?? 'basic';
  let angle: AngleMode = opts.angle ?? 'deg';
  let tokens: Tok[] = [];
  let ans = 0;
  let error: string | null = null;
  let justEvaluated = false; // display currently holds a computed result
  let repeat: { op: Op; operand: number } | null = null; // for repeated '='
  let announce: string | null = null;
  let lastExprDisplay: string | null = null; // the "A op B =" line shown after equals

  const last = (): Tok | undefined => tokens[tokens.length - 1];
  const lastNum = (): NumTok | undefined => {
    const t = last();
    return t && t.t === 'num' ? t : undefined;
  };

  const numValue = (t: NumTok): number => {
    if (t.pct && t.resolved != null) return t.resolved;
    if (t.exact != null) return t.exact; // full precision, already signed
    const v = t.s === '' || t.s === '.' ? 0 : Number(t.s);
    return t.neg ? -v : v;
  };

  const hasSci = (): boolean => tokens.some((t) => t.t === 'sci');

  const renderTok = (t: Tok): string => {
    if (t.t === 'op') return ` ${OP_SYMBOL[t.s]} `;
    if (t.t === 'sci') return t.display;
    const body = t.s === '' ? '' : t.s;
    return `${t.neg ? '-' : ''}${body}${t.pct ? '%' : ''}`;
  };

  /** Left-to-right evaluation of a basic num/op token list (no precedence). */
  const evalBasic = (toks: Tok[]): number => {
    let acc = 0;
    let pendingOp: Op | null = null;
    let seenValue = false;
    for (const t of toks) {
      if (t.t === 'op') {
        pendingOp = t.s;
      } else if (t.t === 'num') {
        const v = numValue(t);
        if (!seenValue) {
          acc = v;
          seenValue = true;
        } else if (pendingOp) {
          acc = applyOp(acc, pendingOp, v);
          pendingOp = null;
        }
      }
    }
    return acc;
  };

  function applyOp(a: number, op: Op, b: number): number {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/':
        if (b === 0) throw new CalculatorError('__divzero__');
        return a / b;
      case '^': return Math.pow(a, b);
    }
  }

  /**
   * Assemble an evaluator-ready string. Unlike the display, this substitutes a
   * percent token's RESOLVED value and a result token's FULL-PRECISION value,
   * and parenthesises negatives/results — so the safe parser gets correct maths
   * even for "200 + 10%" or a continued high-precision result.
   */
  const evalString = (): string =>
    tokens
      .map((t) => {
        if (t.t === 'op') return OP_SYMBOL[t.s];
        if (t.t === 'sci') return t.display;
        if (t.pct && t.resolved != null) return `(${t.resolved})`;
        if (t.exact != null) return `(${t.exact})`;
        const body = t.s === '' ? '0' : t.s;
        return t.neg ? `(-${body})` : body;
      })
      .join('');

  /** Evaluate the whole buffer → number (throws CalculatorError on failure). */
  const evalTokens = (): number => {
    if (tokens.length === 0) throw new CalculatorError('Empty expression');
    if (hasSci() || feature === 'scientific') {
      return evaluate(evalString(), angle);
    }
    const r = evalBasic(tokens);
    if (!Number.isFinite(r)) throw new CalculatorError('Result is not a number');
    return r;
  };

  /** Prefix value (everything before the final operator) — used for contextual %. */
  const prefixValue = (opIndex: number): number => evalBasic(tokens.slice(0, opIndex));

  const startFresh = () => {
    tokens = [];
    justEvaluated = false;
    lastExprDisplay = null;
  };

  const resetError = () => {
    error = null;
    announce = null;
    startFresh();
    repeat = null;
  };

  const fail = (msg: string) => {
    error = msg;
    announce = msg; // errors are announced (allowed by the SR contract)
    justEvaluated = false;
  };

  /* --------------------------------------------------------------- actions */

  function inputDigit(d: string) {
    if (error) resetError();
    announce = null;
    if (justEvaluated) startFresh(); // a new number begins a new calculation
    let t = lastNum();
    if (!t || last()!.t !== 'num') {
      t = { t: 'num', s: '' };
      tokens.push(t);
    }
    if (t.pct) return; // a resolved percent is complete; ignore further digits
    t.exact = undefined; // editing turns a value token into a typed number
    if (d === '0' && (t.s === '' || t.s === '0')) {
      t.s = '0';
    } else if (t.s === '0') {
      t.s = d; // no uncontrolled leading zeros: "0" + "5" → "5"
    } else {
      t.s += d;
    }
  }

  function inputDot() {
    if (error) resetError();
    announce = null;
    if (justEvaluated) startFresh();
    let t = lastNum();
    if (!t || last()!.t !== 'num') {
      t = { t: 'num', s: '0' };
      tokens.push(t);
    }
    if (t.pct) return;
    t.exact = undefined;
    if (t.s === '' ) t.s = '0.'; // ".5" is entered as "0.5"
    else if (!t.s.includes('.')) t.s += '.';
  }

  function inputOp(op: Op) {
    if (error) return; // require AC after an error
    announce = null;
    justEvaluated = false;
    repeat = null;
    lastExprDisplay = null;
    const l = last();
    if (!l) {
      // Leading operator: seed a zero so "− 5" etc. is well-defined.
      tokens.push({ t: 'num', s: '0' });
      tokens.push({ t: 'op', s: op });
      return;
    }
    if (l.t === 'op') {
      // Operator replacement (a second operator before the next operand).
      (l as OpTok).s = op;
      return;
    }
    if (l.t === 'sci' && (l.s === '(' )) {
      // after "(" a leading operator seeds zero
      tokens.push({ t: 'num', s: '0' });
    }
    tokens.push({ t: 'op', s: op });
  }

  /** Scientific token: function-with-paren, paren, constant, factorial, power. */
  function inputToken(value: string, display?: string) {
    if (error) resetError();
    announce = null;
    if (justEvaluated && /[0-9πe(]/.test(value[0] ?? '')) startFresh();
    justEvaluated = false;
    repeat = null;
    if (value === '^') {
      inputOp('^');
      return;
    }
    tokens.push({ t: 'sci', s: value, display: display ?? value });
  }

  function recallAns() {
    if (error) resetError();
    announce = null;
    if (justEvaluated) startFresh();
    // Render Ans as its numeric value, keeping full precision for maths.
    const v = ans;
    tokens.push({ t: 'num', s: formatDisplay(Math.abs(v)), neg: v < 0, exact: v });
    justEvaluated = false;
  }

  /** ± — toggle the sign of the current numeric operand (token-aware, safe). */
  function negate() {
    if (error) return;
    announce = null;
    lastExprDisplay = null;
    const t = lastNum();
    // No-op if there is no current operand (e.g. right after an operator).
    if (!t || last()!.t !== 'num' || t.s === '') return;
    if (numValue({ ...t, neg: false, exact: t.exact != null ? Math.abs(t.exact) : undefined }) === 0) {
      t.neg = false; // never display negative zero
      if (t.exact != null) t.exact = Math.abs(t.exact);
      return;
    }
    t.neg = !t.neg;
    if (t.exact != null) t.exact = -t.exact;
  }

  /** Contextual percent (Basic). Standalone → /100; +/− → % of first operand; ×/÷ → /100. */
  function percent() {
    if (error) return;
    announce = null;
    lastExprDisplay = null;
    const t = lastNum();
    if (!t || last()!.t !== 'num' || t.s === '' || t.pct) return;
    // Find the operator immediately before this operand.
    let opIndex = -1;
    for (let i = tokens.length - 2; i >= 0; i--) {
      if (tokens[i].t === 'op') { opIndex = i; break; }
      if (tokens[i].t === 'num') break;
    }
    const b = numValue({ ...t, pct: false });
    if (opIndex === -1) {
      // Standalone: convert in place (50 % → 0.5). Shown as the value, not "50%".
      const v = b / 100;
      t.s = formatDisplay(Math.abs(v));
      t.neg = v < 0;
      return;
    }
    const op = (tokens[opIndex] as OpTok).s;
    const a = prefixValue(opIndex);
    const resolved = op === '+' || op === '-' ? a * (b / 100) : b / 100;
    t.pct = true;
    t.resolved = resolved; // display keeps "b%", evaluation uses the resolved value
  }

  /**
   * Reciprocal (1/x). Applies to the active numeric operand (preserving any
   * preceding expression) or, when the buffer ends in a completed expression
   * like ")", to that expression's value. Never uses text replacement.
   */
  function reciprocal() {
    if (error) return;
    announce = null;
    lastExprDisplay = null;
    const l = last();
    if (l && l.t === 'num') {
      const v = numValue(l as NumTok);
      if (v === 0) return fail('Cannot divide by zero');
      const r = 1 / v;
      const shown = formatDisplay(r);
      tokens[tokens.length - 1] = { t: 'num', s: shown.replace(/^-/, ''), neg: shown.startsWith('-'), exact: r };
      justEvaluated = tokens.length === 1; // standalone → behaves like a result
    } else if (l && l.t === 'sci' && l.s !== '(') {
      // Completed expression (e.g. "(2 + 3)") → reciprocal of its value.
      try {
        const base = evalTokens();
        if (base === 0) return fail('Cannot divide by zero');
        const r = 1 / base;
        const shown = formatDisplay(r);
        tokens = [{ t: 'num', s: shown.replace(/^-/, ''), neg: shown.startsWith('-'), exact: r }];
        justEvaluated = true;
      } catch (err) {
        fail(err instanceof CalculatorError && err.message === '__divzero__' ? 'Cannot divide by zero' : friendlyError(err));
      }
    }
    // else: pending operator / fresh buffer → no-op
  }

  function equals() {
    if (error) return;
    try {
      let result: number;
      let exprDisplay: string | null = null;
      const hasOp = tokens.some((t) => t.t === 'op') && last()?.t === 'num';
      if (hasOp) {
        exprDisplay = tokens.map(renderTok).join('').trim();
        result = evalTokens();
        // Remember the last binary op + operand for repeated '='.
        let opIdx = -1;
        for (let i = tokens.length - 1; i >= 0; i--) if (tokens[i].t === 'op') { opIdx = i; break; }
        const lastN = lastNum();
        if (opIdx >= 0 && lastN && BASIC_OPS.has((tokens[opIdx] as OpTok).s) && !hasSci()) {
          repeat = { op: (tokens[opIdx] as OpTok).s, operand: numValue(lastN) };
        } else {
          repeat = null;
        }
      } else if (tokens.length <= 1 && repeat) {
        // Repeated equals: apply the remembered op+operand to the current result.
        const base = tokens.length === 1 && tokens[0].t === 'num' ? numValue(tokens[0] as NumTok) : ans;
        exprDisplay = `${formatDisplay(base)} ${OP_SYMBOL[repeat.op]} ${formatDisplay(repeat.operand)}`;
        result = applyOp(base, repeat.op, repeat.operand);
      } else if (tokens.length === 1 && tokens[0].t === 'num') {
        result = numValue(tokens[0] as NumTok); // just "n =" — no expression to show
      } else {
        exprDisplay = tokens.map(renderTok).join('').trim();
        result = evalTokens();
      }
      // The safe parser returns Infinity for x/0 (it only throws on NaN); in a
      // calculator that reads as divide-by-zero. Never surface Infinity.
      if (!Number.isFinite(result)) throw new CalculatorError('__divzero__');
      ans = result;
      const shown = formatDisplay(result);
      tokens = [{ t: 'num', s: shown.replace(/^-/, ''), neg: shown.startsWith('-'), exact: result }];
      justEvaluated = true;
      announce = shown;
      lastExprDisplay = exprDisplay ? `${exprDisplay} =` : null;
      error = null;
    } catch (err) {
      error =
        err instanceof CalculatorError && err.message === '__divzero__'
          ? 'Cannot divide by zero'
          : friendlyError(err);
      announce = error;
      justEvaluated = false;
    }
  }

  function backspace() {
    announce = null;
    lastExprDisplay = null;
    if (error) {
      resetError();
      return;
    }
    if (justEvaluated) {
      // Treat the result as an entry and drop its last character.
      justEvaluated = false;
    }
    const l = last();
    if (!l) return;
    if (l.t === 'num') {
      const n = l as NumTok;
      n.exact = undefined; // editing a result truncates it to what's shown
      if (n.pct) { n.pct = false; n.resolved = undefined; return; }
      if (n.s.length > 0) n.s = n.s.slice(0, -1);
      if (n.s === '' ) { n.neg = false; tokens.pop(); }
    } else {
      tokens.pop();
    }
  }

  function clear() {
    startFresh();
    error = null;
    announce = null;
    repeat = null;
    // Ans and angle intentionally preserved across AC.
  }

  function setAngle(mode: AngleMode) {
    angle = mode;
    announce = null;
  }

  function setFeature(next: Feature) {
    feature = next; // keypad visibility only; buffer/Ans/angle preserved
  }

  /**
   * Display contract (secondary must never duplicate the main value):
   *   fresh        → sub "",            main "0"
   *   entering N   → sub "",            main N
   *   during expr  → sub "A op",        main <active operand> (or "0" awaiting it)
   *   after equals → sub "A op B =",    main <result>
   */
  function view(): View {
    if (error) return { main: error, sub: '', error, announce, ans, angle };
    if (justEvaluated) {
      return { main: renderTok(tokens[0]).trim() || '0', sub: lastExprDisplay ?? '', error: null, announce, ans, angle };
    }
    if (tokens.length === 0) return { main: '0', sub: '', error: null, announce, ans, angle };
    const l = tokens[tokens.length - 1];
    if (l.t === 'num') {
      const before = tokens.slice(0, -1).map(renderTok).join('').trim();
      return { main: renderTok(l).trim() || '0', sub: before, error: null, announce, ans, angle };
    }
    // Last token is an operator/function → awaiting the next operand.
    return { main: '0', sub: tokens.map(renderTok).join('').trim(), error: null, announce, ans, angle };
  }

  return {
    inputDigit,
    inputDot,
    inputOp,
    inputToken,
    recallAns,
    negate,
    percent,
    reciprocal,
    equals,
    backspace,
    clear,
    setAngle,
    setFeature,
    view,
    /** test/debug accessor */
    _tokens: () => tokens.map(renderTok).join(''),
  };
}

export type Engine = ReturnType<typeof createEngine>;
