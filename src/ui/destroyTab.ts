/**
 * DESTROY (a tab of the RECIPE window, Phase 14; destroy2.ts): event-level destruction of the
 * finished pattern.
 *   top row     ENABLED (off by default; the settings are kept), MASTER AMOUNT (scales every
 *               probability), RE-DESTROY (another take: other hits), CHAOS (random settings for the
 *               effects the matrix uses)
 *   the matrix  tracks across, effects down: which effect may touch which track. Click a cell to
 *               switch it, an effect's name to edit it on the right
 *   the right   the chosen effect: its PROBABILITY (how many hits) and its intensity controls
 *   below       what DESTROY did to this pattern, and the earlier CHOP ▸ DESTROY if a saved break
 *               still has it
 * Every change is heard on the same break (the switching mode decides when, while playing) and is
 * one undo step.
 */
import { CATEGORIES, type Category } from '../engine/types';
import { describeDestroy } from '../engine/destroy';
import { describeDestroy2, EFFECT_LABEL, EFFECT_ORDER, GATE_LENGTHS, STUTTER_SUB_LABEL, STUTTER_SUBS, type DestroyEffect, type DestroySettings2 } from '../engine/destroy2';
import { el, label, setTip } from './dom';
import { Button, RangeBar } from './widgets';
import type { UiContext } from './context';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const ABBR: Record<Category, string> = { kick: 'KCK', snare: 'SNR', ghost: 'GHO', clap: 'CLP', htom: 'HT', mtom: 'MT', ltom: 'LT', hat: 'HAT', open: 'OPN', ride: 'RDE', crash: 'CRS', perc: 'PRC', fx: 'FX' };
const FX_TIP: Record<DestroyEffect, string> = {
  stutter: 'STUTTER: the hit repeated (REPEATS, at a SUBDIVISION, EVEN, ACCEL or DECEL), with a velocity contour and a pitch movement. Repeats stop before the next hit of the track. DESTROY’s own repeats: ROLL GENERATION stays as you set it.',
  pitch: 'PITCH: the hit transposed (RANGE, UP, DOWN or BOTH), on semitones (QUANTISE) or free; FIXED, or a DIVE or RISE along a stutter (a glide on a single hit). Never beyond ±24 semitones.',
  reverse: 'REVERSE: the sample played backwards (WHOLE, or PARTIAL: a shorter swell into the hit), on each chosen hit, ALTERNATE (every other one) or as a CLUSTER (with the next hits of the track in the beat). Faded in, so it does not click.',
  gate: 'GATE: the sound cut after a LENGTH (SHORT 1/32, MEDIUM 1/16, LONG 1/8), HARD or SOFT, or RHYTHMIC (open and shut at that length). On a reversed hit it keeps the swell into the hit.',
  tape: 'TAPE STOP: the track slows to a halt, a continuous playback-rate ramp (pitch and speed fall together) over a DURATION by a PITCH FALL, then CUT or RESUME. Later hits of the track in the window are carried later and slower, or dropped; the other tracks keep time.',
};

