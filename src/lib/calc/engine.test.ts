import { describe, it, expect } from 'vitest';
import { createEngine, formatDisplay } from './engine';

/**
 * Drive the engine with a compact key string.
 *   digits 0-9 . ( )   → entry
 *   + - * /            → operators
 *   =                  → equals
 *   %                  → percent
 *   ~                  → ± (negate)
 *   C                  → clear (AC)
 *   B                  → backspace
 */
function press(seq: string, feature: 'basic' | 'scientific' = 'basic') {
  const e = createEngine({ feature });
  for (const ch of seq) {
    if (ch >= '0' && ch <= '9') e.inputDigit(ch);
    else if (ch === '.') e.inputDot();
    else if (ch === '+' || ch === '-' || ch === '*' || ch === '/') e.inputOp(ch);
    else if (ch === '=') e.equals();
    else if (ch === '%') e.percent();
    else if (ch === '~') e.negate();
    else if (ch === 'r') e.reciprocal();
    else if (ch === '(') e.inputToken('(', '(');
    else if (ch === ')') e.inputToken(')', ')');
    else if (ch === 'C') e.clear();
    else if (ch === 'B') e.backspace();
  }
  return e;
}
const main = (seq: string, f?: 'basic' | 'scientific') => press(seq, f).view().main;

describe('display semantics (secondary never duplicates main)', () => {
  it('fresh: secondary blank, main 0', () => {
    const v = createEngine().view();
    expect(v.sub).toBe('');
    expect(v.main).toBe('0');
  });
  it('entering a number: secondary blank, main = number', () => {
    const v = press('56').view();
    expect(v.sub).toBe('');
    expect(v.main).toBe('56');
  });
  it('pending operator: secondary "56 +", main awaits operand', () => {
    const v = press('56+').view();
    expect(v.sub).toBe('56 +');
    expect(v.main).toBe('0');
  });
  it('during expression: secondary "56 +", main = active operand', () => {
    const v = press('56+12').view();
    expect(v.sub).toBe('56 +');
    expect(v.main).toBe('12');
  });
  it('after equals: secondary "56 + 12 =", main = result, never duplicated', () => {
    const v = press('56+12=').view();
    expect(v.sub).toBe('56 + 12 =');
    expect(v.main).toBe('68');
    expect(v.sub).not.toContain(v.main); // no duplication of the result
  });
  it('repeated equals updates the secondary expression', () => {
    const e = press('5+2=');
    e.equals();
    const v = e.view();
    expect(v.sub).toBe('7 + 2 =');
    expect(v.main).toBe('9');
  });
});

describe('basic arithmetic', () => {
  it('adds, subtracts, multiplies, divides', () => {
    expect(main('12+3=')).toBe('15');
    expect(main('9-4=')).toBe('5');
    expect(main('6*7=')).toBe('42');
    expect(main('8/2=')).toBe('4');
  });
  it('evaluates left-to-right like a physical basic calculator', () => {
    expect(main('2+3*4=')).toBe('20'); // (2+3)*4, not 14
  });
  it('continues from the result with full precision', () => {
    const e = press('2/3=');
    expect(e.view().main).toBe('0.666666666667');
    e.inputOp('*'); e.inputDigit('3'); e.equals();
    expect(e.view().main).toBe('2'); // used 0.6666… not the shown value
  });
});

describe('repeated equals', () => {
  it('reapplies the last operator and operand', () => {
    const e = press('5+2=');
    expect(e.view().main).toBe('7');
    e.equals(); expect(e.view().main).toBe('9');
    e.equals(); expect(e.view().main).toBe('11');
  });
});

describe('operator replacement', () => {
  it('replaces a pending operator (12 + × 3 = 36)', () => {
    expect(main('12+*3=')).toBe('36');
  });
});

describe('contextual percent (basic)', () => {
  it('standalone divides by 100', () => {
    expect(main('50%')).toBe('0.5');
  });
  it('× and ÷ treat percent as a fraction', () => {
    expect(main('200*10%=')).toBe('20');
    expect(main('200/10%=')).toBe('2000');
  });
  it('+ and − apply percent of the first operand', () => {
    expect(main('200+10%=')).toBe('220');
    expect(main('200-10%=')).toBe('180');
  });
  it('keeps "10%" readable in the display, not its derived value', () => {
    const e = press('200+10%');
    expect(e.view().main).toBe('10%'); // operand shown as "10%", not its derived 20/0.1
    expect(e.view().sub).toBe('200 +');
  });
});

