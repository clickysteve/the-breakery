/**
 * ROLLS (engine 2): fast runs of strokes on one drum, as real events (each stroke is a hit that
 * can be selected, moved, deleted or changed by hand), never an audio effect.
 *
 * A roll LEADS INTO something: it ends one stroke before its ANCHOR, a strong hit or a phrase
 * boundary, and that is what makes it musical rather than a scatter of fast hits:
 *   backbeat     a snare roll anticipating the backbeat (funk drags, jungle snare bursts)
 *   downbeat     into the next bar's downbeat or the loop point (descending tom rolls, kick
 *                doubles and triples, the roll into the top)
 *   section      into a new four-bar section (after the half-way fill)
 *   tom fill     into the first stroke of a tom fill (snare roll, then round the toms)
 *   beat         a hat flurry into a beat, pushing the groove forward
 * PLACE chooses which anchors count (BEFORE ACCENT, PHRASE END, FILLS, ANYWHERE); TARGETS which
 * drums may roll (the recipe weighs between them, and the anchor does too: snares lead into
 * backbeats, toms descend into the top of the loop, kicks double into a downbeat, hats push into
 * a beat). AMOUNT and the recipe (styles.ts FLOURISH) set how many: at most one roll a bar, and
 * the first groove bar stays as it is, so the groove is never buried.
 *
 * A roll keeps its subdivision exactly: its strokes are SPEED apart (1/16 … 1/64, triplets
 * included) in grid ticks, and swing shifts the roll as a whole (by its anchor's swing) rather
 * than warping the strokes. A roll never runs over a backbeat, a downbeat kick, a crash, a tom
 * fill or another roll, nor across a bar line: it is shortened. The hands go to the roll, so
 * timekeeping, ghosts and percussion inside a snare or tom roll stop. Faster rolls are played
 * softer (a 64th roll at full force is a roar, and clips).
 *
 * Like TOMS, rolls are a layer after the performance from their own streams (the BEAT seed for
 * what and where, the FEEL seed for how): ROLLS never changes another hit, ROLLS 0 adds nothing,
 * and FREEZE BEAT keeps the rolls.
 */
import { posName } from './meter';
import type { Rng } from './rng';
import type { Flourish, StyleDef } from './styles';
import { contour } from './toms';
import { clamp, ROLL_SPEED_LABEL, ROLL_TICKS, TOMS, TPB, TPS, type BarRole, type BreakEvent, type Category, type Feel, type Recipe, type RollTarget } from './types';

type AnchorKind = 'backbeat' | 'downbeat' | 'section' | 'tomfill' | 'beat';

interface Anchor {
  kind: AnchorKind;
  /** grid tick from the start of the break (a roll ends one stroke before it) */
  tick: number;
  weight: number;
  /** its swing, in sixteenths (the roll moves with it) */
  swing: number;
  what: string;
}

const HANDS: Category[] = ['hat', 'open', 'ride', 'ghost', 'perc'];
/** Faster rolls are softer. */
const SPEED_LEVEL: Record<number, number> = { 12: 1, 8: 0.95, 6: 0.9, 4: 0.85, 3: 0.78 };
/** How each drum suits each anchor. */
const SUITS: Record<AnchorKind, Record<RollTarget, number>> = {
  backbeat: { snare: 1.6, hat: 0.5, perc: 0.5, tom: 0.4, kick: 0.15 },
  downbeat: { snare: 1.2, hat: 0.6, perc: 0.5, tom: 1.5, kick: 1 },
  section: { snare: 1.2, hat: 0.5, perc: 0.4, tom: 1.4, kick: 0.8 },
  tomfill: { snare: 1.6, hat: 0.2, perc: 0.3, tom: 0.4, kick: 0.2 },
  beat: { snare: 0.15, hat: 1.6, perc: 1, tom: 0, kick: 0 },
};