export function destroyTab(b: HTMLElement, ui: UiContext, W: number) {
  const { app } = ui;
  const d = () => app.destroy2;
  const set = (patch: Partial<DestroySettings2>) => app.setDestroy2(patch);
  let fx: DestroyEffect = 'stutter';

  // ---- top row
  label(b, 5, 6, 'DESTROY', 'head');
  const enable = new Button(b, [56, 3, 58, 14], 'DISABLED', {
    cls: 'small',
    tip: 'DESTROY: on, the effects in the matrix wreck the finished pattern (hand edits included, never the hits you placed or changed by hand); off, the pattern as it is. The settings are kept either way. ⌘Z undoes.',
    onPress: () => set({ on: !d().on }),
  });
  label(b, 120, 6, 'MASTER');
  const master = new RangeBar(b, [158, 3, 120, 14], { get: () => d().master, set: (v) => set({ master: v }), format: pct, label: 'Destroy master amount', tip: 'MASTER AMOUNT: scales every effect’s PROBABILITY. 0% = nothing destroyed; 100% = the probabilities as set. A higher amount destroys the same hits and more.' });
  const again = new Button(b, [284, 3, 66, 14], 'RE-DESTROY', { cls: 'small', tip: 'RE-DESTROY: another take: other hits are chosen, with the same settings. ⌘Z returns to the previous take. (The BEAT seed decides the takes: FREEZE BEAT keeps them.)', onPress: () => app.reDestroy() });
  new Button(b, [354, 3, 46, 14], 'CHAOS', { cls: 'small', tip: 'CHAOS: random settings for every effect the matrix uses (the matrix and MASTER AMOUNT stay), and DESTROY on. ⌘Z undoes.', onPress: () => app.chaos() });
  const take = el('div', 'label tiny', b, [404, 7, W - 408]);
  take.style.textAlign = 'right';
  el('div', 'rule', b, [4, 20, W - 8]);

  // ---- the matrix: tracks across, effects down
  const mx = 58;
  const cw = 16;
  CATEGORIES.forEach((c, j) => {
    const h = el('div', 'label tiny', b, [mx + j * cw, 24, cw - 1], ABBR[c]);
    h.style.textAlign = 'center';
  });
  const names = EFFECT_ORDER.map((x, k) => new Button(b, [4, 33 + k * 13, 52, 12], EFFECT_LABEL[x], { cls: 'small', tip: `${FX_TIP[x]} Click to edit it on the right.`, onPress: () => ((fx = x), update()) }));
  const cells = EFFECT_ORDER.map((x, k) =>
    CATEGORIES.map((c, j) => {
      const btn = new Button(b, [mx + j * cw, 33 + k * 13, cw - 1, 12], '', { cls: 'small', tip: `${EFFECT_LABEL[x]} on the ${c === 'hat' ? 'closed hat' : c} track: click to switch.`, onPress: () => app.setDestroyCell(c, x, !(d().matrix[c] ?? []).includes(x)) });
      btn.el.setAttribute('aria-label', `${EFFECT_LABEL[x]} on ${c}`);
      return btn;
    }),
  );

  // ---- the chosen effect
  const px = mx + CATEGORIES.length * cw + 8;
  const pw = W - 4 - px;
  const head = el('div', 'label head', b, [px, 24, pw]);
  label(b, px, 39, 'PROB');
  const prob = new RangeBar(b, [px + 34, 36, pw - 34, 13], { get: () => d()[fx].prob, set: (v) => set({ [fx]: { ...d()[fx], prob: v } } as Partial<DestroySettings2>), format: pct, label: 'Effect probability', tip: 'PROBABILITY: how many hits of the matrix’s tracks this effect takes (scaled by MASTER AMOUNT). Separate from how hard it is (the controls below). Higher keeps the same hits and adds more.' });
  const groups: Record<DestroyEffect, HTMLElement[]> = { stutter: [], pitch: [], reverse: [], gate: [], tape: [] };
  const upd: (() => void)[] = [];
  const row = (g: DestroyEffect, y: number, text: string) => groups[g].push(label(b, px, y + 3, text));
  const rangeIn = (g: DestroyEffect, y: number, text: string, o: { get: () => number; set: (v: number) => void; format: (v: number) => string; label: string; tip: string }) => {
    row(g, y, text);
    const r = new RangeBar(b, [px + 52, y, pw - 52, 12], o);
    groups[g].push(r.el);
    upd.push(() => r.update());
  };
  const choices = <T extends string>(g: DestroyEffect, y: number, x: number, w: number, opts: readonly T[], labels: Record<T, string>, get: () => T, pick: (v: T) => void, tip: string) => {
    const bs = opts.map((o, i) => new Button(b, [x + i * (w + 2), y, w, 12], labels[o], { cls: 'small', tip, onPress: () => pick(o) }));
    groups[g].push(...bs.map((x) => x.el));
    upd.push(() => bs.forEach((x, i) => (x.on = opts[i] === get())));
  };
  const toggle = (g: DestroyEffect, rect: [number, number, number, number], text: string, get: () => boolean, flip: () => void, tip: string) => {
    const t = new Button(b, rect, text, { cls: 'small', tip, onPress: flip });
    groups[g].push(t.el);
    upd.push(() => (t.on = get()));
  };
  const st = () => d().stutter;
  const pi = () => d().pitch;
  const re = () => d().reverse;
  const ga = () => d().gate;
  const ta = () => d().tape;
  // STUTTER
  rangeIn('stutter', 51, 'REPEATS', { get: () => (st().repeats - 1) / 7, set: (v) => set({ stutter: { ...st(), repeats: Math.round(1 + v * 7) } }), format: () => String(st().repeats), label: 'Stutter repeats', tip: 'REPEATS: how many times the hit is struck again (1–8), stopping before the next hit of its track.' });
  choices('stutter', 65, px, Math.floor((pw - 10) / 6), STUTTER_SUBS, STUTTER_SUB_LABEL, () => st().sub, (v) => set({ stutter: { ...st(), sub: v } }), 'The repeats’ SUBDIVISION.');
  const sw = Math.floor((pw - 10) / 6);
  choices('stutter', 79, px, sw, ['even', 'accel', 'decel'] as const, { even: 'EVEN', accel: 'ACCEL', decel: 'DECEL' }, () => st().shape, (v) => set({ stutter: { ...st(), shape: v } }), 'EVEN repeats, or ACCELERATING (closer together) or DECELERATING (further apart).');
  choices('stutter', 79, px + 3 * (sw + 2), sw, ['flat', 'fade', 'swell'] as const, { flat: 'FLAT', fade: 'FADE', swell: 'SWELL' }, () => st().vel, (v) => set({ stutter: { ...st(), vel: v } }), 'The repeats’ velocity: FLAT, FADING away, or SWELLING up.');
  rangeIn('stutter', 93, 'PITCH', { get: () => (st().pitch + 12) / 24, set: (v) => set({ stutter: { ...st(), pitch: Math.round(v * 24 - 12) } }), format: () => `${st().pitch > 0 ? '+' : ''}${st().pitch} ST`, label: 'Stutter pitch movement', tip: 'PITCH: semitones the repeats move by the last one (−12 to +12; 0 = none).' });
  // PITCH
  rangeIn('pitch', 51, 'RANGE', { get: () => (pi().range - 1) / 23, set: (v) => set({ pitch: { ...pi(), range: Math.round(1 + v * 23) } }), format: () => `${pi().range} ST`, label: 'Pitch range', tip: 'RANGE: up to how many semitones a hit is transposed (1–24). Each chosen hit gets its own amount within it.' });
  const pw3 = Math.floor((pw - 10) / 6);
  choices('pitch', 65, px, pw3, ['up', 'down', 'both'] as const, { up: 'UP', down: 'DOWN', both: 'BOTH' }, () => pi().dir, (v) => set({ pitch: { ...pi(), dir: v } }), 'Which way: UP, DOWN, or BOTH (each hit its own way).');
  toggle('pitch', [px + 3 * (pw3 + 2), 65, 2 * pw3 + 2, 12], 'QUANTISE', () => pi().quantise, () => set({ pitch: { ...pi(), quantise: !pi().quantise } }), 'QUANTISE: whole semitones (on), or free, in cents (off).');
  choices('pitch', 79, px, pw3, ['fixed', 'dive', 'rise'] as const, { fixed: 'FIXED', dive: 'DIVE', rise: 'RISE' }, () => pi().contour, (v) => set({ pitch: { ...pi(), contour: v } }), 'FIXED: one transposition. DIVE and RISE: along a stutter’s repeats, or a glide within a single hit.');
  // REVERSE
  rangeIn('reverse', 51, 'AMOUNT', { get: () => (re().amount - 0.1) / 0.9, set: (v) => set({ reverse: { ...re(), amount: 0.1 + v * 0.9 } }), format: () => pct(re().amount), label: 'Reverse amount', tip: 'AMOUNT (PARTIAL): how much of the reversed sound plays: less is a shorter swell into the hit.' });
  choices('reverse', 65, px, pw3, ['whole', 'partial'] as const, { whole: 'WHOLE', partial: 'PARTIAL' }, () => re().mode, (v) => set({ reverse: { ...re(), mode: v } }), 'WHOLE: the whole sample backwards. PARTIAL: only AMOUNT of it.');
  choices('reverse', 79, px, pw3, ['hit', 'alternate', 'cluster'] as const, { hit: 'EACH', alternate: 'ALTERN', cluster: 'CLUSTER' }, () => re().pattern, (v) => set({ reverse: { ...re(), pattern: v } }), 'EACH chosen hit; ALTERNATE: every other one (or every other repeat of a stutter); CLUSTER: with the next hits of the track in the beat.');
  // GATE
  rangeIn('gate', 51, 'LENGTH', { get: () => Math.log2(ga().len * 16) / 4, set: (v) => set({ gate: { ...ga(), len: 2 ** (v * 4) / 16 } }), format: () => `${(ga().len * 4).toFixed(2)} 16TH`, label: 'Gate length', tip: 'LENGTH: how long the sound plays before the gate shuts, from a 64th note to a quarter note.' });
  choices('gate', 65, px, pw3, ['short', 'medium', 'long'] as const, { short: 'SHORT', medium: 'MEDIUM', long: 'LONG' }, () => (ga().len === GATE_LENGTHS.short ? 'short' : ga().len === GATE_LENGTHS.medium ? 'medium' : ga().len === GATE_LENGTHS.long ? 'long' : ('' as 'short')), (v) => set({ gate: { ...ga(), len: GATE_LENGTHS[v] } }), 'SHORT 1/32, MEDIUM 1/16, LONG 1/8.');
  choices('gate', 79, px, pw3, ['hard', 'soft'] as const, { hard: 'HARD', soft: 'SOFT' }, () => ga().shape, (v) => set({ gate: { ...ga(), shape: v } }), 'HARD: cut quickly. SOFT: faded out over half the length.');
  toggle('gate', [px + 3 * (pw3 + 2), 79, 2 * pw3 + 2, 12], 'RHYTHMIC', () => ga().rhythmic, () => set({ gate: { ...ga(), rhythmic: !ga().rhythmic } }), 'RHYTHMIC: the gate opens and shuts at the LENGTH while the sound rings (a trance gate), instead of cutting it once.');
  // TAPE STOP
  rangeIn('tape', 51, 'DURATION', { get: () => (ta().len - 0.25) / 1.75, set: (v) => set({ tape: { ...ta(), len: 0.25 + v * 1.75 } }), format: () => `${ta().len.toFixed(2)} BEAT`, label: 'Tape stop duration', tip: 'DURATION: how long the slowdown takes, a sixteenth to two beats.' });
  rangeIn('tape', 65, 'FALL', { get: () => (ta().fall - 0.2) / 0.75, set: (v) => set({ tape: { ...ta(), fall: 0.2 + v * 0.75 } }), format: () => pct(ta().fall), label: 'Tape stop pitch fall', tip: 'PITCH FALL: how far the speed (and with it the pitch) falls: 50% is down an octave, 95% almost to a halt.' });
  choices('tape', 79, px, pw3, ['cut', 'resume'] as const, { cut: 'CUT', resume: 'RESUME' }, () => ta().end, (v) => set({ tape: { ...ta(), end: v } }), 'CUT: silence until the window ends. RESUME: back up to speed over the same time.');

  el('div', 'rule', b, [4, 108, W - 8]);
  const report = el('div', 'label tiny', b, [5, 112, W - 10]);
  const legacy = el('div', 'label tiny', b, [5, 124, W - 4 - 70 - 10]);
  const removeLegacy = new Button(b, [W - 4 - 70, 121, 70, 12], 'REMOVE', { cls: 'small', tip: 'Remove the earlier CHOP ▸ DESTROY (Phase 12) from this break. ⌘Z brings it back.', onPress: () => app.removeLegacyDestroy() });

  function update(): void {
    const s = d();
    enable.text = s.on ? 'ENABLED' : 'DISABLED';
    enable.on = s.on;
    master.update();
    again.disabled = !s.on;
    take.textContent = `TAKE ${s.take + 1}`;
    names.forEach((x, k) => (x.on = EFFECT_ORDER[k] === fx));
    cells.forEach((rowBtns, k) => rowBtns.forEach((c, j) => (c.on = (s.matrix[CATEGORIES[j]!] ?? []).includes(EFFECT_ORDER[k]!))));
    for (const [g, els] of Object.entries(groups)) for (const e of els) e.style.display = g === fx ? '' : 'none';
    head.textContent = EFFECT_LABEL[fx];
    setTip(head, FX_TIP[fx]);
    prob.update();
    for (const f of upd) f();
    for (const x of [master.el, prob.el]) x.classList.toggle('inactive', !s.on);
    report.textContent = describeDestroy2(s, app.current.destroy2).toUpperCase();
    setTip(report, 'What DESTROY did to this pattern. RECIPE ▸ GROOVE ▸ CHOP ▸ HAND EDITS ▸ DESTROY ▸ PATTERN: it never compounds on its own result, and DISABLED gives the pattern back. MIDI export has the hits (a stutter’s repeats are notes); pitch, reverse, gate and tape stop are sample playback and are not in a MIDI file.');
    const old = app.recipe.destroy;
    legacy.textContent = old?.on ? `THIS BREAK ALSO HAS THE EARLIER CHOP ▸ DESTROY: ${describeDestroy(app.current.destroy, old)}`.toUpperCase() : 'DESTROY RUNS AFTER CHOP AND YOUR HAND EDITS · ⌘Z UNDOES EVERY CHANGE';
    removeLegacy.el.style.display = old ? '' : 'none';
  }
  update();
  return { update };
}
