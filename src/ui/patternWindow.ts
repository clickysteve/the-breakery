/**
 * PATTERN · MIXER · BATCH · OUTPUT (outputPanel.ts: the master output chain). PATTERN: the break, and where it is edited by hand. One row per drum category,
 * with SOLO (S) and MUTE (M); each hit is drawn at its PERFORMED position (grid + swing +
 * microtiming) with its height showing velocity. Rows that SOLO / MUTE silence are drawn faint.
 *
 * Editing (gridEdit.ts): click an empty place to add a hit (on the SNAP grid) and click a hit to
 * delete it; shift+click a hit to select it (velocity, timing, sample, move and copy in the strip
 * under the grid); drag a hit sideways to move it (by SNAP steps, past a small threshold, so a click
 * never moves it); drag from an empty place to paint; right-click, Delete or DEL deletes; Escape
 * deselects; ⌘Z / ⇧⌘Z undo and redo. Hand edits carry a mark (■ added or moved, □ changed).
 *
 * ROLLS: a roll whose hits are too close to tell apart is drawn as one outlined group (ROLL ×N);
 * click it to expand it (a one-bar view, where every hit of it is drawn and edited on its own).
 * VIEW shows every bar, or 4, 2 or 1 bar at a time (◀ ▶ page).
 */
import { analyse } from '../engine/analysis';
import { describeEdits, MANUAL_OFFSET_MS, posLabel, snapTick, tickOf } from '../engine/edits';
import { swingPercent } from '../engine/performance';
import { STYLE_DEFS } from '../engine/styles';
import { CATEGORIES, CATEGORY_LABEL, STEPS, TPB, TPS, type BreakEvent, type Category } from '../engine/types';
import { anySolo } from '../app/mix';
import { SNAP_LABEL, SNAPS } from '../app/app';
import { esc, el, localPoint, setTip, svgEl, trackDrag } from './dom';
import { rollGroups, type RollGroup } from '../engine/rolls';
import { isDrag, pressAction, releaseDeletes, ROLL_GROUP_PX } from './gridEdit';
import { batchPanel } from './batchWindow';
import { mixerPanel } from './mixerPanel';
import { outputPanel } from './outputPanel';
import { Button, MWindow, NumBox } from './widgets';
import type { UiContext } from './context';

const ROLE_MARK: Record<string, string> = { A: 'GROOVE', A2: 'ANSWER', B: 'DEVELOP', F: 'FILL', T: 'TURNAROUND' };
const SHORT: Record<Category, string> = { kick: 'KICK', snare: 'SNARE', ghost: 'GHOST', htom: 'HI TOM', mtom: 'MID TOM', ltom: 'LO TOM', hat: 'HAT', open: 'OPEN', ride: 'RIDE', crash: 'CRASH', perc: 'PERC' };
const CYCLE: Record<string, string> = { beats: 'ACCENTS ON BEATS', offbeats: 'OFF-BEAT ACCENTS', alternate: 'ALTERNATE 16THS', backbeat: 'ACCENTS WITH THE BACKBEAT', tresillo: '3+3+2 ACCENTS' };
const ORIGIN: Record<string, string> = { added: 'ADDED BY HAND', moved: 'MOVED BY HAND', edited: 'GENERATED, CHANGED BY HAND' };
/** bars per view: 0 = every bar */
const ZOOMS = [0, 4, 2, 1] as const;

