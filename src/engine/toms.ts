/**
 * TOMS (engine 2): the toms take part in fills and phrase development. They are added AFTER the
 * performance, from their own seeded streams (the BEAT seed for what is played, the FEEL seed for
 * how), so turning TOMS up or down never changes any other hit of the break: its velocities,
 * timing and samples stay exactly as they were. TOMS 0 adds nothing and draws nothing.
 *
 * Where: mostly the turnaround (T) and the half-way fill (F), sometimes a development bar (B),
 * rarely an answer bar (A2), never the groove (A) itself. How likely follows TOMS, FILLS and the
 * recipe (styles.ts FLOURISH: funk and half-time go round the kit; hip-hop, boom bap and garage
 * barely touch the toms).
 *
 * What (musical figures, not random tom hits):
 *   descend    high → mid → low across the fill, the classic run into the top of the loop
 *              (often ending with the kick in unison on the low tom)
 *   ascend     low → mid → high, rising into the next bar
 *   alternate  snare and toms in turn (a snare/tom combination), the toms descending
 *   answer     one or two toms answering the backbeat on beat 4 (call and response)
 *   linear     toms with the kick on the beats, no two limbs together (a linear fill)
 * If the bar already has a generated snare fill, the toms RE-VOICE it (same rhythm, same
 * dynamics, the drums change), so the fill keeps its shape; otherwise they play their own
 * sixteenths (or eighths when FILLS is low), and the timekeeper and ghosts stop for them.
 *
 * Toms never borrow another category's sounds: without tom samples the tom hits are silent (the
 * pattern shows them dotted), and nothing else changes.
 */
import { posName } from './meter';
import { swingDelay } from './performance';
import type { Rng } from './rng';
import type { KitIndex } from './kit';
import type { Flourish, PhraseFigure, StyleDef, TomFigure } from './styles';
import { clamp, isTom, STEPS, TOMS, TPS, type BarRole, type BreakEvent, type Category, type Feel, type Recipe } from './types';

const FIGURES: TomFigure[] = ['descend', 'ascend', 'alternate', 'answer', 'linear'];
/** How readily each kind of bar gets toms. The groove itself never does. */
const BAR_WEIGHT: Record<BarRole, number> = { A: 0, A2: 0.15, B: 0.3, F: 0.75, T: 1 };
const HANDS: Category[] = ['hat', 'open', 'ride', 'ghost', 'perc'];

const TOM_NAME: Record<string, string> = { htom: 'high', mtom: 'mid', ltom: 'low' };

/** The tom for the k-th of n strokes of a run, spread evenly from high to low (or low to high), so a run always reaches the last tom. */
export function contour(k: number, n: number, down: boolean): Category {
  const i = n <= 1 ? 2 : Math.round((k * 2) / (n - 1));
  return TOMS[down ? i : 2 - i]!;
}

export interface TomContext {
  def: StyleDef;
  fl: Flourish;
  recipe: Recipe;
  feel: Feel;
  roles: BarRole[];
}

/** A tom-phrase hit (or a kick or snare of the figure): its level and feel from the FEEL stream, or those of the hit it re-voices (`like`). */
function maker(ctx: TomContext, frng: Rng) {
  const { def, recipe, feel } = ctx;
  const h = recipe.humanise * def.timingScale;
  return (bar: number, cat: Category, step: number, sub: number, level: number, why: string, like?: BreakEvent, role: BreakEvent['role'] = 'fill'): BreakEvent => {
    const drift = def.programmed ? 0 : frng.gauss() * 3 * h;
    const vel = like ? like.vel + (def.programmed ? 0 : Math.round(frng.gauss() * 2 * h)) : level * 127 + drift;
    let off = like ? like.offsetMs : clamp(feel.snare * 0.4 + (def.programmed ? 0 : frng.gauss() * 1.6 * h), cat === 'snare' ? -1 : -6, 12);
    if (bar === 0 && step === 0 && sub === 0) off = Math.max(0, off);
    return {
      cat,
      bar,
      step,
      sub,
      level,
      role,
      why,
      vel: Math.round(clamp(vel, 1, 127)),
      swing: like ? like.swing : Math.round(swingDelay(step + sub / TPS, recipe.swing) * 1000) / 1000 || 0,
      offsetMs: Math.round(off * 10) / 10 || 0,
      sample: null,
    };
  };
}