describe('reciprocal (1/x)', () => {
  it('reciprocates a standalone value', () => {
    expect(main('8r')).toBe('0.125');
  });
  it('reports divide-by-zero for 0', () => {
    const e = press('0r');
    expect(e.view().error).toBe('Cannot divide by zero');
    expect(e.view().main).not.toMatch(/Infinity|NaN/);
  });
  it('preserves sign', () => {
    expect(main('4~r')).toBe('-0.25'); // -4 → -0.25
  });
  it('applies to the active operand, retaining the expression', () => {
    const e = press('2+8r');
    expect(e.view().sub).toBe('2 +');
    expect(e.view().main).toBe('0.125'); // 2 + 0.125
    e.equals();
    expect(e.view().main).toBe('2.125');
  });
  it('reciprocates a completed parenthesized expression', () => {
    expect(main('(2+3)r')).toBe('0.2'); // 1/(2+3)
  });
  it('keeps full precision for a continued calculation', () => {
    const e = press('3r'); // 0.333333333333
    e.inputOp('*'); e.inputDigit('3'); e.equals();
    expect(e.view().main).toBe('1'); // used 1/3 exactly, not the shown value
  });
});

describe('negate (±)', () => {
  it('toggles the current operand', () => {
    expect(main('34~')).toBe('-34');
    expect(main('34~~')).toBe('34');
  });
  it('negates the second operand mid-expression', () => {
    expect(main('12+34~=')).toBe('-22'); // 12 + (-34)
  });
  it('negates a result', () => {
    expect(main('46=~')).toBe('-46');
  });
  it('never shows negative zero', () => {
    expect(main('0~')).toBe('0');
  });
  it('is a no-op right after an operator', () => {
    // ± with no operand present → ignored; 12 + 3 still = 15
    expect(main('12+~3=')).toBe('15');
  });
});

describe('decimal handling', () => {
  it('turns .5 into 0.5', () => {
    expect(main('.5')).toBe('0.5');
  });
  it('allows only one decimal point', () => {
    expect(main('0.5.')).toBe('0.5');
  });
  it('prevents uncontrolled leading zeros', () => {
    expect(main('007')).toBe('7');
    expect(main('00')).toBe('0');
  });
  it('cleans floating-point artifacts', () => {
    expect(main('0.1+0.2=')).toBe('0.3');
  });
});

describe('display formatting & precision', () => {
  it('uses trimmed scientific notation for very large/small values', () => {
    expect(formatDisplay(1e13)).toBe('1e+13');
    expect(formatDisplay(1e-7)).toBe('1e-7');
    expect(formatDisplay(1234567890123456)).toMatch(/e\+15$/);
  });
  it('shows normal decimals within range', () => {
    expect(formatDisplay(123456789012)).toBe('123456789012');
    expect(formatDisplay(0.5)).toBe('0.5');
  });
  it('never emits negative zero', () => {
    expect(formatDisplay(-0)).toBe('0');
  });
});

describe('error recovery', () => {
  it('reports divide-by-zero with a human message, never Infinity/NaN', () => {
    const e = press('5/0=');
    expect(e.view().error).toBe('Cannot divide by zero');
    expect(e.view().main).toBe('Cannot divide by zero');
    expect(e.view().main).not.toMatch(/Infinity|NaN|undefined/);
  });
  it('a digit after an error begins a new calculation', () => {
    const e = press('5/0=');
    e.inputDigit('7');
    expect(e.view().error).toBeNull();
    expect(e.view().main).toBe('7');
  });
  it('backspace after an error is deterministic (resets to 0)', () => {
    const e = press('5/0=');
    e.backspace();
    expect(e.view().error).toBeNull();
    expect(e.view().main).toBe('0');
  });
  it('AC clears the calculator', () => {
    const e = press('5/0=');
    e.clear();
    expect(e.view().error).toBeNull();
    expect(e.view().main).toBe('0');
  });
});

