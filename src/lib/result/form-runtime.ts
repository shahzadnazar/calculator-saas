/**
 * Standard-form calculator runtime (R2).
 *
 * A shared controller for the SIMPLEST calculator family: a single form whose
 * fields produce one result object. It owns everything that is easy to get
 * subtly wrong and must be identical across calculators — the first-calculation
 * gate, the result state machine, live-after-first recalculation, Calculate /
 * Reset, form- and field-level validation, the single result announcement, and
 * the focus / scroll decisions — so a per-calculator binding stays tiny and
 * declares only its own reading, validation, computation and rendering.
 *
 * SCOPE: this runtime is validated for standard one-form calculators only. It
 * does NOT yet claim support for two-way converters, date/duration tools,
 * dynamic-row calculators, multi-mode calculators, financial schedules or
 * specialized reports — each must be validated before binding to it.
 *
 * The decision logic (`planFormAction`) is a PURE function of the machine state,
 * the trigger and a validation/finiteness probe, so it is unit-tested without a
 * DOM. `mountFormCalculator` is the thin DOM executor that runs a plan.
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

export type ResetMode = 'personal' | 'all';

export type ValidationResult =
  | { ok: true }
  | { ok: false; fieldErrors?: Record<string, string>; formError?: string };

export type RecalculationMode = 'explicit' | 'live-after-first' | 'always-live';

export interface FormRenderContext {
  /** The calculator root element. */
  root: HTMLElement;
  /** The ResultShell element (`[data-result-shell]`) to render the result into. */
  result: HTMLElement;
}

/**
 * Transition-aware result-description context (R7C-2D.1). Passed to
 * `describeResult` so a binding can compare the new result against the previous
 * valid one WITHOUT any module-global state. The previous-result cell lives in each
 * mounted instance's closure (see `createResultDescriptionTracker`), so two mounted
 * copies of the same calculator never share announcement state.
 */
export interface ResultDescriptionContext<R> {
  /** `first-result` for the first valid result since mount or reset; else `live-update`. */
  phase: 'first-result' | 'live-update';
  /** The previous valid computed result — absent on the first result. */
  previousResult?: R;
}

/** Per-instance tracker of the previous valid result, for transition-aware
 *  descriptions. One is created per `mountFormCalculator` call, so its state is
 *  never shared between mounted instances. */
export interface ResultDescriptionTracker<R> {
  /** The context to describe the next result, given what has been committed so far. */
  context(): ResultDescriptionContext<R>;
  /** Record a valid result as the new previous (after a successful compute). */
  commit(result: R): void;
  /** Forget the previous result (on reset). */
  reset(): void;
}

export function createResultDescriptionTracker<R>(): ResultDescriptionTracker<R> {
  let previousResult: R | null = null;
  return {
    context() {
      return previousResult === null
        ? { phase: 'first-result' }
        : { phase: 'live-update', previousResult };
    },
    commit(result: R) {
      previousResult = result;
    },
    reset() {
      previousResult = null;
    },
  };
}

export interface FormCalculatorBinding<V, R> {
  /** Read the current raw field values from the DOM. */
  readValues(root: HTMLElement): V;
  /** Validate values BEFORE computing. Pure — no DOM. */
  validate(values: V): ValidationResult;
  /** Compute the result from valid values. Pure — no DOM. */
  compute(values: V): R;
  /** Fill the valid-region DOM with the result (format at this boundary). */
  renderResult(result: R, context: FormRenderContext): void;
  /** Accessible one-line announcement for a completed valid result. Pure. The
   *  context carries the phase + previous valid result so transition-aware
   *  calculators (ideal-weight sex change, target-heart-rate method change) need no
   *  module state. Bindings that ignore transitions may take just `(result)`. */
  describeResult(result: R, context: ResultDescriptionContext<R>): string;
  /** The primary magnitude the runtime guards for finiteness (never NaN/∞). Pure.
   *  Consulted only under the DEFAULT usability gate — a binding that provides
   *  `isUsableResult` takes over the gate and `resultValue` is not probed. */
  resultValue(result: R): number;
  /** Optional widening of the success gate. By DEFAULT the runtime treats a result
   *  as usable iff `resultValue(result)` is a finite number, so a non-finite value
   *  renders as an input error. A calculator whose meaningful result is deliberately
   *  non-numeric — e.g. an "impossible" informational outcome — may override this to
   *  mark such results usable, so the shell renders them in the VALID region instead.
   *  Malformed / uncomputable results must still return `false`. Pure — no DOM. */
  isUsableResult?(result: R): boolean;
  /** Clear personal values (`personal`) or everything incl. structure (`all`). */
  resetValues(root: HTMLElement, mode: ResetMode): void;
  /** Convert entered values in place on a unit change. Optional. */
  convertValues?(root: HTMLElement, fromUnit: string, toUnit: string): void;
}