/** TOMS as released up to Phase 10 (revision 0): kept so breaks saved with it reproduce exactly. */
export function addToms(events: BreakEvent[], ctx: TomContext, rng: Rng, frng: Rng): BreakEvent[] {
  const { fl, recipe, roles } = ctx;
  if (recipe.toms <= 0) return events;
  let out = events.slice();
  const at = (bar: number, cat: Category, step: number, sub = 0) => out.find((e) => e.bar === bar && e.cat === cat && e.step === step && e.sub === sub);

  const make = maker(ctx, frng);

  // every A2 in a phrase is the same bar (the answer, repeated): its toms are decided once
  let answerDraw: number[] | null = null;
  roles.forEach((role, bar) => {
    // every bar draws the same numbers whatever happens, so one bar's choice never shifts another's
    const fresh = [rng.next(), rng.next(), rng.range(0.75, 1.25), rng.next()];
    if (role === 'A2') answerDraw ??= fresh;
    const [u, pick, lenF, kickEnd] = role === 'A2' ? answerDraw! : fresh;
    const single = roles.length === 1;
    const w = single ? 0.35 : BAR_WEIGHT[role];
    const fillBar = role === 'T' || role === 'F' || single;
    // tom fills need FILLS; toms in answer and development bars are a variation, so they need VARIATION
    const scale = fillBar ? (recipe.fills > 0.05 ? 0.5 + 0.8 * recipe.fills : 0) : recipe.variation;
    const p = clamp(recipe.toms * fl.tomP * w * scale * 1.6, 0, 0.95);
    if (!w || u! >= p) return;

    // the figure: development and answer bars keep it short
    const allowed = role === 'A2' || single ? ['answer'] : role === 'B' ? ['answer', 'alternate', 'linear', 'descend'] : FIGURES;
    const wts = FIGURES.map((f) => (allowed.includes(f) ? fl.tomFigures[f] : 0));
    let acc = 0;
    const total = wts.reduce((a, b) => a + b, 0);
    let fig: TomFigure = 'answer';
    for (let i = 0; i < FIGURES.length; i++) {
      acc += wts[i]! / total;
      if (pick! < acc) {
        fig = FIGURES[i]!;
        break;
      }
    }

    if (fig === 'answer') {
      // call and response: the toms answer the last backbeat of the bar
      const bb = out.filter((e) => e.bar === bar && e.cat === 'snare' && (e.role === 'backbeat' || e.role === 'displaced backbeat')).sort((a, b) => b.step - a.step)[0];
      const from = bb ? bb.step + 2 : 14;
      const slots = [from, from + 1].filter((s) => s < STEPS && !at(bar, 'snare', s) && !at(bar, 'kick', s));
      const two = recipe.toms > 0.45 && slots.length === 2;
      const use = two ? slots : slots.slice(-1);
      use.forEach((s, k) => {
        const cat: Category = two ? (k === 0 ? 'htom' : 'ltom') : 'mtom';
        out.push(make(bar, cat, s, 0, 0.74 + 0.06 * k, `${TOM_NAME[cat]} tom on ${posName(s)}: answers the ${bb ? `backbeat on ${posName(bb.step)}` : 'snare'} (call and response)`));
      });
      return;
    }

    // a snare roll stays on the snare (a roll round the toms is ROLLS' job): the toms end where it starts
    const rollAt = out.filter((e) => e.bar === bar && e.role === 'roll').reduce((m, e) => Math.min(m, e.step), STEPS);
    // the snare run of a generated fill, at most its last eight strokes
    const existing = out.filter((e) => e.bar === bar && e.cat === 'snare' && e.role === 'fill' && e.step < rollAt).sort((a, b) => a.step * TPS + a.sub - (b.step * TPS + b.sub)).slice(-8);
    const L = role === 'B' ? clamp(Math.round(2 + 2 * recipe.toms * lenF!), 2, 4) : clamp(Math.round((2 + 6 * recipe.toms * (0.4 + 0.6 * recipe.fills)) * lenF! * (role === 'F' ? 0.5 : 1)), 2, 8);
    const down = fig !== 'ascend';
    const label = fig === 'ascend' ? 'rising tom fill (low → mid → high)' : fig === 'alternate' ? 'snare and toms in turn' : fig === 'linear' ? 'linear fill: toms, with the kick on the beats' : 'tom fill descending (high → mid → low)';
    const into = role === 'T' ? 'into the top of the loop' : role === 'F' ? 'closing the first section' : 'developing the groove';

    if (existing.length >= 2 && fillBar) {
      // RE-VOICE the generated snare fill: its rhythm and dynamics stay, the drums change
      const voiced = fig === 'alternate' ? existing.filter((_, k) => k % 2 === 1) : existing;
      voiced.forEach((e, k) => {
        const cat = contour(k, voiced.length, down);
        out = out.filter((x) => x !== e);
        if (!at(bar, cat, e.step, e.sub)) out.push(make(bar, cat, e.step, e.sub, e.level, `${label}, ${into} (the snare fill, played round the toms)`, e));
      });
      const last = voiced[voiced.length - 1];
      if (last && (fig === 'descend' || fig === 'linear') && kickEnd! < 0.5 && !at(bar, 'kick', last.step, last.sub)) out.push(make(bar, 'kick', last.step, last.sub, 0.8, `kick with the low tom: the end of the ${label}`, last));
      return;
    }

    // the toms' own figure, on sixteenths (eighths when FILLS is low), at the end of the bar (or before its roll)
    const end = rollAt;
    const start = end - L;
    if (start < 4) return;
    const every = recipe.fills < 0.3 && L >= 4 ? 2 : 1;
    const steps: number[] = [];
    for (let s = start; s < end; s += every) steps.push(s);
    // the hands move to the toms: timekeeping, ghosts and percussion stop for the fill
    out = out.filter((e) => !(e.bar === bar && e.step >= start && e.step < end && HANDS.includes(e.cat)));
    // the backbeat keeps its place: the toms play round it (a snare/tom combination of its own)
    const backbeat = (s: number) => out.some((e) => e.bar === bar && e.step === s && e.sub === 0 && e.cat === 'snare' && (e.role === 'backbeat' || e.role === 'displaced backbeat'));
    const tomSteps = (fig === 'alternate' ? steps.filter((_, k) => k % 2 === 1) : fig === 'linear' ? steps.filter((s) => s % 4 !== 0) : steps).filter((s) => !backbeat(s));
    steps.forEach((s, k) => {
      const f = (k + 1) / steps.length;
      if (fig === 'alternate' && k % 2 === 0) {
        if (!at(bar, 'snare', s)) {
          out = out.filter((e) => !(e.bar === bar && e.cat === 'snare' && e.step === s));
          out.push(make(bar, 'snare', s, 0, 0.62 + 0.25 * f, `${label}, ${into}`));
        }
        return;
      }
      if (fig === 'linear' && s % 4 === 0) {
        if (!at(bar, 'kick', s)) out.push(make(bar, 'kick', s, 0, 0.8, `${label}, ${into}`));
        return;
      }
      const j = tomSteps.indexOf(s);
      if (j < 0) return;
      const cat = contour(j, tomSteps.length, down);
      // the first stroke on each drum a little firmer; the whole run grows towards its end
      const firstOnDrum = j === 0 || contour(j - 1, tomSteps.length, down) !== cat;
      if (at(bar, cat, s)) return;
      // a non-backbeat snare under a tom stroke would double it: the tom takes the place
      out = out.filter((e) => !(e.bar === bar && e.step === s && e.cat === 'snare' && e.role !== 'backbeat' && e.role !== 'displaced backbeat'));
      out.push(make(bar, cat, s, 0, (firstOnDrum ? 0.84 : 0.72) + 0.1 * f, `${label}, ${into}`));
    });
    const last = steps[steps.length - 1]!;
    if ((fig === 'descend' || fig === 'linear') && kickEnd! < 0.5 && !at(bar, 'kick', last)) out.push(make(bar, 'kick', last, 0, 0.8, `kick with the low tom: the end of the ${label}`));
  });

  return out.sort((a, b) => a.bar * STEPS * TPS + a.step * TPS + a.sub - (b.bar * STEPS * TPS + b.step * TPS + b.sub));
}

