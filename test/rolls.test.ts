/**
 * ROLLS: real, editable events at their own subdivision (not quantised to sixteenths), leading
 * into an accent, deterministic, never burying the groove, and the same in playback, WAV, stems
 * and MIDI.
 */
import { describe, expect, it } from 'vitest';
import { breakTimeline, CORE_PPQ, eventTick } from '../src/audio/timeline';
import { deleteHit, findRef, moveHit, noEdits, setVelocity } from '../src/engine/edits';
import { bake, reseed, sanitiseRecipe, seedsFrom, toggleTarget } from '../src/engine/generate';
import { makeRng } from '../src/engine/rng';
import { rollLevels } from '../src/engine/rolls';
import { emptyKit, type KitIndex } from '../src/engine/kit';
import { defaultRecipe } from '../src/engine/styles';
import { CATEGORIES, ROLL_DYNAMICS, ROLL_PLACES, ROLL_SPEEDS, ROLL_TARGETS, ROLL_TICKS, STYLES, TPB, TPS, type Bars, type Break, type BreakEvent, type Recipe, type RollSpeed } from '../src/engine/types';
import { breakMidi, MIDI_PPQ } from '../src/midi/breakMidi';
import { parseSmf } from '../src/midi/smf';

const SEEDS = Array.from({ length: 60 }, (_, i) => i * 7919 + 13);
const fullKit = (): KitIndex => {
  const k = emptyKit();
  for (const c of CATEGORIES) k[c] = [`${c}-a`, `${c}-b`, `${c}-c`];
  return k;
};
/** Revision 5: the ROLLS layer inside the GROOVE (rolls.ts addRolls), which every break saved before revision 6 still bakes. Revision 6's transformation: phase16.test.ts. */
const r = (style: Recipe['style'], bars: Bars, patch: Partial<Recipe> = {}): Recipe => ({ ...defaultRecipe(style, bars), revision: 5, toms: 0, ...patch });
const tick = (e: BreakEvent) => e.bar * TPB + e.step * TPS + e.sub;
const posKey = (e: BreakEvent) => `${e.cat}|${e.bar}|${e.step}|${e.sub}`;
/** the hits ROLLS added, grouped into rolls */
function rolls(b: Break): BreakEvent[][] {
  const g = new Map<string, BreakEvent[]>();
  for (const e of b.events) if (e.role === 'roll' && e.why.endsWith('(ROLLS)')) g.set(`${e.bar}|${e.why}`, [...(g.get(`${e.bar}|${e.why}`) ?? []), e]);
  return [...g.values()].map((x) => x.sort((a, c) => tick(a) - tick(c)));
}
/** a break with at least one roll for these settings */
function withRoll(patch: Partial<Recipe>, style: Recipe['style'] = 'jungle', bars: Bars = 4): Break {
  for (const seed of SEEDS) {
    const b = bake(r(style, bars, { rolls: 1, ...patch }), seedsFrom(seed), fullKit());
    if (rolls(b).length) return b;
  }
  throw new Error('no roll');
}