const tickOf = (e: Pick<BreakEvent, 'bar' | 'step' | 'sub'>) => e.bar * TPB + e.step * TPS + e.sub;
const isBackbeat = (e: BreakEvent) => e.cat === 'snare' && (e.role === 'backbeat' || e.role === 'displaced backbeat');

export interface RollContext {
  def: StyleDef;
  fl: Flourish;
  recipe: Recipe;
  feel: Feel;
  roles: BarRole[];
  timekeeper: 'hat' | 'ride';
}

/** The strokes' levels (0..1) for a roll of n strokes. */
export function rollLevels(n: number, dynamics: Recipe['rollDynamics'], rng: Rng, onSixteenth: (k: number) => boolean): number[] {
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const f = n > 1 ? k / (n - 1) : 1;
    let l: number;
    if (dynamics === 'even') l = 0.62;
    else if (dynamics === 'crescendo') l = 0.36 + 0.52 * f;
    else if (dynamics === 'decrescendo') l = 0.88 - 0.52 * f;
    else if (dynamics === 'alternating') l = k % 2 === 0 ? 0.74 : 0.44;
    else l = 0.4 + 0.42 * f + rng.range(-0.08, 0.08) + (onSixteenth(k) ? 0.05 : 0);
    out.push(clamp(l, 0.1, 1));
  }
  return out;
}

