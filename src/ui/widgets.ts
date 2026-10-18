/**
 * The Breakery's controls, in the Slop Factory's 1-bit vocabulary (emmm's look): windows with a
 * slanted title tab, framed buttons that invert when on, range bars and number boxes you drag.
 */
import { el, localPoint, place, setTip, svgEl, trackDrag } from './dom';

let zTop = 100;

export interface WindowOpts {
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A window: title in a tab with a slanted edge; drag the title bar to move it. */
export class MWindow {
  el: HTMLDivElement;
  body: HTMLDivElement;
  titleEl: HTMLDivElement;
  constructor(parent: HTMLElement, public o: WindowOpts) {
    this.el = el('div', 'mwin', parent, [o.x, o.y, o.w, o.h]);
    this.el.setAttribute('role', 'region');
    this.el.setAttribute('aria-label', o.title);
    const tb = el('div', 'titlebar', this.el);
    this.titleEl = el('div', 'title', tb, undefined, o.title);
    const slant = el('div', 'slant', tb);
    slant.appendChild(svgEl(16, 16, `<polygon points="0,0 1,0 16,15.5 0,15.5" fill="var(--paper)"/><line x1="0.5" y1="0" x2="16" y2="15.5" stroke="var(--ink)"/>`));
    el('div', 'titlefill', tb);
    this.body = el('div', 'body', this.el);
    this.body.style.height = o.h - 18 + 'px';
    tb.addEventListener('pointerdown', (ev) => {
      this.front();
      const x0 = this.o.x;
      const y0 = this.o.y;
      trackDrag(ev, tb, ({ dx, dy }) => {
        this.o.x = Math.round(x0 + dx);
        this.o.y = Math.max(16, Math.round(y0 + dy));
        place(this.el, this.o.x, this.o.y);
      });
    });
    this.el.addEventListener('pointerdown', () => this.front(), true);
  }
  front(): void {
    this.el.style.zIndex = String(++zTop);
  }
  setTitle(t: string): void {
    if (this.titleEl.textContent !== t) this.titleEl.textContent = t;
  }
}

export interface ButtonOpts {
  tip?: string;
  cls?: string;
  /** called on press */
  onPress: (ev: PointerEvent) => void;
}

/** A framed button; `on` inverts it (toggles, the current style). */
export class Button {
  el: HTMLDivElement;
  constructor(parent: HTMLElement, rect: [number, number, number, number], text: string, o: ButtonOpts) {
    this.el = el('div', 'btn ' + (o.cls ?? ''), parent, rect, text);
    this.el.setAttribute('role', 'button');
    this.el.tabIndex = 0;
    if (o.tip) setTip(this.el, o.tip);
    this.el.addEventListener('pointerdown', (ev) => {
      if (this.el.classList.contains('disabled')) return;
      ev.preventDefault();
      o.onPress(ev);
    });
    this.el.addEventListener('keydown', (ev) => {
      if ((ev.key === 'Enter' || ev.key === ' ') && !this.el.classList.contains('disabled')) {
        ev.preventDefault();
        ev.stopPropagation();
        o.onPress(new PointerEvent('pointerdown'));
      }
    });
  }
  set on(v: boolean) {
    this.el.classList.toggle('on', v);
    this.el.setAttribute('aria-pressed', String(v));
  }
  set text(t: string) {
    if (this.el.textContent !== t) this.el.textContent = t;
  }
  set disabled(v: boolean) {
    this.el.classList.toggle('disabled', v);
    this.el.setAttribute('aria-disabled', String(v));
  }
  set tip(t: string) {
    setTip(this.el, t);
  }
}

// ---------------------------------------------------------------------------- direct entry (emmm)

/** The control that currently owns typing (a number box, range bar or seed box being edited). */
export const typing = { active: null as { cancel(): void } | null };

/**
 * Direct entry shared by number boxes, range bars and the seed box (emmm's TextEntry): the
 * control keeps its look; the current value is shown selected (inverted) until the first key
 * replaces it; typed characters show with a caret until Return commits or Escape cancels.
 */
class TextEntry {
  text = '';
  /** the first key replaces the shown value */
  replace = true;
  constructor(
    private host: HTMLElement,
    private accept: (ch: string) => boolean,
    private maxLen = 12,
  ) {}
  start(initial: string, replace: boolean): void {
    this.text = initial;
    this.replace = replace;
    this.host.classList.add('editing');
  }
  get on(): boolean {
    return this.host.classList.contains('editing');
  }
  stop(): void {
    this.host.classList.remove('editing');
  }
  /** a typed character; false if refused */
  type(ch: string): boolean {
    if (!this.accept(ch)) return false;
    if (this.replace) this.text = '';
    this.replace = false;
    if (this.text.length < this.maxLen) this.text += ch;
    return true;
  }
  backspace(): void {
    this.text = this.replace ? '' : this.text.slice(0, -1);
    this.replace = false;
  }
  /** what was typed ('' if nothing replaced the shown value) */
  get typed(): string {
    return this.replace ? '' : this.text.trim();
  }
}

/** Brief "no" flash for invalid typing (the value stays as it was). */
export function refuse(e: HTMLElement): void {
  e.classList.remove('refused');
  void e.offsetWidth;
  e.classList.add('refused');
  setTimeout(() => e.classList.remove('refused'), 300);
}

const NUMBER_TEXT = /^-?(\d+\.?\d*|\.\d+)$/;

export interface RangeOpts {
  get: () => number;
  set: (v: number, final: boolean) => void;
  format: (v: number) => string;
  tip: string;
  label: string;
  /** typed text (in the shown units) → value 0..1, or null if not valid (default: a percentage) */
  parse?: (text: string) => number | null;
  /** the text an edit starts from (default: the shown text without units) */
  editText?: (v: number) => string;
}

const pctParse = (t: string): number | null => (NUMBER_TEXT.test(t) ? Math.max(0, Math.min(1, Number(t) / 100)) : null);

/**
 * A horizontal range bar, 0..1: click or drag to set; arrow keys and the wheel nudge it. To type a
 * value: double-click it (or select it and press Return or a digit), type, Return; Escape cancels.
 */
export class RangeBar {
  el: HTMLDivElement;
  private fill: HTMLDivElement;
  private val: HTMLDivElement;
  private entry: TextEntry;
  private entryEl: HTMLDivElement | null = null;
  constructor(parent: HTMLElement, rect: [number, number, number, number], private o: RangeOpts) {
    this.el = el('div', 'range', parent, rect);
    this.el.tabIndex = 0;
    this.el.setAttribute('role', 'slider');
    this.el.setAttribute('aria-label', o.label);
    this.el.setAttribute('aria-valuemin', '0');
    this.el.setAttribute('aria-valuemax', '100');
    setTip(this.el, o.tip + ' Double-click (or Return) to type a value.');
    this.fill = el('div', 'fill fill-grey', this.el);
    this.fill.style.left = '0';
    this.val = el('div', 'val', this.el);
    this.entry = new TextEntry(this.el, (ch) => /[0-9.\-]/.test(ch));
    const setFrom = (ev: PointerEvent, final: boolean) => {
      const p = localPoint(this.el, ev);
      o.set(Math.max(0, Math.min(1, (p.x - 1) / (p.w - 2))), final);
      this.update();
    };
    this.el.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      if (this.entry.on) this.commit();
      this.el.focus();
      if (ev.detail >= 2) {
        this.beginEdit();
        return;
      }
      setFrom(ev, false);
      trackDrag(ev, this.el, ({ ev: e }) => setFrom(e, false), ({ ev: e }) => setFrom(e, true));
    });
    this.el.addEventListener('keydown', (ev) => this.key(ev));
    this.el.addEventListener('blur', () => this.entry.on && this.commit());
    this.el.addEventListener(
      'wheel',
      (ev) => {
        ev.preventDefault();
        o.set(Math.max(0, Math.min(1, o.get() - Math.sign(ev.deltaY || -ev.deltaX) * 0.02)), true);
        this.update();
      },
      { passive: false },
    );
    this.update();
  }

  get editing(): boolean {
    return this.entry.on;
  }

  beginEdit(first?: string): void {
    typing.active?.cancel();
    const v = this.o.get();
    this.entry.start(this.o.editText ? this.o.editText(v) : this.o.format(v).replace(/[^0-9.\-]/g, ''), true);
    typing.active = { cancel: () => this.cancelEdit() };
    if (first) this.entry.type(first);
    this.render();
  }

  cancelEdit(): void {
    if (!this.entry.on) return;
    this.entry.stop();
    if (typing.active) typing.active = null;
    this.entryEl?.remove();
    this.entryEl = null;
  }

  private commit(): void {
    const t = this.entry.typed;
    this.cancelEdit();
    if (!t) return;
    const v = (this.o.parse ?? pctParse)(t);
    if (v === null || !Number.isFinite(v)) {
      refuse(this.el);
      return;
    }
    this.o.set(Math.max(0, Math.min(1, v)), true);
    this.update();
  }

  private key(ev: KeyboardEvent): void {
    if (ev.metaKey || ev.ctrlKey) return;
    const k = ev.key;
    if (this.entry.on) {
      ev.stopPropagation();
      ev.preventDefault();
      if (k === 'Enter' || k === 'Tab') this.commit();
      else if (k === 'Escape') this.cancelEdit();
      else if (k === 'Backspace' || k === 'Delete') (this.entry.backspace(), this.render());
      else if (k === 'ArrowUp' || k === 'ArrowDown') {
        this.commit();
        this.nudge(k === 'ArrowUp' ? 1 : -1, ev.shiftKey);
        this.beginEdit();
      } else if (k.length === 1 && !this.entry.type(k)) refuse(this.el);
      else this.render();
      return;
    }
    let handled = true;
    if (k === 'ArrowRight' || k === 'ArrowUp') this.nudge(1, ev.shiftKey);
    else if (k === 'ArrowLeft' || k === 'ArrowDown') this.nudge(-1, ev.shiftKey);
    else if (k === 'Enter') this.beginEdit();
    else if (k.length === 1 && /[0-9.]/.test(k)) this.beginEdit(k);
    else if (k === 'Escape') this.el.blur();
    else handled = false;
    if (handled) {
      ev.preventDefault();
      ev.stopPropagation();
    }
  }

  private nudge(dir: number, big: boolean): void {
    this.o.set(Math.max(0, Math.min(1, this.o.get() + dir * (big ? 0.1 : 0.01))), true);
    this.update();
  }

  private render(): void {
    if (!this.entry.on) return;
    if (!this.entryEl) this.entryEl = el('div', 'entrytext rangeentry', this.el);
    this.entryEl.textContent = this.entry.text;
    this.entryEl.classList.toggle('whole', this.entry.replace);
  }

  update(): void {
    const v = this.o.get();
    this.fill.style.width = `${Math.round(v * 100)}%`;
    const t = this.o.format(v);
    if (this.val.textContent !== t) {
      this.val.replaceChildren();
      el('span', '', this.val, undefined, t);
    }
    this.el.setAttribute('aria-valuenow', String(Math.round(v * 100)));
    this.el.setAttribute('aria-valuetext', t);
  }
}

