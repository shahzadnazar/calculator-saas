/**
 * Key catalogs.
 *
 * BASIC_KEYS is the four-column physical-calculator keypad, shared by BOTH
 * modes (its number/operator/AC/±/%/./= positions never move). Scientific mode
 * adds SCI_FUNCTION_KEYS as a five-column function panel ABOVE the same Basic
 * keypad. Backspace is not here — it is a secondary control beside the display.
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
  | { kind: 'reciprocal' }
  | { kind: 'ans' };

export type KeyKind = 'num' | 'op' | 'fn' | 'primary' | 'danger' | 'util';

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
// ± and % are neutral utility keys (green is reserved for success/result status).
const NEG: KeyDef = { label: '±', aria: 'plus minus, toggle sign', act: { kind: 'negate' }, kind: 'util' };
const PCT: KeyDef = { label: '%', aria: 'percent', act: { kind: 'percent' }, kind: 'util' };

/**
 * Basic keypad — the familiar physical-calculator arrangement (used in BOTH
 * modes; positions are stable).
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

const ANS: KeyDef = { label: 'Ans', aria: 'Previous answer', act: { kind: 'ans' }, kind: 'fn' };
const RECIP: KeyDef = { label: '1/x', aria: 'Reciprocal', act: { kind: 'reciprocal' }, kind: 'fn' };

/**
 * Scientific FUNCTION panel, rendered above the Basic keypad.
 * The first four rows are a 5-column grid; the final four controls render as a
 * CENTERED row (no empty trailing cells):
 *   sin  cos  tan  ln  log
 *   sin⁻¹ cos⁻¹ tan⁻¹ eˣ 10ˣ
 *   x²   x³   xʸ   √   ∛
 *   π    e    (    )   n!
 *        mod  Ans  EXP  1/x            ← centered
 *
 * EXP is implemented as ×10^ (a supported composition), NOT a faked function.
 * 1/x is a real engine reciprocal operation. Rand stays out of scope.
 */
export const SCI_GRID_KEYS: KeyDef[] = [
  fn('sin', 'sin(', 'sine'), fn('cos', 'cos(', 'cosine'), fn('tan', 'tan(', 'tangent'), fn('ln', 'ln(', 'natural log'), fn('log', 'log(', 'log base 10'),
  fn('sin⁻¹', 'asin(', 'inverse sine'), fn('cos⁻¹', 'acos(', 'inverse cosine'), fn('tan⁻¹', 'atan(', 'inverse tangent'), fn('eˣ', 'exp(', 'e to the power x'), fn('10ˣ', '10^', 'ten to the power x'),
  fn('x²', '^2', 'square'), fn('x³', '^3', 'cube'), { label: 'xʸ', aria: 'power', act: { kind: 'op', value: '^' }, kind: 'fn' }, fn('√', 'sqrt(', 'square root'), fn('∛', 'cbrt(', 'cube root'),
  fn('π', 'π', 'pi'), fn('e', 'e', "euler's number"), fn('(', '(', 'open parenthesis'), fn(')', ')', 'close parenthesis'), fn('n!', '!', 'factorial'),
];

export const SCI_FINAL_KEYS: KeyDef[] = [
  fn('mod', 'mod', 'Modulo', ' mod '), ANS, fn('EXP', '*10^', 'Enter exponent in scientific notation', '×10^'), RECIP,
];

/** Requested scientific keys NOT surfaced, and why (reported, never faked). */
export const UNSUPPORTED_SCI = [
  { key: 'Rand', reason: 'The safe evaluator has no random-number function; adding one is a non-deterministic engine input (out of scope this phase).' },
] as const;