export function patternWindow(parent: HTMLElement, ui: UiContext, rect: { x: number; y: number; w: number; h: number }) {
  const { app } = ui;
  const win = new MWindow(parent, { title: 'PATTERN', tabs: ['PATTERN', 'MIXER', 'BATCH', 'OUTPUT'], ...rect, onTab: () => draw() });
  const [b, mixerBody, batchBody, outputBody] = win.panes as [HTMLDivElement, HTMLDivElement, HTMLDivElement, HTMLDivElement];
  const batch = batchPanel(batchBody, ui, { w: rect.w - 2, h: rect.h - 18 });
  const mixer = mixerPanel(mixerBody, app, { w: rect.w - 2, h: rect.h - 18 });
  const output = outputPanel(outputBody, app, { w: rect.w - 2, h: rect.h - 18 });
  const W = rect.w - 2;
  const X0 = 70;
  const Y0 = 22;
  const RH = 14;
  const GW = W - X0 - 6;
  const GH = CATEGORIES.length * RH;
  const TOP = 10; // grid top inside the svg
  let zoom: (typeof ZOOMS)[number] = 0;
  /** first bar of the view */
  let first = 0;

  const card = el('div', 'card', b, [6, 3, W - 12 - 118]);
  const zoomBtns = ZOOMS.map((z, i) =>
    new Button(b, [W - 118 + i * 21, 1, 20, 11], z === 0 ? 'ALL' : `${z}`, {
      cls: 'small',
      tip: z === 0 ? 'VIEW: every bar' : `VIEW: ${z} bar${z > 1 ? 's' : ''} at a time (◀ ▶ to page): closer, for placing 32nds and 64ths`,
      onPress: () => {
        zoom = z;
        first = z ? Math.floor(first / z) * z : 0;
        draw();
      },
    }),
  );
  const pageBtns = [-1, 1].map((d, i) =>
    new Button(b, [W - 32 + i * 13, 1, 12, 11], d < 0 ? '◀' : '▶', {
      cls: 'small',
      tip: d < 0 ? 'Earlier bars' : 'Later bars',
      onPress: () => {
        if (!zoom) return;
        first = Math.max(0, Math.min(app.current.recipe.bars - 1, first + d * zoom));
        first = Math.floor(first / zoom) * zoom;
        draw();
      },
    }),
  );
  const rowCtl = CATEGORIES.map((c, i) => {
    const l = el('div', 'label small', b, [6, Y0 + i * RH + 3], SHORT[c]);
    l.style.fontSize = '8px';
    setTip(l, CATEGORY_LABEL[c]);
    const s = new Button(b, [42, Y0 + i * RH + 1, 12, 12], 'S', { cls: 'small sm', tip: `SOLO ${CATEGORY_LABEL[c]}: hear only the soloed rows (several can be soloed; MUTE remains silent). Playback changes at once; the break itself does not change.`, onPress: () => app.toggleSolo(c) });
    const m = new Button(b, [55, Y0 + i * RH + 1, 12, 12], 'M', { cls: 'small sm', tip: `MUTE ${CATEGORY_LABEL[c]}: silence this row, including when soloed. Playback changes at once; the break itself does not change.`, onPress: () => app.toggleMute(c) });
    return { l, s, m };
  });
  const svg = svgEl(GW + 2, GH + 22, '', 'patternsvg');
  svg.style.left = X0 + 'px';
  svg.style.top = Y0 - TOP + 'px';
  svg.setAttribute('aria-label', 'Pattern grid: click an empty place to add a hit, click a hit to delete it, shift+click a hit to edit it');
  b.appendChild(svg);
  const head = el('div', '', b, [X0 + 1, Y0, 1, GH]);
  Object.assign(head.style, { position: 'absolute', background: 'var(--mark-color, #fff)', mixBlendMode: 'var(--mark-blend, difference)', display: 'none', pointerEvents: 'none' });

  // ---------------------------------------------------------------- selected-hit strip
  const iy = Y0 + GH + 13;
  const info = el('div', 'card hitinfo', b, [6, iy, W - 12]);
  const r2 = iy + 12;
  const ctl = el('div', '', b, [0, r2, W, 15]);
  ctl.style.position = 'absolute';
  el('div', 'label small', ctl, [6, 4], 'VEL');
  const vel = new NumBox(ctl, [24, 0, 26, 14], {
    get: () => app.selectedEvent?.vel ?? 0,
    set: (v) => app.setHitVelocity(v),
    min: 1,
    max: 127,
    pxPerUnit: 1.5,
    label: 'Velocity of the selected hit',
    tip: 'VELOCITY of the selected hit, 1–127. Click and type, Return; ↑ ↓ step it (Shift: by 10); drag up/down. The bar height in the grid shows it.',
  });
  el('div', 'label small', ctl, [56, 4], 'TIME');
  const time = new NumBox(ctl, [78, 0, 30, 14], {
    get: () => Math.round(app.selectedEvent?.offsetMs ?? 0),
    set: (v) => app.setHitTiming(v),
    min: -MANUAL_OFFSET_MS,
    max: MANUAL_OFFSET_MS,
    pxPerUnit: 2,
    format: (v) => `${v > 0 ? '+' : ''}${v}`,
    label: 'Timing of the selected hit, milliseconds',
    tip: `TIMING of the selected hit: milliseconds early (−) or late (+) against its grid place and swing, ±${MANUAL_OFFSET_MS} ms. Click and type, Return; ↑ ↓ step it; drag up/down. The hit moves in the grid as you change it.`,
  });
  el('div', 'label small', ctl, [111, 4], 'MS');
  el('div', 'label small', ctl, [128, 4], 'SAMPLE');
  const sample = el('select', 'mselect', ctl);
  Object.assign(sample.style, { position: 'absolute', left: '160px', top: '1px', width: '126px', height: '13px', fontSize: '8px' });
  sample.setAttribute('aria-label', 'Sample of the selected hit');
  sample.addEventListener('pointerdown', (e) => e.stopPropagation());
  sample.addEventListener('change', () => app.setHitSample(sample.value || null));
  const bx = 292;
  const left = new Button(ctl, [bx, 0, 13, 14], '◀', { cls: 'small', tip: 'Move the selected hit one SNAP step earlier (←; Shift: a beat)', onPress: (ev) => app.nudge(-(ev.shiftKey ? 4 * TPS : app.snap)) });
  const right = new Button(ctl, [bx + 14, 0, 13, 14], '▶', { cls: 'small', tip: 'Move the selected hit one SNAP step later (→; Shift: a beat)', onPress: (ev) => app.nudge(ev.shiftKey ? 4 * TPS : app.snap) });
  const dup = new Button(ctl, [bx + 31, 0, 26, 14], 'DUP', { cls: 'small', tip: 'DUPLICATE: a copy of the selected hit one SNAP step later (or the next free place)', onPress: () => app.duplicateHit() });
  const del = new Button(ctl, [bx + 59, 0, 26, 14], 'DEL', { cls: 'small', tip: 'DELETE the selected hit (Delete or Backspace; right-click a hit also deletes it). ⌘Z brings it back.', onPress: () => app.deleteHit() });
  const rev = new Button(ctl, [bx + 87, 0, 40, 14], 'REVERT', { cls: 'small', tip: 'REVERT: this hit back to how the generator made it (a moved hit returns to its place)', onPress: () => app.revertHit() });
  const none = el('div', 'label tiny', b, [6, r2 + 4, W - 12]);

  const r3 = r2 + 17;
  el('div', 'label small', b, [6, r3 + 3], 'SNAP');
  const snapBtns = SNAPS.map((t, i) => new Button(b, [30 + i * 31, r3, 30, 12], SNAP_LABEL[t]!, { cls: 'small', tip: `SNAP ${SNAP_LABEL[t]}: where new hits land, and the step for moving hits (moves keep a hit's offset from the grid, so rolls keep their subdivision)`, onPress: () => app.setSnap(t) }));
  const undo = new Button(b, [W - 168, r3, 34, 12], 'UNDO', { cls: 'small', tip: 'Undo the last pattern action (Cmd/Ctrl+Z)', onPress: () => app.undo() });
  const redo = new Button(b, [W - 132, r3, 34, 12], 'REDO', { cls: 'small', tip: 'Redo (⇧⌘Z)', onPress: () => app.redo() });
  const clear = new Button(b, [W - 96, r3, 90, 12], 'CLEAR EDITS', { cls: 'small', tip: 'Remove every hand edit of this break: back to the break as generated (⌘Z undoes it)', onPress: () => app.revertAll() });
  const foot = el('div', 'label tiny', b, [6, r3 + 17, W - 12]);
  const help = el('div', 'label tiny', b, [6, r3 + 27, W - 12], 'CLICK: TOGGLE · SHIFT+CLICK: EDIT · DRAG: MOVE · RIGHT-CLICK: DELETE · CLICK ROLL ×N: EXPAND');
  setTip(help, 'Click an empty place: add a hit (drag on: paint). Click a hit: delete it. Shift+click a hit: select it to set its velocity, timing and sample, nudge or copy it. Drag a hit sideways: move it by SNAP steps. Right-click (or DEL): delete. A roll drawn as one group: click it to expand it to a one-bar view, where each hit is edited on its own; right-click it to delete the whole roll. ⌘Z undoes any of these.');

  let shown: { e: BreakEvent; x: number; w: number; row: number }[] = [];
  /** rolls drawn as one group: their extent, row and hits */
  let groups: { g: RollGroup; x0: number; x1: number; row: number }[] = [];
  let view0 = 0;
  let cw = 1;

  /** The bars on screen: [first, count]. */
  function view(): [number, number] {
    const bars = app.current.recipe.bars;
    if (!zoom || zoom >= bars) return [0, bars];
    const f = Math.min(Math.floor(first / zoom) * zoom, bars - 1);
    return [f, Math.min(zoom, bars - f)];
  }

  /** Grid ticks (from the break's start) at an x in the svg. */
  const tickAt = (x: number) => view0 * TPB + ((x - 1) / cw) * TPS;

  /** The hit under a point (drawn position, with a little slack for thin hits). */
  function hitAt(x: number, row: number): BreakEvent | null {
    let best: BreakEvent | null = null;
    let d = Infinity;
    for (const s of shown) {
      if (s.row !== row) continue;
      const lo = s.x - 3;
      const hi = s.x + s.w + 3;
      if (x < lo || x > hi) continue;
      const dd = Math.abs(x - (s.x + s.w / 2));
      if (dd < d) {
        d = dd;
        best = s.e;
      }
    }
    return best;
  }

  /** A roll drawn as one group under a point. */
  const groupAt = (x: number, row: number) => groups.find((g) => g.row === row && x >= g.x0 - 2 && x <= g.x1 + 2) ?? null;

  /** Expand a grouped roll: a one-bar view of its bar, where each of its hits is drawn and edited. */
  function expand(g: RollGroup): void {
    zoom = 1;
    first = g.bar;
    draw();
    app.say(`Roll of ${g.events.length} ${CATEGORY_LABEL[g.cat]} hits expanded: bar ${g.bar + 1}, one bar at a time. Each hit can be edited; ALL shows every bar again.`);
  }

  svg.addEventListener('contextmenu', (ev) => ev.preventDefault());
  svg.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    const p = localPoint(svg, ev);
    const row = Math.floor((p.y - TOP) / RH);
    if (row < 0 || row >= CATEGORIES.length || p.x < 0 || p.x > GW + 1) return;
    const cat = CATEGORIES[row]!;
    const group = groupAt(p.x, row);
    const hit = group ? null : hitAt(p.x, row);
    const bars = app.current.recipe.bars;
    const action = pressAction({ button: ev.button, shift: ev.shiftKey, macCtrl: ev.ctrlKey && navigator.platform.startsWith('Mac'), onHit: !!hit?.ref, onRoll: !!group });
    if (action === 'none') return;
    if (action === 'deleteRoll') return app.deleteHits(group!.g.events.map((e) => e.ref!).filter(Boolean), `Deleted a roll of ${group!.g.events.length} ${CATEGORY_LABEL[group!.g.cat]} hits (⌘Z brings it back).`);
    if (action === 'delete') return app.deleteHit(hit!.ref!);
    if (action === 'expand') return expand(group!.g);
    if (hit?.ref) {
      // shift+click: select it (and hear it) for the editor strip. Either way, a drag past the
      // threshold moves it by SNAP steps; a plain click that does not drag deletes it on release.
      if (action === 'select') {
        app.select(hit.ref);
        if (hit.sample) void app.player.audition(hit.cat, hit.sample, hit.vel);
      }
      const t0 = tickOf(hit);
      let ref = hit.ref;
      let at = t0;
      let started = false;
      trackDrag(ev, svg, ({ dx, dy }) => {
        if (!started && !isDrag(dx, dy)) return;
        const d = Math.round((dx / cw) * TPS / app.snap) * app.snap;
        const to = Math.max(0, Math.min(bars * TPB - 1, t0 + d));
        if (to === at) return;
        if (!started) {
          app.beginGesture();
          started = true;
        }
        if (app.moveHit(ref, to, true)) {
          at = to;
          ref = app.selected ?? ref;
        }
      }, ({ ev: up }) => {
        const q = localPoint(svg, up);
        if (releaseDeletes(action, started || isDrag(q.x - p.x, q.y - p.y))) app.deleteHit(ref);
      });
      return;
    }
    // an empty place: add a hit there; dragging paints more along the row
    const t = snapTick(tickAt(p.x), app.snap, bars);
    app.beginGesture();
    app.addHit(cat, t, true);
    const e = app.selectedEvent;
    if (e?.sample) void app.player.audition(e.cat, e.sample, e.vel);
    let last = t;
    trackDrag(ev, svg, ({ ev: m }) => {
      const tt = snapTick(tickAt(localPoint(svg, m).x), app.snap, bars);
      if (tt === last) return;
      last = tt;
      app.addHit(cat, tt, true);
    });
  });

  function sampleOptions(e: BreakEvent): void {
    const kit = app.ingredients.kit();
    const sig = JSON.stringify([e.ref, e.pinned ?? '', CATEGORIES.map((c) => kit[c])]);
    if (sample.dataset.sig === sig) {
      sample.value = e.pinned ?? '';
      return;
    }
    sample.dataset.sig = sig;
    sample.replaceChildren();
    const auto = el('option', '', sample, undefined, e.sample && !e.pinned ? `PICK: ${app.ingredients.name(e.sample)}` : 'PICK MODE');
    auto.value = '';
    const order = [e.cat, ...CATEGORIES.filter((c) => c !== e.cat)];
    for (const c of order) {
      if (!kit[c].length) continue;
      const g = el('optgroup', '', sample);
      g.label = CATEGORY_LABEL[c];
      for (const id of kit[c]) {
        const o = el('option', '', g, undefined, app.ingredients.name(id));
        o.value = id;
      }
    }
    sample.value = e.pinned ?? '';
    sample.disabled = !order.some((c) => kit[c].length);
  }

  function draw(): void {
    mixer.update();
    const br = app.current;
    const r = br.recipe;
    const bars = r.bars;
    const [b0, nb] = view();
    view0 = b0;
    const steps = nb * STEPS;
    cw = GW / steps;
    const sixteenthMs = 60000 / r.bpm / 4;
    let s = '<defs><pattern id="dots" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="var(--ink)"/></pattern><pattern id="rollfill" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="var(--hits)"/><rect x="1" y="1" width="1" height="1" fill="var(--hits)"/></pattern></defs>';
    // beats 2 and 4 shaded, bar lines solid, beats dotted, SNAP lines faint when there is room
    for (let i = 0; i < steps; i += 4) {
      const beat = (i / 4) % 4;
      if (beat === 1 || beat === 3) s += `<rect x="${(i * cw).toFixed(2)}" y="${TOP}" width="${(4 * cw).toFixed(2)}" height="${GH}" fill="url(#dots)" opacity="0.18"/>`;
    }
    const snapPx = (cw * app.snap) / TPS;
    if (snapPx >= 4 && app.snap !== TPS) {
      for (let t = 0; t < steps * TPS; t += app.snap) {
        if (t % TPS === 0) continue;
        const x = Math.round((t / TPS) * cw) + 0.5;
        s += `<line x1="${x}" y1="${TOP}" x2="${x}" y2="${TOP + GH}" stroke="var(--dim)" stroke-dasharray="1 3" opacity="0.5"/>`;
      }
    } else if (cw >= 10) {
      for (let i = 0; i < steps; i++) if (i % 4) s += `<line x1="${Math.round(i * cw) + 0.5}" y1="${TOP}" x2="${Math.round(i * cw) + 0.5}" y2="${TOP + GH}" stroke="var(--dim)" stroke-dasharray="1 4" opacity="0.5"/>`;
    }
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(i * cw) + 0.5;
      if (i % STEPS === 0) s += `<line x1="${x}" y1="${TOP - 10}" x2="${x}" y2="${TOP + GH}" stroke="var(--ink)"/>`;
      else if (i % 4 === 0 && cw * 4 >= 6) s += `<line x1="${x}" y1="${TOP}" x2="${x}" y2="${TOP + GH}" stroke="var(--ink)" stroke-dasharray="1 2"/>`;
    }
    for (let c = 0; c <= CATEGORIES.length; c++) s += `<line x1="0" y1="${TOP + c * RH + 0.5}" x2="${GW}" y2="${TOP + c * RH + 0.5}" stroke="var(--ink)" stroke-dasharray="${c === 0 || c === CATEGORIES.length ? '0' : '1 3'}"/>`;
    // silenced rows: a faint wash
    CATEGORIES.forEach((c, i) => {
      if (!app.audible(c)) s += `<rect x="0" y="${TOP + i * RH + 1}" width="${GW}" height="${RH - 1}" fill="url(#dots)" opacity="0.35"/>`;
    });
    // bar numbers and roles (short names when bars are narrow)
    const barW = STEPS * cw;
    for (let k = 0; k < nb; k++) {
      const bar = b0 + k;
      const role = br.plan[bar] ?? 'A';
      const mark = barW >= 70 ? ROLE_MARK[role] : role;
      s += `<text x="${k * barW + 3}" y="${TOP - 2}" font-size="7" font-family="Silkscreen, monospace">${bar + 1}${barW >= 30 ? ' ' + mark : ''}</text>`;
    }
    // beat numbers (only when there is room)
    if (cw * 4 >= 8) for (let i = 0; i < steps; i += 4) s += `<text x="${(i * cw + 2).toFixed(1)}" y="${TOP + GH + 9}" font-size="7" font-family="Silkscreen, monospace">${(i / 4) % 4 + 1}</text>`;

    // the hits, at their performed places; a hit is never wider than the gap to the next one in its row
    shown = [];
    groups = [];
    const inView = br.events.filter((e) => e.bar >= b0 && e.bar < b0 + nb);
    const xOf = (e: BreakEvent) => ((e.bar - b0) * STEPS + e.step + e.sub / TPS + e.swing + e.offsetMs / sixteenthMs) * cw + 1;
    // rolls too dense to tell their hits apart are drawn as one group (unless one of them is selected)
    const grouped = new Set<BreakEvent>();
    for (const g of rollGroups(inView, true)) {
      if (g.events.length < 3 || g.events.some((e) => e.ref === app.selected)) continue;
      const xs = g.events.map(xOf).sort((a, b2) => a - b2);
      const minGap = Math.min(...xs.slice(1).map((x, i) => x - xs[i]!));
      if (minGap >= ROLL_GROUP_PX) continue;
      const row = CATEGORIES.indexOf(g.cat);
      const x0 = xs[0]!;
      const x1 = Math.max(xs[xs.length - 1]! + 1.5, x0 + 6);
      groups.push({ g, x0, x1, row });
      g.events.forEach((e) => grouped.add(e));
      const y = TOP + row * RH + 2;
      const h = RH - 3;
      const tip = `ROLL: ${g.events.length} ${CATEGORY_LABEL[g.cat]} hits in bar ${g.bar + 1} (${posLabel(g.events[0]!)} to ${posLabel(g.events[g.events.length - 1]!)}), velocity ${Math.min(...g.events.map((e) => e.vel))}–${Math.max(...g.events.map((e) => e.vel))}.\nClick: expand it (one bar), to edit each hit · right-click: delete the roll`;
      s += `<g class="hit rollgroup" data-tip="${esc(tip)}"${app.audible(g.cat) ? '' : ' opacity="0.35"'}><rect x="${(x0 - 1).toFixed(2)}" y="${y}" width="${(x1 - x0 + 2).toFixed(2)}" height="${h}" fill="url(#dots)" fill-opacity="0.45" stroke="var(--hits)" stroke-width="1" stroke-dasharray="1 1"/>`;
      // subdivision markers along the bottom, where there is room for them
      if (minGap >= 2) for (const x of xs) s += `<rect x="${x.toFixed(2)}" y="${y + h - 3}" width="1" height="3" fill="var(--hits)"/>`;
      const label = x1 - x0 >= 42 ? `ROLL ×${g.events.length}` : `×${g.events.length}`;
      // Silkscreen at 7px: about 5px a character
      if (x1 - x0 >= label.length * 5 + 1) s += `<rect x="${(x0 + 0.5).toFixed(2)}" y="${y + 1}" width="${label.length * 5 + 1}" height="7" fill="var(--paper)"/><text x="${(x0 + 1).toFixed(2)}" y="${y + 7}" font-size="7" font-family="Silkscreen, monospace" fill="var(--hits)">${label}</text>`;
      s += '</g>';
    }
    for (const [row, c] of CATEGORIES.entries()) {
      const evs = inView.filter((e) => e.cat === c && !grouped.has(e)).map((e) => ({ e, x: xOf(e) })).sort((a, b2) => a.x - b2.x);
      evs.forEach((v, i) => {
        const gap = i + 1 < evs.length ? evs[i + 1]!.x - v.x : Infinity;
        const w = Math.max(1.5, Math.min(cw * (v.e.sub ? 0.45 : 0.7), 9, gap * 0.75));
        shown.push({ e: v.e, x: v.x, w, row });
      });
    }
    const sel = app.selected;
    for (const { e, x, w, row } of shown) {
      const h = Math.max(2, Math.round((e.vel / 127) * (RH - 4)));
      const y = TOP + row * RH + RH - h;
      const timing = `${e.swing ? ` · swing +${Math.round(e.swing * sixteenthMs)} ms` : ''}${e.offsetMs ? ` · ${e.offsetMs > 0 ? '+' : ''}${e.offsetMs.toFixed(1)} ms` : ''}`;
      const sample = e.sample ? `\nSample: ${app.ingredients.name(e.sample)}${e.sampleWhy ? ` (${e.sampleWhy})` : ''}` : '\nNO SAMPLE (silent)';
      const origin = e.manual ? `\n${ORIGIN[e.manual]}${e.editWhy ? `: ${e.editWhy}` : ''}` : '';
      const tip = `${CATEGORY_LABEL[e.cat]}${e.role === 'roll' ? ' ROLL HIT' : ''} · ${posLabel(e)} · velocity ${e.vel}${timing}\n${e.why}${origin}${sample}${app.audible(e.cat) ? '' : '\n(silenced by SOLO / MUTE)'}\nClick: delete · shift+click: edit · drag: move`;
      // roll hits are drawn dithered, so the main hits stay the strongest marks
      const fill = !e.sample ? 'none' : e.role === 'roll' ? 'url(#rollfill)' : 'var(--hits)';
      const faint = app.audible(e.cat) ? '' : ' opacity="0.35"';
      s += `<rect class="hit" data-tip="${esc(tip)}" x="${x.toFixed(2)}" y="${y}" width="${w.toFixed(2)}" height="${h}" fill="${fill}" stroke="var(--hits)" stroke-width="${e.sample && e.role !== 'roll' ? 0 : e.sample ? 0.6 : 1}" ${e.sample ? '' : 'stroke-dasharray="1 1"'}${faint}/>`;
      // hand edits: a filled mark (added or moved) or a hollow one (changed) above the hit
      if (e.manual) {
        const my = Math.max(TOP + row * RH + 1, y - 3);
        const mx = x + w / 2 - 1;
        s += e.manual === 'edited' ? `<rect x="${(mx - 0.5).toFixed(2)}" y="${my - 0.5}" width="2" height="2" fill="none" stroke="var(--edits)" stroke-width="0.8" pointer-events="none"/>` : `<rect x="${mx.toFixed(2)}" y="${my - 1}" width="2" height="2" fill="var(--edits)" pointer-events="none"/>`;
      }
      if (sel && e.ref === sel) {
        const ry = TOP + row * RH + 1;
        s += `<rect x="${(x - 2).toFixed(2)}" y="${ry}" width="${(w + 4).toFixed(2)}" height="${RH - 2}" fill="none" stroke="var(--selection)" stroke-width="1.5" pointer-events="none"/>`;
        // timing indicator: from the grid place (with swing) to where it plays
        const gx = ((e.bar - b0) * STEPS + e.step + e.sub / TPS + e.swing) * cw + 1;
        if (Math.abs(gx - x) >= 1) s += `<line x1="${gx.toFixed(2)}" y1="${ry + RH - 3}" x2="${x.toFixed(2)}" y2="${ry + RH - 3}" stroke="var(--selection)" stroke-width="1" pointer-events="none"/><rect x="${(gx - 0.5).toFixed(2)}" y="${ry + RH - 5}" width="1" height="4" fill="var(--selection)" pointer-events="none"/>`;
      }
    }
    svg.innerHTML = s;

    // ---- the card
    const st = analyse(br.events, bars);
    const def = STYLE_DEFS[r.style];
    const mut = br.seeds.mut?.length ? ` +${br.seeds.mut.length}` : '';
    const edited = app.hasEdits ? ' · EDITED' : '';
    card.textContent = `${app.player.queued ? 'PATTERN CHANGE PENDING — ' + ({ bar: 'NEXT BAR', loop: 'NEXT LOOP', immediate: 'IMMEDIATE' }[app.player.switchMode]) : 'PATTERN ACTIVE'} · ${def.label} · ${r.bpm} BPM · ${bars} BAR${bars > 1 ? 'S' : ''} · SWING ${Math.round(swingPercent(r.swing))}% · SEED ${app.seedText}${mut} · ${st.hits} HITS${edited} · E${r.engine}`;
    setTip(
      card,
      `The recipe card. SYNC ${st.sync.toFixed(1)}: the kick/snare syncopation per bar (Longuet-Higgins & Lee style). Phrase: ${br.plan.join(' ')}. Seeds: beat ${br.seeds.beat}, detail ${br.seeds.detail}, feel ${br.seeds.feel}, kit ${br.seeds.kit}${mut ? `, ${br.seeds.mut!.length} mutation(s)` : ''}. ${br.timekeeper === 'ride' ? 'Ride' : 'Hats'} keep time${br.feel.cycle ? `, ${CYCLE[br.feel.cycle]?.toLowerCase()}` : ''}. Feel: snare ${br.feel.snare >= 0 ? '+' : ''}${br.feel.snare.toFixed(1)} ms (on 2; less on 4), hats ${br.feel.hats >= 0 ? '+' : ''}${br.feel.hats.toFixed(1)} ms, kick ${br.feel.kick >= 0 ? '+' : ''}${br.feel.kick.toFixed(1)} ms. Engine ${r.engine}. ${describeEdits(app.edits, br.editReport)}`,
    );
    zoomBtns.forEach((z, i) => {
      z.on = ZOOMS[i] === zoom;
      z.disabled = ZOOMS[i]! >= bars && ZOOMS[i] !== 0;
    });
    pageBtns[0]!.disabled = !zoom || b0 === 0;
    pageBtns[1]!.disabled = !zoom || b0 + nb >= bars;
    const solo = anySolo(app.mix);
    rowCtl.forEach((rc, i) => {
      const c = CATEGORIES[i]!;
      rc.s.on = app.mix[c].solo;
      rc.m.on = app.mix[c].mute;
      rc.l.style.opacity = app.audible(c) ? '1' : '0.45';
      rc.m.el.classList.remove('overridden');
    });

    // ---- the selected hit
    const e = app.selectedEvent;
    ctl.style.display = e ? '' : 'none';
    none.style.display = e ? 'none' : '';
    none.textContent = 'SHIFT+CLICK A HIT TO EDIT ITS VELOCITY, TIMING AND SAMPLE, NUDGE OR COPY IT';
    if (e) {
      const where = posLabel(e);
      info.textContent = `${CATEGORY_LABEL[e.cat]} · ${where} · VEL ${e.vel} · ${e.offsetMs > 0 ? '+' : ''}${Math.round(e.offsetMs)} MS · ${e.manual ? ORIGIN[e.manual] : `GENERATED (${e.role.toUpperCase()})`}`;
      setTip(info, `${CATEGORY_LABEL[e.cat]} at ${where} (bar.beat.sixteenth). ${e.why}${e.editWhy ? ` ${e.editWhy}` : ''}${e.sample ? ` Sample: ${app.ingredients.name(e.sample)} (${e.sampleWhy ?? ''}).` : ' No sample: silent.'}`);
      vel.update();
      time.update();
      sampleOptions(e);
      rev.disabled = !(e.manual === 'edited' || e.manual === 'moved');
      left.disabled = right.disabled = false;
    } else {
      info.textContent = 'SELECTED HIT: NONE';
      setTip(info, 'Shift+click a hit in the grid to select it: its velocity, timing and sample can then be set here. Escape deselects.');
    }
    del.disabled = dup.disabled = !e;
    snapBtns.forEach((sb, i) => (sb.on = SNAPS[i] === app.snap));
    undo.disabled = !app.canUndo;
    redo.disabled = !app.canRedo;
    clear.disabled = !app.hasEdits;

    const silent = CATEGORIES.filter((c) => br.events.some((x) => x.cat === c && !x.sample));
    const muted = CATEGORIES.filter((c) => !app.audible(c) && br.events.some((x) => x.cat === c));
    foot.textContent = silent.length
      ? `NO SAMPLE FOR: ${silent.map((c) => CATEGORY_LABEL[c]).join(', ')} (DOTTED HITS ARE SILENT)`
      : muted.length
        ? `SILENCED BY ${solo ? 'SOLO' : 'MUTE'}: ${muted.map((c) => CATEGORY_LABEL[c]).join(', ')} · TAKEAWAY FOLLOWS MIXER`
        : app.hasEdits
          ? `${describeEdits(app.edits, br.editReport).toUpperCase()} ■ ADDED/MOVED □ CHANGED`
          : 'HEIGHT = VELOCITY · OFFSET = SWING + FEEL · HOVER A HIT: WHY IT IS THERE · ⌘Z UNDO';
  }

  function tick(): void {
    if (win.tab === 1) mixer.tick();
    const p = app.player.position();
    const pb = app.player.break;
    if (!p) {
      head.style.display = 'none';
      return;
    }
    const [b0, nb] = view();
    const bars = pb?.recipe.bars ?? 1;
    const at = p.frac * bars - b0; // bars from the view's start
    if (at < 0 || at >= nb) {
      head.style.display = 'none';
      return;
    }
    head.style.display = 'block';
    // the shown break is queued for the next loop: a faint playhead
    head.style.opacity = pb !== app.current ? '0.4' : '1';
    head.style.left = X0 + 1 + (at / nb) * GW + 'px';
  }

  draw();
  return { update: () => { draw(); batch.update(); output.update(); }, tick, win };
}