describe('announcements (accessibility)', () => {
  it('does not announce plain digit/operator entry', () => {
    const e = createEngine({ feature: 'basic' });
    e.inputDigit('5'); expect(e.view().announce).toBeNull();
    e.inputOp('+'); expect(e.view().announce).toBeNull();
    e.inputDigit('2'); expect(e.view().announce).toBeNull();
  });
  it('announces the final result and errors only', () => {
    const e = createEngine({ feature: 'basic' });
    e.inputDigit('5'); e.inputOp('+'); e.inputDigit('2'); e.equals();
    expect(e.view().announce).toBe('7');
    const e2 = press('5/0=');
    expect(e2.view().announce).toBe('Cannot divide by zero');
  });
});

describe('scientific evaluation (delegated to the safe parser)', () => {
  it('respects operator precedence and functions', () => {
    const e = createEngine({ feature: 'scientific' });
    // 2 + 3 * 4 with precedence = 14
    e.inputDigit('2'); e.inputOp('+'); e.inputDigit('3'); e.inputOp('*'); e.inputDigit('4'); e.equals();
    expect(e.view().main).toBe('14');
  });
  it('evaluates sin(30) in degrees = 0.5', () => {
    const e = createEngine({ feature: 'scientific', angle: 'deg' });
    e.inputToken('sin(', 'sin('); e.inputDigit('3'); e.inputDigit('0'); e.inputToken(')', ')'); e.equals();
    expect(Number(e.view().main)).toBeCloseTo(0.5, 10);
  });
  it('never surfaces Infinity — x/0 in scientific mode reports divide-by-zero', () => {
    const e = createEngine({ feature: 'scientific' });
    e.inputDigit('5'); e.inputOp('/'); e.inputDigit('0'); e.equals();
    expect(e.view().error).toBe('Cannot divide by zero');
    expect(e.view().main).not.toMatch(/Infinity/);
  });
  it('resolves contextual percent correctly in scientific mode (no modulo mishap)', () => {
    const e = createEngine({ feature: 'scientific' });
    e.inputDigit('2'); e.inputDigit('0'); e.inputDigit('0'); e.inputOp('+'); e.inputDigit('1'); e.inputDigit('0'); e.percent(); e.equals();
    expect(e.view().main).toBe('220');
    expect(e.view().error).toBeNull();
  });
});

describe('mode switch preserves state', () => {
  it('keeps the expression, Ans and angle when the visible keypad changes', () => {
    const e = createEngine({ feature: 'basic' });
    e.inputDigit('1'); e.inputDigit('2'); e.inputOp('+'); e.inputDigit('3');
    const before = e.view().sub;
    e.setFeature('scientific'); // switching keypad must not clear anything
    e.equals();
    expect(before).toContain('12');
    expect(e.view().main).toBe('15');
  });
});