describe('roll generation', () => {
  it('ROLLS 0, or no target allowed, adds no roll', () => {
    for (const style of STYLES)
      for (const seed of SEEDS.slice(0, 8)) {
        expect(rolls(bake(r(style, 4, { rolls: 0 }), seedsFrom(seed), fullKit()))).toHaveLength(0);
        expect(rolls(bake(r(style, 4, { rolls: 1, rollTargets: [] }), seedsFrom(seed), fullKit()))).toHaveLength(0);
      }
  });

  it('keeps every subdivision exactly: strokes SPEED apart in the grid, and in time (no quantising to sixteenths)', () => {
    for (const speed of ROLL_SPEEDS) {
      const b = withRoll({ rollSpeed: speed, rollDynamics: 'even', rollLength: 6, swing: 0.5, humanise: 0.6 });
      const d = ROLL_TICKS[speed];
      for (const roll of rolls(b)) {
        for (let i = 1; i < roll.length; i++) {
          expect(tick(roll[i]!) - tick(roll[i - 1]!)).toBe(d);
          // in time too: swing moves the whole roll, never one stroke against another
          expect(eventTick(roll[i]!, b.recipe.bpm) - eventTick(roll[i - 1]!, b.recipe.bpm)).toBe((d / (4 * TPS)) * CORE_PPQ);
        }
        if (d < TPS) expect(roll.some((e) => e.sub !== 0)).toBe(true); // finer than the sixteenth grid
      }
    }
  });

  it('lead into their anchor: the last stroke is one stroke before a backbeat, a downbeat, a tom fill or a beat', () => {
    let n = 0;
    for (const place of ROLL_PLACES)
      for (const seed of SEEDS.slice(0, 25)) {
        const b = bake(r('jungle', 4, { rolls: 1, rollPlace: place, rollSpeed: '32', rollLength: 4 }), seedsFrom(seed), fullKit());
        for (const roll of rolls(b)) {
          n++;
          const anchor = tick(roll[roll.length - 1]!) + 6;
          const bar = roll[0]!.bar;
          // a backbeat, a downbeat or beat, a fill (or the roll a fill ends with) that starts there
          const strong = b.events.some((e) => tick(e) === anchor && e.cat === 'snare' && (e.role === 'backbeat' || e.role === 'displaced backbeat')) || anchor % TPB === 0 || anchor % (4 * TPS) === 0 || b.events.some((e) => tick(e) === anchor && (e.role === 'fill' || e.role === 'roll'));
          expect(strong).toBe(true);
          // inside one bar
          for (const e of roll) expect(e.bar).toBe(bar);
          expect(anchor).toBeLessThanOrEqual((bar + 1) * TPB);
        }
      }
    expect(n).toBeGreaterThan(20);
  });

  it('never run over a backbeat, a downbeat kick, a crash or a tom fill, nor out of the pattern', () => {
    for (const style of STYLES)
      for (const seed of SEEDS.slice(0, 15)) {
        const b = bake(r(style, 4, { rolls: 1, toms: 1, rollLength: 16, rollSpeed: '16', rollPlace: 'anywhere' }), seedsFrom(seed), fullKit());
        for (const roll of rolls(b)) {
          const lo = tick(roll[0]!);
          const hi = tick(roll[roll.length - 1]!);
          for (const e of b.events) {
            const t = tick(e);
            if (t <= lo || t >= hi || roll.includes(e)) continue;
            const prot = (e.cat === 'snare' && (e.role === 'backbeat' || e.role === 'displaced backbeat')) || e.cat === 'crash' || (e.cat === 'kick' && e.step === 0 && e.sub === 0) || (e.role === 'fill' && e.cat.endsWith('tom'));
            expect(prot).toBe(false);
          }
          expect(hi).toBeLessThan(4 * TPB);
          expect(lo).toBeGreaterThanOrEqual(0);
        }
      }
  });

  it('never bury the groove: the first bar and the groove bars stay as they were, at most one roll a bar, every answer bar alike', () => {
    for (const style of STYLES)
      for (const seed of SEEDS.slice(0, 10)) {
        const b = bake(r(style, 8, { rolls: 1, rollPlace: 'accent' }), seedsFrom(seed), fullKit());
        const rs = rolls(b);
        const bars = rs.map((x) => x[0]!.bar);
        expect(new Set(bars).size).toBe(bars.length);
        for (const bar of bars) expect(b.plan[bar]).not.toBe('A');
        const a2 = b.plan.flatMap((p, i) => (p === 'A2' ? [i] : []));
        const at = (bar: number) => rs.filter((x) => x[0]!.bar === bar).flatMap((x) => x.map((e) => `${e.cat}${e.step}.${e.sub}`)).join(' ');
        for (const i of a2) expect(at(i)).toBe(at(a2[0]!));
      }
    // ANYWHERE may roll in a groove bar, but never the first
    for (const seed of SEEDS.slice(0, 20)) for (const x of rolls(bake(r('breakcore', 8, { rolls: 1, rollPlace: 'anywhere' }), seedsFrom(seed), fullKit()))) expect(x[0]!.bar).toBeGreaterThan(0);
  });

  it('change no other hit: what is not in a roll keeps its velocity, timing and sample', () => {
    for (const style of STYLES)
      for (const seed of SEEDS.slice(0, 6)) {
        const base = bake(r(style, 4, { rolls: 0 }), seedsFrom(seed), fullKit());
        const b = bake(r(style, 4, { rolls: 1 }), seedsFrom(seed), fullKit());
        const was = new Map(base.events.map((e) => [posKey(e), e]));
        const inRoll = new Set(rolls(b).flat());
        for (const e of b.events) {
          if (inRoll.has(e)) continue;
          const w = was.get(posKey(e))!;
          expect(w).toBeTruthy();
          expect([e.vel, e.offsetMs, e.swing, e.sample]).toEqual([w.vel, w.offsetMs, w.swing, w.sample]);
        }
      }
  });

  it('respond to the recipe: jungle, D&B and breakcore roll more than boom bap and electro', () => {
    const count = (style: Recipe['style']) => SEEDS.reduce((n, s) => n + rolls(bake(r(style, 8, { rolls: 0.6, rollPlace: 'accent', rollTargets: ['snare', 'hat'] }), seedsFrom(s), fullKit())).length, 0);
    expect(count('jungle')).toBeGreaterThan(count('boombap'));
    expect(count('dnb')).toBeGreaterThan(count('electro'));
    expect(count('breakcore')).toBeGreaterThan(count('funk'));
  });

  it('roll the drums allowed, and the anchor shapes them: descending toms into the top of the loop', () => {
    for (const t of ROLL_TARGETS) {
      const b = withRoll({ rollTargets: [t], rollPlace: 'anywhere' });
      for (const roll of rolls(b)) for (const e of roll) expect(t === 'hat' ? ['hat', 'ride'] : t === 'tom' ? ['htom', 'mtom', 'ltom'] : [t]).toContain(e.cat);
    }
    let down = 0;
    for (const seed of SEEDS) {
      const b = bake(r('halftime', 4, { rolls: 1, rollTargets: ['tom'], rollPlace: 'phrase', rollLength: 6 }), seedsFrom(seed), fullKit());
      for (const roll of rolls(b)) {
        if (!roll[0]!.why.includes('descending')) continue;
        down++;
        const order = roll.map((e) => ['htom', 'mtom', 'ltom'].indexOf(e.cat));
        for (let i = 1; i < order.length; i++) expect(order[i]!).toBeGreaterThanOrEqual(order[i - 1]!);
        expect(order[0]).toBe(0);
        expect(order[order.length - 1]).toBe(2);
      }
    }
    expect(down).toBeGreaterThan(10);
  });

  it('are deterministic, and FREEZE BEAT keeps them', () => {
    const p = { rolls: 1, rollTargets: ['snare', 'tom'] as Recipe['rollTargets'] };
    const a = bake(r('dnb', 4, p), seedsFrom(99), fullKit());
    expect(rolls(bake(r('dnb', 4, p), seedsFrom(99), fullKit())).flat().map(posKey)).toEqual(rolls(a).flat().map(posKey));
    let n = 0;
    for (const seed of SEEDS.slice(0, 20)) {
      const s0 = seedsFrom(seed);
      const x = bake(r('dnb', 4, p), s0, fullKit());
      const y = bake(r('dnb', 4, p), reseed(s0, { beat: true }), fullKit());
      if (!rolls(x).length) continue;
      n++;
      expect(rolls(y).flat().map(posKey)).toEqual(rolls(x).flat().map(posKey));
    }
    expect(n).toBeGreaterThan(5);
  });

  it('respect the bar length: one-bar loops roll into their own top; longer patterns keep rolls in their bars', () => {
    for (const bars of [1, 2, 3, 5, 8] as Bars[])
      for (const seed of SEEDS.slice(0, 10)) {
        const b = bake(r('jungle', bars, { rolls: 1, rollPlace: 'phrase' }), seedsFrom(seed), fullKit());
        for (const e of rolls(b).flat()) expect(e.bar).toBeLessThan(bars);
      }
  });
});

