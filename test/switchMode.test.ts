import { describe, expect, it } from 'vitest';
import { loadSwitchMode, saveSwitchMode } from '../src/app/switchMode';

const store = (v: string | null) => ({ getItem: () => v });

describe('SWITCH default and persistence', () => {
  it('defaults to IMMEDIATE with nothing saved or junk saved', () => {
    expect(loadSwitchMode(store(null))).toBe('immediate');
    expect(loadSwitchMode(store('nonsense'))).toBe('immediate');
  });
  it('respects a saved choice, and saves changes', () => {
    for (const m of ['bar', 'loop', 'immediate'] as const) {
      let saved = '';
      saveSwitchMode(m, { setItem: (_k, v) => void (saved = v) });
      expect(loadSwitchMode(store(saved))).toBe(m);
    }
  });
});
