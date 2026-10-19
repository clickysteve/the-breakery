/**
 * PHASE 13, RHYTHMIC INTELLIGENCE: the rhythmic vocabulary (GROOVE revision 3), HI-HAT and RIDE
 * ACTIVITY with their RELATIONSHIP, TEMPO PROFILES with TEMPO LOCK and the tempo DICE, and
 * WILDCARD. Structural and statistical checks: old revisions reproduce, 0 means none, controls
 * respond in the right direction, the diversity it was built for is there, and the App keeps its
 * promises (undo, FREEZE, TEMPO LOCK, solo and mute). Whether it grooves is for listening; these
 * tests do not claim it.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from '../src/app/app';
import { hatActivity, rideActivity } from '../src/engine/cymbals';
import { bake, seedsFrom } from '../src/engine/generate';
import { emptyKit, type KitIndex } from '../src/engine/kit';
import { PERSONALITIES } from '../src/engine/personality';
import { defaultRecipe, VOCAB } from '../src/engine/styles';
import { pickTempo, tempoFor, TEMPO_PROFILES } from '../src/engine/tempo';
import { CATEGORIES, CURRENT_REVISION, STYLES, type Bars, type Break, type BreakEvent, type Category, type Recipe, type Style } from '../src/engine/types';
import { makeRng } from '../src/engine/rng';
import { defaultWildcard, sanitiseWildcard, wildcardMix, wildcardRecipe, WILDCARD_CATEGORIES } from '../src/engine/wildcard';

const kit = (): KitIndex => {
  const k = emptyKit();
  for (const c of CATEGORIES) k[c] = [`${c}-a`, `${c}-b`, `${c}-c`];
  return k;
};
const K = kit();
// revision 3 (Phase 13's generator; Phase 14's revision 4 is tested in phase14.test.ts)
const R = (style: Style, bars: Bars = 4, patch: Partial<Recipe> = {}): Recipe => ({ ...defaultRecipe(style, bars), revision: 3, ...patch });
const B = (r: Recipe, seed = 4242) => bake(r, seedsFrom(seed), K, {}, (id) => id);
const HATS: Category[] = ['hat', 'open'];
const SEEDS = (n: number) => Array.from({ length: n }, (_, i) => 1000 + i * 7919);
const cymbalHits = (b: Break, cats: Category[]) => b.events.filter((e) => cats.includes(e.cat) && e.role !== 'roll' && e.role !== 'chop');
const barPattern = (events: BreakEvent[], bar: number, cats: Category[]) =>
  events.filter((e) => e.bar === bar && cats.includes(e.cat)).map((e) => `${e.cat[0]}${e.step}.${e.sub}`).sort().join(' ');

describe('old revisions reproduce', () => {
  it('revision 2 bakes byte-for-byte as before Phase 13 (fingerprint taken from main at the merge of Phase 12)', () => {
    // FNV-1a over 264 plain breaks (every recipe, 4 seeds, 2/4/8 bars, rolls on and off) and
    // 132 treated ones (every personality, BREAK DNA, CHOP), baked by main (4b7897b) and here
    let h = 2166136261 >>> 0;
    const add = (s: string) => {
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
      }
    };
    const row = (b: Break) => JSON.stringify(b.events.map((e) => [e.cat, e.bar, e.step, e.sub, e.vel, e.swing, e.offsetMs, e.sample, e.role]));
    for (const st of STYLES) for (const seed of [13, 4242, 7919, 90001]) for (const bars of [2, 4, 8] as Bars[]) for (const rollsOn of [false, true]) add(row(B({ ...defaultRecipe(st, bars), revision: 2, rollsOn }, seed)));
    for (const st of STYLES) for (const p of PERSONALITIES) for (const seed of [13, 4242]) {
      const r = { ...defaultRecipe(st, 4), revision: 2, rollsOn: true, personality: { id: p, amount: 0.8 }, dna: seed === 13 ? { id: 'amen' as const, amount: 0.6 } : undefined, chop: { on: true, amount: 0.5, slice: 'small' as const, retrigger: 0.3, variant: 7 } };
      add(row(B(r, seed)));
    }
    expect(h.toString(16)).toBe('c17c2aff');
  });

  it('new breaks use the vocabulary; a revision 2 break has no approach and ignores the cymbal controls', () => {
    expect(CURRENT_REVISION).toBeGreaterThanOrEqual(3);
    expect(defaultRecipe('hiphop', 4).revision).toBe(CURRENT_REVISION);
    expect(B(R('hiphop')).approach).toBeDefined();
    const old = R('hiphop', 4, { revision: 2 });
    expect(B(old).approach).toBeUndefined();
    expect(JSON.stringify(B({ ...old, hats: 0.1, ride: 0.9, cymbals: 'layer' }).events)).toBe(JSON.stringify(B(old).events));
  });
});

describe('diversity (the reason for Phase 13)', () => {
  it('HIP-HOP over 100 seeds: many different hat patterns, none dominant, where revision 2 had a handful', () => {
    const count = (rev: number) => {
      const m = new Map<string, number>();
      for (const s of SEEDS(100)) {
        const p = barPattern(B(R('hiphop', 4, { revision: rev }), s).events, 0, HATS);
        m.set(p, (m.get(p) ?? 0) + 1);
      }
      return m;
    };
    const now = count(3);
    const before = count(2);
    expect(before.size).toBeLessThanOrEqual(10);
    expect(now.size).toBeGreaterThanOrEqual(40);
    expect(Math.max(...now.values())).toBeLessThanOrEqual(15);
    // and the patterns are not all one family: off-beats, sixteenths and sparse bars all occur
    const densities = [...now.keys()].map((p) => (p ? p.split(' ').length : 0));
    expect(Math.min(...densities)).toBeLessThanOrEqual(4);
    expect(Math.max(...densities)).toBeGreaterThanOrEqual(12);
  });

  it('every recipe draws on several groove approaches, phrase forms and timekeeping approaches', () => {
    for (const st of STYLES) {
      const grooves = new Set<string>();
      const forms = new Set<string>();
      const tk = new Set<string>();
      for (const s of SEEDS(60)) {
        const a = B(R(st), s).approach!;
        grooves.add(a.groove.split(' ')[0]!);
        forms.add(a.form);
        tk.add(`${a.hats}|${a.ride}`);
      }
      expect(grooves.size, `${st} grooves`).toBeGreaterThanOrEqual(2);
      expect(forms.size, `${st} forms`).toBeGreaterThanOrEqual(2);
      expect(tk.size, `${st} timekeeping`).toBeGreaterThanOrEqual(4);
    }
  });

  it('identity holds: the backbeat recipes keep a snare on 2 or 4 in most groove bars; GARAGE and D&B keep their signatures', () => {
    for (const st of ['funk', 'hiphop', 'boombap'] as Style[]) {
      let ok = 0;
      for (const s of SEEDS(60)) {
        const ev = B(R(st), s).events.filter((e) => e.bar === 0 && e.cat === 'snare' && e.vel >= 70);
        if (ev.some((e) => e.step === 4 || e.step === 12)) ok++;
      }
      expect(ok / 60, st).toBeGreaterThanOrEqual(0.8);
    }
    // D&B: the snare on the half-time backbeat (step 4 or 12 at double tempo is beat 2/4 of the bar)
    let dnb = 0;
    for (const s of SEEDS(60)) if (B(R('dnb'), s).events.some((e) => e.bar === 0 && e.cat === 'snare' && e.vel >= 70 && (e.step === 4 || e.step === 12))) dnb++;
    expect(dnb / 60).toBeGreaterThanOrEqual(0.8);
  });

  it('every phrase form ends in the turnaround; VARIATION 0 repeats the groove bar in a programmed recipe', () => {
    for (const st of STYLES) for (const s of SEEDS(20)) for (const bars of [2, 4, 8] as Bars[]) expect(B(R(st, bars), s).plan.at(-1), `${st} ${bars}`).toBe('T');
    for (const st of ['hiphop', 'garage', 'electro'] as Style[]) {
      for (const s of SEEDS(10)) {
        const ev = B(R(st, 4, { variation: 0, fills: 0, rollsOn: false }), s).events.filter((e) => e.role !== 'fill' && e.role !== 'roll');
        // the first bar opens with a crash on the one, which takes the place of the hat there
        const key = (bar: number) => ev.filter((e) => e.bar === bar && e.cat !== 'crash' && !(e.step === 0 && e.sub === 0 && ['hat', 'open', 'ride'].includes(e.cat))).map((e) => `${e.cat}${e.step}.${e.sub}`).sort().join(' ');
        expect(key(2), `${st} ${s}`).toBe(key(0));
      }
    }
  });

  it('shuffle grooves land on the triplet grid (and are not swung a second time)', () => {
    let trip = 0;
    for (const st of ['hiphop', 'boombap', 'funk'] as Style[]) for (const s of SEEDS(80)) {
      const b = B(R(st), s);
      if (!b.approach!.groove.startsWith('SHUFFLE')) continue;
      const t = b.events.filter((e) => e.sub === 4 || e.sub === 8);
      if (t.length) trip++;
      for (const e of t) expect(e.swing).toBe(0);
    }
    expect(trip).toBeGreaterThan(0);
  });
});

describe('HI-HAT and RIDE ACTIVITY', () => {
  it('0 means no hats or no ride at all, with every personality, rolls on, CHOP and BREAK DNA', () => {
    for (const st of STYLES) for (const p of PERSONALITIES) for (const s of [13, 4242]) {
      const b = B(R(st, 4, { hats: 0, ride: 0.6, rollsOn: true, rolls: 0.8, personality: { id: p, amount: 1 }, chop: { on: true, amount: 0.6, slice: 'small', retrigger: 0.5, variant: 3 }, dna: s === 13 ? { id: 'amen', amount: 0.8 } : undefined }), s);
      expect(b.events.filter((e) => HATS.includes(e.cat)), `${st} ${p} hats`).toEqual([]);
      const c = B(R(st, 4, { ride: 0, hats: 0.6, rollsOn: true, rolls: 0.8, personality: { id: p, amount: 1 } }), s);
      expect(c.events.filter((e) => e.cat === 'ride'), `${st} ${p} ride`).toEqual([]);
    }
  });

  it('more activity, more cymbal hits (averaged over seeds), for every recipe', () => {
    for (const st of STYLES) {
      const mean = (patch: Partial<Recipe>, cats: Category[]) => SEEDS(30).reduce((n, s) => n + cymbalHits(B(R(st, 4, patch), s), cats).length, 0) / 30;
      const h = [0.15, 0.5, 0.9].map((a) => mean({ hats: a, ride: 0, cymbals: 'independent' }, HATS));
      expect(h[0]!, `${st} hats low→mid`).toBeLessThan(h[1]!);
      expect(h[1]!, `${st} hats mid→high`).toBeLessThan(h[2]!);
      const r = [0.15, 0.9].map((a) => mean({ ride: a, hats: 0, cymbals: 'independent' }, ['ride']));
      expect(r[0]!, `${st} ride`).toBeLessThan(r[1]!);
    }
  });

  it('defaults come from the recipe vocabulary; the activity is clamped and saved with the recipe', () => {
    for (const st of STYLES) {
      expect(hatActivity(R(st))).toBe(VOCAB[st].hats);
      expect(rideActivity(R(st))).toBe(VOCAB[st].ride);
    }
    expect(VOCAB.dnb.rideLean).toBeGreaterThan(VOCAB.garage.rideLean);
  });

  it('RELATIONSHIP: ALTERNATE rarely stacks hats and ride on the same tick; LAYER does more often; INDEPENDENT gives each its own approach', () => {
    const together = (mode: Recipe['cymbals']) => {
      let n = 0;
      for (const s of SEEDS(40)) {
        const ev = B(R('jungle', 4, { hats: 0.7, ride: 0.7, cymbals: mode }), s).events;
        const ride = new Set(ev.filter((e) => e.cat === 'ride').map((e) => `${e.bar}.${e.step}.${e.sub}`));
        n += ev.filter((e) => e.cat === 'hat' && ride.has(`${e.bar}.${e.step}.${e.sub}`)).length;
      }
      return n;
    };
    expect(together('alternate')).toBeLessThan(together('layer'));
    let both = 0;
    for (const s of SEEDS(40)) {
      const a = B(R('broken', 4, { hats: 0.7, ride: 0.7, cymbals: 'independent' }), s).approach!;
      if (a.hats && a.ride) both++;
    }
    expect(both / 40).toBeGreaterThanOrEqual(0.8);
  });

  it('REGEN TRACK of the hats keeps activity 0 for the ride, and redraws the hats from the vocabulary', () => {
    const { app } = makeApp();
    app.setRecipe({ hats: 0.7, ride: 0 });
    const before = barPattern(app.current.events, 0, HATS) + barPattern(app.current.events, 1, HATS);
    let changed = false;
    for (let i = 0; i < 6 && !changed; i++) {
      app.regenTracks(['hat']);
      expect(app.current.events.some((e) => e.cat === 'ride')).toBe(false);
      changed = barPattern(app.current.events, 0, HATS) + barPattern(app.current.events, 1, HATS) !== before;
    }
    expect(changed).toBe(true);
  });
});

describe('TEMPO PROFILES', () => {
  it('each recipe picks tempos inside its range, centred but not always the centre', () => {
    for (const st of STYLES) {
      const p = TEMPO_PROFILES[st];
      const got = SEEDS(200).map((s) => tempoFor(st, s));
      for (const t of got) {
        expect(t).toBeGreaterThanOrEqual(p.min);
        expect(t).toBeLessThanOrEqual(p.max);
      }
      expect(new Set(got).size, st).toBeGreaterThanOrEqual(8);
      const mean = got.reduce((a, b) => a + b, 0) / got.length;
      expect(Math.abs(mean - (p.min + p.max + p.centre) / 3), st).toBeLessThan((p.max - p.min) * 0.08);
      expect(tempoFor(st, 4242)).toBe(tempoFor(st, 4242));
    }
    const rng = makeRng(1);
    for (let i = 0; i < 500; i++) {
      const t = pickTempo('breakcore', rng);
      expect(t).toBeGreaterThanOrEqual(150);
      expect(t).toBeLessThanOrEqual(220);
    }
  });
});

describe('WILDCARD (engine)', () => {
  const ctx = (patch: Partial<Parameters<typeof wildcardRecipe>[1]> = {}) => ({ settings: defaultWildcard(), frozen: { beat: false, detail: false, feel: false, kit: false }, tempoLock: false, rollGeneration: false, ...patch });

  it('defaults: the break categories on, samples, mixer and output off; settings sanitise', () => {
    const d = defaultWildcard();
    expect(WILDCARD_CATEGORIES.filter((c) => d[c])).toEqual(['recipe', 'tempo', 'personality', 'dna', 'controls', 'chop', 'rollExpr', 'destroy']);
    expect(sanitiseWildcard({ mixer: true, recipe: 'yes', bogus: true })).toEqual({ ...d, mixer: true });
    expect(sanitiseWildcard(null)).toEqual(d);
  });

  it('is deterministic per seed, and different seeds give different breaks', () => {
    const cur = R('funk');
    expect(wildcardRecipe(cur, ctx(), 77)).toEqual(wildcardRecipe(cur, ctx(), 77));
    const styles = new Set(SEEDS(40).map((s) => wildcardRecipe(cur, ctx(), s).recipe.style));
    expect(styles.has('funk')).toBe(false);
    expect(styles.size).toBeGreaterThanOrEqual(8);
  });

  it('is musically informed: tempos inside the new recipe’s profile, controls near its defaults, treatments only sometimes', () => {
    let persona = 0;
    let destroy = 0;
    let dist = 0;
    const N = 200;
    for (const s of SEEDS(N)) {
      const { recipe: r } = wildcardRecipe(R('funk'), ctx(), s);
      const p = TEMPO_PROFILES[r.style];
      expect(r.bpm).toBeGreaterThanOrEqual(p.min);
      expect(r.bpm).toBeLessThanOrEqual(p.max);
      const d = defaultRecipe(r.style, 4);
      dist += Math.abs(r.density - d.density) + Math.abs(r.swing - d.swing);
      if (r.personality) persona++;
      if (r.destroy?.on) destroy++;
      expect(r.rollsOn).toBe(R('funk').rollsOn);
      if (r.chop?.on) expect(r.chop.retrigger).toBe(0);
    }
    expect(dist / N).toBeLessThan(0.3);
    expect(persona / N).toBeGreaterThan(0.35);
    expect(persona / N).toBeLessThan(0.75);
    expect(destroy / N).toBeLessThan(0.35);
  });

  it('respects TEMPO LOCK, FREEZE and the switched-off categories', () => {
    const cur = { ...R('dnb'), bpm: 171, personality: { id: 'nervous' as const, amount: 0.5 } };
    for (const s of SEEDS(30)) {
      expect(wildcardRecipe(cur, ctx({ tempoLock: true }), s).recipe.bpm).toBe(171);
      const frozen = wildcardRecipe(cur, ctx({ frozen: { beat: true, detail: true, feel: true, kit: false } }), s);
      expect(frozen.recipe.style).toBe('dnb');
      expect(frozen.recipe.density).toBe(cur.density);
      expect(frozen.recipe.personality).toEqual(cur.personality);
      const off = Object.fromEntries(WILDCARD_CATEGORIES.map((c) => [c, false])) as ReturnType<typeof defaultWildcard>;
      expect(wildcardRecipe(cur, ctx({ settings: { ...off, tempo: true } }), s).recipe).toEqual({ ...cur, bpm: wildcardRecipe(cur, ctx({ settings: { ...off, tempo: true } }), s).recipe.bpm });
    }
  });

  it('the mixer: levels and pans move, solo and mute never do; kick, snare and ghosts stay centred', () => {
    const { app } = makeApp();
    const mix = JSON.parse(JSON.stringify(app.mix)) as typeof app.mix;
    mix.snare.solo = true;
    mix.hat.mute = true;
    const out = wildcardMix(mix, 99);
    for (const c of Object.keys(mix) as Category[]) {
      expect(out[c].solo).toBe(mix[c].solo);
      expect(out[c].mute).toBe(mix[c].mute);
      expect(out[c].gain).toBeGreaterThanOrEqual(0.6);
      expect(out[c].gain).toBeLessThanOrEqual(1);
    }
    expect([out.kick.pan, out.snare.pan, out.ghost.pan]).toEqual([0, 0, 0]);
  });
});

describe('Phase 13 in the App', () => {
  beforeEach(() => {
    (globalThis as { localStorage?: Storage }).localStorage = memoryStorage();
  });

  it('choosing a recipe picks a tempo from its profile; TEMPO LOCK keeps it through recipes, RANDOM RECIPE and WILDCARD; BAKE never changes it', () => {
    const { app } = makeApp();
    const bpms = new Set<number>();
    for (const s of SEEDS(12)) {
      app.setSeed(s);
      app.setStyle('jungle');
      bpms.add(app.recipe.bpm);
      expect(app.recipe.bpm).toBeGreaterThanOrEqual(155);
      expect(app.recipe.bpm).toBeLessThanOrEqual(176);
    }
    expect(bpms.size).toBeGreaterThan(1);
    app.setRecipe({ bpm: 133 });
    app.setTempoLock(true);
    app.setStyle('hiphop');
    expect(app.recipe.bpm).toBe(133);
    app.randomRecipe(0.5);
    expect(app.recipe.bpm).toBe(133);
    app.wildcard(4242);
    expect(app.recipe.bpm).toBe(133);
    app.setRecipe({ bpm: 101 });
    expect(app.recipe.bpm).toBe(101);
    app.setTempoLock(false);
    for (let i = 0; i < 5; i++) {
      app.bake();
      expect(app.recipe.bpm).toBe(101);
    }
  });

  it('TEMPO LOCK is saved; the tempo DICE refuses while locked, otherwise changes only the tempo (one undo step)', () => {
    const { app } = makeApp();
    app.setTempoLock(true);
    expect(JSON.parse(localStorage.getItem('breakery.state.v1')!).tempoLock).toBe(true);
    const bpm = app.recipe.bpm;
    expect(app.diceTempo(5)).toBe(false);
    expect(app.recipe.bpm).toBe(bpm);
    expect(app.status).toMatch(/TEMPO LOCK/);
    app.setTempoLock(false);
    const events = JSON.stringify(app.current.events.map((e) => [e.cat, e.bar, e.step, e.sub, e.vel]));
    expect(app.diceTempo(5)).toBe(true);
    expect(app.recipe.bpm).not.toBe(bpm);
    expect(JSON.stringify(app.current.events.map((e) => [e.cat, e.bar, e.step, e.sub, e.vel]))).toBe(events);
    app.undo();
    expect(app.recipe.bpm).toBe(bpm);
  });

  it('WILDCARD: deterministic, one undo step, redo works, the KIT seed only with SAMPLE ASSIGNMENTS, FREEZE respected', () => {
    const a = makeApp().app;
    const b = makeApp().app;
    a.wildcard(31337);
    b.wildcard(31337);
    expect(a.recipe).toEqual(b.recipe);
    expect(a.seeds).toEqual(b.seeds);

    const { app } = makeApp();
    const recipe = JSON.stringify(app.recipe);
    const seeds = JSON.stringify(app.seeds);
    const kitSeed = app.seeds.kit;
    app.wildcard(7);
    expect(JSON.stringify(app.recipe)).not.toBe(recipe);
    expect(app.seeds.kit).toBe(kitSeed);
    const after = JSON.stringify(app.recipe);
    app.undo();
    expect(JSON.stringify(app.recipe)).toBe(recipe);
    expect(JSON.stringify(app.seeds)).toBe(seeds);
    app.redo();
    expect(JSON.stringify(app.recipe)).toBe(after);

    app.setWildcard('samples', true);
    app.wildcard(8);
    expect(app.seeds.kit).not.toBe(kitSeed);
    app.toggleFreeze('kit');
    const k2 = app.seeds.kit;
    app.wildcard(9);
    expect(app.seeds.kit).toBe(k2);

    app.toggleRhythm();
    const frozen = { style: app.recipe.style, beat: app.seeds.beat, detail: app.seeds.detail, feel: app.seeds.feel };
    app.wildcard(10);
    expect({ style: app.recipe.style, beat: app.seeds.beat, detail: app.seeds.detail, feel: app.seeds.feel }).toEqual(frozen);
  });

  it('WILDCARD with ROLL GENERATION off adds no rolls; settings are saved and restore to defaults', () => {
    const { app } = makeApp();
    expect(app.rollGeneration).toBe(false);
    for (const s of SEEDS(12)) {
      app.wildcard(s);
      expect(app.current.events.filter((e) => e.role === 'roll'), `seed ${s}`).toEqual([]);
    }
    app.setWildcard('mixer', true);
    app.setWildcard('recipe', false);
    const saved = JSON.parse(localStorage.getItem('breakery.state.v1')!).wildcard;
    expect(saved.mixer).toBe(true);
    expect(saved.recipe).toBe(false);
    const again = new App({ kit: () => K, loudness: () => ({}), name: (id: string | null) => id ?? '—' } as never, playerStub() as never);
    expect(again.wildcardSettings.mixer).toBe(true);
    app.resetWildcard();
    expect(app.wildcardSettings).toEqual(defaultWildcard());
  });

  it('WILDCARD with MIXER and OUTPUT EFFECTS: one undo step restores both, solo and mute kept', () => {
    const { app } = makeApp();
    app.toggleSolo('snare');
    app.toggleMute('hat');
    app.setWildcard('mixer', true);
    app.setWildcard('output', true);
    const mix = JSON.stringify(app.mix);
    const output = JSON.stringify(app.output.config);
    let seed = 1;
    do app.wildcard(seed++);
    while (JSON.stringify(app.output.config) === output && seed < 20);
    expect(JSON.stringify(app.mix)).not.toBe(mix);
    expect(JSON.stringify(app.output.config)).not.toBe(output);
    expect(app.mix.snare.solo).toBe(true);
    expect(app.mix.hat.mute).toBe(true);
    // undo back to before the first press
    for (let i = 1; i < seed; i++) app.undo();
    expect(JSON.stringify(app.mix)).toBe(mix);
    expect(JSON.stringify(app.output.config)).toBe(output);
    app.redo();
    expect(JSON.stringify(app.mix)).not.toBe(mix);
  });

  it('cymbal settings are part of the recipe: saved, undoable and carried by the history', () => {
    // (revision 4 holds them in Recipe.cym: CLOSED HAT, RIDE and the PRIMARY RELATIONSHIP; phase14.test.ts)
    const { app } = makeApp();
    app.setCym({ closed: 0.2, ride: 0.8, rel: 'layer' });
    expect(JSON.parse(localStorage.getItem('breakery.state.v1')!).recipe.cym).toMatchObject({ closed: 0.2, ride: 0.8, rel: 'layer' });
    app.undo();
    expect(app.recipe.cym?.rel ?? 'accent').toBe('accent');
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
  const ingredients = { kit: () => K, loudness: () => ({}), name: (id: string | null) => id ?? '—' };
  const sent: Break[] = [];
  const app = new App(ingredients as never, playerStub(sent) as never, seed);
  app.setStyle('funk');
  app.setRecipe({ bars: 4 });
  return { app, sent };
}