describe('function-entry parentheses are completed at equals', () => {
  /**
   * Pressing a function key inserts "name(" for the visitor (keys.ts), so the
   * closing ")" is the one character they were never asked to type. At '=' the
   * engine completes exactly those. A "(" the visitor opened themselves is NOT
   * completed — that intent is not knowable, so it keeps the existing error.
   *
   * Values are asserted numerically (view().ans) because the behaviour under
   * test is the parenthesis completion, not the display formatter.
   */
  const sci = () => createEngine({ feature: 'scientific' });
  const digits = (e: ReturnType<typeof sci>, s: string) => {
    for (const ch of s) (ch === '.' ? e.inputDot() : e.inputDigit(ch));
  };
  /** Enter `fn` + digits, press equals, return the view. Angle mode stays deg. */
  const evalFn = (token: string, value: string) => {
    const e = sci();
    e.inputToken(token, token);
    digits(e, value);
    e.equals();
    return e.view();
  };

  it('completes cos⁻¹ — "acos(0.5" = 60 in degrees', () => {
    const v = evalFn('acos(', '0.5');
    expect(v.error).toBeNull();
    expect(v.ans).toBeCloseTo(60, 10);
  });

  it('completes sin — "sin(0.5" evaluates in degrees', () => {
    const v = evalFn('sin(', '0.5');
    expect(v.error).toBeNull();
    expect(v.ans).toBeCloseTo(Math.sin((0.5 * Math.PI) / 180), 12);
  });

  it('completes tan — "tan(0.5" evaluates in degrees', () => {
    const v = evalFn('tan(', '0.5');
    expect(v.error).toBeNull();
    expect(v.ans).toBeCloseTo(Math.tan((0.5 * Math.PI) / 180), 12);
  });

  it('completes ln — "ln(10" = Math.log(10)', () => {
    const v = evalFn('ln(', '10');
    expect(v.error).toBeNull();
    expect(v.ans).toBeCloseTo(Math.log(10), 12);
  });

  it('completes log — "log(100" = 2', () => {
    const v = evalFn('log(', '100');
    expect(v.error).toBeNull();
    expect(v.ans).toBeCloseTo(2, 12);
  });

  it('completes sin⁻¹ — "asin(0.5" = 30 in degrees', () => {
    const v = evalFn('asin(', '0.5');
    expect(v.error).toBeNull();
    expect(v.ans).toBeCloseTo(30, 10);
  });

  it('completes tan⁻¹ — "atan(1" = 45 in degrees', () => {
    const v = evalFn('atan(', '1');
    expect(v.error).toBeNull();
    expect(v.ans).toBeCloseTo(45, 10);
  });

  it('completes eˣ — "exp(2" = e squared', () => {
    const v = evalFn('exp(', '2');
    expect(v.error).toBeNull();
    expect(v.ans).toBeCloseTo(Math.exp(2), 10);
  });

  it('completes √ and ∛ — "sqrt(9" and "cbrt(27"', () => {
    expect(evalFn('sqrt(', '9').ans).toBeCloseTo(3, 12);
    expect(evalFn('cbrt(', '27').ans).toBeCloseTo(3, 12);
  });

  it('10ˣ needs no completion — it enters "10^", which opens no parenthesis', () => {
    const e = sci();
    e.inputToken('10^', '10^');
    digits(e, '2');
    e.equals();
    expect(e.view().error).toBeNull();
    expect(e.view().ans).toBeCloseTo(100, 12);
  });

  it('completes NESTED function parentheses — "sin(cos(0.5" closes both', () => {
    const e = sci();
    e.inputToken('sin(', 'sin('); e.inputToken('cos(', 'cos(');
    digits(e, '0.5');
    e.equals();
    const inner = Math.cos((0.5 * Math.PI) / 180);
    expect(e.view().error).toBeNull();
    expect(e.view().ans).toBeCloseTo(Math.sin((inner * Math.PI) / 180), 12);
  });

  it('completes a function parenthesis inside a wider expression — "2 + sin(30"', () => {
    const e = sci();
    digits(e, '2'); e.inputOp('+');
    e.inputToken('sin(', 'sin('); digits(e, '30');
    e.equals();
    expect(e.view().error).toBeNull();
    expect(e.view().ans).toBeCloseTo(2.5, 12);
  });

  it('leaves a manually closed expression unchanged — "sin(30)" still = 0.5', () => {
    const e = sci();
    e.inputToken('sin(', 'sin('); digits(e, '30'); e.inputToken(')', ')');
    e.equals();
    expect(e.view().error).toBeNull();
    expect(e.view().main).toBe('0.5');
  });

  it('leaves an already-balanced expression unchanged — "(2 + 3) * 4" = 20', () => {
    const e = sci();
    e.inputToken('(', '('); digits(e, '2'); e.inputOp('+'); digits(e, '3');
    e.inputToken(')', ')'); e.inputOp('*'); digits(e, '4');
    e.equals();
    expect(e.view().error).toBeNull();
    expect(e.view().ans).toBeCloseTo(20, 12);
  });

  it('does NOT complete a visitor-opened "(" — "2 + (3 * 4" still reports the error', () => {
    const e = sci();
    digits(e, '2'); e.inputOp('+'); e.inputToken('(', '(');
    digits(e, '3'); e.inputOp('*'); digits(e, '4');
    e.equals();
    expect(e.view().error).toBe('Check the parentheses');
  });

  it('does NOT complete when a visitor-opened "(" is also unclosed — "sin((2"', () => {
    const e = sci();
    e.inputToken('sin(', 'sin('); e.inputToken('(', '(');
    digits(e, '2');
    e.equals();
    expect(e.view().error).toBe('Check the parentheses');
  });

  it('still rejects a surplus closing parenthesis — "sin(2))"', () => {
    const e = sci();
    e.inputToken('sin(', 'sin('); digits(e, '2');
    e.inputToken(')', ')'); e.inputToken(')', ')');
    e.equals();
    expect(e.view().error).toBe('Check the parentheses');
  });

  // An incomplete buffer is NOT merely missing a closer — it is mid-expression.
  // Completing it would swap one parser complaint for another, so each of these
  // keeps the error it produced before function-paren completion existed.
  it('preserves "Check the parentheses" for an empty function call — "sin(" then =', () => {
    const e = sci();
    e.inputToken('sin(', 'sin(');
    e.equals();
    expect(e.view().error).toBe('Check the parentheses');
  });

  it('preserves "Check the parentheses" for an empty function call — "sin(" then 1/x', () => {
    const e = sci();
    e.inputToken('sin(', 'sin(');
    e.reciprocal();
    expect(e.view().error).toBe('Check the parentheses');
  });

  it('preserves "Check the parentheses" for every mid-expression tail', () => {
    const tail = (steps: (e: ReturnType<typeof sci>) => void) => {
      const e = sci();
      e.inputToken('sin(', 'sin(');
      steps(e);
      e.equals();
      return e.view().error;
    };
    expect(tail((e) => e.inputToken('cos(', 'cos('))).toBe('Check the parentheses');
    expect(tail((e) => e.inputOp('+'))).toBe('Check the parentheses');
    expect(tail((e) => { digits(e, '2'); e.inputOp('*'); })).toBe('Check the parentheses');
    expect(tail((e) => e.inputToken('10^', '10^'))).toBe('Check the parentheses');
    expect(tail((e) => { digits(e, '2'); e.inputToken('mod', ' mod '); })).toBe('Check the parentheses');
    expect(tail((e) => { digits(e, '2'); e.inputToken('*10^', '\u00d710^'); })).toBe('Check the parentheses');
  });

  it('preserves "Check the parentheses" for a trailing function inside a wider expression', () => {
    const e = sci();
    digits(e, '2'); e.inputOp('+'); e.inputToken('sin(', 'sin(');
    e.equals();
    expect(e.view().error).toBe('Check the parentheses');
  });

  it('completes when the buffer ends on a value token — pi, factorial, x\u00b2, ")"', () => {
    const endsOn = (steps: (e: ReturnType<typeof sci>) => void) => {
      const e = sci();
      e.inputToken('sin(', 'sin(');
      steps(e);
      e.equals();
      return e.view();
    };
    expect(endsOn((e) => e.inputToken('\u03c0', '\u03c0')).error).toBeNull();
    expect(endsOn((e) => e.inputToken('\u03c0', '\u03c0')).ans)
      .toBeCloseTo(Math.sin((Math.PI * Math.PI) / 180), 12);
    expect(endsOn((e) => { digits(e, '5'); e.inputToken('!', '!'); }).ans)
      .toBeCloseTo(Math.sin((120 * Math.PI) / 180), 12);
    expect(endsOn((e) => { digits(e, '5'); e.inputToken('^2', '^2'); }).ans)
      .toBeCloseTo(Math.sin((25 * Math.PI) / 180), 12);
    // "sin((2)" — the manual paren is closed, so only the function one remains.
    expect(endsOn((e) => { e.inputToken('(', '('); digits(e, '2'); e.inputToken(')', ')'); }).ans)
      .toBeCloseTo(Math.sin((2 * Math.PI) / 180), 12);
  });

  it('completion survives a continued calculation — "sin(30" then "× 4" = 2', () => {
    const e = sci();
    e.inputToken('sin(', 'sin('); digits(e, '30'); e.equals();
    e.inputOp('*'); digits(e, '4'); e.equals();
    expect(e.view().error).toBeNull();
    expect(e.view().ans).toBeCloseTo(2, 12);
  });
});