export function addRolls(events: BreakEvent[], ctx: RollContext, rng: Rng, frng: Rng): BreakEvent[] {
  const { def, fl, recipe, feel, roles } = ctx;
  const targets = recipe.rollTargets;
  if (recipe.rolls <= 0 || !targets.length) return events;
  const bars = roles.length;
  const d = ROLL_TICKS[recipe.rollSpeed];
  const total = bars * TPB;
  let out = events.slice();

  // ---- the anchors this PLACE allows
  const place = recipe.rollPlace;
  const any = place === 'anywhere';
  const fillBar = (bar: number) => roles[bar] === 'T' || roles[bar] === 'F' || bars === 1;
  // groove bars (A) stay the groove unless rolls may go ANYWHERE (and the first never changes);
  // every answer bar (A2) is the same bar, so its roll is chosen once, in the first, and copied
  const firstA2 = roles.indexOf('A2');
  const okBar = (bar: number) => bar >= 0 && bar < bars && (bars === 1 || (bar > 0 && (roles[bar] !== 'A' || any) && (roles[bar] !== 'A2' || bar === firstA2)));
  const anchors: Anchor[] = [];
  const add = (kind: AnchorKind, tick: number, weight: number, what: string, swing = 0) => {
    const bar = Math.floor((tick - 1) / TPB);
    if (!okBar(bar) || weight <= 0) return;
    if (place === 'fills' && !fillBar(bar)) return;
    anchors.push({ kind, tick, weight, swing, what });
  };
  for (const e of out) {
    if (isBackbeat(e) && (place === 'accent' || any || place === 'fills')) add('backbeat', tickOf(e), roles[e.bar] === 'A' ? 0.6 : 1, `the backbeat on ${posName(e.step)}`, e.swing);
    if (e.role === 'fill' && (e.cat === 'htom' || e.cat === 'mtom' || e.cat === 'ltom') && !out.some((x) => x.bar === e.bar && x.role === 'fill' && TOMS.includes(x.cat as (typeof TOMS)[number]) && tickOf(x) < tickOf(e)))
      add('tomfill', tickOf(e), 1.3, 'the tom fill', e.swing);
  }
  for (let bar = 0; bar < bars; bar++) {
    const end = (bar + 1) * TPB;
    const last = bar === bars - 1;
    const section = roles[bar] === 'F' || (bars >= 6 && bar === 3);
    if (last) add('downbeat', end, place === 'phrase' || place === 'fills' ? 3 : 1.6, 'the top of the loop');
    else if (section && place !== 'accent') add('section', end, place === 'phrase' ? 2 : 1.2, 'the next section');
    else if (place === 'accent' || any) add('downbeat', end, 0.7, `the downbeat of bar ${bar + 2}`);
    // hat flurries into the beats (momentum), where hats are allowed to roll
    if ((place === 'accent' || any) && targets.includes('hat')) for (const s of [4, 8, 12]) add('beat', bar * TPB + s * TPS, 0.35, `beat ${s / 4 + 1}`);
  }
  if (!anchors.length) return events;

  // ---- how many: AMOUNT, the recipe's appetite for rolls, and the room there is
  const room = place === 'phrase' ? Math.max(1, Math.ceil(bars / 4)) : place === 'fills' ? Math.max(1, roles.filter((r) => r === 'T' || r === 'F').length) : Math.max(1, bars - 1);
  const want = recipe.rolls * fl.rollP * room * (place === 'phrase' || place === 'fills' ? 1.4 : 0.8);
  const count = Math.min(bars === 1 ? 1 : bars - 1, Math.floor(want + rng.next()));

  const used = new Set<number>(); // bars with a roll already
  /** spans nothing may roll over: earlier rolls (generated fills too) and tom fills */
  const busy: [number, number, string][] = [];
  const spanOf = (pred: (e: BreakEvent) => boolean, what: string) => {
    for (let bar = 0; bar < bars; bar++) {
      const evs = out.filter((e) => e.bar === bar && pred(e));
      if (evs.length) busy.push([Math.min(...evs.map(tickOf)), Math.max(...evs.map(tickOf)) + 1, what]);
    }
  };
  spanOf((e) => e.role === 'roll', 'the fill’s roll');
  spanOf((e) => e.role === 'fill' && (e.cat === 'htom' || e.cat === 'mtom' || e.cat === 'ltom'), 'the tom fill');

  for (let i = 0; i < count; i++) {
    // every roll draws the same numbers whatever happens, so one roll's choice never shifts the next
    const pickA = rng.next();
    const pickT = rng.next();
    const pool = anchors.filter((a) => !used.has(Math.floor((a.tick - 1) / TPB)));
    if (!pool.length) break;
    const sum = pool.reduce((s, a) => s + a.weight, 0);
    let acc = 0;
    const a = pool.find((x) => (acc += x.weight / sum) > pickA) ?? pool[pool.length - 1]!;
    // which drum: the recipe's leaning, times how the drum suits the anchor
    const tw = targets.map((t) => fl.rollWeights[t] * SUITS[a.kind][t]);
    const tsum = tw.reduce((s, x) => s + x, 0);
    if (tsum <= 0) {
      anchors.splice(anchors.indexOf(a), 1);
      continue;
    }
    let tacc = 0;
    const ti = tw.findIndex((x) => (tacc += x / tsum) > pickT);
    const target = targets[ti < 0 ? targets.length - 1 : ti]!;

    // the span: N strokes ending one stroke before the anchor, inside its bar, clear of protected hits
    const bar = Math.floor((a.tick - 1) / TPB);
    let n = target === 'kick' && def.warp <= 0 ? Math.min(recipe.rollLength, 4) : recipe.rollLength;
    let end = a.tick;
    let into = a.what;
    // lead into a busy span (a fill's roll, a tom fill, another roll) rather than over it
    for (const [s0, , w] of busy)
      if (s0 < end && s0 > end - n * d && Math.floor(s0 / TPB) === bar) {
        end = s0;
        into = w;
      }
    let start = end - n * d;
    const floor = Math.max(bar * TPB, ...busy.filter(([, s1]) => s1 <= end).map(([, s1]) => s1));
    const protectedTicks = out.filter((e) => e.bar === bar && (isBackbeat(e) || e.cat === 'crash' || (e.cat === 'kick' && e.step === 0 && e.sub === 0))).map(tickOf).filter((t) => t < end);
    const lo = Math.max(floor, ...protectedTicks.map((t) => t + 1));
    while (start < lo && n > 0) {
      n--;
      start = end - n * d;
    }
    if (n < 2 || end > total) {
      used.add(bar);
      continue;
    }

    // the drum each stroke plays
    const cats: Category[] = [];
    for (let k = 0; k < n; k++) {
      if (target === 'tom') {
        // round the toms, high to low, into a downbeat or a new section; one tom into a backbeat
        const down = a.kind === 'downbeat' || a.kind === 'section';
        cats.push(down ? contour(k, n, true) : 'mtom');
      } else cats.push(target === 'hat' ? ctx.timekeeper : target === 'snare' ? 'snare' : target);
    }
    const levels = rollLevels(n, recipe.rollDynamics, frng, (k) => (start + k * d) % TPS === 0);
    const speedScale = SPEED_LEVEL[d] ?? 0.85;
    const drumScale = target === 'hat' ? 0.85 : target === 'perc' ? 0.9 : target === 'kick' ? 1.05 : 1;
    const base = target === 'kick' ? feel.kick : target === 'hat' ? feel.hats * 0.5 : target === 'perc' ? feel.hats * 0.3 : feel.snare * 0.3;
    const loose = recipe.rollDynamics === 'human' ? 1.2 * recipe.humanise * def.timingScale : 0;
    const desc = `${target === 'tom' && (a.kind === 'downbeat' || a.kind === 'section') ? 'descending tom' : target === 'hat' ? (ctx.timekeeper === 'ride' ? 'ride' : 'hat') : target === 'perc' ? 'percussion' : target === 'kick' ? 'kick' : target === 'tom' ? 'tom' : 'snare'} roll`;
    const why = `${desc}: ${n} × ${ROLL_SPEED_LABEL[recipe.rollSpeed]}, ${recipe.rollDynamics}, into ${into} (ROLLS)`;
    // early snares are heard as mistakes (as in the performance): at most 1 ms ahead
    const offs = cats.map((c) => Math.round(clamp(base + (loose ? frng.gauss() * loose : 0), c === 'snare' ? -1 : -18, 18) * 10) / 10 || 0);
    const bars2 = roles[bar] === 'A2' ? roles.flatMap((r, i) => (r === 'A2' ? [i] : [])) : [bar];
    for (const b2 of bars2) {
      const shift = (b2 - bar) * TPB;
      const s0 = start + shift;
      const s1 = end + shift;
      used.add(b2);
      busy.push([s0, s1, 'another roll']);
      // the hands go to a snare or tom roll; a hat roll replaces the hats it runs over
      out = out.filter((e) => {
        const t = tickOf(e);
        if (t < s0 || t >= s1) return true;
        if (isBackbeat(e) || e.cat === 'crash' || (e.cat === 'kick' && target !== 'kick')) return true;
        if (cats.includes(e.cat)) return false;
        if ((target === 'snare' || target === 'tom') && HANDS.includes(e.cat)) return false;
        if (target === 'hat' && (e.cat === 'hat' || e.cat === 'ride' || e.cat === 'open')) return false;
        return true;
      });
      for (let k = 0; k < n; k++) {
        const t = s0 + k * d;
        const step = Math.floor((t - b2 * TPB) / TPS);
        const sub = (t - b2 * TPB) % TPS;
        const cat = cats[k]!;
        if (out.some((e) => e.cat === cat && e.bar === b2 && e.step === step && e.sub === sub)) continue;
        out.push({
          cat,
          bar: b2,
          step,
          sub,
          level: levels[k]!,
          role: 'roll',
          why,
          vel: Math.round(clamp(levels[k]! * speedScale * drumScale * 127, 1, 127)),
          swing: a.swing,
          offsetMs: b2 === 0 && step === 0 && sub === 0 ? Math.max(0, offs[k]!) : offs[k]!,
          sample: null,
        });
      }
    }
  }
  return out.sort((x, y) => tickOf(x) - tickOf(y));
}

