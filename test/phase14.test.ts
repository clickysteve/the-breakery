/**
 * PHASE 14: BREAK DNA (eight generative grammars), DESTROY (its own tab, an event engine), text
 * seeds and the cymbal engine (GROOVE revision 4). Structural and statistical checks: 0 means
 * none and 100% means all, controls move in the right direction, old breaks reproduce, the same
 * input gives the same break, live and export read the same notes. Whether it grooves is for
 * listening; these tests do not claim it, and no audio was rendered or listened to for them.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/app/app';
import { diceName } from '../src/app/seeds';
import { fxSuffix, parseFx } from '../src/audio/shaped';
import { buildFileName, migrateNaming } from '../src/audio/exportName';
import { breakTimeline, hatChoke, noteInstrument } from '../src/audio/timeline';
import { takeawayName } from '../src/audio/takeaway';
import { analyseCymbals, migrateCym, PRIMARY_RELS, SUB_TICKS, SUBDIVISIONS, type CymbalSettings } from '../src/engine/cymbals4';
import { chaosDestroy, defaultDestroy2, destroy2, DESTROY_EFFECTS, MAX_NEW, sanitiseDestroy2, type DestroyEffect, type DestroySettings2 } from '../src/engine/destroy2';
import { DNA_IDS, DNA_LABEL, describeDna, sanitiseDna } from '../src/engine/dna';
import { bake, hashSeedName, parseSeed, seedsFrom } from '../src/engine/generate';
import { emptyKit, type KitIndex } from '../src/engine/kit';
import { PERSONALITIES } from '../src/engine/personality';
import { defaultRecipe } from '../src/engine/styles';
import { CATEGORIES, CURRENT_REVISION, MAX_PITCH, STYLES, TPB, TPS, type Bars, type Break, type BreakEvent, type Category, type Recipe, type Style } from '../src/engine/types';
import { defaultWildcard, wildcardRecipe } from '../src/engine/wildcard';
import { breakMidi, GM_MAPPING } from '../src/midi/breakMidi';

const kit = (): KitIndex => {
  const k = emptyKit();
  for (const c of CATEGORIES) k[c] = [`${c}-a`, `${c}-b`, `${c}-c`];
  return k;
};
const K = kit();
const R = (style: Style = 'funk', bars: Bars = 4, patch: Partial<Recipe> = {}): Recipe => ({ ...defaultRecipe(style, bars), ...patch });
const B = (r: Recipe, seed = 4242) => bake(r, seedsFrom(seed), K, {}, (id) => id);
const SEEDS = (n: number) => Array.from({ length: n }, (_, i) => 1000 + i * 7919);
const tick = (e: Pick<BreakEvent, 'bar' | 'step' | 'sub'>) => e.bar * TPB + e.step * TPS + e.sub;
const place = (e: BreakEvent) => `${e.cat}|${e.bar}|${e.step}|${e.sub}`;
const kickSnare = (b: Break) => b.events.filter((e) => e.cat === 'kick' || e.cat === 'snare').map(place).sort();
const CYM = (patch: Partial<CymbalSettings>): CymbalSettings => ({ closed: 0, open: 0, ride: 0, crash: 0, sub: '16', rel: 'accent', hatRel: 'accent', choke: true, ...patch });
const ticksOf = (b: Break, cat: Category, bar: number) => new Set(b.events.filter((e) => e.cat === cat && e.bar === bar).map((e) => e.step * TPS + e.sub));

describe('BREAK DNA', () => {
  it('eight grammars, each with a label; old ids sanitise, unknown ones do not', () => {
    expect(DNA_IDS.length).toBeGreaterThanOrEqual(8);
    expect(DNA_IDS).toContain('amen');
    for (const id of DNA_IDS) expect(DNA_LABEL[id]).toMatch(/^[A-Z0-9 &'’-]+$/);
    expect(sanitiseDna({ id: 'boogie', amount: 0.4 })).toEqual({ id: 'boogie', amount: 0.4 });
    expect(sanitiseDna({ id: 'bogus', amount: 0.4 })).toBeUndefined();
    expect(describeDna({ id: 'funky', amount: 0.5 })).toMatch(/50%/);
  });

  it('diversity: 100 seeds of every DNA give at least 85 different kick and snare patterns', () => {
    for (const id of DNA_IDS) {
      const u = new Set(SEEDS(100).map((s) => kickSnare(B(R('funk', 4, { dna: { id, amount: 1 } }), s)).join(' ')));
      expect(u.size, id).toBeGreaterThanOrEqual(85);
    }
  });

  it('the DNAs are different from each other: their first-bar kick profiles over 100 seeds differ', () => {
    const profile = (id: string) => {
      const p = new Array<number>(16).fill(0);
      for (const s of SEEDS(100)) for (const e of B(R('funk', 4, { dna: { id: id as never, amount: 1 } }), s).events) if (e.cat === 'kick' && e.bar === 0) p[e.step]!++;
      return p;
    };
    const ps = DNA_IDS.map(profile);
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) {
        const d = ps[i]!.reduce((a, v, k) => a + Math.abs(v - ps[j]![k]!), 0);
        expect(d, `${DNA_IDS[i]} vs ${DNA_IDS[j]}`).toBeGreaterThan(60);
      }
  });

  it('INFLUENCE: 0% is NONE exactly, and the distance from NONE grows at 25, 50, 75 and 100%', () => {
    for (const id of DNA_IDS) {
      const dist = [0, 0.25, 0.5, 0.75, 1].map((a) => {
        let tot = 0;
        for (const s of SEEDS(30)) {
          const none = B(R('funk', 4), s);
          const b = B(R('funk', 4, a ? { dna: { id, amount: a } } : {}), s);
          if (a === 0) expect(b.events).toEqual(none.events);
          const x = new Set(kickSnare(b));
          const n = new Set(kickSnare(none));
          tot += [...x].filter((k) => !n.has(k)).length + [...n].filter((k) => !x.has(k)).length;
        }
        return tot;
      });
      expect(dist[0], id).toBe(0);
      for (let i = 1; i < dist.length; i++) expect(dist[i]!, `${id} at ${i * 25}%`).toBeGreaterThan(dist[i - 1]!);
    }
    // amount 0 stored is the same as no DNA at all
    expect(B(R('funk', 4, { dna: { id: 'think', amount: 0 } })).events).toEqual(B(R('funk', 4)).events);
  });

  it('never changes the tempo, the kit or the samples, never adds rolls, and respects TOMS 0 and CLOSED HAT 0', () => {
    for (const id of DNA_IDS)
      for (const s of SEEDS(12)) {
        const none = B(R('hiphop', 4, { rollsOn: false }), s);
        const b = B(R('hiphop', 4, { rollsOn: false, dna: { id, amount: 1 } }), s);
        expect(b.recipe.bpm).toBe(none.recipe.bpm);
        expect(b.seeds).toEqual(none.seeds);
        expect(b.events.filter((e) => e.role === 'roll'), id).toEqual([]);
        const quiet = B(R('funk', 4, { rollsOn: false, toms: 0, cym: CYM({ closed: 0, open: 0.3, ride: 0.2, crash: 0.3 }), dna: { id, amount: 1 } }), s);
        expect(quiet.events.filter((e) => e.cat === 'htom' || e.cat === 'mtom' || e.cat === 'ltom'), id).toEqual([]);
        expect(quiet.events.filter((e) => e.cat === 'hat'), id).toEqual([]);
      }
  });

  it('personality stays independent: a personality changes the playing of a DNA break, the DNA stays on', () => {
    for (const p of PERSONALITIES.filter((x) => x !== 'neutral')) {
      const b = B(R('funk', 4, { dna: { id: 'apache', amount: 0.8 }, personality: { id: p, amount: 0.8 } }));
      expect(b.recipe.dna).toEqual({ id: 'apache', amount: 0.8 });
      expect(b.recipe.personality?.id).toBe(p);
    }
  });
});

describe('CYMBALS (revision 4)', () => {
  it('new recipes are revision 4 or later (revision 5 added CLAP and FX)', () => {
    expect(CURRENT_REVISION).toBeGreaterThanOrEqual(4);
    expect(defaultRecipe('funk', 4).revision).toBe(CURRENT_REVISION);
  });

  it('CRITICAL: CLOSED HAT 100% fills every position of every subdivision in every bar (and RIDE 100% its own)', () => {
    for (const sub of SUBDIVISIONS.filter((x) => x !== 'auto'))
      for (const st of STYLES)
        for (const s of SEEDS(3)) {
          const n = TPB / SUB_TICKS[sub];
          const extras: Partial<Recipe> = s === SEEDS(3)[1] ? { dna: { id: 'boogie', amount: 0.9 } } : s === SEEDS(3)[2] ? { personality: { id: 'nervous', amount: 0.9 } } : {};
          const b = B(R(st, 4, { cym: CYM({ closed: 1, sub }), ...extras }), s);
          const r = B(R(st, 4, { cym: CYM({ ride: 1, sub }), ...extras }), s);
          for (let bar = 0; bar < 4; bar++) {
            const t = [...ticksOf(b, 'hat', bar)].filter((x) => x % SUB_TICKS[sub] === 0);
            expect(t.length, `${st} ${sub} seed ${s} bar ${bar} closed`).toBe(n);
            const rt = [...ticksOf(r, 'ride', bar)].filter((x) => x % SUB_TICKS[sub] === 0);
            expect(rt.length, `${st} ${sub} seed ${s} bar ${bar} ride`).toBe(n);
          }
        }
  });

  it('0% means none: no closed hats, open hats, ride or crash at all', () => {
    for (const st of STYLES)
      for (const s of SEEDS(4)) {
        const b = B(R(st, 4, { cym: CYM({}), dna: { id: 'amen', amount: 0.7 }, personality: { id: 'showoff', amount: 0.8 } }), s);
        expect(b.events.filter((e) => ['hat', 'open', 'ride', 'crash'].includes(e.cat)), `${st} ${s}`).toEqual([]);
      }
  });

  it('ACTIVITY is monotonic: more closed hat, ride, open hat or crash never plays fewer (and keeps the same strokes on a plain bar)', () => {
    for (const st of ['funk', 'dnb', 'garage'] as Style[])
      for (const s of SEEDS(6)) {
        for (const fam of ['closed', 'ride', 'open', 'crash'] as const) {
          const cat: Category = fam === 'closed' ? 'hat' : fam;
          const base: Partial<CymbalSettings> = fam === 'open' ? { closed: 0.8 } : {};
          const counts = [0, 0.25, 0.5, 0.75, 1].map((a) => B(R(st, 4, { cym: CYM({ ...base, [fam]: a }) }), s).events.filter((e) => e.cat === cat).length);
          for (let i = 1; i < counts.length; i++) expect(counts[i]!, `${st} ${fam} ${counts.join(',')}`).toBeGreaterThanOrEqual(counts[i - 1]!);
          expect(counts[0]).toBe(0);
          expect(counts[4]!).toBeGreaterThan(0);
        }
        const lo = ticksOf(B(R(st, 4, { cym: CYM({ closed: 0.4 }) }), s), 'hat', 0);
        const hi = ticksOf(B(R(st, 4, { cym: CYM({ closed: 0.7 }) }), s), 'hat', 0);
        for (const t of lo) expect(hi.has(t), `${st} ${s}`).toBe(true);
      }
  });

  it('OPEN HAT 100% (ACCENT) plays an open hat on every “and”; CRASH marks the top of the phrase', () => {
    for (const s of SEEDS(5)) {
      const b = B(R('funk', 4, { cym: CYM({ closed: 1, open: 1, sub: '8' }) }), s);
      for (let bar = 0; bar < 4; bar++) {
        const o = ticksOf(b, 'open', bar);
        for (const t of [24, 72, 120, 168]) expect(o.has(t), `seed ${s} bar ${bar} tick ${t}`).toBe(true);
        // ACCENT: the open hat replaces the closed stroke on its position
        for (const t of o) expect(ticksOf(b, 'hat', bar).has(t)).toBe(false);
      }
      const c = B(R('funk', 4, { cym: CYM({ closed: 0.8, crash: 0.3 }) }), s);
      expect(c.events.some((e) => e.cat === 'crash' && e.bar === 0 && e.step === 0 && e.sub === 0), `seed ${s}`).toBe(true);
      // at most two crashes a bar
      for (let bar = 0; bar < 4; bar++) expect(B(R('funk', 4, { cym: CYM({ crash: 1 }) }), s).events.filter((e) => e.cat === 'crash' && e.bar === bar && e.role !== 'roll').length).toBeLessThanOrEqual(2);
    }
  });

  it('the PRIMARY RELATIONSHIP shapes how the hats and the ride share the time', () => {
    const share = (rel: CymbalSettings['rel']) => {
      let hat = 0;
      let ride = 0;
      let both = 0;
      let sameHalf = 0;
      for (const s of SEEDS(8)) {
        const b = B(R('funk', 4, { cym: CYM({ closed: 1, ride: 1, sub: '8', rel }) }), s);
        const h = new Set(b.events.filter((e) => e.cat === 'hat').map((e) => tick(e)));
        const r = new Set(b.events.filter((e) => e.cat === 'ride').map((e) => tick(e)));
        hat += h.size;
        ride += r.size;
        both += [...h].filter((t) => r.has(t)).length;
        // per bar: the half each family plays in (0 first, 1 second, 2 both)
        const half = (ts: Set<number>, bar: number) => {
          const hs = new Set([...ts].filter((t) => Math.floor(t / TPB) === bar).map((t) => (t % TPB < TPB / 2 ? 0 : 1)));
          return hs.size === 2 ? 2 : hs.size ? [...hs][0]! : -1;
        };
        for (let bar = 0; bar < 4; bar++) if (half(h, bar) === 2 || half(r, bar) === 2 || half(h, bar) === half(r, bar)) sameHalf++;
      }
      return { hat, ride, both, sameHalf };
    };
    const ind = share('independent');
    const lay = share('layer');
    const exc = share('exclusive');
    const alt = share('alternate');
    const call = share('call');
    const acc = share('accent');
    expect(ind.hat).toBe(8 * 32);
    expect(ind.ride).toBe(8 * 32);
    expect(lay.both).toBe(lay.ride);
    expect(exc.both).toBe(0);
    expect(alt.both).toBe(0);
    expect(alt.hat).toBeGreaterThan(0);
    expect(alt.ride).toBeGreaterThan(0);
    expect(call.both).toBe(0);
    // CALL & RESPONSE: in every bar one family calls in one half and the other answers in the other
    // (the primary, the hats on a tie, calls first; the answer bars of the phrase swap them)
    expect(call.sameHalf).toBe(0);
    expect(call.hat).toBe(8 * 16);
    expect(call.ride).toBe(8 * 16);
    // ACCENT: the secondary marks a subset of the time
    expect(acc.ride).toBeLessThan(acc.hat);
    expect(acc.ride).toBeGreaterThan(0);
    expect(new Set(PRIMARY_RELS).size).toBe(6);
  });

  it('OPEN-HAT CHOKE: on, a closed hat cuts a ringing open hat; off, the closed hats are marked free and cut nothing (live and export read the same note)', () => {
    const on = B(R('funk', 4, { cym: CYM({ closed: 1, open: 0.5, hatRel: 'layer' }) }));
    const off = B(R('funk', 4, { cym: CYM({ closed: 1, open: 0.5, hatRel: 'layer', choke: false }) }));
    expect(on.events.some((e) => e.free)).toBe(false);
    const hats = off.events.filter((e) => e.cat === 'hat');
    expect(hats.length).toBeGreaterThan(0);
    expect(hats.every((e) => e.free)).toBe(true);
    const note = (b: Break) => breakTimeline(b).events.find((n) => n.voice === 'hat')!;
    expect(hatChoke('hat', note(on) as never)).toMatchObject({ cuts: true });
    expect(hatChoke('hat', note(off) as never)).toBeNull();
    expect(hatChoke('open', note(off) as never)).toMatchObject({ cutBy: true });
  });

  it('HI-HAT ACTIVITY migrates: revision 3 settings carry over to revision 4', () => {
    expect(migrateCym(R('funk', 4, { revision: 3, hats: 0.3, ride: 0.6, cymbals: 'alternate' }))).toMatchObject({ closed: 0.3, ride: 0.6, rel: 'accent' });
    expect(migrateCym(R('funk', 4, { revision: 3, hats: 0, cymbals: 'layer' }))).toMatchObject({ closed: 0, open: 0, rel: 'layer' });
    const { hats: _h, ride: _r, cymbals: _c, ...bare } = R('dnb', 4, { revision: 3 });
    expect(migrateCym(bare as Recipe)).toMatchObject({ closed: 0.7, ride: 0.25, sub: 'auto', rel: 'accent', choke: true });
  });

  it('THIS BREAK reads the actual events', () => {
    const b = B(R('funk', 4, { cym: CYM({ closed: 1, sub: '8', crash: 0.3 }) }));
    const a = analyseCymbals(b.events, 4);
    const closed = a.find((x) => x.cat === 'hat')!;
    expect(closed.count).toBe(b.events.filter((e) => e.cat === 'hat').length);
    expect(closed.grids).toBe('1/8');
    expect(b.cymReport?.grid.hat).toBe('8');
  });
});

describe('DESTROY (its own tab)', () => {
  const plain = () => B(R('funk', 4, { rollsOn: false }));
  const only = (fx: DestroyEffect, prob: number, patch: Partial<DestroySettings2> = {}): DestroySettings2 => {
    const d = defaultDestroy2();
    for (const x of DESTROY_EFFECTS) d[x] = { ...d[x], prob: x === fx ? prob : 0 } as never;
    return { ...d, on: true, ...patch };
  };

  it('off, MASTER 0 or an empty matrix is the pattern exactly; the settings are kept when off', () => {
    const b = plain();
    expect(destroy2(b.events, { ...defaultDestroy2(), on: false }, { seed: 1, bars: 4 }).events).toBe(b.events);
    expect(destroy2(b.events, { ...defaultDestroy2(), on: true, master: 0 }, { seed: 1, bars: 4 }).events).toBe(b.events);
    const empty = { ...defaultDestroy2(), on: true, matrix: Object.fromEntries(CATEGORIES.map((c) => [c, []])) as never };
    expect(destroy2(b.events, empty, { seed: 1, bars: 4 }).events).toBe(b.events);
    const off = { ...chaosDestroy(defaultDestroy2(), 5), on: false };
    expect(B(R('funk', 4, { rollsOn: false, destroy2: off })).events).toEqual(b.events);
    expect(sanitiseDestroy2(off)).toEqual(off);
  });

  it('deterministic per seed and TAKE; RE-DESTROY (another take) destroys other hits', () => {
    const r = R('funk', 4, { destroy2: { ...defaultDestroy2(), on: true } });
    expect(B(r).events).toEqual(B(r).events);
    expect(B({ ...r, destroy2: { ...r.destroy2!, take: 1 } }).events).not.toEqual(B(r).events);
  });

  it('PROBABILITY is monotonic and separate from intensity: a higher probability destroys the same hits and more', () => {
    const b = plain();
    for (const fx of DESTROY_EFFECTS) {
      const counts = [0.1, 0.3, 0.6, 1].map((p) => destroy2(b.events, only(fx, p), { seed: 99, bars: 4 }).report?.hits[fx] ?? 0);
      for (let i = 1; i < counts.length; i++) expect(counts[i]!, `${fx} ${counts.join(',')}`).toBeGreaterThanOrEqual(counts[i - 1]!);
      // MASTER AMOUNT scales the probability
      const half = destroy2(b.events, only(fx, 1, { master: 0.5 }), { seed: 99, bars: 4 }).report?.hits[fx] ?? 0;
      expect(half, fx).toBeLessThanOrEqual(counts[3]!);
    }
    // the gated hits at 30% are among the gated hits at 60%
    const g = (p: number) => new Set(destroy2(b.events, only('gate', p), { seed: 99, bars: 4 }).events.filter((e) => e.gate).map(place));
    for (const k of g(0.3)) expect(g(0.6).has(k)).toBe(true);
  });

  it('STUTTER is bounded: at most 8 repeats a hit, never past the next hit of its track, never more than MAX_NEW in all; its repeats are not rolls', () => {
    for (const s of SEEDS(10)) {
      const b = B(R('breakcore', 8, { rollsOn: false }), s);
      const out = destroy2(b.events, only('stutter', 1, { stutter: { prob: 1, repeats: 8, sub: '64', shape: 'even', vel: 'fade', pitch: 12 } }), { seed: s, bars: 8 });
      const added = out.events.filter((e) => e.role === 'stutter');
      expect(added.length).toBeLessThanOrEqual(MAX_NEW);
      expect(out.events.filter((e) => e.role === 'roll')).toEqual([]);
      for (const c of CATEGORIES) {
        const src = b.events.filter((e) => e.cat === c).map(tick).sort((x, y) => x - y);
        for (let i = 0; i < src.length; i++) {
          const next = src[i + 1] ?? 8 * TPB;
          const reps = added.filter((e) => e.cat === c && tick(e) > src[i]! && tick(e) < next);
          expect(reps.length).toBeLessThanOrEqual(8);
        }
      }
      for (const e of out.events) expect(Math.abs(e.pitch ?? 0)).toBeLessThanOrEqual(MAX_PITCH);
    }
  });

  it('PITCH stays within ±24 semitones; GATE never longer than the gap between a stutter’s repeats', () => {
    const b = plain();
    const all: DestroySettings2 = { ...defaultDestroy2(), on: true, stutter: { prob: 1, repeats: 4, sub: '32', shape: 'even', vel: 'flat', pitch: 0 }, pitch: { prob: 1, range: 24, dir: 'both', quantise: false, contour: 'fixed' }, gate: { prob: 1, len: 1, shape: 'hard', rhythmic: false } };
    const out = destroy2(b.events, all, { seed: 3, bars: 4 });
    for (const e of out.events) expect(Math.abs(e.pitch ?? 0)).toBeLessThanOrEqual(24);
    // a 1/32 repeat is 1/8 of a quarter: the gate on a repeated hit is at most that
    for (const e of out.events.filter((x) => x.role === 'stutter' && x.gate)) expect(e.gate!.len).toBeLessThanOrEqual(0.125 + 1e-9);
  });

  it('TAPE STOP slows its own track (later hits move later or drop) and leaves the other tracks on time', () => {
    const b = plain();
    const out = destroy2(b.events, only('tape', 1, { matrix: { ...defaultDestroy2().matrix, kick: ['tape'], snare: [], hat: [], open: [], crash: [], htom: [], mtom: [], ltom: [], perc: [] } }), { seed: 7, bars: 4 });
    const others = (es: BreakEvent[]) => es.filter((e) => e.cat !== 'kick').map((e) => `${place(e)}|${e.vel}`).sort();
    expect(others(out.events)).toEqual(others(b.events));
    const taped = out.events.filter((e) => e.tape);
    expect(taped.length).toBeGreaterThan(0);
    for (const e of taped) expect(e.tape!.to).toBeLessThan(e.tape!.from);
  });

  it('hand-edited hits are never destroyed; DESTROY never switches ROLL GENERATION on', () => {
    const b = plain();
    const ev = b.events.map((e, i) => (i % 2 ? { ...e, manual: 'edited' as const } : e));
    const out = destroy2(ev, { ...chaosDestroy(defaultDestroy2(), 11), master: 1 }, { seed: 4, bars: 4 });
    for (const e of ev.filter((x) => x.manual)) expect(out.events.some((o) => place(o) === place(e) && !o.gate && !o.tape && !o.detune && o.reverse === e.reverse)).toBe(true);
    const { app } = makeApp();
    app.setDestroy2({ on: true });
    app.chaos(3);
    app.reDestroy();
    expect(app.rollGeneration).toBe(false);
    expect(app.current.events.filter((e) => e.role === 'roll')).toEqual([]);
  });

  it('parity: the timeline (export, stems) and the player name the same shaped instrument, in seconds at the tempo', () => {
    const b = B(R('funk', 4, { destroy2: { ...defaultDestroy2(), on: true, master: 1 } }));
    const shaped = b.events.filter((e) => e.gate || e.tape || e.detune || (e.reverse && e.revFrac !== undefined));
    expect(shaped.length).toBeGreaterThan(0);
    const notes = breakTimeline(b).events;
    for (const e of shaped) {
      const id = noteInstrument(e.sample!, e, b.recipe.bpm);
      expect(notes.some((n) => n.type === 'note' && n.instrument === id)).toBe(true);
      expect(parseFx(id)?.base).toBe(e.reverse ? `${e.sample}~rev` : e.sample);
    }
    // a gate of a quarter note is 0.5 s at 120 BPM and 0.25 s at 240
    expect(parseFx('x' + fxSuffix({ gate: { len: 1, fade: 0.1 } }, 120))!.shape.gate!.len).toBe(0.5);
    expect(parseFx('x' + fxSuffix({ gate: { len: 1, fade: 0.1 } }, 240))!.shape.gate!.len).toBe(0.25);
    expect(fxSuffix({}, 120)).toBe('');
  });

  it('MIDI: the hits (a stutter’s repeats included) on each track’s own note; pitch is never a drum transposition', () => {
    const b = B(R('funk', 4, { destroy2: { ...defaultDestroy2(), on: true, master: 1, pitch: { prob: 1, range: 12, dir: 'both', quantise: true, contour: 'fixed' } } }));
    expect(b.events.some((e) => e.pitch)).toBe(true);
    const plainPitch = { ...b, events: b.events.map(({ pitch: _p, detune: _d, ...e }) => e) };
    // the same file whatever the pitches: every hit on its track's GM note
    expect(breakMidi(b).bytes).toEqual(breakMidi(plainPitch).bytes);
    expect(breakMidi(b).notes).toBeGreaterThan(0);
    expect(Object.values(GM_MAPPING).every((m) => m.channel === 10)).toBe(true);
  });
});

describe('SEEDS', () => {
  it('legacy numeric seeds stay numbers and bake exactly as before', () => {
    expect(parseSeed('724273')).toEqual({ seed: 724273, name: null });
    expect(parseSeed(' 0042 ')).toEqual({ seed: 42, name: null });
    expect(B(R('funk', 4, { revision: 3 }), 724273).events).toEqual(bake(R('funk', 4, { revision: 3 }), seedsFrom(parseSeed('724273')!.seed), K, {}, (id) => id).events);
  });

  it('the text hash is stable (FNV-1a over the normalised UTF-8): fixed values, case and spacing do not matter', () => {
    expect(hashSeedName('VELVET-THUNDER-42')).toBe(hashSeedName('velvet-thunder-42'));
    expect(hashSeedName('  dusty   kettle ')).toBe(hashSeedName('DUSTY KETTLE'));
    expect(hashSeedName('VELVET-THUNDER-42')).toMatchInlineSnapshot(`2805161001`);
    expect(hashSeedName('amen brother')).toMatchInlineSnapshot(`1336572714`);
    expect(hashSeedName('café')).toBe(hashSeedName('café'));
    const p = parseSeed('Velvet-Thunder-42')!;
    expect(p.name).toBe('Velvet-Thunder-42');
    expect(p.seed).toBe(hashSeedName('VELVET-THUNDER-42'));
  });

  it('DICE names are memorable words and a number, and reproduce through the hash', () => {
    let i = 0;
    const rnd = () => ((i = (i * 9301 + 49297) % 233280), i / 233280);
    const names = Array.from({ length: 200 }, () => diceName(rnd));
    for (const n of names) {
      expect(n).toMatch(/^[A-Z]+-[A-Z]+-\d\d$/);
      expect(parseSeed(n)!.seed).toBe(parseSeed(n.toLowerCase())!.seed);
    }
    expect(new Set(names).size).toBeGreaterThan(190);
  });

  it('the App shows the name everywhere: the break, the batch, exports; a typed name reproduces the break', () => {
    const { app } = makeApp();
    expect(app.setSeedText('Velvet Thunder')).toBe(true);
    expect(app.seedText).toBe('Velvet Thunder');
    expect(app.current.seedName).toBe('Velvet Thunder');
    const events = JSON.stringify(app.current.events);
    app.setSeedText('12345');
    app.setSeedText('velvet thunder');
    expect(JSON.stringify(app.current.events)).toBe(events);
    expect(takeawayName(app.current, { mode: 'tail' }, 'wav')).toMatch(/velvet-thunder/);
    // (Phase 15: the Phase 14 preferences migrate to the component builder, same name)
    expect(buildFileName(migrateNaming({ name: 'Loop', recipe: false, bpm: false, seed: true }), app.current, '', 'wav')).toBe('Loop_velvet-thunder.wav');
    app.bake();
    expect(app.seedText).toMatch(/^[A-Z]+-[A-Z]+-\d\d$/);
    app.bakeBatch();
    expect(app.batch.every((c) => /^[A-Z]+-[A-Z]+-\d\d$/.test(c.seedName ?? ''))).toBe(true);
  });
});

describe('integration', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
  });

  it('WILDCARD draws the cymbal controls and the DESTROY tab’s engine, sometimes', () => {
    const ctx = { settings: defaultWildcard(), frozen: { beat: false, detail: false, feel: false, kit: false }, tempoLock: false, rollGeneration: false };
    let destroyed = 0;
    const dnas = new Set<string>();
    for (const s of SEEDS(200)) {
      const { recipe: r } = wildcardRecipe(R('funk'), ctx, s);
      expect(r.cym).toBeDefined();
      expect(r.hats).toBeUndefined();
      if (r.destroy2?.on) destroyed++;
      if (r.dna) dnas.add(r.dna.id);
      expect(r.destroy?.on ?? false).toBe(false);
    }
    expect(destroyed / 200).toBeGreaterThan(0.08);
    expect(destroyed / 200).toBeLessThan(0.35);
    expect(dnas.size).toBeGreaterThanOrEqual(6);
  });

  it('settings persist, undo in one step each, and old saved breaks keep their output', () => {
    const { app } = makeApp();
    const before = JSON.stringify(app.recipe);
    app.setCym({ sub: '32', closed: 1 });
    app.setDestroy2({ on: true, master: 0.5 });
    app.setDna({ id: 'motorik', amount: 0.7 });
    const saved = JSON.parse(localStorage.getItem('breakery.state.v1')!).recipe as Recipe;
    expect(saved.cym?.sub).toBe('32');
    expect(saved.destroy2?.master).toBe(0.5);
    expect(saved.dna).toEqual({ id: 'motorik', amount: 0.7 });
    const again = new App({ kit: () => K, loudness: () => ({}), name: (id: string | null) => id ?? '?' } as never, playerStub() as never);
    expect(JSON.stringify(again.current.events)).toBe(JSON.stringify(app.current.events));
    app.undo();
    app.undo();
    app.undo();
    expect(JSON.stringify(app.recipe)).toBe(before);
  });

  it('REGEN CRASH changes the crash track only', () => {
    const { app } = makeApp();
    app.setCym({ crash: 0.6 });
    const keep = (es: BreakEvent[]) => JSON.stringify(es.filter((e) => e.cat !== 'crash').map(place).sort());
    const others = keep(app.current.events);
    app.regenTracks(['crash']);
    expect(keep(app.current.events)).toBe(others);
  });

  it('FREEZE BEAT keeps the destruction: a new DETAIL draw destroys the same way where the hits are the same', () => {
    const r = R('funk', 4, { destroy2: { ...defaultDestroy2(), on: true } });
    const a = bake(r, { ...seedsFrom(5), feel: 1 }, K);
    const b = bake(r, { ...seedsFrom(5), feel: 2 }, K);
    expect(a.events.filter((e) => e.gate).map(place)).toEqual(b.events.filter((e) => e.gate).map(place));
  });
});

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
function playerStub(sent: Break[] = []) {
  return { loop: true, level: 0.5, playing: true, setLevel() {}, setMix() {}, setOutput() {}, setBreak: (b: Break) => sent.push(b), update: (b: Break) => sent.push(b), audition: async () => {}, onSwap: () => {} };
}
function makeApp(seed: string | undefined = '4242') {
  if (!(globalThis as { localStorage?: Storage }).localStorage) (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
  const ingredients = { kit: () => K, loudness: () => ({}), name: (id: string | null) => id ?? '?' };
  const sent: Break[] = [];
  const app = new App(ingredients as never, playerStub(sent) as never, seed);
  app.setStyle('funk');
  app.setRecipe({ bars: 4 });
  return { app, sent };
}
