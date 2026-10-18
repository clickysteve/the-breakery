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

export interface RangeOpts {
  get: () => number;
  set: (v: number, final: boolean) => void;
  format: (v: number) => string;
  tip: string;
  label: string;
}

/** A horizontal range bar, 0..1: click or drag to set; arrow keys and the wheel nudge it. */
export class RangeBar {
  el: HTMLDivElement;
  private fill: HTMLDivElement;
  private val: HTMLDivElement;
  constructor(parent: HTMLElement, rect: [number, number, number, number], private o: RangeOpts) {
    this.el = el('div', 'range', parent, rect);
    this.el.tabIndex = 0;
    this.el.setAttribute('role', 'slider');
    this.el.setAttribute('aria-label', o.label);
    this.el.setAttribute('aria-valuemin', '0');
    this.el.setAttribute('aria-valuemax', '100');
    setTip(this.el, o.tip);
    this.fill = el('div', 'fill fill-grey', this.el);
    this.fill.style.left = '0';
    this.val = el('div', 'val', this.el);
    const setFrom = (ev: PointerEvent, final: boolean) => {
      const p = localPoint(this.el, ev);
      o.set(Math.max(0, Math.min(1, (p.x - 1) / (p.w - 2))), final);
      this.update();
    };
    this.el.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      this.el.focus();
      setFrom(ev, false);
      trackDrag(ev, this.el, ({ ev: e }) => setFrom(e, false), ({ ev: e }) => setFrom(e, true));
    });
    this.el.addEventListener('keydown', (ev) => {
      const step = ev.shiftKey ? 0.1 : 0.02;
      let d = 0;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') d = step;
      else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') d = -step;
      else return;
      ev.preventDefault();
      ev.stopPropagation();
      o.set(Math.max(0, Math.min(1, o.get() + d)), true);
      this.update();
    });
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
  /** double-click: ask for a typed value */
  ask?: () => void;
}

/** A number box: drag up/down, wheel or arrow keys; double-click to type. */
export class NumBox {
  el: HTMLDivElement;
  constructor(parent: HTMLElement, rect: [number, number, number, number], private o: NumOpts) {
    this.el = el('div', 'num', parent, rect);
    this.el.tabIndex = 0;
    this.el.setAttribute('role', 'spinbutton');
    this.el.setAttribute('aria-label', o.label);
    setTip(this.el, o.tip);
    const clampV = (v: number) => Math.max(o.min, Math.min(o.max, Math.round(v)));
    this.el.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      this.el.focus();
      const v0 = o.get();
      trackDrag(ev, this.el, ({ dy }) => {
        o.set(clampV(v0 - dy / (o.pxPerUnit ?? 2)));
        this.update();
      });
    });
    this.el.addEventListener('dblclick', () => o.ask?.());
    this.el.addEventListener('keydown', (ev) => {
      const step = ev.shiftKey ? 10 : 1;
      if (ev.key === 'ArrowUp' || ev.key === 'ArrowRight') o.set(clampV(o.get() + step));
      else if (ev.key === 'ArrowDown' || ev.key === 'ArrowLeft') o.set(clampV(o.get() - step));
      else if (ev.key === 'Enter') o.ask?.();
      else return;
      ev.preventDefault();
      ev.stopPropagation();
      this.update();
    });
    this.el.addEventListener(
      'wheel',
      (ev) => {
        ev.preventDefault();
        o.set(clampV(o.get() - Math.sign(ev.deltaY)));
        this.update();
      },
      { passive: false },
    );
    this.update();
  }
  update(): void {
    const t = String(this.o.get());
    if (this.el.textContent !== t) this.el.textContent = t;
    this.el.setAttribute('aria-valuenow', t);
  }
}
