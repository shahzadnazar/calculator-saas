/**
 * Equation calculator runtime (R3).
 *
 * A shared controller for calculators made of one or more INDEPENDENT
 * natural-language equations (e.g. the Percentage calculator's three questions).
 * Each equation mounts its OWN runtime instance against its own `<form
 * data-equation="…">` root, so it owns its operands, result state, activity,
 * first-calculation gate, Calculate/Reset, validation, announcement and focus.
 * Changing one equation can never calculate, reset, announce or overwrite
 * another — there is no shared/root-level listener.
 *
 * SCOPE: certified for independent natural-language equations only. It does NOT
 * claim support for multi-mode forms, converters, date calculators, dynamic-row
 * tools, financial schedules or specialized reports.
 *
 * Mirrors the standard-form runtime pattern: a PURE `planEquationAction`
 * (unit-tested, no DOM) + a thin `mountEquationCalculator` DOM executor. It
 * reuses the shared result state machine (@lib/result/state) and focus helpers
 * (@lib/result/focus); the standard-form runtime is untouched.
 */
import {
  reduceResult,
  INITIAL_STATUS,
  sanitizeResultNumber,
  type ResultStatus,
} from './state';
import { focusFirstInvalidField, revealResult } from './focus';

/* ------------------------------------------------------------------ */
/* Contracts                                                           */
/* ------------------------------------------------------------------ */

export type ValidationResult =
  | { ok: true }
  | { ok: false; fieldErrors?: Record<string, string>; formError?: string };

export type RecalculationMode = 'explicit' | 'live-after-first' | 'always-live';

export interface EquationRenderContext {
  /** The equation's root (its `<form data-equation>`). */
  root: HTMLElement;
  /** The equation's ResultShell element. */
  result: HTMLElement;
}

export interface EquationCalculatorBinding<O, R> {
  readOperands(root: HTMLElement): O;
  validate(operands: O): ValidationResult;
  compute(operands: O): R;
  renderResult(result: R, context: EquationRenderContext): void;
  describeResult(result: R): string;
  /** Primary magnitude guarded for finiteness (never NaN/∞). */
  resultValue(result: R): number;
  resetOperands(root: HTMLElement): void;
}

export interface EquationCalculatorOptions {
  calculateButtonLabel: string;
  recalculationMode?: RecalculationMode;
}

/* ------------------------------------------------------------------ */
/* Pure decision logic                                                 */
/* ------------------------------------------------------------------ */

export interface EquationMachineState {
  status: ResultStatus;
  hasCalculated: boolean;
}

export const INITIAL_EQUATION_STATE: EquationMachineState = {
  status: INITIAL_STATUS,
  hasCalculated: false,
};

export type EquationTrigger =
  | { kind: 'submit' }
  | { kind: 'input' }
  | { kind: 'reset' }
  /**
   * Leave a server-rendered worked example and hand this equation's panel to the
   * visitor. `action` is the explicit "Start with my values" button (focus moves
   * to the first operand); `input` is the visitor starting to type, which drops
   * the example silently without stealing focus mid-keystroke.
   *
   * Per-equation, like every other trigger: dismissing one equation's example
   * never touches its neighbours.
   */
  | { kind: 'dismissExample'; source: 'action' | 'input' };

export interface EquationProbe {
  validation: ValidationResult;
  resultFinite: boolean;
}

export interface EquationEffects {
  compute: boolean;
  announce: 'value' | 'error' | 'none';
  focus: 'firstInvalid' | 'revealResult' | 'firstField' | 'none';
  liveNote: boolean;
  fieldErrors: 'apply' | 'clear' | 'none';
  clearOperands: boolean;
}

export interface EquationPlan {
  next: EquationMachineState;
  effects: EquationEffects;
}

export function isLiveActive(mode: RecalculationMode, hasCalculated: boolean): boolean {
  return mode === 'always-live' || (mode === 'live-after-first' && hasCalculated);
}

function idle(state: EquationMachineState, liveNote: boolean): EquationPlan {
  return {
    next: state,
    effects: {
      compute: false,
      announce: 'none',
      focus: 'none',
      liveNote,
      fieldErrors: 'none',
      clearOperands: false,
    },
  };
}

/**
 * Pure planner for a single equation instance. Same discipline as the
 * standard-form runtime: first-calc gate, live-after-first, invalid↔valid
 * recovery, non-finite protection, reset. Never throws.
 */
