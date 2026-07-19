/**
 * Key catalogs for the Basic and Scientific keypads.
 *
 * A single typed catalog drives BOTH the rendered keypad markup and the
 * keyboard controller, so a physical key and its on-screen button always map to
 * the same engine action. Backspace is deliberately NOT here — it is a
 * secondary control rendered beside the display (see CalculatorDisplay), for
 * both keypads.
 */
import type { Op } from './engine';

export type KeyAct =
  | { kind: 'digit'; value: string }
  | { kind: 'dot' }
  | { kind: 'op'; value: Op }
  | { kind: 'token'; value: string; display?: string }
  | { kind: 'equals' }
  | { kind: 'clear' }
  | { kind: 'negate' }
  | { kind: 'percent' }
  | { kind: 'ans' };

export type KeyKind = 'num' | 'op' | 'fn' | 'primary' | 'danger' | 'accent';

export interface KeyDef {
  label: string; // may include markup for superscripts
  aria: string;
  act: KeyAct;
  kind: KeyKind;
  span?: number; // grid column span (Basic zero spans two)
}

const d = (n: string): KeyDef => ({ label: n, aria: n, act: { kind: 'digit', value: n }, kind: 'num' });
const op = (label: string, value: Op, aria: string): KeyDef => ({ label, aria, act: { kind: 'op', value }, kind: 'op' });
const fn = (label: string, value: string, aria: string, display?: string): KeyDef => ({
  label, aria, act: { kind: 'token', value, display: display ?? value }, kind: 'fn',
});

const DOT: KeyDef = { label: '.', aria: 'decimal point', act: { kind: 'dot' }, kind: 'num' };
const EQ: KeyDef = { label: '=', aria: 'equals', act: { kind: 'equals' }, kind: 'primary' };
const AC: KeyDef = { label: 'AC', aria: 'all clear', act: { kind: 'clear' }, kind: 'danger' };
const NEG: KeyDef = { label: '±', aria: 'plus minus, toggle sign', act: { kind: 'negate' }, kind: 'accent' };
const PCT: KeyDef = { label: '%', aria: 'percent', act: { kind: 'percent' }, kind: 'accent' };

/**
 * Basic keypad — the familiar physical-calculator arrangement.
 *   AC  ±  %  ÷
 *   7   8  9  ×
 *   4   5  6  −
 *   1   2  3  +
 *   0(span 2)  .  =
 */
export const BASIC_KEYS: KeyDef[] = [
  AC, NEG, PCT, op('÷', '/', 'divide'),
  d('7'), d('8'), d('9'), op('×', '*', 'multiply'),
  d('4'), d('5'), d('6'), op('−', '-', 'subtract'),
  d('1'), d('2'), d('3'), op('+', '+', 'add'),
  { ...d('0'), span: 2 }, DOT, EQ,
];

/**
 * Scientific keypad — superset. Deg/Rad lives in the wrapper; backspace beside
 * the display. ± replaces the old grid backspace slot.
 */
export const SCIENTIFIC_KEYS: KeyDef[] = [
  fn('sin', 'sin(', 'sine'), fn('cos', 'cos(', 'cosine'), fn('tan', 'tan(', 'tangent'), fn('ln', 'ln(', 'natural log'), fn('log', 'log(', 'log base 10'),
  fn('sin⁻¹', 'asin(', 'inverse sine'), fn('cos⁻¹', 'acos(', 'inverse cosine'), fn('tan⁻¹', 'atan(', 'inverse tangent'), fn('eˣ', 'exp(', 'e to the power x'), fn('10ˣ', '10^', 'ten to the power x'),
  fn('x²', '^2', 'square'), fn('x³', '^3', 'cube'), { label: 'xʸ', aria: 'power', act: { kind: 'op', value: '^' }, kind: 'fn' }, fn('√', 'sqrt(', 'square root'), fn('∛', 'cbrt(', 'cube root'),
  fn('π', 'π', 'pi'), fn('e', 'e', "euler's number"), fn('(', '(', 'open parenthesis'), fn(')', ')', 'close parenthesis'), fn('n!', '!', 'factorial'),
  d('7'), d('8'), d('9'), op('÷', '/', 'divide'), NEG,
  d('4'), d('5'), d('6'), op('×', '*', 'multiply'), fn('mod', 'mod', 'modulo', ' mod '),
  d('1'), d('2'), d('3'), op('−', '-', 'subtract'), { label: 'Ans', aria: 'answer', act: { kind: 'ans' }, kind: 'fn' },
  d('0'), DOT, op('+', '+', 'add'), AC, EQ,
];
