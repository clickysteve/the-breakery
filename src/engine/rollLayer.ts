/**
 * ROLLS as a TRANSFORMATION (revision 6, Phase 16). Before revision 6 the ROLLS layer was part of
 * the GROOVE (rolls.ts addRolls, drawn from the beat seed), so the only way to hear another roll
 * was BAKE, and PROBABILITY scaled a count of attempts at a few exact anchors rather than choosing
 * among the hits that could take a roll. Now ROLLS runs on the finished groove, after CHOP:
 *
 *   SOURCE GROOVE  ->  CHOP  ->  ROLLS  ->  EXPRESSION  ->  hand edits  ->  DESTROY
 *
 * A roll is a run of RETRIGGERS of one drum LEADING INTO one of its source hits (the CANDIDATE):
 * LENGTH strokes, SPEED apart, ending one stroke before the hit. The hit itself is never moved,
 * deleted or changed, and no other hit is touched: every source hit stays as it was, and the
 * strokes are extra events (role 'roll', `rollOf` the hit's key), so they are editable, drawn,
 * counted, exported and reshaped by EXPRESSION as every roll is.
 *
 * CANDIDATES are the source hits of the TARGET TRACKS (SNARE; HATS = closed hat and ride; PERC;
 * TOMS; KICK) that PLACEMENT allows, never a roll stroke already there (a fill's roll, a CHOP
 * retrigger):
 *   PHRASE END     hits in the last two beats of a bar that ends the phrase or one of its
 *                  sections (the last bar, a half-way fill bar, bar 4 of six or more): a window,
 *                  not one exact tick
 *   BEFORE ACCENT  accented hits (a backbeat, a hit on the beat) outside the groove (A) bars
 *   FILLS          hits in the fill bars (the turnaround and the half-way fill)
 *   ANYWHERE       any hit outside the first bar
 * ELIGIBLE: there is room for at least two strokes before the hit, inside its bar, after the
 * previous hit of the same drum and clear of any roll already there (a roll is shortened to fit).
 *
 * PROBABILITY is the chance that each eligible candidate gets a roll: 0% none, 100% every one
 * (at most MAX_PER_BAR rolls in a bar, the lowest draws first; the answer bars (A2) draw alike, so
 * they stay alike). Each candidate draws its own
 * number from the BEAT seed, the RE-ROLL take and its own key, so raising PROBABILITY only adds
 * rolls, a change elsewhere never reshuffles the rest, and RE-ROLL (the next take) draws again.
 * How the strokes are played (DYNAMICS, HUMAN looseness) comes from the FEEL seed and the take.
 */
import { posLabel } from './edits';
import { stream } from './rng';
import { rollLevels, SPEED_LEVEL } from './rolls';
import { STYLE_DEFS } from './styles';
import { CATEGORY_LABEL, clamp, MIN_ROLL, ROLL_SPEED_LABEL, ROLL_TICKS, ROLLS_REVISION, TPB, TPS, type BarRole, type BreakEvent, type Category, type Recipe, type RollPlace, type RollReport, type RollTarget, type Seeds } from './types';

/** Does this recipe's ROLLS run as the transformation (revision 6, or a break moved to it by a roll action)? */
export const usesRollLayer = (r: Recipe): boolean => r.engine === 2 && ((r.revision ?? 0) >= ROLLS_REVISION || r.rollLayer === true);

/** At most this many rolls in one bar, so 100% on a busy track stays a pattern rather than a roar. */
export const MAX_PER_BAR = 2;

/** The drums each target may roll. */
export const TARGET_CATS: Record<RollTarget, Category[]> = { snare: ['snare'], hat: ['hat', 'ride'], perc: ['perc'], tom: ['htom', 'mtom', 'ltom'], kick: ['kick'] };
const TARGET_WORD: Record<RollTarget, string> = { snare: 'SNARE', hat: 'HAT', perc: 'PERC', tom: 'TOM', kick: 'KICK' };
const PLACE_WORDS: Record<RollPlace, string> = { phrase: 'NEAR PHRASE ENDS', accent: 'ON ACCENTS OUTSIDE THE GROOVE BARS', fills: 'IN THE FILL BARS', anywhere: 'AFTER THE FIRST BAR' };

const tickOf = (e: Pick<BreakEvent, 'bar' | 'step' | 'sub'>) => e.bar * TPB + e.step * TPS + e.sub;
const keyOf = (e: Pick<BreakEvent, 'cat' | 'bar' | 'step' | 'sub'>) => `${e.cat}|${e.bar}|${e.step}|${e.sub}`;
const isBackbeat = (e: BreakEvent) => e.cat === 'snare' && (e.role === 'backbeat' || e.role === 'displaced backbeat');

