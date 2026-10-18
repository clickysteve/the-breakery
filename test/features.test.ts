import { describe, expect, it } from 'vitest';
import { analyse } from '../src/engine/analysis';
import { bake, hashSeedName, mutate, normaliseSeedName, parseSeed, reseed, seedsFrom } from '../src/engine/generate';
import { emptyKit, type KitIndex } from '../src/engine/kit';
import { MAX_OFFSET_MS } from '../src/engine/performance';
import { planBars } from '../src/engine/phrase';
import { sampleUsage, sanitiseSampleSettings, selectSamples, type SampleSettings } from '../src/engine/samples';
import { defaultRecipe, STYLE_DEFS } from '../src/engine/styles';
import { CATEGORIES, STEPS, STYLES, TPS, type Bars, type Break, type BreakEvent, type Category, type Recipe } from '../src/engine/types';
import { breakTimeline, CORE_PPQ, eventSeconds, loopSeconds } from '../src/audio/timeline';
import { takeawayName, defaultTakeaway } from '../src/audio/takeaway';
import { guessCategory, importable, matches, suggestCategory } from '../src/audio/categorise';
import { breakMidi } from '../src/midi/breakMidi';
import { parseSmf } from '../src/midi/smf';
import { anySolo, audible, audibleCategories, emptyMix, mixActive, sanitiseMix } from '../src/app/mix';
import { diceName, entryKey, entryLabel, HISTORY_MAX, sanitiseEntry, sanitiseFavourite, SeedHistory, type SeedEntry } from '../src/app/seeds';

const SEEDS = Array.from({ length: 30 }, (_, i) => i * 7919 + 13);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const BARS: Bars[] = [1, 2, 3, 4, 5, 6, 7, 8];
const fullKit = (): KitIndex => {
  const k = emptyKit();
  for (const c of CATEGORIES) k[c] = [`${c}-a`, `${c}-b`, `${c}-c`];
  return k;
};
const grid = (b: Break, bar: number) =>
  b.events
    .filter((e) => e.bar === bar && !(e.step === 0 && (e.cat === 'crash' || e.cat === 'hat' || e.cat === 'ride' || e.cat === 'open')))
    .map((e) => `${e.cat}${e.step}.${e.sub}`)
    .sort()
    .join(' ');