describe('roll dynamics', () => {
  const lv = (dyn: Recipe['rollDynamics'], n = 8) => rollLevels(n, dyn, makeRng(3), (k) => k % 2 === 0);
  it('EVEN, CRESCENDO, DECRESCENDO, ALTERNATING and HUMAN have their shapes', () => {
    expect(new Set(lv('even')).size).toBe(1);
    const c = lv('crescendo');
    for (let i = 1; i < c.length; i++) expect(c[i]!).toBeGreaterThan(c[i - 1]!);
    const d = lv('decrescendo');
    for (let i = 1; i < d.length; i++) expect(d[i]!).toBeLessThan(d[i - 1]!);
    const a = lv('alternating');
    for (let i = 1; i < a.length; i++) expect(Math.sign(a[i]! - a[i - 1]!)).toBe(i % 2 ? -1 : 1);
    const h = lv('human', 16);
    expect(h[15]!).toBeGreaterThan(h[0]!); // grows overall
    expect(new Set(h.map((x) => x.toFixed(3))).size).toBeGreaterThan(8); // uneven
    for (const dyn of ROLL_DYNAMICS) for (const x of lv(dyn)) expect(x > 0 && x <= 1).toBe(true);
  });

  it('reach the velocities, and faster rolls are softer (no roar, no clipping)', () => {
    const peak = (speed: RollSpeed) => {
      let m = 0;
      for (const seed of SEEDS.slice(0, 30)) for (const e of rolls(bake(r('jungle', 4, { rolls: 1, rollSpeed: speed, rollDynamics: 'crescendo', rollTargets: ['snare'] }), seedsFrom(seed), fullKit())).flat()) m = Math.max(m, e.vel);
      return m;
    };
    expect(peak('64')).toBeLessThan(peak('16'));
    expect(peak('16')).toBeLessThanOrEqual(127);
    const b = withRoll({ rollDynamics: 'crescendo', rollTargets: ['snare'], rollLength: 6 });
    const v = rolls(b)[0]!.map((e) => e.vel);
    for (let i = 1; i < v.length; i++) expect(v[i]!).toBeGreaterThan(v[i - 1]!);
  });
});