export interface FormCalculatorOptions {
  recalculationMode?: RecalculationMode;
  /** Task-specific primary label, e.g. "Calculate BMI". */
  calculateButtonLabel: string;
  persistStructuralPreferences?: boolean;
}

/**
 * The usability gate for a computed result: a binding's `isUsableResult` when it
 * provides one, else the DEFAULT guard that the primary `resultValue` is finite.
 * Pure and shared by the DOM executor, so the widening is unit-testable without a
 * DOM. The default is exactly the historical behaviour — every binding that does
 * not implement the hook keeps the finite-number guard unchanged.
 */
export function isResultUsable<V, R>(binding: FormCalculatorBinding<V, R>, result: R): boolean {
  return binding.isUsableResult
    ? binding.isUsableResult(result)
    : sanitizeResultNumber(binding.resultValue(result)) !== null;
}

/* ------------------------------------------------------------------ */
/* Pure decision logic                                                 */
/* ------------------------------------------------------------------ */

export interface FormMachineState {
  status: ResultStatus;
  /** True once a first successful calculation has happened (the live gate). */
  hasCalculated: boolean;
}

export const INITIAL_FORM_STATE: FormMachineState = {
  status: INITIAL_STATUS,
  hasCalculated: false,
};

export type FormTrigger =
  | { kind: 'submit' } // explicit Calculate
  | { kind: 'input' } // a field changed
  | { kind: 'unit' } // the unit system changed (structural)
  | { kind: 'reset' };

export interface FormProbe {
  validation: ValidationResult;
  /** Whether the computed result passed the usability gate — a finite primary
   *  value by default, or whatever a binding's `isUsableResult` accepts (which may
   *  include a deliberately non-finite informational result). Only meaningful when
   *  valid. */
  resultUsable: boolean;
}

export interface FormEffects {
  /** Compute + render the result into the valid region. */
  compute: boolean;
  /** What to announce (the executor supplies the text). */
  announce: 'value' | 'error' | 'none';
  /** Where focus should go. */
  focus: 'firstInvalid' | 'revealResult' | 'none';
  /** Desired visibility of the "Changes update automatically." note. */
  liveNote: boolean;
  /** Apply field errors from validation, clear them, or leave them untouched. */
  fieldErrors: 'apply' | 'clear' | 'none';
  /** Reset personal values. */
  clearValues: boolean;
}

export interface FormPlan {
  next: FormMachineState;
  effects: FormEffects;
}

function noop(state: FormMachineState, liveNote: boolean): FormPlan {
  return {
    next: state,
    effects: {
      compute: false,
      announce: 'none',
      focus: 'none',
      liveNote,
      fieldErrors: 'none',
      clearValues: false,
    },
  };
}

/** Live recalculation is active in always-live, or in live-after-first once a
 *  first successful calculation has occurred. Never before the first calc. */
export function isLiveActive(mode: RecalculationMode, hasCalculated: boolean): boolean {
  return mode === 'always-live' || (mode === 'live-after-first' && hasCalculated);
}

/**
 * Pure planner. Given the current machine state, a trigger and (for compute
 * triggers) a validation/finiteness probe, decide the next state and the side
 * effects the executor must run. Never throws; unknown situations degrade to a
 * safe no-op rather than a fabricated result.
 */
