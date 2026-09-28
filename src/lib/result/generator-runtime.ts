/**
 * Generator calculator runtime (R4).
 *
 * A shared controller for EXPLICIT-OUTPUT generators: settings → an explicit
 * Generate action → one generated output, with optional strength/quality
 * interpretation, Copy and Reset. It owns the explicit-generation gate, the
 * stale-output behaviour on settings change, Copy availability, the single
 * restrained announcement (which NEVER carries output content), focus and reset.
 *
 * SCOPE: certified for explicit-output generators only (a settings form + a
 * Generate button + one output). It does NOT claim support for every generator
 * or random-data tool.
 *
 * Mirrors the form/equation runtimes: a PURE `planGeneratorAction` (unit-tested,
 * no DOM) + a thin `mountGeneratorCalculator` DOM executor. It reuses the shared
 * result state machine (@lib/result/state) and focus helpers; `stale` is NOT a
 * new global ResultState — it is generator metadata layered over `valid`.
 */
import { reduceResult, INITIAL_STATUS, type ResultStatus } from './state';
import { focusFirstInvalidField, revealResult } from './focus';

/* ------------------------------------------------------------------ */
/* Contracts                                                           */
/* ------------------------------------------------------------------ */

export type ValidationResult =
  | { ok: true }
  | { ok: false; fieldErrors?: Record<string, string>; formError?: string };

export interface GeneratorRenderContext {
  root: HTMLElement;
  result: HTMLElement;
}

export interface GeneratorBinding<S, O> {
  readSettings(root: HTMLElement): S;
  validateSettings(settings: S): ValidationResult;
  generate(settings: S): O;
  renderOutput(output: O, context: GeneratorRenderContext): void;
  /** Content-FREE announcement for a completed generation (never the output). */
  describeOutput(output: O): string;
  resetSettings(root: HTMLElement): void;
}

export interface GeneratorOptions {
  generateButtonLabel: string;
  regenerateButtonLabel?: string;
  liveRegeneration?: boolean;
  invalidateOutputOnSettingsChange?: boolean;
  /**
   * Opt in to a labelled worked EXAMPLE output on first load. `settings` are
   * example settings in the binding's own shape; the runtime generates from them
   * and calls `renderOutput`, so the example reuses the generator's OWN output
   * markup. The example is never announced, stored, logged or transmitted, and
   * it never counts as the visitor's first generation.
   */
  example?: { settings: unknown };
}

/* ------------------------------------------------------------------ */
/* Pure decision logic                                                 */
/* ------------------------------------------------------------------ */

export interface GeneratorMachineState {
  status: ResultStatus; // empty | valid | invalid (never a `stale` state)
  stale: boolean; // generator metadata layered over a valid result
  hasGenerated: boolean; // controls the Generate → Generate New label
}

export const INITIAL_GENERATOR_STATE: GeneratorMachineState = {
  status: INITIAL_STATUS,
  stale: false,
  hasGenerated: false,
};

export type GeneratorTrigger =
  | { kind: 'generate' }
  | { kind: 'settingsChange' }
  | { kind: 'reset' }
  /**
   * Render a labelled worked EXAMPLE output on mount, generated from example
   * settings the island supplies — never from the visitor's controls, which keep
   * their own defaults. Opt-in via the `example` option.
   */
  | { kind: 'showExample' }
  /**
   * Leave the example and hand the panel to the visitor: the explicit
   * "Start with my values" action, or their first settings change.
   */
  | { kind: 'dismissExample'; source: 'action' | 'input' };

export interface GeneratorProbe {
  validation: ValidationResult;
}

export interface GeneratorEffects {
  generate: boolean; // generate + renderOutput
  announce: 'generated' | 'stale' | 'error' | 'none';
  focus: 'firstInvalid' | 'revealOutput' | 'none';
  fieldErrors: 'apply' | 'clear' | 'none';
  copyEnabled: boolean; // Copy available only for a fresh valid output
  staleNote: boolean; // "Settings changed. Generate again to apply them."
  relabelGenerate: boolean; // true once a first output exists
  clearSettings: boolean;
}

export interface GeneratorPlan {
  next: GeneratorMachineState;
  effects: GeneratorEffects;
}

