import { describe, it, expect, vi } from 'vitest';
import { mapKey, applyAct, targetBlocksKeyboard } from './keyboard';

describe('mapKey', () => {
  it('maps digits, dot and operators', () => {
    expect(mapKey('7')).toEqual({ kind: 'digit', value: '7' });
    expect(mapKey('.')).toEqual({ kind: 'dot' });
    expect(mapKey('+')).toEqual({ kind: 'op', value: '+' });
    expect(mapKey('*')).toEqual({ kind: 'op', value: '*' });
    expect(mapKey('^')).toEqual({ kind: 'op', value: '^' });
  });
  it('maps control keys', () => {
    expect(mapKey('Enter')).toEqual({ kind: 'equals' });
    expect(mapKey('=')).toEqual({ kind: 'equals' });
    expect(mapKey('Backspace')).toEqual({ kind: 'back' });
    expect(mapKey('Escape')).toEqual({ kind: 'clear' });
    expect(mapKey('%')).toEqual({ kind: 'percent' });
  });
  it('ignores non-calculator keys', () => {
    expect(mapKey('a')).toBeNull();
    expect(mapKey('Tab')).toBeNull();
    expect(mapKey('ArrowLeft')).toBeNull();
  });
});

describe('applyAct dispatches to the engine', () => {
  it('calls the matching engine method', () => {
    const engine = {
      inputDigit: vi.fn(), inputDot: vi.fn(), inputOp: vi.fn(), inputToken: vi.fn(),
      equals: vi.fn(), clear: vi.fn(), negate: vi.fn(), percent: vi.fn(), recallAns: vi.fn(), backspace: vi.fn(),
    } as any;
    applyAct(engine, { kind: 'digit', value: '5' });
    applyAct(engine, { kind: 'op', value: '/' });
    applyAct(engine, { kind: 'equals' });
    applyAct(engine, { kind: 'back' });
    applyAct(engine, { kind: 'percent' });
    applyAct(engine, { kind: 'negate' });
    expect(engine.inputDigit).toHaveBeenCalledWith('5');
    expect(engine.inputOp).toHaveBeenCalledWith('/');
    expect(engine.equals).toHaveBeenCalledOnce();
    expect(engine.backspace).toHaveBeenCalledOnce();
    expect(engine.percent).toHaveBeenCalledOnce();
    expect(engine.negate).toHaveBeenCalledOnce();
  });
});

describe('keyboard isolation', () => {
  const root = { contains: (el: unknown) => el === 'inside' } as unknown as Element;
  it('ignores other form controls and search', () => {
    expect(targetBlocksKeyboard({ tagName: 'INPUT' } as any, root)).toBe(true);
    expect(targetBlocksKeyboard({ tagName: 'TEXTAREA' } as any, root)).toBe(true);
    expect(targetBlocksKeyboard({ tagName: 'SELECT' } as any, root)).toBe(true);
    expect(targetBlocksKeyboard({ tagName: 'DIV', isContentEditable: true } as any, root)).toBe(true);
    expect(targetBlocksKeyboard({ tagName: 'INPUT', getAttribute: () => 'searchbox' } as any, root)).toBe(true);
  });
  it('does not block the calculator’s own controls or plain body', () => {
    // Our own display/keys (root.contains → true) are allowed through.
    expect(targetBlocksKeyboard('inside' as any, root)).toBe(false);
    expect(targetBlocksKeyboard(null, root)).toBe(false);
    expect(targetBlocksKeyboard({ tagName: 'BODY' } as any, root)).toBe(false);
  });
});