describe('pattern length 1–8 bars', () => {
  it('every length bakes valid events for every recipe, inside its bars', () => {
    for (const style of STYLES)
      for (const bars of BARS)
        for (const seed of SEEDS.slice(0, 4)) {
          const b = bake(defaultRecipe(style, bars), seedsFrom(seed), fullKit());
          expect(b.recipe.bars).toBe(bars);
          expect(b.plan.length).toBe(bars);
          expect(b.plan[0]).toBe('A');
          if (bars > 1) expect(b.plan[bars - 1]).toBe('T');
          const seen = new Set<string>();
          for (const e of b.events) {
            expect(e.bar).toBeGreaterThanOrEqual(0);
            expect(e.bar).toBeLessThan(bars);
            expect(e.step >= 0 && e.step < STEPS && e.sub >= 0 && e.sub < TPS).toBe(true);
            expect(Number.isInteger(e.vel) && e.vel >= 1 && e.vel <= 127).toBe(true);
            expect(Math.abs(e.offsetMs)).toBeLessThanOrEqual(MAX_OFFSET_MS);
            if (e.cat === 'snare') expect(e.offsetMs).toBeGreaterThanOrEqual(-1);
            expect(e.why.length).toBeGreaterThan(0);
            const k = `${e.cat}|${e.bar}|${e.step}|${e.sub}`;
            expect(seen.has(k)).toBe(false);
            seen.add(k);
          }
          // every bar has something in it
          for (let bar = 0; bar < bars; bar++) expect(b.events.some((e) => e.bar === bar)).toBe(true);
        }
  });

  it('loops, timelines and MIDI files are exactly the bars long', () => {
    for (const bars of BARS) {
      const b = bake(defaultRecipe('jungle', bars), seedsFrom(77), fullKit());
      expect(loopSeconds(b)).toBeCloseTo((bars * 4 * 60) / b.recipe.bpm, 9);
      const t = breakTimeline(b);
      expect(t.length).toBe(bars * 4 * CORE_PPQ);
      for (let i = 1; i < t.events.length; i++) expect(t.events[i]!.tick).toBeGreaterThanOrEqual(t.events[i - 1]!.tick);
      // only a late microtimed last hit may cross the loop point, by no more than the cap
      for (const e of b.events) expect(eventSeconds(e, b.recipe.bpm)).toBeLessThan(loopSeconds(b) + (MAX_OFFSET_MS + 1) / 1000 + (60 / b.recipe.bpm / 4) * 0.5);
      const smf = parseSmf(breakMidi(b).bytes);
      expect(smf.notes.length).toBeGreaterThan(bars * 4);
      expect(Math.max(...smf.notes.map((n) => n.tick))).toBeLessThan(bars * 4 * 960 + 960);
    }
  });

  it('phrases are planned for their length (not stacked bars)', () => {
    expect(BARS.map((n) => planBars(n).join(' '))).toEqual(['A', 'A T', 'A A2 T', 'A A2 A T', 'A A2 A B T', 'A A2 A F A T', 'A A2 A F A B T', 'A A2 A F A A2 B T']);
    // the chop recipes develop the third bar of four
    expect(planBars(4, STYLE_DEFS.jungle).join(' ')).toBe('A A2 B T');
  });

  it('groove bars repeat the groove, answers repeat each other, and later bars stay related', () => {
    for (const seed of SEEDS.slice(0, 15)) {
      const b = bake(defaultRecipe('funk', 8), seedsFrom(seed));
      // bars 1, 3, 5 are the groove (A); bars 2 and 6 the same answer (A2)
      expect(grid(b, 2)).toBe(grid(b, 0));
      expect(grid(b, 4)).toBe(grid(b, 0));
      expect(grid(b, 5)).toBe(grid(b, 1));
    }
    for (const style of ['funk', 'hiphop', 'jungle', 'dnb'] as const) {
      const sims = SEEDS.map((s) => analyse(bake(defaultRecipe(style, 8), seedsFrom(s)).events, 8).barSimilarity);
      expect(mean(sims)).toBeGreaterThan(0.6);
    }
  });

  it('the half-way fill (F) and the turnaround (T) carry fills; with FILLS 0 neither does', () => {
    let fBars = 0;
    for (const seed of SEEDS) {
      const b = bake({ ...defaultRecipe('funk', 8), fills: 0.8 }, seedsFrom(seed));
      const fillHits = (bar: number) => b.events.filter((e) => e.bar === bar && (e.role === 'fill' || e.role === 'roll' || e.role === 'chop' || e.role === 'displaced backbeat' || e.role === 'crash')).length;
      if (fillHits(3) > 0) fBars++;
      expect(fillHits(3)).toBeLessThanOrEqual(fillHits(7) + 6);
    }
    expect(fBars / SEEDS.length).toBeGreaterThan(0.7);
    for (const seed of SEEDS.slice(0, 10)) {
      // (ROLLS is its own control: with ROLLS 0 too, there is no fill or roll at all)
      const b = bake({ ...defaultRecipe('funk', 8), fills: 0, variation: 0, rolls: 0 }, seedsFrom(seed));
      expect(b.events.filter((e) => e.role === 'fill' || e.role === 'roll').length).toBe(0);
    }
  });

  it('eight-bar batches stay fast', () => {
    const t0 = performance.now();
    for (let i = 0; i < 64; i++) bake(defaultRecipe(STYLES[i % STYLES.length]!, 8), seedsFrom(i), fullKit());
    expect((performance.now() - t0) / 64).toBeLessThan(25); // ms per eight-bar break, generous for CI
  });
});

