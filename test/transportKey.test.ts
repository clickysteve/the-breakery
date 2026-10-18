import { describe, expect, it } from 'vitest';
import { isTextEntry, isTransportKey } from '../src/ui/transportKey';

const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, isContentEditable: false, closest: () => null, ...extra });
const key = (o: Record<string, unknown> = {}, target: unknown = el('DIV')) =>
  ({ key: ' ', code: 'Space', repeat: false, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, target, ...o }) as any;

describe('Space transport shortcut', () => {
  it('fires from buttons, tabs, sliders, checkboxes and empty areas', () => {
    for (const t of [el('BODY'), el('DIV', { tabIndex: 0 }), el('BUTTON'), el('INPUT', { type: 'range' }), el('INPUT', { type: 'checkbox' }), el('INPUT', { type: 'radio' })]) {
      expect(isTransportKey(key({}, t))).toBe(true);
    }
  });
  it('leaves text entry alone, including the export name field and ancestors', () => {
    for (const t of [el('INPUT', { type: 'text' }), el('INPUT', {}), el('TEXTAREA'), el('SELECT'), el('DIV', { isContentEditable: true }), el('SPAN', { closest: (s: string) => (s.includes('role="textbox"') ? {} : null) })]) {
      expect(isTextEntry(t)).toBe(true);
      expect(isTransportKey(key({}, t))).toBe(false);
    }
  });
  it('ignores modifiers and other keys', () => {
    for (const m of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey']) expect(isTransportKey(key({ [m]: true }))).toBe(false);
    expect(isTransportKey(key({ key: 'Enter', code: 'Enter' }))).toBe(false);
    expect(isTransportKey(key({ key: 'ArrowLeft', code: 'ArrowLeft' }))).toBe(false);
  });
});