describe('roll hits are ordinary events', () => {
  it('can be selected, changed, moved and deleted by hand, one stroke at a time', () => {
    const b = withRoll({ rollSpeed: '32', rollLength: 6, rollTargets: ['snare'] });
    const roll = rolls(b)[0]!;
    const third = roll[2]!;
    let ed = setVelocity(noEdits(), b.events, third.ref!, 12).edits;
    ed = deleteHit(ed, roll[0]!.ref!);
    const mv = moveHit(ed, bake(b.recipe, b.seeds, fullKit(), {}, (x) => x, ed).events, roll[1]!.ref!, { bar: roll[1]!.bar, step: roll[1]!.step, sub: roll[1]!.sub + 3 > 11 ? roll[1]!.sub - 3 : roll[1]!.sub + 3 });
    const e = bake(b.recipe, b.seeds, fullKit(), {}, (x) => x, mv.edits);
    expect(findRef(e.events, third.ref)!.vel).toBe(12);
    expect(findRef(e.events, roll[0]!.ref)).toBeUndefined();
    expect(findRef(e.events, mv.ref)!.manual).toBe('moved');
    expect(findRef(e.events, mv.ref)!.why).toContain('roll');
    // the rest of the roll is untouched
    for (const x of roll.slice(3)) expect(findRef(e.events, x.ref)!.vel).toBe(x.vel);
  });

  it('play and export exactly where they are: the timeline (playback, WAV, stems) and the MIDI file', () => {
    const b = withRoll({ rollSpeed: '64', rollLength: 8, rollTargets: ['snare'], rollDynamics: 'even', humanise: 0, swing: 0 });
    const roll = rolls(b)[0]!;
    const tl = breakTimeline(b);
    for (const e of roll) expect(tl.events.some((n) => n.type === 'note' && n.voice === 'snare' && n.tick === eventTick(e, b.recipe.bpm) && (n as { velocity: number }).velocity === e.vel)).toBe(true);
    expect(breakTimeline(b, ['snare']).events.filter((n) => roll.some((e) => eventTick(e, b.recipe.bpm) === n.tick)).length).toBe(roll.length);
    const notes = parseSmf(breakMidi(b).bytes).notes.filter((n) => n.note === 38);
    const at = roll.map((e) => Math.round((eventTick(e, b.recipe.bpm) * MIDI_PPQ) / CORE_PPQ));
    for (const t of at) expect(notes.some((n) => n.tick === t)).toBe(true);
    // 64ths are 60 ticks apart at 960 PPQ, and every one is its own note
    for (let i = 1; i < at.length; i++) expect(at[i]! - at[i - 1]!).toBe(60);
  });
});

describe('roll settings in the recipe', () => {
  it('are cleaned; recipes saved before rolls existed have ROLLS 0 and the style’s settings', () => {
    const s = sanitiseRecipe({ ...defaultRecipe('dnb', 2), rollLength: 99, rollSpeed: '7' as RollSpeed, rollDynamics: 'loud' as never, rollPlace: 'moon' as never, rollTargets: ['snare', 'bongo', 'kick', 'snare'] as never });
    expect(s.rollLength).toBe(16);
    expect(s.rollSpeed).toBe('32');
    expect(s.rollDynamics).toBe('crescendo');
    expect(s.rollPlace).toBe('accent');
    expect(s.rollTargets).toEqual(['snare', 'kick']);
    const old = { ...defaultRecipe('jungle', 2) } as Partial<Recipe>;
    for (const k of ['rolls', 'rollLength', 'rollSpeed', 'rollDynamics', 'rollPlace', 'rollTargets'] as const) delete old[k];
    const o = sanitiseRecipe(old as Recipe);
    expect(o.rolls).toBe(0);
    expect(o.rollLength).toBe(6);
    expect(toggleTarget(['snare', 'kick'], 'hat')).toEqual(['snare', 'hat', 'kick']);
    expect(toggleTarget(['snare', 'kick'], 'snare')).toEqual(['kick']);
  });
});
