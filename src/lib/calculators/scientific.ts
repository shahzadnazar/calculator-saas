/**
 * Safe scientific-expression evaluator.
 *
 * Deliberately does NOT use eval()/Function(): user input is tokenised, parsed
 * to Reverse Polish Notation via the shunting-yard algorithm, then evaluated.
 * This is secure (no code execution), predictable, and unit-testable.
 *
 * Supports: + - * / ^, parentheses, unary minus, postfix factorial (!),
 * percent, constants (π, e), and functions sin cos tan asin acos atan
 * sinh cosh tanh ln log sqrt cbrt exp abs. Trig respects the angle mode.
 */

export type AngleMode = 'deg' | 'rad';

export class CalculatorError extends Error {}

type TokenType = 'number' | 'op' | 'lparen' | 'rparen' | 'func' | 'const' | 'bang' | 'comma';
interface Token {
  type: TokenType;
  value: string;
}

const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan',
  'sinh', 'cosh', 'tanh', 'ln', 'log', 'sqrt', 'cbrt', 'exp', 'abs',
]);

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  'π': Math.PI, // π
  e: Math.E,
};

interface OpInfo {
  precedence: number;
  assoc: 'left' | 'right';
}
const OPERATORS: Record<string, OpInfo> = {
  '+': { precedence: 2, assoc: 'left' },
  '-': { precedence: 2, assoc: 'left' },
  '*': { precedence: 3, assoc: 'left' },
  '/': { precedence: 3, assoc: 'left' },
  '%': { precedence: 3, assoc: 'left' },
  '^': { precedence: 4, assoc: 'right' },
  // unary minus, represented internally as 'u-'
  'u-': { precedence: 5, assoc: 'right' },
};

/** Normalise display symbols (×, ÷, −, √) to canonical tokens. */
function normalize(input: string): string {
  return input
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/√/g, 'sqrt')
    .replace(/\bmod\b/gi, '%');
}

function tokenize(input: string): Token[] {
  const s = normalize(input);
  const tokens: Token[] = [];
  let i = 0;

  while (i < s.length) {
    const ch = s[i];

    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }

    // Numbers (with decimals and scientific notation like 1.5e3)
    if (/[0-9.]/.test(ch)) {
      let num = '';
      while (i < s.length && /[0-9.]/.test(s[i])) num += s[i++];
      // optional exponent
      if (s[i] === 'e' || s[i] === 'E') {
        const save = i;
        let exp = s[i++];
        if (s[i] === '+' || s[i] === '-') exp += s[i++];
        if (/[0-9]/.test(s[i] ?? '')) {
          while (i < s.length && /[0-9]/.test(s[i])) exp += s[i++];
          num += exp;
        } else {
          i = save; // not an exponent (e is Euler's constant); back off
        }
      }
      if ((num.match(/\./g) || []).length > 1) {
        throw new CalculatorError(`Malformed number: ${num}`);
      }
      tokens.push({ type: 'number', value: num });
      continue;
    }

    // Identifiers: functions or constants
    if (/[a-zA-Zπ]/.test(ch)) {
      let id = '';
      while (i < s.length && /[a-zA-Zπ]/.test(s[i])) id += s[i++];
      const lower = id.toLowerCase();
      if (FUNCTIONS.has(lower)) {
        tokens.push({ type: 'func', value: lower });
      } else if (lower in CONSTANTS || id in CONSTANTS) {
        tokens.push({ type: 'const', value: id in CONSTANTS ? id : lower });
      } else {
        throw new CalculatorError(`Unknown identifier: ${id}`);
      }
      continue;
    }

    if (ch === '(') { tokens.push({ type: 'lparen', value: ch }); i++; continue; }
    if (ch === ')') { tokens.push({ type: 'rparen', value: ch }); i++; continue; }
    if (ch === ',') { tokens.push({ type: 'comma', value: ch }); i++; continue; }
    if (ch === '!') { tokens.push({ type: 'bang', value: ch }); i++; continue; }

    if (ch in OPERATORS || ch === '-' || ch === '+') {
      tokens.push({ type: 'op', value: ch });
      i++;
      continue;
    }

    throw new CalculatorError(`Unexpected character: ${ch}`);
  }

  return tokens;
}