// ------------------------------------------------------------------ TOM PHRASES (revision 1)

/** The tom voices phrases may use: the toms that have samples, high to low; all three when none has (the MIDI notes still play them). */
export function tomVoices(kit?: KitIndex): Category[] {
  const have = TOMS.filter((t) => !!kit && kit[t].length > 0);
  return have.length ? [...have] : [...TOMS];
}

/** The voice for the k-th of n strokes, spread evenly over the voices from high to low (or low to high), so a run always reaches the last one. */
export function spread(k: number, n: number, down: boolean, voices: readonly Category[]): Category {
  const last = voices.length - 1;
  const i = n <= 1 ? last : Math.round((k * last) / (n - 1));
  return voices[down ? i : last - i]!;
}

const VOICE_NAME = (vs: readonly Category[]) => vs.map((v) => TOM_NAME[v]).join(' → ');
/** Phrases never start before the second beat: the downbeat and the first beat stay the groove's. */
const FLOOR = 4;
const PHRASE_FIGURES: PhraseFigure[] = ['descend', 'ascend', 'snare', 'alternate', 'linear', 'grouped', 'response', 'accent'];

/** How far each figure needs room: the strokes it needs at least, at most, and whether it belongs at the end of a bar or inside it. */
const FIGURE_FIT: Record<PhraseFigure, { min: number; max: number; end: boolean; mid: boolean }> = {
  descend: { min: 2, max: 8, end: true, mid: false },
  ascend: { min: 2, max: 8, end: true, mid: false },
  snare: { min: 3, max: 8, end: true, mid: false },
  alternate: { min: 4, max: 8, end: true, mid: false },
  linear: { min: 4, max: 8, end: true, mid: false },
  grouped: { min: 3, max: 6, end: true, mid: false },
  response: { min: 1, max: 3, end: true, mid: true },
  accent: { min: 1, max: 3, end: false, mid: true },
};