describe('recipes have distinct mechanisms', () => {
  const all = (style: Recipe['style'], bars: Bars = 2, patch: Partial<Recipe> = {}) => SEEDS.map((s) => bake({ ...defaultRecipe(style, bars), ...patch }, seedsFrom(s)));
  const bar0 = (b: Break) => b.events.filter((e) => e.bar === 0);
  it('HALF-TIME: one backbeat, on 3', () => {
    for (const b of all('halftime')) {
      const bb = bar0(b).filter((e) => e.cat === 'snare' && (e.role === 'backbeat' || e.role === 'displaced backbeat'));
      expect(bb.length).toBe(1);
      expect([7, 8, 9, 10]).toContain(bb[0]!.step);
    }
    expect(all('halftime').filter((b) => bar0(b).some((e) => e.role === 'backbeat' && e.step === 8)).length / SEEDS.length).toBeGreaterThan(0.85);
  });
  it('D&B: a two-step skeleton, kicks on 1 and the "and" of 3', () => {
    for (const b of all('dnb')) {
      expect(bar0(b).some((e) => e.cat === 'kick' && e.step === 0)).toBe(true);
      expect(bar0(b).some((e) => e.cat === 'kick' && e.step === 10)).toBe(true);
    }
  });
  it('GARAGE: kicks skip beats 2 and 4; heavy swing', () => {
    for (const b of all('garage')) expect(bar0(b).some((e) => e.cat === 'kick' && (e.step === 4 || e.step === 12))).toBe(false);
    expect(defaultRecipe('garage').swing).toBeGreaterThan(0.45);
  });
  it('HARDCORE: usually a four-on-the-floor layer under the break', () => {
    const withFloor = all('hardcore').filter((b) => [4, 8, 12].every((s) => bar0(b).some((e) => e.cat === 'kick' && e.step === s)));
    expect(withFloor.length / SEEDS.length).toBeGreaterThan(0.6);
  });
  it('ELECTRO: a machine: no ghosts, no swing, no microtiming', () => {
    for (const b of all('electro')) {
      expect(b.events.some((e) => e.cat === 'ghost')).toBe(false);
      expect(b.events.every((e) => e.swing === 0 && e.offsetMs === 0)).toBe(true);
    }
  });
  it('BOOM BAP: a programmed loop: groove and answer identical at default VARIATION', () => {
    for (const b of all('boombap', 4)) expect(grid(b, 1)).toBe(grid(b, 0));
  });
  it('JUNGLE and BREAKCORE chop their development bars; FUNK never chops', () => {
    expect(mean(all('jungle', 8).map((b) => b.events.filter((e) => e.role === 'chop' || e.role === 'roll').length))).toBeGreaterThan(2);
    expect(mean(all('breakcore', 4).map((b) => b.events.filter((e) => e.role === 'chop' || e.role === 'roll').length))).toBeGreaterThan(mean(all('jungle', 4).map((b) => b.events.filter((e) => e.role === 'chop' || e.role === 'roll').length)));
    for (const b of all('funk', 8)) expect(b.events.some((e) => e.role === 'chop')).toBe(false);
    // the groove bar itself is never chopped
    for (const b of all('jungle', 8)) expect(b.events.some((e) => e.bar === 0 && (e.role === 'chop' || e.role === 'roll'))).toBe(false);
  });
  it('a chopped hit says where it came from', () => {
    const chops = all('jungle', 8).flatMap((b) => b.events.filter((e) => e.role === 'chop'));
    expect(chops.length).toBeGreaterThan(0);
    for (const c of chops) expect(c.why).toMatch(/^chop: the .* slice of the/);
  });
  it('every recipe has defaults inside its tempo range and a blurb', () => {
    for (const s of STYLES) {
      const d = STYLE_DEFS[s];
      expect(d.bpm[2]).toBeGreaterThanOrEqual(d.bpm[0]);
      expect(d.bpm[2]).toBeLessThanOrEqual(d.bpm[1]);
      expect(d.blurb.length).toBeGreaterThan(20);
    }
  });
});

