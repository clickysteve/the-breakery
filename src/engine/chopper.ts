/**
 * CHOP: a transformation of a finished GROOVE. It cuts the break into musically meaningful
 * FRAGMENTS and rearranges them, the way a producer edits a sampled break (Collins' phrase / block
 * / repeat cutting; Hockman and Davies on resequencing: docs/BREAKBEAT_RESEARCH.md §4), but on the
 * sequencer's events: nothing here touches audio.
 *
 * Non-destructive and deterministic: RESULT = CHOP(SOURCE, settings, seed). The source is never
 * changed (every hit placed is a copy), and the same source, recipe, settings and seeds always give
 * the same result. AMOUNT 0 returns the source exactly.
 *
 * 1. ANALYSIS. The phrase is cut on its bar lines and on a grid of SLICE SIZE (a half bar, a beat,
 *    an eighth, a sixteenth); the recipe joins some neighbouring slices into longer phrases (FUNK,
 *    HIP-HOP) or splits some into shorter ones (JUNGLE, BREAKCORE). A cut never falls inside a roll
 *    or a tom fill, so they move whole. Each fragment knows what it holds: a downbeat kick, a
 *    backbeat, a fill, its weight in the phrase. Crashes and a layered four-on-the-floor kick are
 *    ANCHORS of the arrangement and stay where they are.
 * 2. DECISION. Each slice in turn is kept or edited. The chance grows with AMOUNT, through the bar
 *    (later beats change more than the downbeat) and through the phrase (the groove bar least, the
 *    turnaround most), and falls where a slice carries a backbeat the recipe protects. The very
 *    first slice is never edited: the loop always starts as the groove does.
 * 3. OPERATIONS. An edited slice plays, instead of its own material:
 *      RECALL     another fragment of the same length: preferring the same place in an earlier bar
 *                 (a recognisable motif), a fragment that starts with a kick or snare, a backbeat
 *                 where a backbeat was, the first half of the bar answering in the second half
 *                 (call and response), and, where the recipe likes it, a fragment displaced off
 *                 the grid. Fills are not recalled into the groove.
 *      SWAP       exchanged with the next slice of the bar (A B C D → A B D C).
 *      REPEAT     what just played, again (the end of a phrase repeated; A B B).
 *      DOUBLE     its first half twice (B → B B): every drum in it repeats together.
 *      RETRIGGER  its lead sound (the snare, in snare-led recipes) retriggered as a roll into the
 *                 next slice, on the existing roll representation (role 'roll' strokes SPEED apart,
 *                 a crescendo), so the ROLLS tab and the editor see an ordinary roll.
 *      GAP        silence (sometimes keeping its kick): a deliberate drop-out.
 *    DOUBLE and RETRIGGER are the retriggers: RETRIGGER 0 never makes one, and each bar has a
 *    ceiling, so a hard chop never becomes one long snare roll. With ROLL GENERATION off (revision
 *    1) RETRIGGER makes no rolls: DOUBLE, a fragment repeated, is all the retriggering CHOP does.
 * 4. CONTINUITY. Every copied hit keeps its drum, velocity (a ghost stays a ghost), microtiming and
 *    sample; swing follows its new place on the grid. Recipes that protect the backbeat get it
 *    back in any bar the edits left without one. Duplicates are merged (the louder wins).
 *
 * The recipe weights the same operations (CHOP_STYLE) rather than having an algorithm of its own.
 * Every number is a DESIGN HYPOTHESIS, set by inspecting generated phrases; whether a chop sounds
 * good needs listening.
 */
import { swingDelay } from './performance';
import { stream, type Rng } from './rng';
import { rollGroups } from './rolls';
import { CATEGORY_LABEL, clamp, SLICE_SIZES, SLICE_STEPS, STEPS, TPB, TPS, type BarRole, type BreakEvent, type Category, type ChopOp, type ChopReport, type ChopSettings, type Recipe, type SliceSize, type Style } from './types';

/** CHOP's default settings (off until ENABLED). */
export const defaultChop = (): ChopSettings => ({ on: false, amount: 0.4, slice: 'medium', retrigger: 0.25, variant: 0 });

/** Stored CHOP settings made safe (absent or malformed: none). */
export function sanitiseChop(v: unknown): ChopSettings | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Partial<ChopSettings>;
  const d = defaultChop();
  const unit = (x: unknown, f: number) => (x !== null && x !== undefined && Number.isFinite(Number(x)) ? clamp(Number(x), 0, 1) : f);
  return {
    on: o.on === true,
    amount: unit(o.amount, d.amount),
    slice: (SLICE_SIZES as readonly string[]).includes(String(o.slice)) ? (o.slice as SliceSize) : d.slice,
    retrigger: unit(o.retrigger, d.retrigger),
    variant: Number.isFinite(Number(o.variant)) && Number(o.variant) > 0 ? Math.min(Math.floor(Number(o.variant)), 999999) : 0,
  };
}

/** Does this recipe's CHOP change anything? (Off, or AMOUNT 0: the GROOVE as it is.) */
export const chopActive = (c: ChopSettings | undefined | null): c is ChopSettings => !!c && c.on && c.amount > 0;

