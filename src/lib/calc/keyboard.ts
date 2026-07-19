/**
 * Keyboard controller for the physical calculator.
 *
 * Maps physical keys to engine actions and enforces keyboard isolation: the
 * calculator never hijacks typing that belongs to another form control (input,
 * textarea, select, contenteditable, the global search), and when several
 * calculators share a page, only the active instance responds.
 */
import type { Engine } from './engine';
import type { KeyAct } from './keys';

export type KeyResult = KeyAct | { kind: 'back' } | null;

/** Physical key → engine action (null = not a calculator key). */
export function mapKey(key: string): KeyResult {
  if (key.length === 1 && key >= '0' && key <= '9') return { kind: 'digit', value: key };
  switch (key) {
    case '.': return { kind: 'dot' };
    case '+': return { kind: 'op', value: '+' };
    case '-': return { kind: 'op', value: '-' };
    case '*': return { kind: 'op', value: '*' };
    case '/': return { kind: 'op', value: '/' };
    case '^': return { kind: 'op', value: '^' };
    case '(': return { kind: 'token', value: '(', display: '(' };
    case ')': return { kind: 'token', value: ')', display: ')' };
    case '%': return { kind: 'percent' };
    case '=':
    case 'Enter': return { kind: 'equals' };
    case 'Backspace': return { kind: 'back' };
    case 'Escape': return { kind: 'clear' };
    default: return null;
  }
}

/** Apply an action (shared by keypad clicks and the keyboard). */
export function applyAct(engine: Engine, act: KeyAct | { kind: 'back' }): void {
  switch (act.kind) {
    case 'digit': engine.inputDigit(act.value); break;
    case 'dot': engine.inputDot(); break;
    case 'op': engine.inputOp(act.value); break;
    case 'token': engine.inputToken(act.value, act.display); break;
    case 'equals': engine.equals(); break;
    case 'clear': engine.clear(); break;
    case 'negate': engine.negate(); break;
    case 'percent': engine.percent(); break;
    case 'ans': engine.recallAns(); break;
    case 'back': engine.backspace(); break;
  }
}

const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION']);

/** True when a keydown target belongs to some OTHER form control we must not hijack. */
export function targetBlocksKeyboard(target: EventTarget | null, root: Element): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (root.contains(el)) return false; // our own display/keys are fine
  if (FORM_TAGS.has(el.tagName)) return true;
  if (el.isContentEditable) return true;
  const role = el.getAttribute?.('role');
  if (role === 'searchbox' || role === 'combobox') return true;
  return false;
}

/* ---- active-instance routing (only one calculator responds to the keyboard) */

let activeRoot: Element | null = null;
const roots = new Set<Element>();

/**
 * Wire a calculator instance to the keyboard. Returns an unbind function.
 * The instance becomes active when the user interacts with it; body-level
 * keystrokes (nothing focused) go to the active instance only.
 */
export function attachKeyboard(root: Element, engine: Engine, onChange: () => void): () => void {
  roots.add(root);
  if (!activeRoot) activeRoot = root;

  const makeActive = () => { activeRoot = root; };
  root.addEventListener('pointerdown', makeActive);
  root.addEventListener('focusin', makeActive);

  const onKeydown = (e: Event) => {
    const ke = e as KeyboardEvent;
    if (ke.ctrlKey || ke.metaKey || ke.altKey) return;
    if (targetBlocksKeyboard(ke.target, root)) return;

    const targetInside = root.contains(ke.target as Node);
    // Only the active instance handles body-level (unfocused) keystrokes.
    if (!targetInside && activeRoot !== root) return;

    // Let native activation handle Enter/Space on a focused keypad button.
    const el = ke.target as HTMLElement;
    if (targetInside && el?.tagName === 'BUTTON' && (ke.key === 'Enter' || ke.key === ' ')) return;

    const result = mapKey(ke.key);
    if (!result) return;
    ke.preventDefault();
    applyAct(engine, result);
    onChange();
  };

  document.addEventListener('keydown', onKeydown);

  return () => {
    document.removeEventListener('keydown', onKeydown);
    root.removeEventListener('pointerdown', makeActive);
    root.removeEventListener('focusin', makeActive);
    roots.delete(root);
    if (activeRoot === root) activeRoot = roots.values().next().value ?? null;
  };
}