interface CoreEffects {
  generate: boolean;
  announce: GeneratorEffects['announce'];
  focus: GeneratorEffects['focus'];
  fieldErrors: GeneratorEffects['fieldErrors'];
  clearSettings: boolean;
}

// copyEnabled / staleNote / relabelGenerate are pure functions of `next`.
function build(next: GeneratorMachineState, core: CoreEffects): GeneratorPlan {
  return {
    next,
    effects: {
      ...core,
      copyEnabled: next.status.state === 'valid' && !next.stale,
      staleNote: next.stale,
      relabelGenerate: next.hasGenerated,
    },
  };
}

const NOOP_CORE: CoreEffects = {
  generate: false,
  announce: 'none',
  focus: 'none',
  fieldErrors: 'none',
  clearSettings: false,
};

/**
 * Pure planner. Explicit Generate is the only path that produces output; a
 * settings change never silently regenerates — it marks an existing output
 * stale (unless liveRegeneration is on). Never throws.
 */
export function planGeneratorAction(
  state: GeneratorMachineState,
  trigger: GeneratorTrigger,
  probe: GeneratorProbe | null,
  options: { liveRegeneration: boolean; invalidateOutputOnSettingsChange: boolean },
): GeneratorPlan {
  switch (trigger.kind) {
    case 'showExample':
      // The example is OURS, not the visitor's: silent, no focus move, and it does
      // NOT count as a generation (so the button keeps saying "Generate").
      if (!probe || !probe.validation.ok) {
        return build(INITIAL_GENERATOR_STATE, {
          generate: false, announce: 'none', focus: 'none', fieldErrors: 'clear', clearSettings: false,
        });
      }
      return build(
        { status: reduceResult(state.status, { type: 'showExample' }), stale: false, hasGenerated: false },
        { generate: true, announce: 'none', focus: 'none', fieldErrors: 'clear', clearSettings: false },
      );

    case 'dismissExample':
      // Protection: only an example can be dismissed.
      if (state.status.state !== 'example') {
        return build(state, {
          generate: false, announce: 'none', focus: 'none', fieldErrors: 'none', clearSettings: false,
        });
      }
      return build(
        { status: reduceResult(state.status, { type: 'reset' }), stale: false, hasGenerated: false },
        { generate: false, announce: 'none', focus: 'none', fieldErrors: 'clear', clearSettings: false },
      );

    case 'reset':
      return build(
        { status: reduceResult(state.status, { type: 'reset' }), stale: false, hasGenerated: false },
        { generate: false, announce: 'none', focus: 'none', fieldErrors: 'clear', clearSettings: true },
      );

    case 'generate': {
      if (!probe) return build(state, NOOP_CORE);
      if (probe.validation.ok) {
        return build(
          {
            status: reduceResult(state.status, { type: 'calculate', valid: true }),
            stale: false,
            hasGenerated: true,
          },
          { generate: true, announce: 'generated', focus: 'revealOutput', fieldErrors: 'clear', clearSettings: false },
        );
      }
      return build(
        {
          status: reduceResult(state.status, { type: 'calculate', valid: false }),
          stale: false,
          hasGenerated: state.hasGenerated,
        },
        { generate: false, announce: 'error', focus: 'firstInvalid', fieldErrors: 'apply', clearSettings: false },
      );
    }

    case 'settingsChange': {
      // Live regeneration is opt-in; the pilot keeps it off.
      if (options.liveRegeneration && probe) {
        return planGeneratorAction(state, { kind: 'generate' }, probe, options);
      }
      // Mark a fresh valid output stale (keep it visible, disable Copy). Empty,
      // invalid or already-stale states are unaffected.
      if (state.status.state === 'valid' && !state.stale && options.invalidateOutputOnSettingsChange) {
        return build(
          { status: { state: 'valid', activity: 'idle' }, stale: true, hasGenerated: true },
          { generate: false, announce: 'stale', focus: 'none', fieldErrors: 'none', clearSettings: false },
        );
      }
      return build(state, NOOP_CORE);
    }

    default:
      return build(state, NOOP_CORE);
  }
}

/* ------------------------------------------------------------------ */
/* DOM executor                                                        */
/* ------------------------------------------------------------------ */