describe('equals-line expression echoes the completed parentheses', () => {
  const sci = () => createEngine({ feature: 'scientific' });
  const digits = (e: ReturnType<typeof sci>, str: string) => {
    for (const ch of str) (ch === '.' ? e.inputDot() : e.inputDigit(ch));
  };

  it('shows "sin(2) =" for "sin(2" — the expression actually evaluated', () => {
    const e = sci();
    e.inputToken('sin(', 'sin('); digits(e, '2');
    e.equals();
    const v = e.view();
    expect(v.sub).toBe('sin(2) =');
    expect(v.main).toBe('0.0348994967025'); // result unchanged
  });

  it('echoes BOTH closers for a nested call — "sin(cos(0.5) )"', () => {
    const e = sci();
    e.inputToken('sin(', 'sin('); e.inputToken('cos(', 'cos('); digits(e, '0.5');
    e.equals();
    expect(e.view().sub).toBe('sin(cos(0.5)) =');
  });

  it('echoes the closer inside a wider expression — "2 + sin(30) ="', () => {
    const e = sci();
    digits(e, '2'); e.inputOp('+'); e.inputToken('sin(', 'sin('); digits(e, '30');
    e.equals();
    expect(e.view().sub).toBe('2 + sin(30) =');
    expect(e.view().main).toBe('2.5');
  });

  it('does not double up when the visitor typed ")" themselves', () => {
    const e = sci();
    e.inputToken('sin(', 'sin('); digits(e, '30'); e.inputToken(')', ')');
    e.equals();
    expect(e.view().sub).toBe('sin(30) =');
  });

  it('leaves a manually opened "(" out of the echo (it is never completed)', () => {
    const e = sci();
    e.inputToken('sqrt(', 'sqrt('); e.inputToken('(', '('); digits(e, '9');
    e.inputToken(')', ')');
    e.equals();
    // Only the sqrt( closer is added; the visitor's "(" was already closed.
    expect(e.view().sub).toBe('sqrt((9)) =');
  });

  it('leaves plain arithmetic echoes untouched — "5 + 6 ="', () => {
    const e = sci();
    digits(e, '5'); e.inputOp('+'); digits(e, '6');
    e.equals();
    expect(e.view().sub).toBe('5 + 6 =');
  });

  it('does not complete the echo while the visitor is still typing', () => {
    const e = sci();
    e.inputToken('sin(', 'sin('); digits(e, '2');
    // Before '=' the open paren is accurate feedback that input continues.
    expect(e.view().sub).toBe('sin(');
    expect(e.view().main).toBe('2');
  });

  it('shows no completed echo when the expression errors', () => {
    const e = sci();
    e.inputToken('sin(', 'sin(');
    e.equals();
    expect(e.view().error).toBe('Check the parentheses');
    expect(e.view().sub).toBe('');
  });
});