describe('engine 2 performance', () => {
  it('the beat-2 backbeat is laid back more than the beat-4 backbeat (FUNK, HIP-HOP)', () => {
    for (const style of ['funk', 'hiphop'] as const) {
      const st = SEEDS.map((s) => analyse(bake(defaultRecipe(style, 2), seedsFrom(s)).events, 2));
      expect(mean(st.map((x) => x.lag2Ms))).toBeGreaterThan(mean(st.map((x) => x.lag4Ms)) + 1);
    }
  });
  it('defaults deviate more than engine 1 did, and stay modest', () => {
    const m2 = mean(SEEDS.map((s) => analyse(bake(defaultRecipe('funk', 2), seedsFrom(s)).events, 2).meanAbsOffsetMs));
    const m1 = mean(SEEDS.map((s) => analyse(bake(defaultRecipe('funk', 2, 1), seedsFrom(s)).events, 2).meanAbsOffsetMs));
    expect(m2).toBeGreaterThan(m1);
    expect(m2).toBeLessThan(6);
  });
  it('hat accents form a repeating cycle (the same step has nearly the same velocity in every bar)', () => {
    for (const style of ['funk', 'garage', 'electro'] as const) expect(mean(SEEDS.map((s) => analyse(bake(defaultRecipe(style, 4), seedsFrom(s)).events, 4).hatAccentDrift))).toBeLessThan(6);
  });
  it('HUMANISE 0 is on the grid in engine 2 as well', () => {
    for (const s of SEEDS) for (const e of bake({ ...defaultRecipe('hiphop', 4), humanise: 0 }, seedsFrom(s)).events) expect(e.offsetMs).toBe(0);
  });
});

describe('named seeds', () => {
  it('numbers stay numbers; anything else is a name, hashed stably', () => {
    expect(parseSeed('1234')).toEqual({ seed: 1234, name: null });
    expect(parseSeed('  0042 ')).toEqual({ seed: 42, name: null });
    expect(parseSeed('')).toBeNull();
    expect(parseSeed('   ')).toBeNull();
    const fc = parseSeed('funky chicken')!;
    expect(fc.name).toBe('funky chicken');
    // FNV-1a over UTF-8: fixed values, so a name bakes the same break in every browser and version
    expect(fc.seed).toBe(296892441);
    expect(hashSeedName('glasgow 1993')).toBe(hashSeedName('glasgow 1993'));
    expect(hashSeedName('glasgow 1993')).not.toBe(hashSeedName('glasgow 1994'));
    // case and spacing do not matter
    expect(parseSeed('Funky   Chicken ')!.seed).toBe(fc.seed);
    expect(normaliseSeedName('  Broken\tWashing  Machine ')).toBe('broken washing machine');
    // non-ASCII names hash their UTF-8 bytes
    expect(parseSeed('Göteborg 94')!.seed).toBe(parseSeed('göteborg 94')!.seed);
    expect(parseSeed('99999999999')!.name).toBe('99999999999'); // too big for a number: a name
  });
  it('the same name, recipe and engine give the same break', () => {
    const s = parseSeed('broken washing machine')!.seed;
    expect(JSON.stringify(bake(defaultRecipe('jungle', 4), seedsFrom(s)))).toBe(JSON.stringify(bake(defaultRecipe('jungle', 4), seedsFrom(s))));
  });
  it('DICE names are words, deterministic for a given random source', () => {
    let x = 0.123;
    const rnd = () => (x = (x * 9301 + 0.4929) % 1);
    let y = 0.123;
    const rnd2 = () => (y = (y * 9301 + 0.4929) % 1);
    for (let i = 0; i < 20; i++) {
      const a = diceName(rnd);
      expect(a).toBe(diceName(rnd2));
      expect(a).toMatch(/^[a-z][a-z -]+ ([a-z -]+|\d{4})$/);
    }
  });
});