/** How a recipe chops: weights on the shared operations. */
export interface ChopStyle {
  /** < 0: join slices into longer phrases; > 0: split slices into shorter fragments */
  grain: number;
  /** how readily slices are edited */
  edit: number;
  recall: number;
  swap: number;
  repeat: number;
  double: number;
  retrigger: number;
  gap: number;
  /** 0..1: how strongly the backbeat stays where it is */
  backbeat: number;
  /** 0..1: snare-led edits (fragments that start with a snare are chosen; the snare is what retriggers) */
  snareLed: number;
  /** weight of recalling the same place of an earlier bar (a recognisable motif) */
  motif: number;
  /** weight of recalling a fragment displaced off the slice grid */
  displace: number;
  /** phrase-end emphasis: repeats and retriggers into the top of the loop */
  tail: number;
  /** retrigger stroke spacings in grid ticks, slow to fast (12 = sixteenths, 6 = 32nds, 4 = 32nd triplets, 3 = 64ths) */
  speeds: number[];
  /** retriggers (DOUBLE and RETRIGGER) per bar */
  maxRetrig: number;
  /** the SLICE SIZE CHOP starts with for this recipe (the one its producers would reach for) */
  slice: SliceSize;
}

// prettier-ignore
export const CHOP_STYLE: Record<Style, ChopStyle> = {
  // longer coherent fragments, subtle displacement, occasional repeated phrases, the backbeat kept
  funk:      { grain: -0.6, edit: 0.85, recall: 1,   swap: 0.25, repeat: 0.6, double: 0.35, retrigger: 0.2,  gap: 0.1,  backbeat: 0.9,  snareLed: 0.2, motif: 1.5, displace: 0.35, tail: 0.4, speeds: [12, 6],       maxRetrig: 1, slice: 'large' },
  // groove continuity, repeated motifs, short variations, deliberate gaps
  hiphop:    { grain: -0.3, edit: 0.75, recall: 0.8, swap: 0.2,  repeat: 1,   double: 0.5,  retrigger: 0.25, gap: 0.6,  backbeat: 0.8,  snareLed: 0.2, motif: 2,   displace: 0.15, tail: 0.5, speeds: [6, 12],       maxRetrig: 1, slice: 'medium' },
  // short fragments, snare-led edits, syncopated repeats, retriggers, call and response
  jungle:    { grain: 0.5,  edit: 1,    recall: 1,   swap: 0.8,  repeat: 0.8, double: 0.8,  retrigger: 0.9,  gap: 0.2,  backbeat: 0.35, snareLed: 1,   motif: 1,   displace: 0.7,  tail: 1,   speeds: [12, 6, 4, 3], maxRetrig: 2, slice: 'small' },
  broken:    { grain: 0.2,  edit: 0.9,  recall: 0.8, swap: 1,    repeat: 0.5, double: 0.4,  retrigger: 0.3,  gap: 0.35, backbeat: 0.4,  snareLed: 0.5, motif: 0.8, displace: 1,    tail: 0.6, speeds: [6, 4],        maxRetrig: 1, slice: 'small' },
  boombap:   { grain: -0.3, edit: 0.7,  recall: 0.7, swap: 0.15, repeat: 1.1, double: 0.5,  retrigger: 0.2,  gap: 0.7,  backbeat: 0.9,  snareLed: 0.2, motif: 2.2, displace: 0.1,  tail: 0.5, speeds: [6, 12],       maxRetrig: 1, slice: 'medium' },
  hardcore:  { grain: 0.3,  edit: 0.9,  recall: 0.8, swap: 0.6,  repeat: 0.9, double: 0.7,  retrigger: 0.7,  gap: 0.2,  backbeat: 0.55, snareLed: 0.8, motif: 1,   displace: 0.4,  tail: 1,   speeds: [12, 6, 4],    maxRetrig: 2, slice: 'small' },
  // drive, controlled edits, a recognisable kick/snare, short turnaround fills
  dnb:       { grain: 0.1,  edit: 0.8,  recall: 0.9, swap: 0.45, repeat: 0.6, double: 0.5,  retrigger: 0.5,  gap: 0.15, backbeat: 0.8,  snareLed: 0.7, motif: 1.2, displace: 0.3,  tail: 1.4, speeds: [12, 6],       maxRetrig: 1, slice: 'medium' },
  halftime:  { grain: -0.2, edit: 0.8,  recall: 0.8, swap: 0.3,  repeat: 0.7, double: 0.4,  retrigger: 0.45, gap: 0.5,  backbeat: 0.85, snareLed: 0.5, motif: 1.2, displace: 0.3,  tail: 0.9, speeds: [8, 4],        maxRetrig: 1, slice: 'medium' },
  garage:    { grain: 0,    edit: 0.7,  recall: 0.7, swap: 0.5,  repeat: 0.8, double: 0.5,  retrigger: 0.35, gap: 0.3,  backbeat: 0.8,  snareLed: 0.3, motif: 1.4, displace: 0.5,  tail: 0.6, speeds: [8, 4],        maxRetrig: 1, slice: 'medium' },
  electro:   { grain: 0,    edit: 0.7,  recall: 0.6, swap: 0.4,  repeat: 1,   double: 0.7,  retrigger: 0.5,  gap: 0.4,  backbeat: 0.8,  snareLed: 0.4, motif: 1.4, displace: 0.2,  tail: 0.8, speeds: [12, 6],       maxRetrig: 1, slice: 'small' },
  // small fragments, aggressive repetition, abrupt changes, many retriggers: still on the grid
  breakcore: { grain: 1,    edit: 1.25, recall: 0.9, swap: 1,    repeat: 1.1, double: 1,    retrigger: 1.3,  gap: 0.3,  backbeat: 0.15, snareLed: 0.9, motif: 0.7, displace: 0.8,  tail: 1.2, speeds: [6, 4, 3],     maxRetrig: 3, slice: 'micro' },
};

