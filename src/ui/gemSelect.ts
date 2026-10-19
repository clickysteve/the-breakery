/**
 * GemSelect: the one drop-down (and list box) of the interface, drawn in the GEM style so no
 * native operating-system menu ever appears. A drop-in for <select>: options with values, labels,
 * groups and disabled entries; a value; a change callback (user choices only, like a native
 * "change"); keyboard use; ARIA combobox / listbox semantics.
 *
 * The popup is a child of the screen (not of the control's window), so no window clips it and it
 * sits above windows and dialogs; it is placed in screen pixels, opens upwards when there is no
 * room below, and scrolls when the list is long.
 *
 * Keys, control focused and closed: Space, ↑ and ↓ open it. Open: ↑ ↓ Home End PageUp
 * PageDown move over the enabled options, Enter or Space choose, Escape closes without changing
 * anything, Tab closes and moves focus on, letters jump to a matching label. Every key the
 * control handles stops there, so Space never also toggles playback and Escape never also closes
 * a dialog. A focused closed control owns Space (it opens), like a native select did.
 *
 * A list box (`mode: 'list'`) tells four states apart: the pointer over an entry (HOVER, a dotted
 * outline), the keyboard cursor (FOCUS, a dashed outline while the list has focus), the chosen
 * entry (SELECTED, inverted) and the entry in use now (`loaded`, a ▸ before it). Hovering never
 * chooses; a click (press and release on the same entry) does. With `confirm`, the arrow keys
 * only move the cursor and Enter or Space choose (the KITS list: nothing is chosen by passing
 * over it); without it, the selection follows the arrow keys, as in a native list box.
 */
import { el, place, setTip } from './dom';

export interface GemOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** options with the same group follow each other under a heading */
  group?: string;
  /** the entry in use now (list box: a ▸ before it, "loaded" to screen readers) */
  loaded?: boolean;
}

export interface GemSelectOpts {
  /** accessible name */
  label: string;
  options?: GemOption[];
  value?: string;
  onChange?: (value: string) => void;
  /** font size in screen px (default 9) */
  fontSize?: number;
  tip?: string;
  /** `list`: the options are always shown, in the control itself (a list box) */
  mode?: 'dropdown' | 'list';
  /** list box: the arrow keys move a cursor, Enter or Space choose (no choice on the move) */
  confirm?: boolean;
  cls?: string;
}

/** The tallest a pop-up gets (screen px) before it scrolls. */
const MAX_POPUP_HEIGHT = 260;
let uid = 0;

/** The next enabled option from `from` going `dir` (±1), without wrapping; `from` itself if there is none. */
export function nextEnabled(opts: readonly GemOption[], from: number, dir: 1 | -1): number {
  for (let i = from + dir; i >= 0 && i < opts.length; i += dir) if (!opts[i]!.disabled) return i;
  return from;
}
export const firstEnabled = (opts: readonly GemOption[]): number => opts.findIndex((o) => !o.disabled);
export const lastEnabled = (opts: readonly GemOption[]): number => opts.reduce((r, o, i) => (o.disabled ? r : i), -1);

/**
 * Where a popup of `height` goes for an anchor spanning [top, bottom) in a viewport of `viewH`:
 * below when it fits, else above when it fits, else on the roomier side, shortened to fit.
 */
export function placeVertical(top: number, bottom: number, height: number, viewH: number, margin = 2): { y: number; maxHeight: number; above: boolean } {
  const below = viewH - bottom - margin;
  const above = top - margin;
  if (height <= below) return { y: bottom, maxHeight: height, above: false };
  if (height <= above) return { y: top - height, maxHeight: height, above: true };
  if (below >= above) return { y: bottom, maxHeight: Math.max(below, 16), above: false };
  const h = Math.max(above, 16);
  return { y: top - h, maxHeight: h, above: true };
}

/** Keeps [x, x+width) inside [0, viewW). */
export function placeHorizontal(x: number, width: number, viewW: number, margin = 2): number {
  return Math.max(margin, Math.min(x, viewW - width - margin));
}

