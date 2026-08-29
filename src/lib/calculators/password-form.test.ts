import { describe, expect, it, vi } from 'vitest';
import {
  validateSettings,
  generate,
  formatBits,
  describeOutput,
  DEFAULTS,
  PASSWORD_EXAMPLE_SETTINGS,
  MSG,
  type PasswordSettings,
} from './password-form';
import { AMBIGUOUS, BRACKETS, buildPool, MAX_LENGTH } from './password-generator';

const settings = (over: Partial<PasswordSettings> = {}): PasswordSettings => ({ ...DEFAULTS, ...over });

const errors = (s: PasswordSettings): Record<string, string> => {
  const result = validateSettings(s);
  return result.ok ? {} : (result.fieldErrors ?? {});
};

describe('validateSettings', () => {
  it('accepts the defaults', () => {
    expect(validateSettings(DEFAULTS).ok).toBe(true);
  });

  it('rejects a length outside the supported range', () => {
    expect(errors(settings({ length: 3 })).length).toBe(MSG.lengthRange);
    expect(errors(settings({ length: MAX_LENGTH + 1 })).length).toBe(MSG.lengthRange);
    expect(errors(settings({ length: Number.NaN })).length).toBe(MSG.lengthRange);
    expect(errors(settings({ length: 12.5 })).length).toBe(MSG.lengthRange);
  });

  it('accepts the ends of the range', () => {
    expect(validateSettings(settings({ length: 4 })).ok).toBe(true);
    expect(validateSettings(settings({ length: MAX_LENGTH })).ok).toBe(true);
  });

  it('rejects an empty selection of character types', () => {
    const s = settings({ lower: false, upper: false, digits: false, symbols: false });
    expect(errors(s).charsets).toBe(MSG.noCharsets);
  });

  /**
   * Every class survives both exclusions with characters to spare — even digits, the smallest, keep
   * eight of ten. So no combination of the checkboxes can leave nothing to draw from, and picking
   * any single type is always accepted. MSG.everythingExcluded stays as a guard in case the
   * excluded sets ever grow.
   */
  it('accepts any single character type, both exclusions on', () => {
    const only = (name: 'lower' | 'upper' | 'digits' | 'symbols') =>
      settings({ lower: false, upper: false, digits: false, symbols: false, [name]: true, length: 8 });
    for (const name of ['lower', 'upper', 'digits', 'symbols'] as const) {
      expect(validateSettings(only(name)).ok).toBe(true);
      expect(buildPool(only(name)).length).toBeGreaterThan(0);
    }
  });

  it('rejects a password longer than the pool when repeats are off', () => {
    const s = settings({ length: 20, lower: false, upper: false, symbols: false, noRepeats: true });
    const pool = new Set(buildPool(s)).size;
    expect(errors(s).length).toBe(MSG.tooLongForNoRepeats(pool));
  });

  it('accepts a no-repeats length exactly equal to the pool', () => {
    // Digits, unexcluded: ten characters, so ten is the longest password with no repeats.
    const base = { lower: false, upper: false, symbols: false, excludeAmbiguous: false, excludeBrackets: false };
    expect(validateSettings(settings({ ...base, noRepeats: true, length: 10 })).ok).toBe(true);
    expect(validateSettings(settings({ ...base, noRepeats: true, length: 11 })).ok).toBe(false);
  });
});

describe('generate', () => {
  it('produces a password, its entropy, its band and the pool it came from', () => {
    const output = generate(settings({ length: 16, excludeAmbiguous: false, excludeBrackets: false }));
    expect(output.password).toHaveLength(16);
    expect(output.poolSize).toBe(94);
    expect(output.bits).toBeCloseTo(16 * Math.log2(94), 10);
    expect(output.strength).toBe('Very strong');
    expect(output.percent).toBeGreaterThan(0);
    expect(output.percent).toBeLessThanOrEqual(100);
  });

  it('reports the entropy of the pool that survived the exclusions, not the one offered', () => {
    const excluded = generate(settings({ length: 12 }));
    const full = generate(settings({ length: 12, excludeAmbiguous: false, excludeBrackets: false }));
    expect(excluded.poolSize).toBeLessThan(full.poolSize);
    expect(excluded.bits).toBeLessThan(full.bits);
  });

  it('honours the exclusions in the password itself', () => {
    const output = generate(settings({ length: 40 }));
    for (const c of output.password) expect(AMBIGUOUS + BRACKETS).not.toContain(c);
  });

  it('does not repeat a character when repeats are off', () => {
    const output = generate(settings({ length: 30, noRepeats: true }));
    expect(new Set(output.password).size).toBe(output.password.length);
  });

  it('draws a different password each time', () => {
    const drawn = new Set(Array.from({ length: 20 }, () => generate(DEFAULTS).password));
    expect(drawn.size).toBeGreaterThan(15);
  });
});

describe('formatBits', () => {
  it('prints one decimal place, as the reference does', () => {
    expect(formatBits(60.94)).toBe('60.9 bits');
    expect(formatBits(60)).toBe('60.0 bits');
    expect(formatBits(103.456)).toBe('103.5 bits');
  });
});

describe('describeOutput', () => {
  it('announces that a password was generated', () => {
    expect(describeOutput(generate(DEFAULTS))).toBe('Password generated.');
  });

  /**
   * The one rule this calculator cannot bend: a screen reader must never read the secret out. The
   * announcement is a fixed sentence, so no password can reach it.
   */
  it('never contains the password', () => {
    for (let i = 0; i < 50; i += 1) {
      const output = generate(settings({ length: 24 }));
      expect(describeOutput(output)).not.toContain(output.password);
    }
  });

  it('says nothing when there is no password', () => {
    expect(describeOutput({ password: '', bits: 0, strength: 'Weak', percent: 0, poolSize: 0 })).toBe('');
  });
});

describe('defaults', () => {
  it('opens on the reference\'s own settings', () => {
    expect(DEFAULTS).toEqual({
      length: 10,
      lower: true,
      upper: true,
      digits: true,
      symbols: true,
      excludeAmbiguous: true,
      excludeBrackets: true,
      noRepeats: false,
    });
  });

  it('uses the same settings for the worked example, and they are valid', () => {
    expect(PASSWORD_EXAMPLE_SETTINGS).toEqual(DEFAULTS);
    expect(validateSettings(PASSWORD_EXAMPLE_SETTINGS).ok).toBe(true);
  });

  it('does not touch storage or the network', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch' as never).mockImplementation(() => {
      throw new Error('the password generator must never make a request');
    });
    generate(DEFAULTS);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