/** Faster retriggers are softer (as ROLLS plays them). */
const SPEED_LEVEL: Record<number, number> = { 12: 1, 8: 0.95, 6: 0.9, 4: 0.85, 3: 0.78 };
/** How much each bar of the phrase may change. */
const BAR_WEIGHT: Record<BarRole, number> = { A: 0.75, A2: 0.9, B: 1.15, F: 1.1, T: 1.25 };
/** Which drum a retrigger repeats, in order of preference. */
const LEAD: Category[] = ['snare', 'kick', 'perc', 'htom', 'mtom', 'ltom', 'open', 'hat', 'ride', 'ghost'];

const tickOf = (e: Pick<BreakEvent, 'bar' | 'step' | 'sub'>) => e.bar * TPB + e.step * TPS + e.sub;
const isBackbeat = (e: BreakEvent) => e.cat === 'snare' && (e.role === 'backbeat' || e.role === 'displaced backbeat');
/** Anchors of the arrangement: they stay where they are, whatever is chopped around them. */
const isAnchor = (e: BreakEvent) => e.cat === 'crash' || e.role === 'floor kick';
const isFillHit = (e: BreakEvent) => e.role === 'fill' || e.role === 'roll';
const where = (bar: number, step: number) => `${bar + 1}.${Math.floor(step / 4) + 1}.${(step % 4) + 1}`;
/** The generator's explanation under any number of CHOP copies. */
const baseWhy = (w: string): string => {
  const m = /^CHOP: [^(]*\((.*)\)$/.exec(w);
  return m ? baseWhy(m[1]!) : w;
};
const frag = (sl: Slice) => `the ${where(sl.bar, sl.start)} fragment`;
const OP_NAME: Record<ChopOp, string> = { recall: 'recalled', swap: 'swapped', repeat: 'repeated', double: 'doubled', retrigger: 'retriggered', gap: 'dropped out' };

/** A slice of the phrase: steps [start, start + len) of one bar. */
interface Slice {
  bar: number;
  start: number;
  len: number;
}

export interface ChopContext {
  recipe: Pick<Recipe, 'style' | 'swing' | 'bars'> & Partial<Pick<Recipe, 'rollsOn' | 'revision'>>;
  /** the bar roles of the phrase (groove, answer, development, fill, turnaround) */
  plan: BarRole[];
  /** the BEAT seed (FREEZE BEAT keeps the chop) */
  seed: number;
  /** the recipe's CHOP_STYLE as BREAK DNA leans it (absent: the recipe's own) */
  style?: ChopStyle;
}

/** A roll or a tom fill, first to last hit (grid ticks from the start of the break): never cut. */
type Span = [number, number];

/** The rolls and tom fills of a break. */
export function atomicSpans(events: readonly BreakEvent[], bars: number): Span[] {
  const spans: Span[] = rollGroups(events as BreakEvent[]).map((g) => [g.start, g.end]);
  for (let bar = 0; bar < bars; bar++) {
    const toms = events.filter((e) => e.bar === bar && e.role === 'fill' && (e.cat === 'htom' || e.cat === 'mtom' || e.cat === 'ltom')).map(tickOf);
    if (toms.length) spans.push([Math.min(...toms), Math.max(...toms)]);
  }
  return spans;
}

/** Does a cut at tick `t` fall inside a span (after its first hit, up to and including its last)? */
const cutsInside = (spans: readonly Span[], t: number) => spans.some(([a, b]) => a < t && t <= b);

/**
 * The slices of every bar: the SLICE SIZE grid, some joined or split by the recipe, never cutting
 * a roll or a tom fill. Draws a fixed number of values per bar, whatever the recipe does with them.
 */
export function slicePhrase(spans: readonly Span[], bars: number, size: SliceSize, cs: ChopStyle, rng: Rng): Slice[] {
  const unit = SLICE_STEPS[size];
  const out: Slice[] = [];
  for (let bar = 0; bar < bars; bar++) {
    const cuts = new Set<number>();
    for (let s = 0; s <= STEPS; s += unit) cuts.add(s);
    // join pairs of slices (longer phrases) or split slices (shorter fragments)
    for (let s = 0; s + 2 * unit <= STEPS; s += 2 * unit) if (rng.next() < -cs.grain * (unit >= 8 ? 0.2 : 0.55)) cuts.delete(s + unit);
    for (let s = 0; s < STEPS; s += unit) if (rng.next() < cs.grain * 0.45 && unit > 1) cuts.add(s + unit / 2);
    const inside = (c: number) => cutsInside(spans, bar * TPB + c * TPS);
    const list = [...cuts].filter((c) => c === 0 || c === STEPS || !inside(c)).sort((a, b) => a - b);
    for (let i = 0; i + 1 < list.length; i++) out.push({ bar, start: list[i]!, len: list[i + 1]! - list[i]! });
  }
  return out;
}

/**
 * CHOP the events of a break. Returns new events (the source is not changed) and what was done.
 * AMOUNT 0 (or CHOP off) returns the source events themselves.
 */
export function chop(source: readonly BreakEvent[], settings: ChopSettings, ctx: ChopContext): { events: BreakEvent[]; report: ChopReport } {
  if (!chopActive(settings)) return { events: source as BreakEvent[], report: { slices: 0, edited: 0, ops: {} } };
  const cs = ctx.style ?? CHOP_STYLE[ctx.recipe.style] ?? CHOP_STYLE.funk;
  const bars = ctx.plan.length;
  const tag = settings.variant ? `:${settings.variant}` : '';
  const spans = atomicSpans(source, bars);
  const slices = slicePhrase(spans, bars, settings.slice, cs, stream(ctx.seed, `chop-slices${tag}`));
  const rng = stream(ctx.seed, `chop${tag}`);
  const amount = settings.amount;
  const retrig = settings.retrigger;
  // ROLL GENERATION off (revision 1): RETRIGGER makes no new rolls; DOUBLE (fragments repeated) still plays
  const noRolls = ctx.recipe.rollsOn === false && (ctx.recipe.revision ?? 0) >= 1;
  const swing = ctx.recipe.swing;

  const anchors = source.filter(isAnchor).map((e) => ({ ...e }));
  const body = source.filter((e) => !isAnchor(e));
  const byBar: BreakEvent[][] = Array.from({ length: bars }, () => []);
  for (const e of body) if (e.bar >= 0 && e.bar < bars) byBar[e.bar]!.push(e);
  /** source events in steps [start, start + len) of a bar */
  const window = (bar: number, start: number, len: number) => byBar[bar]!.filter((e) => e.step >= start && e.step < start + len);
  const backbeatIn = (bar: number, start: number, len: number) => window(bar, start, len).some(isBackbeat);
  const fillBar = (bar: number) => ctx.plan[bar] === 'F' || ctx.plan[bar] === 'T';
  /** a recalled window must not cut a roll or a tom fill either */
  const cutsSpan = (bar: number, start: number, len: number) => cutsInside(spans, bar * TPB + start * TPS) || cutsInside(spans, bar * TPB + (start + len) * TPS);

  /** copies of backbeats played somewhere else */
  const movedBackbeats = new WeakSet<BreakEvent>();
  /** copies of `evs`, moved by `shift` grid ticks, played `gain` times as loud; `what` says where they come from */
  const place = (evs: readonly BreakEvent[], shift: number, op: ChopOp | null, what = '', gain = 1): BreakEvent[] =>
    evs.map((e) => {
      const t = tickOf(e) + shift;
      const bar = Math.floor(t / TPB);
      const step = Math.floor((t - bar * TPB) / TPS);
      const sub = t - bar * TPB - step * TPS;
      if (!shift && !op) return { ...e };
      const moved = step !== e.step || sub !== e.sub;
      const keepRole = !moved || e.role === 'roll' || e.cat === 'ghost';
      const ds = moved ? swingDelay(step + sub / TPS, swing) - swingDelay(e.step + e.sub / TPS, swing) : 0;
      const vel = Math.round(clamp(e.vel * gain, 1, 127));
      const copy: BreakEvent = {
        ...e,
        bar,
        step,
        sub,
        level: e.level * gain,
        vel,
        swing: Math.round((e.swing + ds) * 1000) / 1000 || 0,
        offsetMs: bar === 0 && step === 0 && sub === 0 ? Math.max(0, e.offsetMs) : e.offsetMs,
        role: keepRole ? e.role : 'chop',
        why: `CHOP: ${what || 'a fragment'} ${OP_NAME[op ?? 'recall']} at ${where(bar, step)} (${baseWhy(e.why)})`,
      };
      if (moved && (isBackbeat(e) || movedBackbeats.has(e))) movedBackbeats.add(copy);
      return copy;
    });

  const out: BreakEvent[][] = [];
  const ops: Partial<Record<ChopOp, number>> = {};
  const decided: (ChopOp | null)[] = [];
  const retrigsInBar = new Map<number, number>();
  const gapsInBar = new Map<number, number>();
  /** a SWAP decided by the slice before: this slice plays that slice's material */
  let forced: Slice | null = null;
  /** the window the previous slice recalled (a cut can play on into the next slice) */
  let lastSrc: Slice | null = null;
  const maxRetrig = cs.maxRetrig + (retrig > 0.75 ? 1 : 0);
  const lastBar = bars - 1;
  const bbProtect = backbeatProtection(cs, amount);

  // ---- which slices are edited: how many follows AMOUNT (the sum of each slice's chance, so a
  // MEDIUM chop always edits something), which ones a weighted draw made once per slice. The order
  // does not depend on AMOUNT, so a higher AMOUNT edits the same slices and more: a stronger
  // version of the same chop, never a different one.
  const chance = (sl: Slice, a: number) => {
    if (sl.bar === 0 && sl.start === 0) return 0; // the loop always starts as the groove does
    const own = window(sl.bar, sl.start, sl.len);
    const barW = bars === 1 ? 0.9 : sl.bar === 0 ? 0.15 : BAR_WEIGHT[ctx.plan[sl.bar] ?? 'A'];
    const posW = 0.65 + 0.7 * ((sl.start + sl.len / 2) / STEPS);
    // a short slice holding the backbeat IS the backbeat: protected; a long one may be edited, and its
    // edit keeps the backbeat where it was (RECALL prefers fragments with a backbeat in the same place)
    let protect = backbeatIn(sl.bar, sl.start, sl.len) ? 1 - backbeatProtection(cs, a) * clamp(2 / sl.len, 0.3, 1) : 1;
    // a fill (or a roll) ending a section is its phrase ending: kept at low AMOUNT
    if (fillBar(sl.bar) && own.some(isFillHit)) protect *= 1 - 0.75 * (1 - a);
    return clamp(Math.pow(a, 0.85) * cs.edit * barW * posW * protect, 0, 0.92);
  };
  const order = stream(ctx.seed, `chop-order${tag}`);
  const keys = slices.map((sl) => {
    const w = chance(sl, 0.5);
    const u = order.next();
    return w > 0 ? Math.pow(u, 1 / w) : -1;
  });
  const count = Math.min(keys.filter((k) => k >= 0).length, Math.floor(slices.reduce((sum, sl) => sum + chance(sl, amount), 0) + order.next()));
  const edit = new Set(keys.map((k, i) => [k, i] as const).filter(([k]) => k >= 0).sort((a, b) => b[0] - a[0]).slice(0, count).map(([, i]) => i));

  slices.forEach((sl, i) => {
    // every slice draws the same numbers, whatever is decided, so changing AMOUNT or RETRIGGER never
    // shifts what a later slice draws
    const uOp = rng.next();
    const uSrc = rng.next();
    const uVar = rng.next();
    const uMisc = rng.next();
    const own = window(sl.bar, sl.start, sl.len);
    const origin = sl.bar * TPB + sl.start * TPS;
    const ownSig = signature(own, origin);
    const shiftTo = (from: Slice) => (sl.bar - from.bar) * TPB + (sl.start - from.start) * TPS;
    const keep = () => {
      out.push(place(own, 0, null));
      decided.push(null);
      lastSrc = null;
    };
    // recipes that protect the backbeat keep it where it was through an edit (the fragment around it changes)
    const holdBackbeat = cs.backbeat >= 0.5 && uMisc < cs.backbeat * (1 - 0.4 * amount);
    /** an edit is taken only when it changes what is heard; otherwise the slice is kept */
    const take = (op: ChopOp, edited: BreakEvent[], src: Slice | null = null): boolean => {
      let evs = edited;
      if (holdBackbeat && op !== 'gap') {
        for (const b of own.filter(isBackbeat)) {
          if (evs.some((e) => e.cat === 'snare' && tickOf(e) === tickOf(b) && e.vel >= b.vel * 0.8)) continue;
          evs = [...evs.filter((e) => !((e.cat === 'ghost' || e.cat === 'snare') && tickOf(e) === tickOf(b))), { ...b }];
        }
      }
      // nor gains one on a beat where it had none (a snare on 3 turns a two-step into something else)
      if (cs.backbeat >= 0.5 && uMisc < cs.backbeat + (1 - cs.backbeat) * (1 - amount) && op !== 'gap') {
        if (!own.some(isBackbeat)) evs = evs.filter((e) => !(movedBackbeats.has(e) && e.sub === 0 && e.step % 4 === 0));
      }
      if (signature(evs, origin) === ownSig) return false;
      out.push(evs);
      decided.push(op);
      ops[op] = (ops[op] ?? 0) + 1;
      lastSrc = src;
      return true;
    };
    const recallFrom = (src: Slice) => take('recall', place(window(src.bar, src.start, src.len), shiftTo(src), 'recall', frag(src)), src);
    if (forced) {
      const f = forced;
      forced = null;
      if (!take('swap', place(window(f.bar, f.start, f.len), shiftTo(f), 'swap', frag(f)))) keep();
      return;
    }
    if (!edit.has(i)) return keep();
    const bbSlice = backbeatIn(sl.bar, sl.start, sl.len);

    // ---- which operation (short slices favour repeats and retriggers over moving single hits)
    const next = slices[i + 1];
    const phraseEnd = sl.bar === lastBar && sl.start + sl.len === STEPS;
    const short = sl.len === 1 ? 1 : sl.len === 2 ? 0.5 : 0;
    const roomRetrig = (retrigsInBar.get(sl.bar) ?? 0) < maxRetrig && (decided[i - 1] !== 'retrigger' || cs.maxRetrig >= 3);
    const w: Record<ChopOp, number> = {
      recall: cs.recall * (1 - 0.4 * short),
      // with the next slice of the bar (a swap that would move the backbeat is as rare as the recipe protects it)
      swap: next && next.bar === sl.bar && next.len === sl.len ? cs.swap * (1 - 0.75 * short) * (backbeatIn(next.bar, next.start, next.len) === backbeatIn(sl.bar, sl.start, sl.len) ? 1 : 1 - cs.backbeat) : 0,
      // (never a retrigger again: that would only lengthen it past the ceiling)
      repeat: i > 0 && decided[i - 1] !== 'retrigger' && (decided[i - 1] !== 'double' || roomRetrig) ? cs.repeat * (1 + 0.3 * short) * (decided[i - 1] === 'repeat' ? 0.35 : 1) * (sl.start === 0 ? 0.3 : 1) * (phraseEnd ? 1 + 2 * cs.tail : 1) : 0,
      double: roomRetrig && sl.len >= 2 ? cs.double * retrig * 2 : 0,
      retrigger: roomRetrig && !noRolls ? cs.retrigger * retrig * 2 * (1 + 0.2 * short) * (phraseEnd ? 1 + 2 * cs.tail : 1) : 0,
      gap: (gapsInBar.get(sl.bar) ?? 0) === 0 && decided[i - 1] !== 'gap' && sl.len <= (cs.gap >= 0.5 ? 8 : 4) && !phraseEnd ? cs.gap * (sl.start === 0 ? 0.2 : 1) * (bbSlice ? 1 - bbProtect : 1) : 0,
    };
    const names = Object.keys(w) as ChopOp[];
    // chosen from this slice's own draw (rng.weighted would draw again, and shift every later slice)
    let op: ChopOp = 'recall';
    const total = names.reduce((sum, k) => sum + Math.max(0, w[k]), 0);
    let r = uOp * total;
    for (const k of names) {
      r -= Math.max(0, w[k]);
      if (r < 0) {
        op = k;
        break;
      }
    }

    if (op === 'swap') {
      const n = next!;
      if (take('swap', place(window(n.bar, n.start, n.len), shiftTo(n), 'swap', frag(n)))) {
        forced = { bar: sl.bar, start: sl.start, len: sl.len };
        return;
      }
    } else if (op === 'repeat') {
      // what just played, again: the last `len` sixteenths before this slice
      const before = out.flat().filter((e) => tickOf(e) >= origin - sl.len * TPS && tickOf(e) < origin);
      if (take('repeat', place(before, sl.len * TPS, 'repeat', `the ${sl.len === 1 ? 'sixteenth' : `${sl.len} sixteenths`} before it`, 0.96))) return;
    } else if (op === 'gap') {
      const kick = uMisc < 0.45 ? own.filter((e) => e.cat === 'kick').slice(0, 1) : [];
      if (take('gap', place(kick, 0, null))) {
        gapsInBar.set(sl.bar, 1);
        return;
      }
    } else if (op === 'double') {
      // quarters (B b b b) for fine-grained recipes at strong RETRIGGER, else halves (B B)
      const parts = sl.len >= 4 && cs.grain > 0.3 && uVar < retrig - 0.4 ? 4 : 2;
      const piece = sl.len / parts;
      const head = window(sl.bar, sl.start, piece);
      const evs: BreakEvent[] = [];
      for (let k = 0; k < parts; k++) evs.push(...place(head, k * piece * TPS, k ? 'double' : null, `the first ${piece === 1 ? 'sixteenth' : `${piece} sixteenths`} of ${frag(sl)}`, k ? 0.95 : 1));
      if (take('double', evs)) {
        retrigsInBar.set(sl.bar, (retrigsInBar.get(sl.bar) ?? 0) + 1);
        return;
      }
    } else if (op === 'retrigger') {
      const lead = leadOf(own, cs) ?? leadOf(window(sl.bar, 0, STEPS), cs);
      if (lead && take('retrigger', retrigger(sl, own, lead, cs, retrig, uVar, uSrc, swing, place))) {
        retrigsInBar.set(sl.bar, (retrigsInBar.get(sl.bar) ?? 0) + 1);
        return;
      }
    }
    // RECALL (and what an edit that would change nothing falls back to). A cut may play on: the
    // previous slice's recalled window continues into this one (a longer fragment, displaced)
    const prev = lastSrc as Slice | null;
    if (prev && uVar < (sl.len <= 2 ? 0.65 : 0.35) && prev.start + prev.len + sl.len <= STEPS && !cutsSpan(prev.bar, prev.start + prev.len, sl.len) && recallFrom({ bar: prev.bar, start: prev.start + prev.len, len: sl.len })) return;
    // the drawn fragment first, then the others in order of preference, until one changes the slice
    const cands = chooseRecall(sl, uSrc, { bars, cs, plan: ctx.plan, window, backbeatIn, fillBar, cutsSpan, ownSig: (bar, start) => signature(window(bar, start, sl.len), bar * TPB + start * TPS) === ownSig });
    for (const src of cands.slice(0, 6)) if (recallFrom(src)) return;
    keep();
  });

  // ---- continuity: recipes that protect the backbeat get it back in any bar left without one
  if (cs.backbeat >= 0.5 || amount < 0.4) {
    for (let bar = 0; bar < bars; bar++) {
      const bb = byBar[bar]!.filter(isBackbeat);
      if (!bb.length) continue;
      const has = out.some((evs, i) => slices[i]!.bar === bar && evs.some((e) => e.cat === 'snare' && bb.some((b) => b.step === e.step && b.sub === e.sub)));
      if (has) continue;
      const i = slices.findIndex((sl) => sl.bar === bar && bb[0]!.step >= sl.start && bb[0]!.step < sl.start + sl.len);
      if (i < 0) continue;
      const was = decided[i];
      if (was) ops[was] = Math.max(0, (ops[was] ?? 1) - 1);
      out[i] = place(window(bar, slices[i]!.start, slices[i]!.len), 0, null);
      decided[i] = null;
    }
  }

  // ---- merge: one hit per drum and place (the louder), a ghost under a snare and a hat under an open hat are not doubled
  const m = new Map<string, BreakEvent>();
  for (const e of [...out.flat(), ...anchors]) {
    if (e.bar < 0 || e.bar >= bars) continue;
    const k = `${e.cat}|${tickOf(e)}`;
    const o = m.get(k);
    if (!o || e.vel > o.vel) m.set(k, e);
  }
  const events = [...m.values()]
    .filter((e) => !(e.cat === 'ghost' && m.has(`snare|${tickOf(e)}`)) && !(e.cat === 'hat' && m.has(`open|${tickOf(e)}`)))
    .sort((a, b) => tickOf(a) - tickOf(b) || a.cat.localeCompare(b.cat));
  for (const k of Object.keys(ops) as ChopOp[]) if (!ops[k]) delete ops[k];
  return { events, report: { slices: slices.length, edited: decided.filter(Boolean).length, ops } };
}

/** How strongly the backbeat stays: more at low AMOUNT, whatever the recipe, so a light chop keeps the groove readable. */
const backbeatProtection = (cs: ChopStyle, amount: number) => (cs.backbeat + (1 - cs.backbeat) * 0.7 * (1 - amount) ** 2) * (1 - 0.6 * amount);

/** What a run of hits sounds like, relative to `origin`: drums and places (not the small differences in velocity). */
function signature(evs: readonly BreakEvent[], origin: number): string {
  return evs.map((e) => `${e.cat}|${tickOf(e) - origin}`).sort().join(',');
}

const SPEED_NAME: Record<number, string> = { 12: '1/16', 8: '1/16T', 6: '1/32', 4: '1/32T', 3: '1/64' };

/**
 * RETRIGGER: the lead sound repeated as a roll into the next slice. The first half of the slice keeps
 * its material and the second half retriggers; at strong RETRIGGER (or in a one-sixteenth slice) the
 * whole slice does. Strokes are SPEED apart on the grid, a crescendo, with the swing of their start
 * (a roll moves as a whole, as in ROLLS).
 */
function retrigger(sl: Slice, own: BreakEvent[], lead: BreakEvent, cs: ChopStyle, retrig: number, uVar: number, uSpeed: number, swing: number, place: (evs: readonly BreakEvent[], shift: number, op: ChopOp | null) => BreakEvent[]): BreakEvent[] {
  const whole = sl.len === 1 || uVar < retrig - 0.55;
  const rs = whole ? sl.start : sl.start + Math.max(1, Math.floor(sl.len / 2));
  const span = (sl.start + sl.len - rs) * TPS;
  // faster at higher RETRIGGER; always at least two strokes
  const choices = cs.speeds.filter((d) => span / d >= 2);
  const d = choices.length ? choices[Math.min(choices.length - 1, Math.floor(clamp(uSpeed * 0.6 + retrig * 0.55, 0, 0.999) * choices.length))]! : Math.max(3, Math.floor(span / 2));
  const n = Math.max(2, Math.floor(span / d));
  const kept = whole ? [] : place(own.filter((e) => e.step < rs), 0, null);
  const t0 = sl.bar * TPB + rs * TPS;
  const sw = Math.round(swingDelay(rs, swing) * 1000) / 1000 || 0;
  const scale = SPEED_LEVEL[d] ?? 0.8;
  const into = sl.start + sl.len === STEPS ? `the downbeat of bar ${sl.bar + 2}` : where(sl.bar, sl.start + sl.len);
  const strokes: BreakEvent[] = [];
  for (let k = 0; k < n; k++) {
    const t = t0 + k * d;
    const step = Math.floor((t - sl.bar * TPB) / TPS);
    const sub = (t - sl.bar * TPB) % TPS;
    const f = n > 1 ? k / (n - 1) : 1;
    // the lead's own dynamic (a ghost retriggers softly), growing into the next slice
    const vel = Math.round(clamp(lead.vel * (0.58 + 0.4 * f) * scale, 1, 127));
    strokes.push({
      ...lead,
      bar: sl.bar,
      step,
      sub,
      level: vel / 127,
      vel,
      swing: sw,
      offsetMs: sl.bar === 0 && step === 0 && sub === 0 ? Math.max(0, lead.offsetMs) : lead.offsetMs,
      role: 'roll',
      why: `CHOP retrigger: the ${where(lead.bar, lead.step)} ${CATEGORY_LABEL[lead.cat].toLowerCase()} retriggered ${n} × ${SPEED_NAME[d] ?? `${d}/12 of a sixteenth`} into ${into}`,
    });
  }
  return [...kept, ...strokes];
}

/** The sound a retrigger repeats: the loudest snare (snare-led recipes) or the first strong hit. */
function leadOf(evs: readonly BreakEvent[], cs: ChopStyle): BreakEvent | undefined {
  const hits = evs.filter((e) => !isAnchor(e) && e.role !== 'roll');
  if (!hits.length) return undefined;
  if (cs.snareLed >= 0.5) {
    const sn = hits.filter((e) => e.cat === 'snare').sort((a, b) => b.vel - a.vel)[0];
    if (sn) return sn;
  }
  const t0 = Math.min(...hits.map(tickOf));
  const atStart = hits.filter((e) => tickOf(e) === t0);
  return atStart.sort((a, b) => LEAD.indexOf(a.cat) - LEAD.indexOf(b.cat))[0];
}

interface RecallTools {
  bars: number;
  cs: ChopStyle;
  plan: BarRole[];
  window: (bar: number, start: number, len: number) => BreakEvent[];
  backbeatIn: (bar: number, start: number, len: number) => boolean;
  fillBar: (bar: number) => boolean;
  cutsSpan: (bar: number, start: number, len: number) => boolean;
  /** does this window sound like the slice's own material? (recalling it would change nothing) */
  ownSig: (bar: number, start: number) => boolean;
}

/** RECALL: the fragments that could play in this slice: the one drawn first, then the rest by preference (empty: none fits). */
function chooseRecall(sl: Slice, u: number, t: RecallTools): Slice[] {
  const { cs } = t;
  const grid = Math.min(sl.len, 4);
  const align = Math.max(1, sl.len >= 2 ? sl.len / 2 : 1);
  const slotBackbeat = t.backbeatIn(sl.bar, sl.start, sl.len);
  const slotFill = t.fillBar(sl.bar) && sl.start >= 8;
  const cands: Slice[] = [];
  const weights: number[] = [];
  for (let bar = 0; bar < t.bars; bar++) {
    for (let start = 0; start + sl.len <= STEPS; start += align) {
      if (bar === sl.bar && start === sl.start) continue;
      const evs = t.window(bar, start, sl.len);
      if (t.cutsSpan(bar, start, sl.len) || t.ownSig(bar, start)) continue;
      let w = 1;
      if (!evs.length) w *= 0.05;
      if (start === sl.start) w *= 1 + cs.motif; // the same place in another bar: a motif
      if (bar * STEPS + start < sl.bar * STEPS + sl.start) w *= 1.6; // an earlier fragment
      if (bar === sl.bar && start < 8 && sl.start >= 8) w *= 1.4; // the first half answered in the second
      const lead = evs.filter((e) => e.step === start && e.sub === 0);
      if (lead.some((e) => e.cat === 'kick' || isBackbeat(e))) w *= 1.5 + cs.snareLed * (lead.some((e) => e.cat === 'snare') ? 1 : 0.2);
      const bb = t.backbeatIn(bar, start, sl.len);
      if (slotBackbeat) w *= bb ? 1 + 2.5 * cs.backbeat : 1 - 0.85 * cs.backbeat;
      else if (bb) w *= 1 - 0.6 * cs.backbeat; // a backbeat where none was moves the backbeat
      if (start % grid !== sl.start % grid) w *= cs.displace; // off the slice grid: displaced
      if (!slotFill && (evs.some(isFillHit) || (t.fillBar(bar) && start >= 8))) w *= 0.15; // a fill in the groove
      if (w <= 0) continue;
      cands.push({ bar, start, len: sl.len });
      weights.push(w);
    }
  }
  if (!cands.length) return [];
  const total = weights.reduce((s, w) => s + w, 0);
  let r = u * total;
  let pick = cands.length - 1;
  for (let i = 0; i < cands.length; i++) {
    r -= weights[i]!;
    if (r < 0) {
      pick = i;
      break;
    }
  }
  const rest = cands.map((c, i) => [c, weights[i]!] as const).filter((_, i) => i !== pick).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  return [cands[pick]!, ...rest];
}

/** One line on what CHOP did (status line and the CHOP tab). */
export function describeChop(r: ChopReport | undefined): string {
  if (!r || !r.slices) return 'CHOP is off: the pattern is the GROOVE.';
  if (!r.edited) return `CHOP: none of the ${r.slices} slices edited at this AMOUNT.`;
  const parts = (Object.keys(OP_NAME) as ChopOp[]).filter((k) => r.ops[k]).map((k) => `${r.ops[k]} ${OP_NAME[k]}`);
  return `CHOP: ${r.edited} of ${r.slices} slices edited (${parts.join(', ')}).`;
}