export class GemSelect {
  readonly el: HTMLDivElement;
  private text: HTMLDivElement;
  private opts: GemOption[] = [];
  private current = '';
  private hot = -1;
  private popup: HTMLDivElement | null = null;
  private typed = '';
  private typedAt = 0;
  private enabled = true;
  private readonly id = `gsel${++uid}`;
  private readonly list: boolean;
  private readonly confirm: boolean;
  /** list box: the entry a press started on (a release chooses only the same entry) */
  private pressed = -1;
  private readonly onChange?: (value: string) => void;
  private sig = '';

  constructor(parent: HTMLElement, rect: [number, number, number?, number?] | null, o: GemSelectOpts) {
    this.list = o.mode === 'list';
    this.confirm = this.list && !!o.confirm;
    this.onChange = o.onChange;
    this.el = el('div', `msel gsel${this.list ? ' glist' : ''}${o.cls ? ' ' + o.cls : ''}`, parent, rect ?? undefined);
    if (!rect) this.el.style.position = 'relative';
    if (o.fontSize) this.el.style.fontSize = o.fontSize + 'px';
    this.el.tabIndex = 0;
    this.el.setAttribute('aria-label', o.label);
    if (this.list) {
      this.el.setAttribute('role', 'listbox');
      this.text = el('div', 'msel-text', undefined);
    } else {
      this.el.setAttribute('role', 'combobox');
      this.el.setAttribute('aria-haspopup', 'listbox');
      this.el.setAttribute('aria-expanded', 'false');
      this.text = el('div', 'msel-text', this.el);
      el('div', 'msel-arrow', this.el).setAttribute('aria-hidden', 'true');
    }
    if (o.tip) setTip(this.el, o.tip);
    this.el.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation(); // the window under it must not start a drag or take the press
      if (this.list || !this.enabled) return;
      if (this.popup) this.close();
      else this.open();
      ev.preventDefault();
      this.el.focus();
    });
    this.el.addEventListener('keydown', (ev) => this.key(ev));
    // the list box draws its keyboard cursor only while it has focus
    this.el.addEventListener('focus', () => this.el.classList.add('focused'));
    this.el.addEventListener('blur', () => this.el.classList.remove('focused'));
    this.el.addEventListener('focusout', () => {
      if (!this.list && !this.popup?.matches(':hover')) this.close();
    });
    if (o.options) this.setOptions(o.options);
    if (o.value !== undefined) this.value = o.value;
  }

  // ------------------------------------------------------------------ state

  get value(): string {
    return this.index() >= 0 ? this.current : '';
  }
  set value(v: string) {
    this.current = v;
    this.sync();
  }
  get options(): readonly GemOption[] {
    return this.opts;
  }
  get disabled(): boolean {
    return !this.enabled;
  }
  set disabled(v: boolean) {
    this.enabled = !v;
    this.el.classList.toggle('disabled', v);
    this.el.setAttribute('aria-disabled', String(v));
    this.el.tabIndex = v ? -1 : 0;
    if (v) this.close();
  }
  get isOpen(): boolean {
    return !!this.popup;
  }
  /** the open popup (for tests) */
  get popupEl(): HTMLElement | null {
    return this.popup;
  }

  setOptions(opts: readonly GemOption[]): void {
    const sig = JSON.stringify(opts);
    if (sig === this.sig) return;
    this.sig = sig;
    this.opts = opts.map((o) => ({ ...o }));
    if (this.list) this.render(this.el);
    else if (this.popup) this.render(this.popup);
    this.sync();
  }

  private index(): number {
    return this.opts.findIndex((o) => o.value === this.current);
  }

  private sync(): void {
    const i = this.index();
    const label = i >= 0 ? this.opts[i]!.label : '';
    if (this.text.textContent !== label) this.text.textContent = label;
    this.el.classList.toggle('missing', i < 0);
    for (const n of this.items()) n.setAttribute('aria-selected', String(n.dataset.i === String(i)));
    for (const n of this.items()) n.classList.toggle('checked', !this.list && n.dataset.i === String(i));
    if (this.list) {
      if (this.hot < 0 || this.opts[this.hot]?.value !== this.current) this.hot = i;
      this.paintHot();
    }
  }

  // ------------------------------------------------------------------ rendering

  private items(): HTMLElement[] {
    const root = this.list ? this.el : this.popup;
    return root ? [...root.querySelectorAll<HTMLElement>('.msel-item')] : [];
  }

  private render(root: HTMLElement): void {
    root.replaceChildren();
    let host: HTMLElement = root;
    let group: string | undefined;
    this.opts.forEach((o, i) => {
      if (o.group !== group) {
        group = o.group;
        host = root;
        if (group !== undefined) {
          host = el('div', 'msel-group', root);
          host.setAttribute('role', 'group');
          host.setAttribute('aria-label', group);
          el('div', 'msel-head', host, undefined, group).setAttribute('aria-hidden', 'true');
        }
      }
      const it = el('div', 'msel-item' + (o.disabled ? ' disabled' : '') + (o.loaded ? ' loaded' : ''), host, undefined, o.label);
      it.id = `${this.id}-${i}`;
      it.dataset.i = String(i);
      it.setAttribute('role', 'option');
      it.setAttribute('aria-selected', String(o.value === this.current));
      if (o.loaded) it.setAttribute('aria-description', 'loaded');
      if (o.disabled) it.setAttribute('aria-disabled', 'true');
      if (this.list) {
        // a list box: hovering only outlines; a press and release on the same entry chooses
        it.addEventListener('pointerenter', () => it.classList.toggle('hover', !o.disabled));
        it.addEventListener('pointerleave', () => it.classList.remove('hover'));
        it.addEventListener('pointerdown', () => (this.pressed = i));
        it.addEventListener('pointerup', (ev) => {
          ev.stopPropagation();
          const press = this.pressed;
          this.pressed = -1;
          if (!o.disabled && press === i && this.enabled) this.choose(i);
        });
        return;
      }
      it.addEventListener('pointermove', () => {
        if (!o.disabled && this.hot !== i) {
          this.hot = i;
          this.paintHot(false);
        }
      });
      it.addEventListener('pointerup', (ev) => {
        ev.stopPropagation();
        if (!o.disabled) this.choose(i);
      });
    });
    this.sync();
  }

  private paintHot(scroll = true): void {
    const root = this.list ? this.el : this.popup;
    if (!root) return;
    for (const n of this.items()) n.classList.toggle('hot', n.dataset.i === String(this.hot));
    const hotEl = this.hot >= 0 ? this.items().find((n) => n.dataset.i === String(this.hot)) : undefined;
    if (hotEl) this.el.setAttribute('aria-activedescendant', hotEl.id);
    else this.el.removeAttribute('aria-activedescendant');
    if (scroll && hotEl) {
      // scroll the list itself (scrollIntoView could move the clipped screen)
      const top = hotEl.offsetTop;
      if (top < root.scrollTop) root.scrollTop = top;
      else if (top + hotEl.offsetHeight > root.scrollTop + root.clientHeight) root.scrollTop = top + hotEl.offsetHeight - root.clientHeight;
    }
  }

  // ------------------------------------------------------------------ open and close

  open(): void {
    if (this.list || this.popup || !this.enabled) return;
    const screen = this.el.closest<HTMLElement>('#screen') ?? document.getElementById('screen') ?? document.body;
    const pop = el('div', 'msel-list gsel-popup', screen);
    pop.id = `${this.id}-list`;
    pop.setAttribute('role', 'listbox');
    pop.setAttribute('aria-label', this.el.getAttribute('aria-label') ?? '');
    pop.addEventListener('pointerdown', (ev) => {
      ev.stopPropagation();
      ev.preventDefault(); // keep focus on the control
    });
    this.popup = pop;
    this.render(pop);
    this.hot = this.index() >= 0 && !this.opts[this.index()]!.disabled ? this.index() : firstEnabled(this.opts);
    this.el.classList.add('open');
    this.el.setAttribute('aria-expanded', 'true');
    this.el.setAttribute('aria-controls', pop.id);
    this.position();
    this.paintHot();
    window.addEventListener('pointerdown', this.outside, true);
    window.addEventListener('resize', this.close);
    window.addEventListener('blur', this.close);
  }

  private position(): void {
    const pop = this.popup;
    if (!pop) return;
    const screen = pop.parentElement!;
    const sr = screen.getBoundingClientRect();
    const k = screen === document.body || !screen.offsetWidth ? 1 : sr.width / screen.offsetWidth;
    const viewW = screen === document.body ? window.innerWidth : screen.offsetWidth;
    const viewH = screen === document.body ? window.innerHeight : screen.offsetHeight;
    const r = this.el.getBoundingClientRect();
    const left = (r.left - sr.left) / k;
    const top = (r.top - sr.top) / k;
    const bottom = (r.bottom - sr.top) / k;
    pop.style.minWidth = r.width / k + 'px';
    pop.style.maxHeight = '';
    pop.style.left = '0px';
    pop.style.top = '0px';
    const w = pop.offsetWidth;
    const h = Math.min(pop.scrollHeight + 2, MAX_POPUP_HEIGHT);
    const v = placeVertical(top, bottom, h, viewH);
    pop.style.maxHeight = v.maxHeight + 'px';
    place(pop, placeHorizontal(left, w, viewW), v.y);
    pop.classList.toggle('above', v.above);
  }

  readonly close = (): void => {
    const pop = this.popup;
    if (!pop) return;
    this.popup = null;
    pop.remove();
    this.el.classList.remove('open');
    this.el.setAttribute('aria-expanded', 'false');
    this.el.removeAttribute('aria-controls');
    this.el.removeAttribute('aria-activedescendant');
    window.removeEventListener('pointerdown', this.outside, true);
    window.removeEventListener('resize', this.close);
    window.removeEventListener('blur', this.close);
  };

  private readonly outside = (ev: Event): void => {
    const t = ev.target as Node | null;
    if (t && (this.el.contains(t) || this.popup?.contains(t))) return;
    this.close();
  };

  private choose(i: number): void {
    const o = this.opts[i];
    if (!o || o.disabled) return;
    const changed = o.value !== this.current;
    this.current = o.value;
    this.hot = i;
    if (!this.list) this.close();
    this.sync();
    if (changed) this.onChange?.(o.value);
  }

  // ------------------------------------------------------------------ keyboard

  private move(i: number): void {
    if (i < 0 || i === this.hot) return;
    this.hot = i;
    if (this.list && !this.confirm) this.choose(i);
    else this.paintHot();
  }

  private key(ev: KeyboardEvent): void {
    if (!this.enabled || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (this.list) this.el.classList.add('focused'); // a key reached it: it has focus
    const open = !!this.popup;
    const k = ev.key;
    const stop = () => {
      ev.preventDefault();
      ev.stopPropagation();
    };
    const from = this.hot >= 0 ? this.hot : this.index();
    if (k === 'Tab') return this.close(); // focus moves on normally
    if (k === 'Escape') {
      if (open) {
        stop();
        this.close();
      }
      return;
    }
    if (k === 'ArrowDown' || k === 'ArrowUp') {
      stop();
      if (!open && !this.list) return this.open();
      this.move(nextEnabled(this.opts, from, k === 'ArrowDown' ? 1 : -1));
    } else if (k === 'Home' || k === 'End') {
      stop();
      if (!open && !this.list) return this.open();
      this.move(k === 'Home' ? firstEnabled(this.opts) : lastEnabled(this.opts));
    } else if (k === 'PageDown' || k === 'PageUp') {
      stop();
      if (!open && !this.list) return this.open();
      let i = from;
      for (let n = 0; n < 8; n++) i = nextEnabled(this.opts, i, k === 'PageDown' ? 1 : -1);
      this.move(i);
    } else if (k === ' ' || k === 'Spacebar') {
      stop();
      if (ev.repeat) return;
      if (this.list) return this.confirm ? this.choose(this.hot) : undefined;
      if (open) this.choose(this.hot);
      else this.open();
    } else if (k === 'Enter') {
      if (open) {
        stop();
        this.choose(this.hot);
      } else if (this.list) {
        stop();
        if (this.confirm) this.choose(this.hot);
      }
      // closed: Enter is left to the dialog's default button
    } else if (k.length === 1 && !ev.shiftKey) {
      // type-ahead: the first enabled option whose label starts with the letters typed
      const now = ev.timeStamp;
      this.typed = now - this.typedAt > 800 ? k.toLowerCase() : this.typed + k.toLowerCase();
      this.typedAt = now;
      const n = this.opts.length;
      const start = this.typed.length > 1 ? Math.max(from, 0) : from + 1;
      for (let s = 0; s < n; s++) {
        const i = (start + s) % n;
        const o = this.opts[i]!;
        if (!o.disabled && o.label.toLowerCase().startsWith(this.typed)) {
          stop();
          if (!open && !this.list) this.open();
          this.move(i);
          return;
        }
      }
    }
  }
}