describe('overflow is reported as overflow, not as division by zero', () => {
  it('999^999 says the result is too large', () => {
    const e = createEngine({ feature: 'scientific' });
    for (const d of ['9', '9', '9']) e.inputDigit(d);
    e.inputToken('^', '^');
    for (const d of ['9', '9', '9']) e.inputDigit(d);
    e.equals();
    expect(e.view().error).toBe('Result is too large to show');
    expect(e.view().main).not.toMatch(/Infinity|NaN|undefined/);
  });

  it('division by zero still says division by zero, in both modes', () => {
    const basic = createEngine({ feature: 'basic' });
    basic.inputDigit('5'); basic.inputOp('/'); basic.inputDigit('0'); basic.equals();
    expect(basic.view().error).toBe('Cannot divide by zero');

    const sci = createEngine({ feature: 'scientific' });
    sci.inputDigit('5'); sci.inputOp('/'); sci.inputDigit('0'); sci.equals();
    expect(sci.view().error).toBe('Cannot divide by zero');
  });

  it('a division by zero INSIDE a larger expression is still named correctly', () => {
    const e = press('(5/0)', 'scientific');
    e.inputOp('+'); e.inputDigit('1'); e.equals();
    expect(e.view().error).toBe('Cannot divide by zero');
    expect(e.view().main).not.toMatch(/Infinity/);
  });
});