export interface NumOpts {
  get: () => number;
  set: (v: number) => void;
  min: number;
  max: number;
  tip: string;
  label: string;
  /** pixels of vertical drag per unit */
  pxPerUnit?: number;
  /** what the box shows (default: the number) */
  format?: (v: number) => string;
  /**
   * Take typed text completely (the seed box: numbers or names). True = done, false = not valid.
   * Without it, typing must be a number and is clamped to min..max.
   */
  entry?: (text: string) => boolean;
  /** the text an edit starts from (default: the shown text) */
  editText?: () => string;
  /** accept any printable character while typing (with `entry`) */
  anyText?: boolean;
  /** longest typed text */
  maxLength?: number;
}

/**
 * A number box (emmm's numerical field). Click it: the value is selected; type a replacement
 * and press Return (Escape cancels, clicking elsewhere keeps what you typed). ↑ ↓ step it (Shift:
 * by 10), also while selected; drag up/down or use the wheel to sweep it.
 */
export class NumBox {
  el: HTMLDivElement;
  private entry: TextEntry;
  private textEl: HTMLSpanElement | null = null;
  constructor(parent: HTMLElement, rect: [number, number, number, number], private o: NumOpts) {
    this.el = el('div', 'num', parent, rect);
    this.el.tabIndex = 0;
    this.el.setAttribute('role', o.entry ? 'textbox' : 'spinbutton');
    this.el.setAttribute('aria-label', o.label);
    if (!o.entry) {
      this.el.setAttribute('aria-valuemin', String(o.min));
      this.el.setAttribute('aria-valuemax', String(o.max));
    }
    setTip(this.el, o.tip);
    this.entry = new TextEntry(this.el, (ch) => (o.anyText ? ch >= ' ' : /[0-9]/.test(ch) || (o.min < 0 && ch === '-')), o.maxLength ?? 12);
    this.el.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      if (this.entry.on) {
        // a click into the box being edited keeps editing
        return;
      }
      this.el.focus();
      const v0 = o.get();
      let dragged = false;
      trackDrag(
        ev,
        this.el,
        ({ dy }) => {
          if (!dragged && Math.abs(dy) < 4) return;
          dragged = true;
          this.el.classList.add('inv');
          o.set(this.clampV(v0 - dy / (o.pxPerUnit ?? 2)));
          this.update();
        },
        () => {
          this.el.classList.remove('inv');
          if (!dragged) this.beginEdit(); // a click: select the value, ready to type over it
        },
      );
    });
    this.el.addEventListener('keydown', (ev) => this.key(ev));
    this.el.addEventListener('blur', () => this.entry.on && this.commit());
    this.el.addEventListener(
      'wheel',
      (ev) => {
        ev.preventDefault();
        if (this.entry.on) this.cancelEdit();
        o.set(this.clampV(o.get() - Math.sign(ev.deltaY)));
        this.update();
      },
      { passive: false },
    );
    this.update();
  }

  private clampV(v: number): number {
    return Math.max(this.o.min, Math.min(this.o.max, Math.round(v)));
  }

  get editing(): boolean {
    return this.entry.on;
  }

  beginEdit(first?: string): void {
    typing.active?.cancel();
    this.entry.start(this.o.editText ? this.o.editText() : this.shown(), true);
    typing.active = { cancel: () => this.cancelEdit() };
    if (first) this.entry.type(first);
    this.render();
  }

  cancelEdit(): void {
    if (!this.entry.on) return;
    this.entry.stop();
    if (typing.active) typing.active = null;
    this.textEl = null;
    this.el.textContent = '';
    this.update();
  }

  private commit(): boolean {
    const t = this.entry.typed;
    this.cancelEdit();
    if (!t) return true; // nothing typed: keep the value
    if (this.o.entry) {
      if (!this.o.entry(t)) {
        refuse(this.el);
        return false;
      }
      this.update();
      return true;
    }
    if (!NUMBER_TEXT.test(t)) {
      refuse(this.el);
      return false;
    }
    const v = Number(t);
    if (v < this.o.min || v > this.o.max) refuse(this.el); // out of range: clamped, and says so
    this.o.set(this.clampV(v));
    this.update();
    return true;
  }

  private step(n: number): void {
    this.o.set(this.clampV(this.o.get() + n));
    this.update();
  }

  private key(ev: KeyboardEvent): void {
    if (ev.metaKey || ev.ctrlKey) {
      if (this.entry.on) ev.stopPropagation();
      return;
    }
    const k = ev.key;
    const big = ev.shiftKey ? 10 : 1;
    if (this.entry.on) {
      // while typing, every key belongs to the box (no shortcuts)
      ev.stopPropagation();
      ev.preventDefault();
      if (k === 'Enter') this.commit();
      else if (k === 'Escape') this.cancelEdit();
      else if (k === 'Tab') this.commit();
      else if (k === 'Backspace' || k === 'Delete') (this.entry.backspace(), this.render());
      else if (k === 'ArrowUp' || k === 'ArrowDown') {
        // step from what was typed (if anything), and stay selected
        if (this.entry.typed && !this.commit()) return;
        this.cancelEdit();
        this.step((k === 'ArrowUp' ? 1 : -1) * big);
        this.beginEdit();
      } else if (k.length === 1 && !this.entry.type(k)) refuse(this.el);
      else this.render();
      return;
    }
    let handled = true;
    if (k === 'ArrowUp' || k === 'ArrowRight') this.step(big);
    else if (k === 'ArrowDown' || k === 'ArrowLeft') this.step(-big);
    else if (k === 'PageUp' || k === 'PageDown') this.step(k === 'PageUp' ? 10 : -10);
    else if (k === 'Home') (this.o.set(this.o.min), this.update());
    else if (k === 'End' && !this.o.entry) (this.o.set(this.o.max), this.update());
    else if (k === 'Enter') this.beginEdit();
    else if (k.length === 1 && (/[0-9]/.test(k) || (this.o.anyText && k !== ' '))) this.beginEdit(k);
    else if (k === 'Escape') this.el.blur();
    else handled = false;
    if (handled) {
      ev.preventDefault();
      ev.stopPropagation();
    }
  }

  private shown(): string {
    return this.o.format ? this.o.format(this.o.get()) : String(this.o.get());
  }

  /** Show the typed text with a caret. */
  private render(): void {
    if (!this.entry.on) return;
    if (!this.textEl) {
      this.el.textContent = '';
      this.textEl = el('span', 'entrytext', this.el);
    }
    this.textEl.textContent = this.entry.text;
    this.textEl.classList.toggle('whole', this.entry.replace);
  }

  update(): void {
    if (this.entry.on) return; // the typed text stays until Return / Escape
    const t = this.shown();
    if (this.el.textContent !== t) this.el.textContent = t;
    if (!this.o.entry) this.el.setAttribute('aria-valuenow', String(this.o.get()));
    else this.el.setAttribute('aria-valuetext', t);
  }
}
