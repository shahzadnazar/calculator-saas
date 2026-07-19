/**
 * DEV-ONLY demo controller for /dev/result.
 *
 * It drives the shared result primitives through the *real* state machine
 * (@lib/result/state) so the isolated demo exercises exactly the logic a future
 * calculator runtime will use — but with NO formula, NO field bindings and NO
 * live input listeners. Buttons dispatch synthetic events; the controller
 * reduces them, flips the shell's `data-result-state` / `data-result-activity`,
 * writes the single announcement, and manages the transient settle/computed
 * timers. This file must never ship to a public page.
 */
import {
  reduceResult,
  resultAnnouncement,
  accessibleResultName,
  type ResultStatus,
  type ResultState,
  type ResultActivity,
  type ResultEvent,
} from '@lib/result/state';
import { revealResult, focusFirstInvalidField } from '@lib/result/focus';

const SETTLE_MS = 900;
const COMPUTE_MS = 500;

type Action =
  | 'calculate-valid'
  | 'calculate-invalid'
  | 'live'
  | 'live-perceptible'
  | 'live-invalid'
  | 'example'
  | 'reset';

const EVENT_FOR: Record<Action, ResultEvent> = {
  'calculate-valid': { type: 'calculate', valid: true },
  'calculate-invalid': { type: 'calculate', valid: false },
  live: { type: 'liveUpdate', valid: true },
  'live-perceptible': { type: 'liveUpdate', valid: true, perceptible: true },
  'live-invalid': { type: 'liveUpdate', valid: false },
  example: { type: 'showExample' },
  reset: { type: 'reset' },
};

function readStatus(shell: HTMLElement): ResultStatus {
  return {
    state: (shell.dataset.resultState as ResultState) ?? 'empty',
    activity: (shell.dataset.resultActivity as ResultActivity) ?? 'idle',
  };
}

function setupDemo(root: HTMLElement): void {
  const shell = root.querySelector<HTMLElement>('[data-result-shell]');
  if (!shell) return;
  const live = shell.querySelector<HTMLElement>('[data-result-live]');
  // The primary value lives in the valid region; scope to it so an example
  // region's value (if any) is never mistaken for the visitor's result.
  const validRegion = shell.querySelector<HTMLElement>('[data-result-when~="valid"]');
  const valueEl = (validRegion ?? shell).querySelector<HTMLElement>('[data-result-value]');
  const a11yEl = (validRegion ?? shell).querySelector<HTMLElement>('[data-result-value-a11y]');
  // Demo config lives on the demo root so ResultShell stays a pure primitive.
  const unit = root.dataset.demoUnit || '';
  const base = Number(root.dataset.demoBase || '22.4');
  const errorLabel = root.dataset.demoError || undefined;

  let status = readStatus(shell);
  let tick = 0;
  // Per-root timer token: bumping it invalidates any in-flight settle/compute.
  let token = 0;

  const paint = (nextValue?: string) => {
    shell.dataset.resultState = status.state;
    shell.dataset.resultActivity = status.activity;
    if (nextValue != null && valueEl) {
      valueEl.textContent = nextValue;
      if (a11yEl) a11yEl.textContent = accessibleResultName(nextValue, unit);
    }
    // Exactly one announcement per completed result or error; silent otherwise.
    const message = resultAnnouncement(status, {
      valueLabel: valueEl ? accessibleResultName(valueEl.textContent || '', unit) : undefined,
      errorLabel,
    });
    if (message && live) live.textContent = message;
  };

  const send = (event: ResultEvent) => {
    token += 1;
    const mine = token;
    const prev = status;
    status = reduceResult(prev, event);
    if (status === prev && status.state === prev.state && status.activity === prev.activity) {
      // Ignored event (e.g. liveUpdate before first valid) — nothing to do.
      return;
    }

    // Fake a fresh value so the just-updated highlight is perceptible. No real
    // formula — the demo only needs the number to visibly change.
    let nextValue: string | undefined;
    if (status.state === 'valid') {
      tick += 1;
      nextValue = (base + tick * 0.1).toFixed(1);
    }
    paint(nextValue);

    // Focus rules, exercised without a real form.
    if (status.state === 'invalid') {
      focusFirstInvalidField(root);
    } else if (event.type === 'calculate' && status.state === 'valid') {
      revealResult(shell, { live: false });
    }

    // Transient lifecycle.
    if (status.activity === 'calculating') {
      window.setTimeout(() => {
        if (mine !== token) return;
        status = reduceResult(status, { type: 'computed' });
        paint();
        scheduleSettle(mine);
      }, COMPUTE_MS);
    } else if (status.activity === 'just-updated') {
      scheduleSettle(mine);
    }
  };

  const scheduleSettle = (mine: number) => {
    window.setTimeout(() => {
      if (mine !== token) return;
      status = reduceResult(status, { type: 'settle' });
      paint();
    }, SETTLE_MS);
  };

  root.querySelectorAll<HTMLButtonElement>('[data-demo-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.demoAction as Action;
      const event = EVENT_FOR[action];
      if (event) send(event);
    });
  });
}

document.querySelectorAll<HTMLElement>('[data-result-demo]').forEach(setupDemo);