const SETTLE_MS = 900;
const STALE_MESSAGE = 'Settings changed. Generate again to apply them.';
const COPIED_MESSAGE = 'Password copied.';
const COPY_FAIL_MESSAGE = 'Press Ctrl or Cmd + C to copy.';

export interface GeneratorRuntimeHandle {
  destroy(): void;
}

/**
 * Attach the runtime to a generator root. Expected markup contract:
 *   - a `<form data-form>` of settings with a submit button (Generate) and
 *     optional `[data-reset]`;
 *   - fields with `name` + matching `[data-error-for="<name>"]`;
 *   - a `[data-result-shell]` with valid/empty/invalid regions, a
 *     `[data-result-live]` output, a `[data-generator-output]` control holding
 *     the generated text, an optional `[data-copy]` button, an optional
 *     `[data-copy-confirm]` element and an optional `[data-stale-note]`.
 * The generated output is read from the DOM at copy time and is never announced,
 * stored, logged or transmitted by this runtime.
 */
export function mountGeneratorCalculator<S, O>(
  root: HTMLElement,
  binding: GeneratorBinding<S, O>,
  options: GeneratorOptions,
): GeneratorRuntimeHandle {
  const liveRegeneration = options.liveRegeneration ?? false;
  const invalidateOutputOnSettingsChange = options.invalidateOutputOnSettingsChange ?? true;
  const form = root.querySelector<HTMLFormElement>('[data-form]');
  const shell = root.querySelector<HTMLElement>('[data-result-shell]');
  if (!form || !shell) return { destroy() {} };

  const live = shell.querySelector<HTMLElement>('[data-result-live]');
  const invalidMsg = shell.querySelector<HTMLElement>('[data-result-invalid-message]');
  const staleNote = shell.querySelector<HTMLElement>('[data-stale-note]');
  const outputEl = shell.querySelector<HTMLInputElement | HTMLTextAreaElement>('[data-generator-output]');
  const copyBtn = shell.querySelector<HTMLButtonElement>('[data-copy]');
  const copyConfirm = shell.querySelector<HTMLElement>('[data-copy-confirm]');
  const generateBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const resetBtn = root.querySelector<HTMLButtonElement>('[data-reset]');
  const ctx: GeneratorRenderContext = { root, result: shell };

  let state = INITIAL_GENERATOR_STATE;
  let settleTimer = 0;
  let lastAnnounced = '';

  const setStatus = (next: GeneratorMachineState) => {
    shell.dataset.resultState = next.status.state;
    shell.dataset.resultActivity = next.status.activity;
    shell.dataset.stale = String(next.stale);
    if (next.status.activity === 'just-updated') {
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
    live.textContent = text; // NEVER the generated output
  };

  const firstErrorText = (v: ValidationResult): string => {
    if (v.ok) return 'Please check your settings.';
    if (v.formError) return v.formError;
    return (v.fieldErrors && Object.values(v.fieldErrors)[0]) ?? 'Please check your settings.';
  };

  const clearFieldErrors = () => {
    root.querySelectorAll<HTMLElement>('[data-error-for]').forEach((el) => {
      el.textContent = '';
      el.hidden = true;
    });
    root.querySelectorAll<HTMLElement>('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));
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
      const target =
        root.querySelector<HTMLElement>(`[name="${name}"]`) ??
        root.querySelector<HTMLElement>(`[data-field="${name}"] input, [data-field="${name}"] select`);
      if (target) target.setAttribute('aria-invalid', 'true');
    }
  };

  const clearOutput = () => {
    if (outputEl) outputEl.value = '';
  };

  const run = (trigger: GeneratorTrigger) => {
    let output: O | null = null;
    let probe: GeneratorProbe | null = null;

    if (trigger.kind !== 'reset' && trigger.kind !== 'dismissExample') {
      // The example generates from ITS OWN settings; every other trigger reads the
      // visitor's controls.
      const settings =
        trigger.kind === 'showExample'
          ? (options.example!.settings as S)
          : binding.readSettings(root);
      probe = { validation: binding.validateSettings(settings) };
      if (
        probe.validation.ok &&
        (trigger.kind === 'generate' || trigger.kind === 'showExample' || liveRegeneration)
      ) {
        output = binding.generate(settings);
      }
    }

    const plan = planGeneratorAction(state, trigger, probe, {
      liveRegeneration,
      invalidateOutputOnSettingsChange,
    });
    const { effects } = plan;

    if (effects.fieldErrors === 'clear') clearFieldErrors();
    else if (effects.fieldErrors === 'apply' && probe) applyFieldErrors(probe.validation);

    if (effects.clearSettings) binding.resetSettings(root);

    if (effects.generate && output != null) binding.renderOutput(output, ctx);
    // Never leave a generated value in the DOM when the result is not a fresh
    // valid output (reset / invalid). Stale keeps the last output visible.
    if (plan.next.status.state !== 'valid') clearOutput();

    if (plan.next.status.state === 'invalid' && invalidMsg && probe) {
      invalidMsg.textContent = firstErrorText(probe.validation);
    }

    setStatus(plan.next);

    if (copyBtn) {
      copyBtn.disabled = !effects.copyEnabled;
      copyBtn.setAttribute('aria-disabled', String(!effects.copyEnabled));
    }
    if (staleNote) staleNote.hidden = !effects.staleNote;
    if (generateBtn) {
      generateBtn.textContent =
        effects.relabelGenerate && options.regenerateButtonLabel
          ? options.regenerateButtonLabel
          : options.generateButtonLabel;
    }
    if (copyConfirm && !effects.copyEnabled) copyConfirm.hidden = true;

    if (effects.announce === 'generated' && output != null) announce(binding.describeOutput(output));
    else if (effects.announce === 'stale') announce(STALE_MESSAGE);
    else if (effects.announce === 'error' && probe) announce(firstErrorText(probe.validation));
    else if (trigger.kind === 'reset') {
      lastAnnounced = '';
      if (live) live.textContent = '';
    }

    if (effects.focus === 'firstInvalid') focusFirstInvalidField(root);
    else if (effects.focus === 'revealOutput') revealResult(shell, { live: false, focus: false });

    state = plan.next;
  };

  const onSubmit = (e: Event) => {
    e.preventDefault();
    run({ kind: 'generate' });
  };
  const onSettings = () => run({ kind: 'settingsChange' });
  const onReset = () => run({ kind: 'reset' });

  const onCopy = async () => {
    if (!copyBtn || copyBtn.disabled || !outputEl) return;
    const text = outputEl.value; // read transiently — never stored or logged
    if (!text) return;
    const confirm = (msg: string) => {
      if (copyConfirm) {
        copyConfirm.textContent = msg;
        copyConfirm.hidden = false;
      }
    };
    try {
      await navigator.clipboard.writeText(text);
      confirm('Copied');
      announce(COPIED_MESSAGE); // announce the ACTION, never the password
    } catch {
      outputEl.focus();
      outputEl.select();
      confirm('Select all, then copy');
      announce(COPY_FAIL_MESSAGE);
    }
  };

  // Changing a setting while the example shows ends it, rather than marking the
  // example stale — the example was never the visitor's output to invalidate.
  const onSettingsOrDismiss = () => {
    if (state.status.state === 'example') {
      run({ kind: 'dismissExample', source: 'input' });
      return;
    }
    onSettings();
  };
  const onDismissExample = () => run({ kind: 'dismissExample', source: 'action' });

  form.addEventListener('submit', onSubmit);
  form.addEventListener('input', onSettingsOrDismiss);
  form.addEventListener('change', onSettingsOrDismiss);
  resetBtn?.addEventListener('click', onReset);
  copyBtn?.addEventListener('click', onCopy);
  const dismissBtns = Array.from(root.querySelectorAll<HTMLElement>('[data-example-dismiss]'));
  for (const btn of dismissBtns) btn.addEventListener('click', onDismissExample);

  // Render the worked example once, AFTER wiring.
  if (options.example) run({ kind: 'showExample' });

  return {
    destroy() {
      window.clearTimeout(settleTimer);
      form.removeEventListener('submit', onSubmit);
      form.removeEventListener('input', onSettingsOrDismiss);
      form.removeEventListener('change', onSettingsOrDismiss);
      resetBtn?.removeEventListener('click', onReset);
      copyBtn?.removeEventListener('click', onCopy);
      for (const btn of dismissBtns) btn.removeEventListener('click', onDismissExample);
    },
  };
}
