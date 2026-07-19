/**
 * Physical-calculator island controller. Instantiates the shared engine, wires
 * the keypad (click delegation), the display, the backspace control, the
 * mode/angle switches and the isolated keyboard, and renders the view. Mode
 * switching preserves all engine state (expression, value, Ans, angle).
 */
import { createEngine, type Feature } from '@lib/calc/engine';
import { applyAct, attachKeyboard } from '@lib/calc/keyboard';
import type { KeyAct } from '@lib/calc/keys';

export function mount(root: Element): void {
  const el = root as HTMLElement;
  const defaultMode: Feature = el.dataset.defaultMode === 'scientific' ? 'scientific' : 'basic';
  const engine = createEngine({ feature: defaultMode, angle: 'deg' });

  const q = <T extends Element>(sel: string) => root.querySelector<T>(sel);
  const sub = q<HTMLElement>('[data-calc-sub]')!;
  const mainEl = q<HTMLElement>('[data-calc-main]')!;
  const live = q<HTMLElement>('[data-calc-live]')!;
  const displayEl = q<HTMLElement>('[data-calc-display]')!;
  const sciPanel = q<HTMLElement>('[data-sci-panel]');
  const modeSwitch = q<HTMLElement>('[data-mode-switch]');
  const angleSwitch = q<HTMLElement>('[data-angle-switch]');

  function render(): void {
    const v = engine.view();
    sub.textContent = v.sub || ' ';
    mainEl.textContent = v.main;
    displayEl.setAttribute('data-display-state', v.error ? 'error' : v.sub || v.main !== '0' ? 'active' : 'empty');
    // Announce ONLY a completed result or an error (engine sets `announce` only then).
    live.textContent = v.announce ?? '';
  }

  // Keypad clicks (delegated) → engine action.
  root.querySelectorAll('.keypad').forEach((kp) => {
    kp.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('.calc-key');
      if (!btn?.dataset.act) return;
      applyAct(engine, JSON.parse(btn.dataset.act) as KeyAct);
      render();
    });
  });

  // Backspace beside the display.
  q<HTMLButtonElement>('[data-calc-back]')?.addEventListener('click', () => {
    engine.backspace();
    render();
  });

  // Basic/Scientific switch — visible keypad only; engine state preserved.
  const activate = (group: HTMLElement, btn: HTMLButtonElement) => {
    group.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach((x) => {
      const on = x === btn;
      x.classList.toggle('is-active', on);
      x.setAttribute('aria-checked', String(on));
    });
  };
  modeSwitch?.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach((b) => {
    b.addEventListener('click', () => {
      const mode = (b.dataset.mode as Feature) ?? 'basic';
      engine.setFeature(mode); // preserves expression/value/Ans/angle
      activate(modeSwitch, b);
      // Reveal the function panel above the (unchanged, still-visible) Basic keypad.
      if (sciPanel) sciPanel.hidden = mode !== 'scientific';
      // Deg/Rad appears without shifting layout (visibility, reserved space).
      if (angleSwitch) angleSwitch.classList.toggle('is-hidden', mode !== 'scientific');
      render();
    });
  });

  // Angle mode (scientific).
  angleSwitch?.querySelectorAll<HTMLButtonElement>('.seg-btn').forEach((b) => {
    b.addEventListener('click', () => {
      engine.setAngle(b.dataset.angle === 'rad' ? 'rad' : 'deg');
      activate(angleSwitch, b);
      render();
    });
  });

  // Physical keyboard (isolated; only the active instance responds).
  attachKeyboard(root, engine, render);

  render();
}

// Auto-mount every instance on the page (Astro dedupes this module).
document.querySelectorAll('[data-physical-calculator]').forEach((el) => mount(el));