/** Shunting-yard: infix tokens → RPN output queue. */
function toRPN(tokens: Token[]): Token[] {
  const output: Token[] = [];
  const stack: Token[] = [];

  const isValueEnd = (t: Token | undefined) =>
    t != null && (t.type === 'number' || t.type === 'const' || t.type === 'rparen' || t.type === 'bang');

  for (let idx = 0; idx < tokens.length; idx++) {
    const tok = tokens[idx];
    const prev = tokens[idx - 1];

    switch (tok.type) {
      case 'number':
      case 'const':
        output.push(tok);
        break;
      case 'func':
        stack.push(tok);
        break;
      case 'comma':
        while (stack.length && stack[stack.length - 1].type !== 'lparen') {
          output.push(stack.pop()!);
        }
        break;
      case 'bang':
        output.push(tok); // factorial is postfix — emit immediately
        break;
      case 'op': {
        // Detect unary minus/plus
        const isUnary = !isValueEnd(prev);
        let opVal = tok.value;
        if (isUnary) {
          if (opVal === '+') break; // unary plus is a no-op
          opVal = 'u-';
        }
        const o1 = OPERATORS[opVal];
        while (stack.length) {
          const top = stack[stack.length - 1];
          if (top.type === 'func') {
            output.push(stack.pop()!);
            continue;
          }
          if (top.type === 'op') {
            const o2 = OPERATORS[top.value];
            if (
              o2 &&
              (o2.precedence > o1.precedence ||
                (o2.precedence === o1.precedence && o1.assoc === 'left'))
            ) {
              output.push(stack.pop()!);
              continue;
            }
          }
          break;
        }
        stack.push({ type: 'op', value: opVal });
        break;
      }
      case 'lparen':
        stack.push(tok);
        break;
      case 'rparen': {
        let found = false;
        while (stack.length) {
          const top = stack.pop()!;
          if (top.type === 'lparen') { found = true; break; }
          output.push(top);
        }
        if (!found) throw new CalculatorError('Mismatched parentheses');
        if (stack.length && stack[stack.length - 1].type === 'func') {
          output.push(stack.pop()!);
        }
        break;
      }
    }
  }

  while (stack.length) {
    const top = stack.pop()!;
    if (top.type === 'lparen' || top.type === 'rparen') {
      throw new CalculatorError('Mismatched parentheses');
    }
    output.push(top);
  }
  return output;
}

function factorial(n: number): number {
  if (n < 0 || !Number.isInteger(n)) {
    throw new CalculatorError('Factorial requires a non-negative integer');
  }
  if (n > 170) return Infinity; // beyond double precision
  let result = 1;
  for (let k = 2; k <= n; k++) result *= k;
  return result;
}

function applyFunction(name: string, x: number, mode: AngleMode): number {
  const toRad = (v: number) => (mode === 'deg' ? (v * Math.PI) / 180 : v);
  const fromRad = (v: number) => (mode === 'deg' ? (v * 180) / Math.PI : v);
  switch (name) {
    case 'sin': return Math.sin(toRad(x));
    case 'cos': return Math.cos(toRad(x));
    case 'tan': return Math.tan(toRad(x));
    case 'asin': return fromRad(Math.asin(x));
    case 'acos': return fromRad(Math.acos(x));
    case 'atan': return fromRad(Math.atan(x));
    case 'sinh': return Math.sinh(x);
    case 'cosh': return Math.cosh(x);
    case 'tanh': return Math.tanh(x);
    case 'ln': return Math.log(x);
    case 'log': return Math.log10(x);
    case 'sqrt': return Math.sqrt(x);
    case 'cbrt': return Math.cbrt(x);
    case 'exp': return Math.exp(x);
    case 'abs': return Math.abs(x);
    default: throw new CalculatorError(`Unknown function: ${name}`);
  }
}

function evalRPN(rpn: Token[], mode: AngleMode): number {
  const stack: number[] = [];
  const pop = (): number => {
    const v = stack.pop();
    if (v === undefined) throw new CalculatorError('Invalid expression');
    return v;
  };

  for (const tok of rpn) {
    switch (tok.type) {
      case 'number':
        stack.push(Number(tok.value));
        break;
      case 'const':
        stack.push(CONSTANTS[tok.value] ?? CONSTANTS[tok.value.toLowerCase()]);
        break;
      case 'bang':
        stack.push(factorial(pop()));
        break;
      case 'func':
        stack.push(applyFunction(tok.value, pop(), mode));
        break;
      case 'op': {
        if (tok.value === 'u-') {
          stack.push(-pop());
          break;
        }
        const b = pop();
        const a = pop();
        switch (tok.value) {
          case '+': stack.push(a + b); break;
          case '-': stack.push(a - b); break;
          case '*': stack.push(a * b); break;
          // Division by zero is named at the point it happens. Letting it fall through as
          // Infinity made the engine report EVERY non-finite result as divide-by-zero,
          // including a plain overflow like 999^999.
          case '/':
            if (b === 0) throw new CalculatorError('__divzero__');
            stack.push(a / b);
            break;
          case '%':
            if (b === 0) throw new CalculatorError('__divzero__');
            stack.push(a % b);
            break;
          case '^': stack.push(Math.pow(a, b)); break;
          default: throw new CalculatorError(`Unknown operator: ${tok.value}`);
        }
        break;
      }
      default:
        throw new CalculatorError('Invalid expression');
    }
  }

  if (stack.length !== 1) throw new CalculatorError('Invalid expression');
  return stack[0];
}

/**
 * Evaluate a mathematical expression string.
 * @throws {CalculatorError} on malformed input.
 */
export function evaluate(expression: string, mode: AngleMode = 'deg'): number {
  const trimmed = expression.trim();
  if (trimmed === '') throw new CalculatorError('Empty expression');
  const result = evalRPN(toRPN(tokenize(trimmed)), mode);
  if (Number.isNaN(result)) throw new CalculatorError('Result is not a number');
  return result;
}