/** The bars that end the phrase or one of its sections. */
export function phraseEndBars(roles: readonly BarRole[]): Set<number> {
  const n = roles.length;
  const out = new Set<number>([n - 1]);
  roles.forEach((r, i) => r === 'F' && out.add(i));
  if (n >= 6) out.add(3);
  return out;
}

/** Can PLACEMENT put a roll into this hit? (Before room and probability.) */
function placed(e: BreakEvent, place: RollPlace, roles: readonly BarRole[], ends: Set<number>): boolean {
  const bars = roles.length;
  if (place === 'phrase') return ends.has(e.bar) && e.step >= 8;
  if (bars > 1 && e.bar === 0) return false;
  if (place === 'fills') return bars === 1 || roles[e.bar] === 'T' || roles[e.bar] === 'F';
  if (place === 'accent') {
    if (roles[e.bar] === 'A') return false;
    const onBeat = e.sub === 0 && e.step % 4 === 0;
    return isBackbeat(e) || e.role === 'accent' || (onBeat && (e.cat === 'hat' || e.cat === 'ride' || e.vel >= 80));
  }
  return true;
}

export interface RollLayerResult {
  events: BreakEvent[];
  report: RollReport;
}

/** The targets in words ("SNARE", "SNARE/HAT"). */
export const targetWords = (ts: readonly RollTarget[]): string => ts.map((t) => TARGET_WORD[t]).join('/');

/**
 * The ROLLS transformation of `events` (the groove after CHOP). Pure and deterministic: the same
 * events, recipe, seeds and take give the same rolls. With ROLL GENERATION off it returns the
 * events untouched (and a report saying so).
 */
