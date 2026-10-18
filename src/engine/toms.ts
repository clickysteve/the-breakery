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
import type { Flourish, StyleDef, TomFigure } from './styles';
import { clamp, STEPS, TOMS, TPS, type BarRole, type BreakEvent, type Category, type Feel, type Recipe } from './types';

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

export function addToms(events: BreakEvent[], ctx: TomContext, rng: Rng, frng: Rng): BreakEvent[] {
  const { def, fl, recipe, feel, roles } = ctx;
  if (recipe.toms <= 0) return events;
  let out = events.slice();
  const h = recipe.humanise * def.timingScale;
  const at = (bar: number, cat: Category, step: number, sub = 0) => out.find((e) => e.bar === bar && e.cat === cat && e.step === step && e.sub === sub);

  const make = (bar: number, cat: Category, step: number, sub: number, level: number, why: string, like?: BreakEvent): BreakEvent => {
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
      role: 'fill',
      why,
      vel: Math.round(clamp(vel, 1, 127)),
      swing: like ? like.swing : Math.round(swingDelay(step + sub / TPS, recipe.swing) * 1000) / 1000 || 0,
      offsetMs: Math.round(off * 10) / 10 || 0,
      sample: null,
    };
  };

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