describe('seed history and favourites', () => {
  const entry = (seed: number, style: Recipe['style'] = 'funk'): SeedEntry => ({ recipe: defaultRecipe(style, 2), seeds: seedsFrom(seed), name: null });
  it('goes back and forward, drops the forward branch on a new entry, and ignores repeats', () => {
    const h = new SeedHistory();
    h.push(entry(1));
    h.push(entry(2));
    h.push(entry(2)); // the same break again
    h.push(entry(3));
    expect(h.entries.length).toBe(3);
    expect(h.back()!.seeds.beat).toBe(2);
    expect(h.back()!.seeds.beat).toBe(1);
    expect(h.back()).toBeNull();
    expect(h.forward()!.seeds.beat).toBe(2);
    h.push(entry(9));
    expect(h.entries.map((e) => e.seeds.beat)).toEqual([1, 2, 9]);
    expect(h.canForward).toBe(false);
  });
  it('a recipe change updates the current entry instead of adding one', () => {
    const h = new SeedHistory();
    h.push(entry(1));
    h.replaceCurrent({ ...entry(1), recipe: { ...defaultRecipe('funk', 2), bars: 8 } });
    expect(h.entries.length).toBe(1);
    expect(h.entries[0]!.recipe.bars).toBe(8);
  });
  it('is bounded, and survives a save and reload', () => {
    const h = new SeedHistory();
    for (let i = 0; i < HISTORY_MAX + 20; i++) h.push(entry(i));
    expect(h.entries.length).toBe(HISTORY_MAX);
    const back = SeedHistory.from(JSON.parse(JSON.stringify(h.toJSON())));
    expect(back.entries.map(entryKey)).toEqual(h.entries.map(entryKey));
    expect(back.index).toBe(h.index);
    expect(SeedHistory.from({ entries: [{ nonsense: true }, null, 4] }).entries.length).toBe(0);
  });
  it('favourites keep recipe, engine, seeds, mutations, name and sample settings', () => {
    const seeds = mutate(seedsFrom(5), {}, 77)!;
    const f = sanitiseFavourite({ recipe: { ...defaultRecipe('dnb', 8) }, seeds, name: 'glasgow 1993', id: 'x', savedAt: 3, samples: { hat: { mode: 'roundrobin' }, kick: { mode: 'nonsense' } } })!;
    expect(f.recipe.style).toBe('dnb');
    expect(f.recipe.bars).toBe(8);
    expect(f.recipe.engine).toBe(2);
    expect(f.seeds.mut!.length).toBe(1);
    expect(f.name).toBe('glasgow 1993');
    expect(f.samples.hat!.mode).toBe('roundrobin');
    expect(f.samples.kick!.mode).toBe('auto');
    expect(entryLabel(f)).toBe('glasgow 1993 +1 · D&B 8 bars');
    // reproducible: the same favourite bakes the same break
    expect(JSON.stringify(bake(f.recipe, f.seeds))).toBe(JSON.stringify(bake(f.recipe, f.seeds)));
    expect(sanitiseEntry({ recipe: defaultRecipe(), seeds: { beat: -1, detail: 0, feel: 0, kit: 0 } })).toBeNull();
  });
});

describe('MUTATE', () => {
  it('makes a related variation: deterministic, close to the original, and different', () => {
    let changed = 0;
    const sims: number[] = [];
    for (const s of SEEDS) {
      const r = defaultRecipe('funk', 4);
      const a = bake(r, seedsFrom(s));
      const seeds = mutate(a.seeds, {}, s + 1)!;
      const b = bake(r, seeds);
      expect(JSON.stringify(bake(r, seeds))).toBe(JSON.stringify(b));
      const onsets = (x: Break) => new Set(x.events.map((e) => `${e.cat}|${e.bar}|${e.step}|${e.sub}`));
      const A = onsets(a);
      const B = onsets(b);
      const inter = [...A].filter((k) => B.has(k)).length;
      sims.push(inter / new Set([...A, ...B]).size);
      if (A.size !== B.size || inter !== A.size) changed++;
    }
    expect(changed / SEEDS.length).toBeGreaterThan(0.8);
    expect(mean(sims)).toBeGreaterThan(0.75); // related, not a new break
  });
  it('respects FREEZE BEAT (kick and snare stay) and does nothing when beat and detail are frozen', () => {
    for (const s of SEEDS.slice(0, 10)) {
      const r = defaultRecipe('funk', 2);
      const a = bake(r, seedsFrom(s));
      const b = bake(r, mutate(a.seeds, { beat: true }, s)!);
      const ks = (x: Break) => x.events.filter((e) => e.cat === 'kick' || e.cat === 'snare').map((e) => `${e.cat}${e.bar}.${e.step}.${e.sub}`);
      expect(ks(b)).toEqual(ks(a));
    }
    expect(mutate(seedsFrom(1), { beat: true, detail: true })).toBeNull();
  });
  it('a new BAKE drops mutations unless beat and detail are frozen', () => {
    const m = mutate(seedsFrom(1), {}, 2)!;
    expect(reseed(m, {}, 3).mut).toBeUndefined();
    expect(reseed(m, { beat: true, detail: true }, 3).mut!.length).toBe(1);
  });
});