export function rollLayer(events: BreakEvent[], recipe: Recipe, seeds: Pick<Seeds, 'beat' | 'feel'>, roles: readonly BarRole[]): RollLayerResult {
  const take = recipe.rollTake ?? 0;
  const targets = recipe.rollTargets;
  const report: RollReport = { on: recipe.rollsOn !== false, take, candidates: 0, eligible: 0, capped: 0, rolls: 0, strokes: 0 };
  const words = `${targetWords(targets)} HITS ${PLACE_WORDS[recipe.rollPlace]}`;
  if (!report.on) return { events, report: { ...report, reason: 'ROLL GENERATION OFF' } };
  if (!targets.length) return { events, report: { ...report, reason: 'NO TARGET TRACKS' } };

  const cats = new Set(targets.flatMap((t) => TARGET_CATS[t]));
  const ends = phraseEndBars(roles);
  const d = ROLL_TICKS[recipe.rollSpeed];
  const def = STYLE_DEFS[recipe.style];
  // the spans rolls already there take (a fill's roll, CHOP's retriggers): a new roll never runs into one
  const busy = rollSpans(events);

  interface Cand {
    hit: BreakEvent;
    n: number;
    u: number;
  }
  const eligible: Cand[] = [];
  const sorted = events.slice().sort((a, b) => tickOf(a) - tickOf(b));
  /** target hits PLACEMENT allows that are roll strokes already (a fill's roll, a CHOP retrigger) */
  let rolled = 0;
  for (const e of sorted) {
    if (!cats.has(e.cat) || !placed(e, recipe.rollPlace, roles, ends)) continue;
    if (e.role === 'roll') {
      rolled++;
      continue;
    }
    report.candidates++;
    const t = tickOf(e);
    if (busy.some(([s0, s1]) => t >= s0 && t <= s1)) continue;
    // room: inside the bar, after the previous hit of this drum, after any roll ending before it
    const prev = sorted.filter((x) => x.cat === e.cat && tickOf(x) < t).map(tickOf);
    const floor = Math.max(e.bar * TPB, ...prev.map((x) => x + 1), ...busy.filter(([, s1]) => s1 < t).map(([, s1]) => s1 + 1));
    const want = e.cat === 'kick' && def.warp <= 0 ? Math.min(recipe.rollLength, 4) : recipe.rollLength;
    const n = Math.min(want, Math.floor((t - floor) / d));
    if (n < MIN_ROLL) continue;
    // the answer bars draw alike (each is the same bar), so their rolls stay alike
    const drawKey = roles[e.bar] === 'A2' ? `${e.cat}|A2|${e.step}|${e.sub}` : keyOf(e);
    eligible.push({ hit: e, n, u: stream(seeds.beat, `roll-layer:${take}:${drawKey}`).next() });
  }
  report.eligible = eligible.length;
  if (!report.candidates) return { events, report: { ...report, reason: rolled ? `THE ${words} ARE ROLLS ALREADY (A FILL'S OR CHOP'S)` : `NO ${words}` } };
  if (!eligible.length) return { events, report: { ...report, reason: `NO ROOM FOR A ${recipe.rollLength}-HIT ${ROLL_SPEED_LABEL[recipe.rollSpeed]} ROLL BEFORE THE ${report.candidates} ${words}` } };
  if (recipe.rolls <= 0) return { events, report: { ...report, reason: 'PROBABILITY 0%' } };

  // PROBABILITY over the eligible candidates, then at most MAX_PER_BAR a bar (the lowest draws win)
  const chosen = eligible.filter((c) => c.u < recipe.rolls);
  const perBar = new Map<number, Cand[]>();
  for (const c of chosen) perBar.set(c.hit.bar, [...(perBar.get(c.hit.bar) ?? []), c]);
  const keep = new Set<Cand>();
  for (const cs of perBar.values()) {
    const ok = cs.slice().sort((a, b) => a.u - b.u).slice(0, MAX_PER_BAR);
    report.capped += cs.length - ok.length;
    for (const c of ok) keep.add(c);
  }
  if (!keep.size) return { events, report: { ...report, reason: `NONE OF THE ${eligible.length} ELIGIBLE ${words} CHOSEN AT ${Math.round(recipe.rolls * 100)}%: RE-ROLL DRAWS AGAIN` } };

  const out = events.slice();
  const taken = new Set(events.map((e) => `${e.cat}|${tickOf(e)}`));
  const speedScale = SPEED_LEVEL[d] ?? 0.85;
  const loose = recipe.rollDynamics === 'human' ? 1.2 * recipe.humanise * def.timingScale : 0;
  for (const c of eligible) {
    if (!keep.has(c)) continue;
    const { hit, n } = c;
    const t = tickOf(hit);
    const start = t - n * d;
    const frng = stream(seeds.feel, `roll-layer:${take}:${keyOf(hit)}`);
    const levels = rollLevels(n, recipe.rollDynamics, frng, (k) => (start + k * d) % TPS === 0);
    const drumScale = hit.cat === 'hat' || hit.cat === 'ride' ? 0.85 : hit.cat === 'perc' ? 0.9 : hit.cat === 'kick' ? 1.05 : 1;
    const why = `${CATEGORY_LABEL[hit.cat].toLowerCase()} roll: ${n} × ${ROLL_SPEED_LABEL[recipe.rollSpeed]}, ${recipe.rollDynamics}, into the ${CATEGORY_LABEL[hit.cat].toLowerCase()} at ${posLabel(hit)} (ROLLS${take ? `, take ${take}` : ''})`;
    let made = 0;
    for (let k = 0; k < n; k++) {
      const tk = start + k * d;
      if (taken.has(`${hit.cat}|${tk}`)) continue;
      taken.add(`${hit.cat}|${tk}`);
      const r = tk - hit.bar * TPB;
      const step = Math.floor(r / TPS);
      const sub = r % TPS;
      // never louder than the hit it leads into: the hit stays the accent
      const vel = Math.round(clamp(levels[k]! * speedScale * drumScale * 127, 1, Math.max(1, hit.vel)));
      // early snares are heard as mistakes (as in the performance): at most 1 ms ahead
      const off = Math.round(clamp(hit.offsetMs + (loose ? frng.gauss() * loose : 0), hit.cat === 'snare' ? -1 : -18, 18) * 10) / 10 || 0;
      out.push({ cat: hit.cat, bar: hit.bar, step, sub, level: vel / 127, role: 'roll', why, vel, swing: hit.swing, offsetMs: hit.bar === 0 && step === 0 && sub === 0 ? Math.max(0, off) : off, sample: hit.sample, rollOf: keyOf(hit) });
      made++;
    }
    if (made) {
      report.rolls++;
      report.strokes += made;
    }
  }
  out.sort((a, b) => tickOf(a) - tickOf(b));
  return { events: out, report };
}

/** The spans [first, last] (grid ticks) of the rolls already in `events`, per drum and bar. */
function rollSpans(events: readonly BreakEvent[]): [number, number][] {
  const by = new Map<string, number[]>();
  for (const e of events) if (e.role === 'roll') by.set(`${e.cat}|${e.bar}`, [...(by.get(`${e.cat}|${e.bar}`) ?? []), tickOf(e)]);
  const out: [number, number][] = [];
  for (const ts of by.values()) {
    ts.sort((a, b) => a - b);
    let s0 = ts[0]!;
    let s1 = s0;
    for (const t of ts.slice(1)) {
      if (t - s1 <= TPS) s1 = t;
      else {
        out.push([s0, s1]);
        s0 = s1 = t;
      }
    }
    out.push([s0, s1]);
  }
  return out;
}