export function planFormAction(
  state: FormMachineState,
  trigger: FormTrigger,
  probe: FormProbe | null,
  options: { recalculationMode: RecalculationMode },
): FormPlan {
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
          clearValues: true,
        },
      };

    case 'submit': {
      if (!probe) return noop(state, noteAfterCalc(state.hasCalculated));
      const success = probe.validation.ok && probe.resultUsable;
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
            clearValues: false,
          },
        };
      }
      // Invalid inputs, or (defensively) a non-finite result from valid inputs.
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
          clearValues: false,
        },
      };
    }

    case 'unit':
    case 'input': {
      // A unit change before the first calculation is purely structural — it is
      // never the first calculation and must not compute or announce.
      if (trigger.kind === 'unit' && !state.hasCalculated) {
        return noop(state, false);
      }
      // Before the first calc (or in explicit mode), field edits do nothing.
      if (!isLiveActive(mode, state.hasCalculated)) {
        return noop(state, noteAfterCalc(state.hasCalculated));
      }
      if (!probe) return noop(state, noteAfterCalc(state.hasCalculated));

      const success = probe.validation.ok && probe.resultUsable;
      if (success) {
        // valid → valid is a live update; recovering invalid/empty → valid uses
        // calculate semantics (liveUpdate is ignored unless already valid).
        const status =
          state.status.state === 'valid'
            ? reduceResult(state.status, { type: 'liveUpdate', valid: true })
            : reduceResult(state.status, { type: 'calculate', valid: true });
        return {
          next: { status, hasCalculated: true },
          effects: {
            compute: true,
            announce: 'value',
            focus: 'none', // live updates never move focus or scroll
            liveNote: mode !== 'explicit',
            fieldErrors: 'clear',
            clearValues: false,
          },
        };
      }
      // Became invalid while live: switch to invalid guidance, drop the stale
      // value, do not move focus.
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
          clearValues: false,
        },
      };
    }

    default:
      return noop(state, noteAfterCalc(state.hasCalculated));
  }
}

/* ------------------------------------------------------------------ */
/* DOM executor                                                        */
/* ------------------------------------------------------------------ */

const SETTLE_MS = 900;
const LIVE_DEBOUNCE_MS = 180;
const NON_FINITE_MESSAGE = 'This combination can’t be calculated. Please check your values.';

export interface FormRuntimeHandle {
  destroy(): void;
}

/**
 * Attach the runtime to a calculator root. Expects the R2 markup contract:
 *   - a `<form data-form>` with a submit button (Calculate) and `[data-reset]`;
 *   - fields with `name` + a matching `[data-error-for="<name>"]` element;
 *   - a `[data-result-shell]` (ResultShell) hosting the valid/empty/invalid
 *     regions and a `[data-result-live]` output;
 *   - an optional `[data-live-note]` element;
 *   - optional unit radios `[data-unit]` with `[data-group="<unit>"]` panels.
 */
