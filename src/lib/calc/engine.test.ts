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