describe('sample selection', () => {
  const kit = fullKit();
  const run = (settings: SampleSettings, kitSeed = 11, recipe = defaultRecipe('funk', 4), seed = 3, loudness?: Record<string, number>) => bake(recipe, { ...seedsFrom(seed), kit: kitSeed }, kit, { settings, loudness });
  const hits = (b: Break, cat: Category) => b.events.filter((e) => e.cat === cat);

  it('AUTO is the original behaviour (one main sample, occasional alternates)', () => {
    const b = run({});
    const hat = hits(b, 'hat');
    const main = [...sampleUsage(hat)].sort((x, y) => y[1] - x[1])[0]![1];
    expect(main / hat.length).toBeGreaterThan(0.5);
    expect(hat.every((e) => e.sampleWhy?.startsWith('AUTO'))).toBe(true);
  });
  it('FIXED plays the chosen sample, and falls back gracefully when it is gone', () => {
    expect(hits(run({ hat: { mode: 'fixed', fixed: 'hat-b' } }), 'hat').every((e) => e.sample === 'hat-b')).toBe(true);
    const gone = hits(run({ hat: { mode: 'fixed', fixed: 'deleted-sample' } }), 'hat');
    expect(gone.every((e) => e.sample === 'hat-a')).toBe(true);
    expect(gone[0]!.sampleWhy).toMatch(/removed|no sample chosen/);
  });
  it('ROUND ROBIN cycles in list order from the top of the break, the same every time', () => {
    const h = hits(run({ hat: { mode: 'roundrobin' } }), 'hat');
    h.forEach((e, i) => expect(e.sample).toBe(kit.hat[i % 3]));
    expect(hits(run({ hat: { mode: 'roundrobin' } }), 'hat').map((e) => e.sample)).toEqual(h.map((e) => e.sample));
  });
  it('WEIGHTED never picks a zero weight and favours heavy ones', () => {
    const h = hits(run({ hat: { mode: 'weighted', weights: { 'hat-a': 0, 'hat-b': 9, 'hat-c': 1 } } }, 11, defaultRecipe('funk', 8)), 'hat');
    expect(h.some((e) => e.sample === 'hat-a')).toBe(false);
    const u = sampleUsage(h);
    expect(u.get('hat-b')!).toBeGreaterThan(u.get('hat-c') ?? 0);
  });
  it('RANDOM and WEIGHTED keep a hit’s sample when other hits change (position-hashed)', () => {
    const r = defaultRecipe('funk', 2);
    const a = run({ hat: { mode: 'random' } }, 11, r, 3);
    const b = run({ hat: { mode: 'random' } }, 11, { ...r, density: 0.2 }, 3);
    const at = (x: Break) => new Map(hits(x, 'hat').map((e) => [`${e.bar}|${e.step}`, e.sample]));
    const A = at(a);
    for (const [k, v] of at(b)) if (A.has(k)) expect(v).toBe(A.get(k));
    // and a new KIT seed changes the picks
    expect(hits(run({ hat: { mode: 'random' } }, 99, r, 3), 'hat').map((e) => e.sample)).not.toEqual(hits(a, 'hat').map((e) => e.sample));
  });
  it('VELOCITY maps soft hits to the quietest sample and loud hits to the loudest', () => {
    const loud = { 'snare-a': -10, 'snare-b': -30, 'snare-c': -20 }; // b quietest, a loudest
    const b = run({ ghost: { mode: 'velocity' }, snare: { mode: 'velocity' } }, 11, defaultRecipe('funk', 4), 3, loud);
    for (const e of hits(b, 'snare')) {
      if (e.vel <= 42) expect(e.sample).toBe('snare-b');
      if (e.vel > 85) expect(e.sample).toBe('snare-a');
    }
    // ghosts with no ghost samples borrow the snare samples and say so
    const k = fullKit();
    k.ghost = [];
    const ev = bake(defaultRecipe('funk', 2), seedsFrom(3), k, { settings: { ghost: { mode: 'velocity' } }, loudness: loud }).events.filter((e) => e.cat === 'ghost');
    expect(ev.every((e) => e.sample === 'snare-b')).toBe(true);
    expect(ev[0]!.sampleWhy).toMatch(/SNARE samples/);
  });
  it('ALTERNATE never repeats a sample on consecutive hits (or across the loop seam)', () => {
    for (const s of SEEDS.slice(0, 10)) {
      const h = hits(run({ hat: { mode: 'alternate' } }, s), 'hat');
      for (let i = 1; i < h.length; i++) expect(h[i]!.sample).not.toBe(h[i - 1]!.sample);
      expect(h[h.length - 1]!.sample).not.toBe(h[0]!.sample);
    }
  });
  it('PER BAR uses one sample per bar, changing between bars', () => {
    const b = run({ snare: { mode: 'perbar' } }, 11, defaultRecipe('funk', 8));
    const perBar = Array.from({ length: 8 }, (_, bar) => new Set(hits(b, 'snare').filter((e) => e.bar === bar).map((e) => e.sample)));
    perBar.forEach((s) => expect(s.size).toBeLessThanOrEqual(1));
    for (let i = 1; i < 8; i++) if (perBar[i]!.size && perBar[i - 1]!.size) expect([...perBar[i]!][0]).not.toBe([...perBar[i - 1]!][0]);
  });
  it('the rhythm never depends on samples or selection; FREEZE SAMPLES keeps the KIT seed', () => {
    const r = defaultRecipe('jungle', 4);
    const g = (b: Break) => b.events.map((e) => `${e.cat}${e.bar}.${e.step}.${e.sub}.${e.vel}.${e.offsetMs}`);
    const a = bake(r, seedsFrom(9), kit, { settings: { hat: { mode: 'roundrobin' }, kick: { mode: 'random' } } });
    expect(g(a)).toEqual(g(bake(r, seedsFrom(9))));
    const frozen = reseed(seedsFrom(9), { kit: true }, 1234);
    expect(frozen.kit).toBe(9);
    const b1 = bake(r, frozen, kit, { settings: { kick: { mode: 'random' } } });
    const b2 = bake(r, frozen, kit, { settings: { kick: { mode: 'random' } } });
    expect(b1.events.map((e) => e.sample)).toEqual(b2.events.map((e) => e.sample));
  });
  it('a single sample, an empty category and bad settings are handled', () => {
    const k = emptyKit();
    k.kick = ['only'];
    const b = bake(defaultRecipe('funk', 2), seedsFrom(1), k, { settings: { kick: { mode: 'alternate' }, snare: { mode: 'roundrobin' } } });
    expect(hits(b, 'kick').every((e) => e.sample === 'only')).toBe(true);
    expect(hits(b, 'snare').every((e) => e.sample === null)).toBe(true);
    expect(sanitiseSampleSettings({ hat: { mode: 'x', weights: { a: 99, b: 'q' } } }).hat).toEqual({ mode: 'auto', fixed: null, weights: { a: 9 } });
    const evs: BreakEvent[] = [];
    selectSamples(evs, k, 1, {}); // nothing to do: no crash
  });
});