export function planEquationAction(
  state: EquationMachineState,
  trigger: EquationTrigger,
  probe: EquationProbe | null,
  options: { recalculationMode: RecalculationMode },
): EquationPlan {
  const mode = options.recalculationMode;
  const noteAfterCalc = (hasCalculated: boolean) => hasCalculated && mode !== 'explicit';

  switch (trigger.kind) {
    case 'reset':
      return {
        next: { status: reduceResult(state.status, { type: 'reset' }), hasCalculated: false },
        effects: {
          compute: false,
          announce: 'none',
          focus: 'none',
          liveNote: false,
          fieldErrors: 'clear',
          clearOperands: true,
        },
      };

    case 'dismissExample': {
      // Protection: only the `example` state can be dismissed, so a stray click
      // can never wipe a real result.
      if (state.status.state !== 'example') return idle(state, noteAfterCalc(state.hasCalculated));
      return {
        next: { status: reduceResult(state.status, { type: 'reset' }), hasCalculated: false },
        effects: {
          compute: false,
          announce: 'none',
          focus: trigger.source === 'action' ? 'firstField' : 'none',
          liveNote: false,
          fieldErrors: 'clear',
          // The example lives only in the result panel; on the `input` path the
          // operands hold exactly what the visitor just typed.
          clearOperands: false,
        },
      };
    }

    case 'submit': {
      if (!probe) return idle(state, noteAfterCalc(state.hasCalculated));
      const success = probe.validation.ok && probe.resultFinite;
      if (success) {
        return {
          next: {
            status: reduceResult(state.status, { type: 'calculate', valid: true }),
            hasCalculated: true,
          },
          effects: {
            compute: true,
            announce: 'value',
            focus: 'revealResult',
            liveNote: mode !== 'explicit',
            fieldErrors: 'clear',
            clearOperands: false,
          },
        };
      }
      const fieldInvalid = !probe.validation.ok;
      return {
        next: {
          status: reduceResult(state.status, { type: 'calculate', valid: false }),
          hasCalculated: state.hasCalculated,
        },
        effects: {
          compute: false,
          announce: 'error',
          focus: fieldInvalid ? 'firstInvalid' : 'none',
          liveNote: noteAfterCalc(state.hasCalculated),
          fieldErrors: 'apply',
          clearOperands: false,
        },
      };
    }

    case 'input': {
      if (!isLiveActive(mode, state.hasCalculated)) {
        return idle(state, noteAfterCalc(state.hasCalculated));
      }
      if (!probe) return idle(state, noteAfterCalc(state.hasCalculated));
      const success = probe.validation.ok && probe.resultFinite;
      if (success) {
        const status =
          state.status.state === 'valid'
            ? reduceResult(state.status, { type: 'liveUpdate', valid: true })
            : reduceResult(state.status, { type: 'calculate', valid: true });
        return {
          next: { status, hasCalculated: true },
          effects: {
            compute: true,
            announce: 'value',
            focus: 'none',
            liveNote: mode !== 'explicit',
            fieldErrors: 'clear',
            clearOperands: false,
          },
        };
      }
      return {
        next: {
          status: reduceResult(state.status, { type: 'calculate', valid: false }),
          hasCalculated: state.hasCalculated,
        },
        effects: {
          compute: false,
          announce: 'error',
          focus: 'none',
          liveNote: mode !== 'explicit',
          fieldErrors: 'apply',
          clearOperands: false,
        },
      };
    }

    default:
      return idle(state, noteAfterCalc(state.hasCalculated));
  }
}

/* ------------------------------------------------------------------ */
/* DOM executor (one instance per equation)                            */
/* ------------------------------------------------------------------ */

const SETTLE_MS = 900;
const LIVE_DEBOUNCE_MS = 180;
const NON_FINITE_MESSAGE = 'This can’t be calculated. Please check the values.';

export interface EquationRuntimeHandle {
  destroy(): void;
}

/**
 * Attach a runtime to ONE equation. `root` is the equation's `<form
 * data-equation>` (or any element containing exactly one equation's markup):
 *   - a submit button (Calculate) and a `[data-reset]` button;
 *   - operand fields with `name` + a matching `[data-error-for="<name>"]`;
 *   - a `[data-result-shell]` hosting valid/empty/invalid regions and a
 *     `[data-result-live]` output;
 *   - an optional `[data-live-note]`.
 * All queries are scoped to `root`, so instances never interfere.
 */