interface Slot {
  bar: number;
  /** a phrase at the end of the bar (a fill), or inside it (an accent or an answer) */
  end: boolean;
  weight: number;
  /** this slot's own draws: [order, figure, length, space, kick or voice] */
  d: number[];
}

/**
 * Revision 2's TOM ACTIVITY curve: phrases per bar (before the recipe's rate) for an activity.
 * 0 % none, 20 % occasional (about one phrase in four bars), 40 % noticeable, 60 % frequent,
 * 80 % very active, 100 % a phrase in nearly every place (both places in most bars), still placed
 * by rank, so the structure holds.
 */
export const tomCurve = (t: number): number => (t <= 0 ? 0 : 0.55 * t + 0.5 * t * t + 0.65 * t * t * t);

const pickFigure = (u: number, weights: Record<PhraseFigure, number>, ok: (f: PhraseFigure) => boolean): PhraseFigure | null => {
  const w = PHRASE_FIGURES.map((f) => (ok(f) ? Math.max(0, weights[f]) : 0));
  const total = w.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let acc = 0;
  for (let i = 0; i < PHRASE_FIGURES.length; i++) {
    acc += w[i]! / total;
    if (u < acc) return PHRASE_FIGURES[i]!;
  }
  for (let i = PHRASE_FIGURES.length - 1; i >= 0; i--) if (w[i]! > 0) return PHRASE_FIGURES[i]!;
  return null;
};

/**
 * TOM ACTIVITY (revision 1): tom PHRASES spread over the whole pattern. TOM ACTIVITY is an
 * intensity, not the chance of one fill: it sets how many phrases there are (the recipe's rate per
 * bar, so 0 % is none and 100 % is a phrase or more in most bars), how long they run, and so how
 * many hits and voices they use. Each bar offers two places:
 *   end     a fill into the next bar: strongest into the top of the loop, then the half-way fill
 *           and four-bar section ends, then the end of each two-bar unit, then any later bar
 *   inside  an answer to the backbeat or off-beat accents between the kick and snare
 * The places are ranked once per seed (the bar's weight, the recipe's taste for inside phrases,
 * a draw), and TOM ACTIVITY takes the first N: raising it only adds and lengthens phrases, it never
 * moves the ones already there. Every answer bar gets the same phrase (they are one bar, repeated).
 * The groove bars come last, so they stay the groove until TOM ACTIVITY is high and every other
 * place has a phrase (a programmed loop's bars before its fills too); the first bar always stays
 * the groove.
 *
 * The figures are the recipe's (styles.ts FLOURISH phrasing): descending and rising runs, snare into
 * toms, snare and toms in turn, linear fills with the kick, dotted-eighth groupings, answers and
 * accents. A bar with a generated snare fill is RE-VOICED (its rhythm and dynamics kept, the drums
 * changing), lengthened with tom strokes before it when TOM ACTIVITY wants a longer phrase. A
 * phrase leads into a fill's roll rather than over it. Toms never land on a backbeat or the
 * downbeat; inside the bar they keep off the kicks and snares. They use the toms with samples (all
 * three when none has any, for MIDI), so a kit with one tom plays its phrases on that one.
 *
 * Independent of ROLLS: a tom phrase is ordinary hits. ROLLS may lead into a tom phrase later, but
 * nothing here depends on it. From the BEAT seed (stream 'tom-phrases'), drawn in a fixed amount
 * per bar, so the rest of the break is unchanged whatever TOM ACTIVITY is.
 */