describe('SOLO and MUTE', () => {
  it('MUTE wins with multiple solos', () => {
    const m = emptyMix();
    expect(mixActive(m)).toBe(false);
    m.kick.mute = true;
    expect(audible(m, 'kick')).toBe(false);
    expect(audible(m, 'snare')).toBe(true);
    m.snare.solo = true;
    m.hat.solo = true;
    expect(anySolo(m)).toBe(true);
    expect(audibleCategories(m)).toEqual(['snare', 'hat']);
    m.kick.solo = true; // soloed and muted: MUTE wins
    expect(audible(m, 'kick')).toBe(false);
    expect(sanitiseMix({ kick: { solo: 'yes', mute: true } }).kick).toEqual({ solo: false, mute: true, gain: 1, pan: 0 });
  });
  it('the audible export leaves out silenced categories; the events themselves never change', () => {
    const b = bake(defaultRecipe('funk', 4), seedsFrom(4), fullKit());
    const before = JSON.stringify(b.events);
    const only: Category[] = ['kick', 'snare'];
    const t = breakTimeline(b, only);
    expect(t.events.every((e) => only.includes(e.voice as Category))).toBe(true);
    expect(t.events.length).toBe(b.events.filter((e) => only.includes(e.cat)).length);
    expect(breakTimeline(b).events.length).toBe(b.events.length);
    const midi = parseSmf(breakMidi(b, only).bytes);
    expect(midi.notes.every((n) => n.note === 36 || n.note === 38)).toBe(true);
    expect(JSON.stringify(b.events)).toBe(before);
  });
  it('files say what they contain', () => {
    const b = bake(defaultRecipe('hiphop', 2), seedsFrom(42));
    expect(takeawayName(b, { ...defaultTakeaway(), mix: 'audible' }, 'wav')).toBe('breakery_hip-hop_90bpm_2bar_seed42_audible.wav');
    const m = bake(defaultRecipe('hiphop', 8), mutate(seedsFrom(42), {}, 1)!);
    expect(takeawayName(m, { ...defaultTakeaway(), mode: 'loop' }, 'wav')).toBe('breakery_hip-hop_90bpm_8bar_seed42m1_loop.wav');
    expect(takeawayName(bake(defaultRecipe('funk', 2, 1), seedsFrom(42)), defaultTakeaway(), 'wav')).toBe('breakery_funk_100bpm_2bar_seed42_e1.wav');
  });
});