export function mountEquationCalculator<O, R>(
  root: HTMLElement,
  binding: EquationCalculatorBinding<O, R>,
  options: EquationCalculatorOptions,
): EquationRuntimeHandle {
  const mode: RecalculationMode = options.recalculationMode ?? 'live-after-first';
  const form = (root.matches('form') ? root : root.querySelector('form')) as HTMLFormElement | null;
  const shell = root.querySelector<HTMLElement>('[data-result-shell]');
  if (!form || !shell) return { destroy() {} };

  const live = shell.querySelector<HTMLElement>('[data-result-live]');
  const note = root.querySelector<HTMLElement>('[data-live-note]');
  const invalidMsg = shell.querySelector<HTMLElement>('[data-result-invalid-message]');
  const resetBtn = root.querySelector<HTMLButtonElement>('[data-reset]');
  const ctx: EquationRenderContext = { root, result: shell };

  // Opt-in worked example: an equation that server-renders its shell in the
  // `example` state starts the machine there, so the shared runtime owns the
  // transition out of it rather than a parallel per-island script.
  const startsAsExample = shell.dataset.resultState === 'example';
  let state: EquationMachineState = startsAsExample
    ? { status: reduceResult(INITIAL_STATUS, { type: 'showExample' }), hasCalculated: false }
    : INITIAL_EQUATION_STATE;
  let settleTimer = 0;
  let debounceTimer = 0;
  let lastAnnounced = '';

  const setStatus = (status: ResultStatus) => {
    shell.dataset.resultState = status.state;
    shell.dataset.resultActivity = status.activity;
    if (status.activity === 'just-updated') {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        state = { ...state, status: reduceResult(state.status, { type: 'settle' }) };
        shell.dataset.resultActivity = state.status.activity;
      }, SETTLE_MS);
    }
  };

  const announce = (text: string) => {
    if (!live || text === lastAnnounced) return;
    lastAnnounced = text;
    live.textContent = text;
  };

  const firstErrorText = (v: ValidationResult): string => {
    if (v.ok) return NON_FINITE_MESSAGE;
    if (v.formError) return v.formError;
    return (v.fieldErrors && Object.values(v.fieldErrors)[0]) ?? 'Please check the values entered.';
  };

  const clearFieldErrors = () => {
    root.querySelectorAll<HTMLElement>('[data-error-for]').forEach((el) => {
      el.textContent = '';
      el.hidden = true;
    });
    root.querySelectorAll<HTMLElement>('[aria-invalid="true"]').forEach((el) => {
      el.removeAttribute('aria-invalid');
    });
  };

  const applyFieldErrors = (v: ValidationResult) => {
    clearFieldErrors();
    if (v.ok || !v.fieldErrors) return;
    for (const [name, message] of Object.entries(v.fieldErrors)) {
      const errEl = root.querySelector<HTMLElement>(`[data-error-for="${name}"]`);
      if (errEl) {
        errEl.textContent = message;
        errEl.hidden = false;
      }
      const target = root.querySelector<HTMLElement>(`[name="${name}"]`);
      if (target) target.setAttribute('aria-invalid', 'true');
    }
  };

  /** The first operand a visitor would type into — used only when they explicitly
   *  ask to start with their own values. */
  const focusFirstField = () => {
    const fields = Array.from(
      form.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select'),
    );
    const target = fields.find(
      (el) => !el.disabled && el.type !== 'hidden' && el.offsetParent !== null,
    );
    target?.focus();
  };

  const run = (trigger: EquationTrigger) => {
    let result: R | null = null;
    let probe: EquationProbe | null = null;

    if (trigger.kind !== 'reset' && trigger.kind !== 'dismissExample') {
      const operands = binding.readOperands(root);
      const validation = binding.validate(operands);
      let resultFinite = false;
      if (validation.ok) {
        result = binding.compute(operands);
        resultFinite = sanitizeResultNumber(binding.resultValue(result)) !== null;
      }
      probe = { validation, resultFinite };
    }

    const plan = planEquationAction(state, trigger, probe, { recalculationMode: mode });
    const { effects } = plan;

    if (effects.fieldErrors === 'clear') clearFieldErrors();
    else if (effects.fieldErrors === 'apply' && probe) applyFieldErrors(probe.validation);

    if (effects.clearOperands) binding.resetOperands(root);

    if (effects.compute && result != null) binding.renderResult(result, ctx);
    if (plan.next.status.state === 'invalid' && invalidMsg && probe) {
      invalidMsg.textContent = firstErrorText(probe.validation);
    }

    setStatus(plan.next.status);

    if (effects.announce === 'value' && result != null) announce(binding.describeResult(result));
    else if (effects.announce === 'error' && probe) announce(firstErrorText(probe.validation));
    else if (trigger.kind === 'reset') {
      lastAnnounced = '';
      if (live) live.textContent = '';
    }

    if (note) note.hidden = !effects.liveNote;

    if (effects.focus === 'firstInvalid') focusFirstInvalidField(root);
    else if (effects.focus === 'revealResult') revealResult(shell, { live: false, focus: true });
    else if (effects.focus === 'firstField') focusFirstField();

    state = plan.next;
  };

  const onSubmit = (e: Event) => {
    e.preventDefault();
    window.clearTimeout(debounceTimer);
    run({ kind: 'submit' });
  };
  const onInput = () => {
    // The visitor typing their own operand ends this equation's worked example
    // immediately — before the live gate, which is closed until the first calc.
    if (state.status.state === 'example') {
      window.clearTimeout(debounceTimer);
      run({ kind: 'dismissExample', source: 'input' });
      return;
    }
    if (!isLiveActive(mode, state.hasCalculated)) return;
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => run({ kind: 'input' }), LIVE_DEBOUNCE_MS);
  };
  const onReset = () => run({ kind: 'reset' });
  const onDismissExample = () => run({ kind: 'dismissExample', source: 'action' });

  form.addEventListener('submit', onSubmit);
  form.addEventListener('input', onInput);
  resetBtn?.addEventListener('click', onReset);
  const dismissBtns = Array.from(root.querySelectorAll<HTMLElement>('[data-example-dismiss]'));
  for (const btn of dismissBtns) btn.addEventListener('click', onDismissExample);

  return {
    destroy() {
      window.clearTimeout(settleTimer);
      window.clearTimeout(debounceTimer);
      form.removeEventListener('submit', onSubmit);
      form.removeEventListener('input', onInput);
      resetBtn?.removeEventListener('click', onReset);
      for (const btn of dismissBtns) btn.removeEventListener('click', onDismissExample);
    },
  };
}