export function mountFormCalculator<V, R>(
  root: HTMLElement,
  binding: FormCalculatorBinding<V, R>,
  options: FormCalculatorOptions,
): FormRuntimeHandle {
  const mode: RecalculationMode = options.recalculationMode ?? 'live-after-first';
  const form = root.querySelector<HTMLFormElement>('[data-form]');
  const shell = root.querySelector<HTMLElement>('[data-result-shell]');
  if (!form || !shell) return { destroy() {} };

  const live = shell.querySelector<HTMLElement>('[data-result-live]');
  const note = root.querySelector<HTMLElement>('[data-live-note]');
  const invalidMsg = shell.querySelector<HTMLElement>('[data-result-invalid-message]');
  const resetBtn = root.querySelector<HTMLButtonElement>('[data-reset]');
  const ctx: FormRenderContext = { root, result: shell };

  let state = INITIAL_FORM_STATE;
  let settleTimer = 0;
  let debounceTimer = 0;
  let lastAnnounced = '';
  // Per-instance previous-result tracker — transition-aware descriptions with no
  // module-global state, so two mounted copies stay isolated.
  const description = createResultDescriptionTracker<R>();

  /* -- unit (structural) state -------------------------------------- */

  const activeUnitEl = root.querySelector<HTMLElement>(
    '[data-unit].is-active, [data-unit][aria-checked="true"]',
  );
  let currentUnit = activeUnitEl?.dataset.unit;
  const defaultUnit = currentUnit; // the safe structural default restored on reset

  const selectUnit = (nextUnit: string, convert: boolean) => {
    const from = currentUnit;
    root.querySelectorAll<HTMLElement>('[data-unit]').forEach((b) => {
      const on = b.dataset.unit === nextUnit;
      b.classList.toggle('is-active', on);
      if (b.hasAttribute('aria-checked')) b.setAttribute('aria-checked', String(on));
    });
    root.querySelectorAll<HTMLElement>('[data-group]').forEach((g) => {
      g.hidden = g.dataset.group !== nextUnit;
    });
    if (convert && from && from !== nextUnit && binding.convertValues) {
      binding.convertValues(root, from, nextUnit);
    }
    currentUnit = nextUnit;
  };

  /* -- small DOM helpers -------------------------------------------- */

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
    if (!live) return;
    if (text === lastAnnounced) return; // never repeat the same message
    lastAnnounced = text;
    live.textContent = text;
  };

  const firstErrorText = (v: ValidationResult): string => {
    if (v.ok) return NON_FINITE_MESSAGE;
    if (v.formError) return v.formError;
    const first = v.fieldErrors && Object.values(v.fieldErrors)[0];
    return first ?? 'Please check the values entered.';
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
      // Mark the field's control(s) invalid. Prefer a named control, else the
      // first control inside a `[data-field="<name>"]` wrapper.
      const named = root.querySelector<HTMLElement>(`[name="${name}"]`);
      const target =
        named ?? root.querySelector<HTMLElement>(`[data-field="${name}"] input, [data-field="${name}"] select`);
      if (target) target.setAttribute('aria-invalid', 'true');
    }
  };

  /* -- run a plan --------------------------------------------------- */

  const run = (trigger: FormTrigger) => {
    let result: R | null = null;
    let probe: FormProbe | null = null;

    if (trigger.kind !== 'reset') {
      const values = binding.readValues(root);
      const validation = binding.validate(values);
      let resultUsable = false;
      if (validation.ok) {
        result = binding.compute(values);
        // Default gate: the primary value must be finite. A binding may widen it
        // (isUsableResult) to accept a deliberately non-numeric informational result.
        resultUsable = isResultUsable(binding, result);
      }
      probe = { validation, resultUsable };
    }

    const plan = planFormAction(state, trigger, probe, { recalculationMode: mode });
    const { effects } = plan;

    // 1. Field errors.
    if (effects.fieldErrors === 'clear') clearFieldErrors();
    else if (effects.fieldErrors === 'apply' && probe) applyFieldErrors(probe.validation);

    // 2. Reset personal values + restore the safe structural (unit) default.
    if (effects.clearValues) binding.resetValues(root, 'personal');
    if (trigger.kind === 'reset' && defaultUnit && currentUnit !== defaultUnit) {
      selectUnit(defaultUnit, false); // values already cleared — no conversion
    }

    // 3. Render the result / invalid guidance.
    if (effects.compute && result != null) {
      binding.renderResult(result, ctx);
    }
    if (plan.next.status.state === 'invalid' && invalidMsg && probe) {
      invalidMsg.textContent = firstErrorText(probe.validation);
    }

    // 4. Commit the state to the shell.
    setStatus(plan.next.status);

    // 5. Announce (exactly once per distinct message). The description context is
    //    read BEFORE committing this result, so a transition-aware binding compares
    //    against the correct previous valid result.
    if (effects.announce === 'value' && result != null) {
      announce(binding.describeResult(result, description.context()));
    } else if (effects.announce === 'error' && probe) {
      announce(firstErrorText(probe.validation));
    } else if (trigger.kind === 'reset') {
      lastAnnounced = '';
      if (live) live.textContent = '';
    }

    // 5b. Track the previous valid result per instance. Reset forgets it; an invalid
    //     update leaves the last valid result intact (never a false transition).
    if (trigger.kind === 'reset') description.reset();
    else if (effects.compute && result != null) description.commit(result);

    // 6. Live note.
    if (note) note.hidden = !effects.liveNote;

    // 7. Focus / scroll.
    if (effects.focus === 'firstInvalid') focusFirstInvalidField(root);
    else if (effects.focus === 'revealResult') revealResult(shell, { live: false, focus: true });

    state = plan.next;
  };

  /* -- wiring ------------------------------------------------------- */

  const onSubmit = (e: Event) => {
    e.preventDefault();
    window.clearTimeout(debounceTimer);
    run({ kind: 'submit' });
  };

  const onInput = () => {
    if (!isLiveActive(mode, state.hasCalculated)) return; // cheap gate before debounce
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => run({ kind: 'input' }), LIVE_DEBOUNCE_MS);
  };

  const onReset = () => run({ kind: 'reset' });

  form.addEventListener('submit', onSubmit);
  form.addEventListener('input', onInput);
  resetBtn?.addEventListener('click', onReset);

  // Unit switching: convert entered values in place, then recalculate live only
  // if a first calculation has already happened (the planner enforces this).
  root.querySelectorAll<HTMLElement>('[data-unit]').forEach((r) => {
    r.addEventListener('click', () => {
      const u = r.dataset.unit;
      if (!u || u === currentUnit) return;
      selectUnit(u, true);
      run({ kind: 'unit' });
    });
  });

  return {
    destroy() {
      window.clearTimeout(settleTimer);
      window.clearTimeout(debounceTimer);
      form.removeEventListener('submit', onSubmit);
      form.removeEventListener('input', onInput);
      resetBtn?.removeEventListener('click', onReset);
    },
  };
}