describe('folder import: category suggestions', () => {
  it('uses folders and file names, with common abbreviations', () => {
    const c = (p: string) => suggestCategory(p).cat;
    expect(c('Drum Kit/Kicks/kick01.wav')).toBe('kick');
    expect(c('Drum Kit/Kicks/01.wav')).toBe('kick');
    expect(c('Drum Kit/Snares/snare01.wav')).toBe('snare');
    expect(c('Drum Kit/Hats/closedhat01.wav')).toBe('hat');
    expect(c('Drum Kit/Hats/closedhat02.wav')).toBe('hat');
    expect(c('BD_02.wav')).toBe('kick');
    expect(c('SD 3.aif')).toBe('snare');
    expect(c('HH-07.wav')).toBe('hat');
    expect(c('CH 02.wav')).toBe('hat');
    expect(c('OH.wav')).toBe('open');
    expect(c('closed hat.wav')).toBe('hat');
    expect(c('open hat.wav')).toBe('open');
    expect(c('Percussion/conga hi.wav')).toBe('perc');
    expect(c('Cymbals/thing.wav')).toBe('crash');
    expect(c('Kit/Rides/r1.wav')).toBe('ride');
  });
  it('a more specific folder refines the file name', () => {
    expect(suggestCategory('Open Hats/hat 3.wav').cat).toBe('open');
    expect(suggestCategory('Ghost notes/snare soft.wav').cat).toBe('ghost');
    expect(suggestCategory('Snares/rim.wav').cat).toBe('perc'); // the file name is more specific than its folder
  });
  it('handles ambiguity conservatively (UNSORTED, never discarded)', () => {
    expect(suggestCategory('Kit/kick snare combo.wav').cat).toBe('unsorted');
    expect(suggestCategory('Kit/kick snare combo.wav').reason).toMatch(/ambiguous/);
    expect(suggestCategory('Kicks/kick snare combo.wav').cat).toBe('kick'); // the folder settles it
    expect(suggestCategory('Loops/whoosh.wav').cat).toBe('unsorted');
    expect(guessCategory('chord stab.wav')).toBe('unsorted'); // "ch" only as a whole letter group
    expect(guessCategory('prime.wav')).toBe('unsorted'); // "rim" only as a whole word
    expect(matches('hat_open.wav')).toEqual(['open']);
  });
  it('skips hidden files and non-audio', () => {
    expect(importable('Kit/Kicks/._kick01.wav')).toBe('hidden');
    expect(importable('Kit/.DS_Store')).toBe('hidden');
    expect(importable('__MACOSX/Kit/kick.wav')).toBe('hidden');
    expect(importable('Kit/readme.txt')).toBe('other');
    expect(importable('Kit/kick.WAV')).toBe('audio');
    expect(importable('Kit/kick', 'audio/wav')).toBe('audio');
  });
});
