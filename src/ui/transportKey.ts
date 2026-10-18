/** Rules for the global Space-to-toggle-playback shortcut, kept apart from the DOM wiring so they can be tested. */

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'image', 'file', 'color']);
const TEXT_ROLES = '[role="textbox"], [role="spinbutton"], [role="searchbox"], [role="combobox"]';

/** True when Space belongs to the element (typing a space), including through its ancestors. */
export function isTextEntry(t: unknown): boolean {
  const e = t as Partial<HTMLElement> | null;
  if (!e || typeof e !== 'object') return false;
  if (e.isContentEditable) return true;
  const tag = typeof e.tagName === 'string' ? e.tagName.toUpperCase() : '';
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') return !NON_TEXT_INPUTS.has(String((e as HTMLInputElement).type ?? 'text').toLowerCase());
  return !!e.closest?.(TEXT_ROLES) || !!e.closest?.('[contenteditable=""], [contenteditable="true"]');
}

/** A bare, first-press Space that is not typing into a text control. */
export function isTransportKey(e: Pick<KeyboardEvent, 'key' | 'code' | 'repeat' | 'ctrlKey' | 'altKey' | 'metaKey' | 'shiftKey' | 'target'>): boolean {
  if (e.key !== ' ' && e.code !== 'Space') return false;
  if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return false;
  return !isTextEntry(e.target);
}