export function addTomPhrases(events: BreakEvent[], ctx: TomContext, rng: Rng, frng: Rng, voices: readonly Category[] = TOMS): BreakEvent[] {
  const { fl, recipe, roles } = ctx;
  const t = clamp(recipe.toms, 0, 1);
  if (t <= 0 || !voices.length) return events;
  const ph = fl.phrasing;
  const n = roles.length;
  // revision 2: the recalibrated curve (more and longer phrases as TOM ACTIVITY rises; see docs/tom-report.md)
  const rev2 = (recipe.revision ?? 0) >= 2;
  const make = maker(ctx, frng);
  let out = events.slice();
  const inBar = (bar: number) => out.filter((e) => e.bar === bar);
  const has = (bar: number, cat: Category, step: number, sub = 0) => out.some((e) => e.bar === bar && e.cat === cat && e.step === step && e.sub === sub);
  const isBackbeat = (e: BreakEvent) => e.cat === 'snare' && (e.role === 'backbeat' || e.role === 'displaced backbeat');
  const backbeatAt = (bar: number, step: number) => out.some((e) => e.bar === bar && e.step === step && e.sub === 0 && isBackbeat(e));
  const kickOrSnare = (bar: number, step: number) => out.some((e) => e.bar === bar && e.step === step && (e.cat === 'kick' || e.cat === 'snare'));
  const hasTom = (bar: number, step: number) => out.some((e) => e.bar === bar && e.step === step && isTom(e.cat));

  // ---- the places, with their draws (every A2 is the same bar: its draws are shared)
  const slots: Slot[] = [];
  const loopy = ctx.def.loop && recipe.variation < 0.5;
  let a2: number[] | null = null;
  roles.forEach((role, bar) => {
    const fresh = Array.from({ length: 10 }, () => rng.next());
    if (role === 'A2') a2 ??= fresh;
    const d = role === 'A2' ? a2! : fresh;
    const last = bar === n - 1;
    const section = (bar + 1) % 4 === 0;
    // a groove bar (A) comes last of all: it keeps the groove until every other place has a phrase
    // (in a programmed loop, BOOM BAP, GARAGE, ELECTRO at low VARIATION, so does every bar before the fills)
    const groove = !last && (role === 'A' || (loopy && role !== 'F'));
    const endW = n === 1 ? 10 : bar === 0 ? 0 : groove ? 0.3 : last ? 100 : role === 'F' ? 50 : section ? 20 : role === 'B' ? 8 : (bar + 1) % 2 === 0 ? 6 : 3;
    // revision 2: at the top of the range even the first bar may take an accent (never its first beat: FLOOR)
    const midW = n === 1 ? ph.mid : bar === 0 ? (rev2 && t >= 0.85 ? 0.1 * ph.mid : 0) : groove ? 0.25 * ph.mid : (role === 'A2' || role === 'B' ? 4 : 2) * ph.mid;
    // the order of the places varies with the seed; the phrase ends stay ahead of the rest
    if (endW) slots.push({ bar, end: true, weight: endW * (0.6 + 0.8 * d[0]!), d: d.slice(1, 5) });
    if (midW) slots.push({ bar, end: false, weight: midW * (0.6 + 0.8 * d[5]!), d: d.slice(6, 10) });
  });
  const uN = rng.next();
  slots.sort((a, b) => b.weight - a.weight || a.bar - b.bar);
  // ---- how many: TOM ACTIVITY × the recipe's rate × the bars (from 50 % there is always one)
  let count = Math.floor((rev2 ? tomCurve(t) * ph.rate * (n + 0.5) : t * ph.rate * n) + uN);
  if (t >= (rev2 ? 0.4 : 0.5)) count = Math.max(1, count);

  /** where the bar's toms already are: its fill's first stroke, its accents' last */
  const fillFrom = (bar: number) => inBar(bar).filter((e) => isTom(e.cat) && e.role === 'fill').reduce((m, e) => Math.min(m, e.step), STEPS);
  const accentsTo = (bar: number) => inBar(bar).filter((e) => isTom(e.cat) && e.role === 'accent').reduce((m, e) => Math.max(m, e.step), -1);

  const place = (slot: Slot): boolean => {
    const { bar } = slot;
    const role = roles[bar]!;
    const [uFig, uLen, uSpace, uMisc] = slot.d as [number, number, number, number];
    if (slot.end) {
      // a fill leads into a roll the GROOVE put at the end of the bar, never over it
      const end = inBar(bar).filter((e) => e.role === 'roll').reduce((m, e) => Math.min(m, e.step), STEPS);
      // and starts after any accents already inside the bar
      const floor = Math.max(FLOOR, accentsTo(bar) + 1);
      const fillBar = n === 1 || bar === n - 1 || role === 'F' || (bar + 1) % 4 === 0;
      const lenF = 0.75 + 0.5 * uLen;
      let L = fillBar ? 2 + (ph.reach * (0.85 + 0.3 * recipe.fills) - 2) * t * lenF : 2 + 2 * t * lenF;
      // revision 2: longer runs at high activity (up to 12 strokes into the top), shorter on a single tom
      if (rev2) L = fillBar ? 2 + (ph.reach * (0.85 + 0.3 * recipe.fills) * (1 + 0.5 * t * t) - 2) * t * lenF : 2 + 3.5 * t * lenF;
      if (role === 'F' && bar !== n - 1) L *= 0.65;
      L = clamp(Math.round(L), 2, rev2 ? (voices.length === 1 ? 6 : 12) : 8);
      let every = L >= 3 && uSpace < ph.space * (1.3 - t) ? 2 : 1;
      if (end - floor < L * every) every = 1;
      L = Math.min(L, end - floor);
      if (L < 2) return false;
      // the bar's generated snare fill (before any roll), which the toms re-voice
      const fill = inBar(bar).filter((e) => e.cat === 'snare' && e.role === 'fill' && e.step < end && e.step >= floor).sort((a, b) => a.step * TPS + a.sub - (b.step * TPS + b.sub));
      const revoice = fill.length >= 2;
      const fig = pickFigure(uFig, ph.figures, (f) => FIGURE_FIT[f].end && L >= FIGURE_FIT[f].min && L <= Math.max(FIGURE_FIT[f].max, FIGURE_FIT[f].min) && !(revoice && f === 'grouped') && !(f === 'response' && L > 3)) ?? 'descend';
      const down = fig !== 'ascend';

      // the strokes: the fill's own rhythm (lengthened before it if TOM ACTIVITY wants more), or the figure's
      let strokes: { step: number; sub: number; like?: BreakEvent }[];
      if (revoice) {
        const own = fill.slice(-L).map((e) => ({ step: e.step, sub: e.sub, like: e }));
        const before: { step: number; sub: number }[] = [];
        for (let s = own[0]!.step - every; before.length < L - own.length && s >= floor; s -= every) if (!backbeatAt(bar, s) && !hasTom(bar, s)) before.unshift({ step: s, sub: 0 });
        strokes = [...before, ...own];
      } else if (fig === 'grouped') {
        // dotted eighths into the bar line: 3 + 3 + 2
        strokes = [end - 14, end - 11, end - 8, end - 5, end - 2, end - 1].filter((s) => s >= floor).slice(-L).map((s) => ({ step: s, sub: 0 }));
      } else if (fig === 'response') {
        const bb = inBar(bar).filter((e) => isBackbeat(e) && e.step < end).sort((a, b) => b.step - a.step)[0];
        const from = bb ? bb.step + 2 : end - L;
        strokes = [];
        for (let s = from; s < end && strokes.length < L; s++) if (!kickOrSnare(bar, s)) strokes.push({ step: s, sub: 0 });
      } else {
        strokes = [];
        for (let s = end - L * every; s < end; s += every) strokes.push({ step: s, sub: 0 });
      }
      strokes = strokes.filter((p) => p.step >= floor && !(p.sub === 0 && backbeatAt(bar, p.step)));
      if (!strokes.length) return false;
      const first = strokes[0]!.step;

      // the hands move to the toms: timekeeping, ghosts and percussion stop for an own figure
      if (!revoice && fig !== 'response') out = out.filter((e) => !(e.bar === bar && e.step >= first && e.step < end && HANDS.includes(e.cat)));
      const into = bar === n - 1 ? 'into the top of the loop' : role === 'F' ? 'closing the first section' : (bar + 1) % 2 === 0 ? `into bar ${bar + 2}, a new two-bar phrase` : `into bar ${bar + 2}`;
      // which strokes are snares, kicks or toms
      const lead = fig === 'snare' ? Math.max(1, Math.round(strokes.length / 4)) : 0;
      const kind = (k: number, s: number): 'snare' | 'kick' | 'tom' => (k < lead || (fig === 'alternate' && k % 2 === 0) ? 'snare' : fig === 'linear' && s % 4 === 0 ? 'kick' : 'tom');
      const tomIdx = strokes.map((p, k) => (kind(k, p.step) === 'tom' ? k : -1)).filter((k) => k >= 0);
      const used = voices.length === 1 ? voices : tomIdx.length >= voices.length ? voices : [voices[0]!, voices[voices.length - 1]!];
      const shape = used.length === 1 ? `on the ${TOM_NAME[used[0]!]} tom` : `(${VOICE_NAME(down ? used : [...used].reverse())})`;
      const label =
        fig === 'ascend' ? `rising tom fill ${shape}`
        : fig === 'snare' ? `snare into a tom fill descending ${shape}`
        : fig === 'alternate' ? `snare and toms in turn ${shape}`
        : fig === 'linear' ? `linear fill: toms ${shape}, with the kick on the beats`
        : fig === 'grouped' ? `tom fill in dotted eighths (3 + 3 + 2) ${shape}`
        : fig === 'response' ? `toms answering the backbeat ${shape}`
        : `tom fill descending ${shape}`;
      const why = `${label}, ${into}${revoice ? ' (the snare fill, played round the toms)' : ''} (TOM ACTIVITY)`;
      strokes.forEach((p, k) => {
        const f = (k + 1) / strokes.length;
        const what = kind(k, p.step);
        if (what === 'snare') {
          // the fill's own snare stays as it is; a new one never doubles a kick (the kick plays that stroke)
          if (p.like || has(bar, 'snare', p.step, p.sub) || has(bar, 'kick', p.step, p.sub)) return;
          out.push(make(bar, 'snare', p.step, p.sub, 0.62 + 0.25 * f, why));
          return;
        }
        if (what === 'kick') {
          // linear: one limb at a time, so the kick takes the stroke from a fill snare (never from a backbeat)
          if (has(bar, 'kick', p.step, p.sub) || out.some((e) => e.bar === bar && e.step === p.step && e.sub === p.sub && isBackbeat(e))) return;
          out = out.filter((e) => !(e.bar === bar && e.step === p.step && e.sub === p.sub && (e.cat === 'snare' || e.cat === 'ghost')));
          out.push(make(bar, 'kick', p.step, p.sub, 0.8, why));
          return;
        }
        const j = tomIdx.indexOf(k);
        const cat = spread(j, tomIdx.length, down, used);
        if (has(bar, cat, p.step, p.sub)) return;
        // a snare that is not a backbeat gives way to the tom (a re-voiced one is replaced)
        out = out.filter((e) => !(e.bar === bar && e.step === p.step && e.sub === p.sub && e.cat === 'snare' && !isBackbeat(e)));
        out = out.filter((e) => !(e.bar === bar && e.step === p.step && e.sub === p.sub && (e.cat === 'ghost' || e.cat === 'perc')));
        const firstOnDrum = j === 0 || spread(j - 1, tomIdx.length, down, used) !== cat;
        out.push(make(bar, cat, p.step, p.sub, p.like ? p.like.level : (firstOnDrum ? 0.84 : 0.72) + 0.1 * f, why, p.like));
      });
      // the kick with the last low tom, sometimes (the classic end of a descending run)
      const lastP = strokes[strokes.length - 1]!;
      if ((fig === 'descend' || fig === 'snare' || fig === 'linear') && uMisc < 0.5 && !has(bar, 'kick', lastP.step, lastP.sub)) out.push(make(bar, 'kick', lastP.step, lastP.sub, 0.8, `kick with the last tom: the end of the ${label}`, lastP.like));
      return true;
    }

    // ---- inside the bar: an answer to the backbeat, or accents between the kick and snare
    const limit = Math.min(fillFrom(bar), 12);
    const fig = pickFigure(uFig, ph.figures, (f) => FIGURE_FIT[f].mid) ?? 'accent';
    // fewer strokes beside a long fill: the bar is not to be all toms
    const fillToms = inBar(bar).filter((e) => isTom(e.cat) && e.role === 'fill').length;
    const k = rev2
      ? clamp(1 + Math.round(4 * t * uLen), 1, fillToms >= 8 ? 1 : fillToms >= 6 ? 2 : voices.length === 1 ? 3 : 5)
      : clamp(1 + Math.round(2 * t * uLen), 1, fillToms >= 6 ? 1 : fillToms >= 4 ? 2 : 3);
    const free = (s: number) => s >= (bar === 0 ? FLOOR : FLOOR - 1) && s < limit && !kickOrSnare(bar, s) && !hasTom(bar, s);
    let steps: number[] = [];
    if (fig === 'response') {
      const bb = inBar(bar).filter((e) => isBackbeat(e) && e.step < limit).sort((a, b) => a.step - b.step)[0];
      if (bb) for (let s = bb.step + (k >= 3 ? 1 : 2); s < limit && steps.length < k; s++) if (free(s)) steps.push(s);
    } else {
      // off-beat sixteenths and eighths between the accents, ranked by this slot's draw
      const cands: number[] = [];
      for (let s = FLOOR - 1; s < limit; s++) if (s % 2 === 1 || s % 4 === 2) if (free(s) && !backbeatAt(bar, s + 1) && !backbeatAt(bar, s - 1)) cands.push(s);
      const score = (s: number) => (s % 4 === 2 ? 1.4 : 1) * (0.3 + ((uSpace * 9301 + s * 49297) % 233280) / 233280);
      steps = cands.sort((a, b) => score(b) - score(a)).slice(0, k).sort((a, b) => a - b);
    }
    if (!steps.length) return false;
    const answer = fig === 'response';
    // an answer descends; accents sit low (the floor tom), a pair calls high and answers low
    const accentVoice = voices[uMisc < 0.6 ? voices.length - 1 : uMisc < 0.85 ? Math.floor((voices.length - 1) / 2) : 0]!;
    steps.forEach((s, i) => {
      const cat = answer || steps.length > 1 ? spread(i, steps.length, true, voices) : accentVoice;
      out = out.filter((e) => !(e.bar === bar && e.step === s && (e.cat === 'ghost' || e.cat === 'perc')));
      const why = answer ? `${TOM_NAME[cat]} tom on ${posName(s)}: answers the backbeat (call and response, TOM ACTIVITY)` : `${TOM_NAME[cat]} tom accent on ${posName(s)}, between the kick and snare (TOM ACTIVITY)`;
      out.push(make(bar, cat, s, 0, answer ? 0.74 + 0.06 * i : 0.8 + 0.1 * uMisc, why, undefined, 'accent'));
    });
    return true;
  };

  // ---- the phrases, in rank order, until TOM ACTIVITY's count is reached (a place without room
  // passes its turn to the next). Every answer bar (A2) is the same bar: its phrase comes in all of
  // them or in none, and counts once.
  const done = new Set<Slot>();
  for (const slot of slots) {
    if (count <= 0) break;
    if (done.has(slot)) continue;
    const group = roles[slot.bar] === 'A2' ? slots.filter((x) => roles[x.bar] === 'A2' && x.end === slot.end) : [slot];
    let placed = false;
    for (const g of group) {
      done.add(g);
      placed = place(g) || placed;
    }
    if (placed) count--;
  }
  return out.sort((a, b) => a.bar * STEPS * TPS + a.step * TPS + a.sub - (b.bar * STEPS * TPS + b.step * TPS + b.sub));
}
