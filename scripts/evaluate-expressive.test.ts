/**
 * `npm run evaluate`: also writes docs/expressive-report.md, the event data behind Phase 12: TOM
 * ACTIVITY's revision 2 against revision 1, the PERSONALITIES over several recipes, DILLA and
 * AMEN at 30, 70 and 100 %, the roll EXPRESSION presets, DESTROY and REGEN TRACK. Every number is
 * measured from baked events (sample-free kits, many seeds). They say what the engine does; they
 * say nothing about how it sounds, which needs listening.
 */
import { writeFileSync } from 'node:fs';
import { test } from 'vitest';
import { destroy } from '../src/engine/destroy';
import { dillaStrategy, DILLA_STRATEGY_LABEL, DILLA_STRATEGIES } from '../src/engine/dilla';
import { bake, seedsFrom } from '../src/engine/generate';
import { emptyKit, type KitIndex } from '../src/engine/kit';
import { PERSONALITIES, PERSONALITY_LABEL, type PersonalityId } from '../src/engine/personality';
import { regenStep } from '../src/engine/regen';
import { presetExpr, ROLL_PRESETS, ROLL_PRESET_LABEL } from '../src/engine/rollExpr';
import { rollGroups } from '../src/engine/rolls';
import { defaultRecipe, STYLE_DEFS } from '../src/engine/styles';
import { CATEGORIES, isTom, STEPS, TOMS, TPB, TPS, type Break, type BreakEvent, type Category, type Recipe, type Seeds, type Style } from '../src/engine/types';

const SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i * 37);
const kit = (toms = 3): KitIndex => {
  const k = emptyKit();
  for (const c of CATEGORIES) k[c] = [`${c}-a`];
  for (const [i, c] of TOMS.entries()) if (i >= toms) k[c] = [];
  return k;
};
const K = kit();
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sd = (xs: number[]) => Math.sqrt(mean(xs.map((x) => (x - mean(xs)) ** 2)));
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '-');
const sg = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(1)}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const tick = (e: BreakEvent) => e.bar * TPB + e.step * TPS + e.sub;
const B = (r: Recipe, seed: number, k = K, seeds?: Seeds) => bake(r, seeds ?? seedsFrom(seed), k);
const R = (style: Style, patch: Partial<Recipe> = {}): Recipe => ({ ...defaultRecipe(style, 4), rollsOn: false, ...patch });
const label = (s: Style) => STYLE_DEFS[s].label;
const table = (head: string[], rows: (string | number)[][]) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
const VOICES: Record<string, Category[]> = { kick: ['kick'], snare: ['snare', 'ghost'], hats: ['hat', 'open', 'ride'] };
const voiceMean = (evs: BreakEvent[], v: string, f: (e: BreakEvent) => number) => mean(evs.filter((e) => VOICES[v]!.includes(e.cat)).map(f));

// ------------------------------------------------------------------ toms

function tomMeasure(b: Break) {
  const t = b.events.filter((e) => isTom(e.cat) && e.role !== 'roll');
  let phrases = 0;
  for (let bar = 0; bar < b.recipe.bars; bar++) {
    const st = t.filter((e) => e.bar === bar).map((e) => e.step).sort((x, y) => x - y);
    st.forEach((x, i) => (i === 0 || x - st[i - 1]! > 2) && phrases++);
  }
  const bbs = new Set(b.events.filter((e) => e.cat === 'snare' && e.role === 'backbeat').map(tick));
  return { hits: t.length, phrases, voices: new Set(t.map((e) => e.cat)).size, bars: new Set(t.map((e) => e.bar)).size, ending: t.length ? t.filter((e) => e.step >= STEPS - 4).length / t.length : 0, first: t.filter((e) => tick(e) < 4 * TPS).length, clash: t.filter((e) => bbs.has(tick(e))).length };
}

function tomsSection(): string {
  const styles: Style[] = ['hiphop', 'broken', 'funk', 'jungle', 'dnb', 'breakcore'];
  const levels = [0, 0.2, 0.4, 0.6, 0.8, 1];
  const out: string[] = ['## 1. TOM ACTIVITY: revision 2 against revision 1', '', `4 bars, ${SEEDS.length} seeds, ROLL GENERATION off, a three-tom kit. Tom rolls from ROLLS are not counted. **hits** and **phrases** per 4-bar break (a phrase: toms with no gap longer than an eighth); **len**: hits per phrase; **voices**: toms used; **bars**: bars with toms; **end**: share of tom hits in the last beat of a bar; **clash**: tom hits on a backbeat snare (per break); **first beat**: tom hits in the loop's first beat (all breaks).`, ''];
  out.push('Target curve (revision 2): about 0 at 0 %, an occasional short phrase at 20 %, a phrase most breaks at 40 %, phrases in more than one bar at 60 %, several longer phrases at 80 %, and tom-led playing (several long phrases, two or three toms) at 100 %. The curve is `0.55t + 0.5t² + 0.65t³` times the recipe\'s rate (toms.ts `tomCurve`), with at least one phrase from 40 %.', '');
  for (const style of styles) {
    const rows: (string | number)[][] = [];
    for (const t of levels)
      for (const rev of [1, 2]) {
        const m = SEEDS.map((s) => tomMeasure(B(R(style, { toms: t, revision: rev }), s)));
        const hits = mean(m.map((x) => x.hits));
        const ph = mean(m.map((x) => x.phrases));
        rows.push([pct(t), `rev ${rev}`, f1(hits), f1(ph), f1(ph ? hits / ph : 0), f1(mean(m.map((x) => x.voices))), f1(mean(m.map((x) => x.bars))), pct(mean(m.map((x) => x.ending))), f1(mean(m.map((x) => x.clash))), m.reduce((a, x) => a + x.first, 0)]);
      }
    out.push(`### ${label(style)}`, '', table(['TOM ACTIVITY', 'revision', 'hits', 'phrases', 'len', 'voices', 'bars', 'end', 'clash', 'first beat'], rows), '');
  }
  const rows: (string | number)[][] = [];
  for (const style of styles)
    for (const n of [3, 2, 1]) {
      const k = kit(n);
      const m = SEEDS.map((s) => tomMeasure(B(R(style, { toms: 1 }), s, k)));
      rows.push([label(style), n, f1(mean(m.map((x) => x.hits))), f1(mean(m.map((x) => x.phrases))), f1(mean(m.map((x) => x.voices)))]);
    }
  out.push('### Kits with three, two and one tom (100 %, revision 2)', '', table(['recipe', 'toms in kit', 'hits', 'phrases', 'voices'], rows), '');
  return out.join('\n');
}

// ------------------------------------------------------------------ personalities

function bodyStats(evs: BreakEvent[], bars: number) {
  const ks = (bar: number) => evs.filter((e) => e.bar === bar && (e.cat === 'kick' || e.cat === 'snare')).map((e) => `${e.cat}${e.step}.${e.sub}`).sort().join(',');
  let same = 0;
  for (let i = 1; i < bars; i++) if (ks(i) === ks(0)) same++;
  return same / Math.max(1, bars - 1);
}

function personalitiesSection(): string {
  const styles: Style[] = ['funk', 'hiphop', 'jungle', 'dnb', 'breakcore'];
  const S = SEEDS.slice(0, 30);
  const out: string[] = ['## 2. PERSONALITIES × recipes', '', `INTENSITY 70 %, 4 bars, ${S.length} seeds, ROLL GENERATION off. **hits**: change against NEUTRAL on the same seeds; **vel**: mean velocity and its spread (sd); **K / S / H ms**: mean timing offset of kick, snare (with ghosts) and hats against NEUTRAL; **jitter**: spread of the hats' offsets; **repeat**: share of bars whose kick and snare are the first bar's again.`, ''];
  for (const style of styles) {
    const rows: (string | number)[][] = [];
    const base = S.map((s) => B(R(style), s));
    for (const id of PERSONALITIES) {
      const bs = S.map((s) => B(R(style, { personality: { id, amount: 0.7 } }), s));
      const dh = mean(bs.map((b, i) => b.events.length - base[i]!.events.length));
      const vel = bs.flatMap((b) => b.events.map((e) => e.vel));
      const d = (v: string) => mean(bs.map((b, i) => voiceMean(b.events, v, (e) => e.offsetMs) - voiceMean(base[i]!.events, v, (e) => e.offsetMs)));
      const jitter = mean(bs.map((b) => sd(b.events.filter((e) => VOICES.hats!.includes(e.cat)).map((e) => e.offsetMs))));
      rows.push([PERSONALITY_LABEL[id], sg(dh), `${f1(mean(vel))} (${f1(sd(vel))})`, sg(d('kick')), sg(d('snare')), sg(d('hats')), f1(jitter), pct(mean(bs.map((b) => bodyStats(b.events, 4))))]);
    }
    out.push(`### ${label(style)}`, '', table(['personality', 'hits', 'vel (sd)', 'K ms', 'S ms', 'H ms', 'jitter', 'repeat'], rows), '');
  }
  // explicit settings
  const rows: (string | number)[][] = [];
  for (const id of PERSONALITIES.filter((p) => p !== 'neutral')) {
    let toms = 0;
    let rolls = 0;
    const sparse: number[] = [];
    const sparse0: number[] = [];
    for (const style of styles)
      for (const s of S.slice(0, 10)) {
        const b = B(R(style, { toms: 0, personality: { id, amount: 1 } }), s);
        toms += b.events.filter((e) => isTom(e.cat)).length;
        rolls += b.events.filter((e) => e.role === 'roll').length;
        sparse.push(B(R(style, { density: 0.2, personality: { id, amount: 1 } }), s).events.length);
        sparse0.push(B(R(style, { density: 0.2 }), s).events.length);
      }
    rows.push([PERSONALITY_LABEL[id], toms, rolls, `${f1(mean(sparse))} vs ${f1(mean(sparse0))}`]);
  }
  out.push('### Explicit settings at INTENSITY 100 %', '', `${styles.length} recipes × 10 seeds each. TOMS 0 and ROLL GENERATION off: toms and roll hits added (must be 0). DENSITY 20 %: mean hits with the personality vs NEUTRAL.`, '', table(['personality', 'toms (TOMS 0)', 'roll hits (ROLLS off)', 'hits at DENSITY 20 %'], rows), '');
  return out.join('\n');
}

// ------------------------------------------------------------------ DILLA

function dillaSection(): string {
  const out: string[] = ['## 3. DILLA at 30, 70 and 100 %', '', 'HIP-HOP and FUNK, 4 bars, 40 seeds. Each break plays one strategy chosen by its FEEL seed. **K / S / H**: mean offset (ms) of kick, snare and hats against the same break at 0 %; **max**: largest offset; **swing K / S / H**: mean swing delay of the off-beat sixteenths by voice, ms at the recipe tempo; **2-bar diff**: mean difference (ms) between the offset of a hit and of the same hit two bars earlier, against the same figure at 0 % in brackets: smaller means the figure repeats more exactly (the table repeats; T bars vary).', ''];
  const rows: (string | number)[][] = [];
  for (const style of ['hiphop', 'funk'] as Style[])
    for (const strat of DILLA_STRATEGIES) {
      const seeds = SEEDS.concat(SEEDS.map((s) => s + 5000)).filter((s) => dillaStrategy(s) === strat).slice(0, 12);
      for (const a of [0.3, 0.7, 1]) {
        const pairs = seeds.map((s) => [B(R(style), s), B(R(style, { personality: { id: 'dilla', amount: a } }), s)] as const);
        const d = (v: string) => mean(pairs.map(([b0, b]) => voiceMean(b.events, v, (e) => e.offsetMs) - voiceMean(b0.events, v, (e) => e.offsetMs)));
        const max = Math.max(...pairs.flatMap(([, b]) => b.events.map((e) => Math.abs(e.offsetMs))));
        const bpm = pairs[0]![1].recipe.bpm;
        const swingMs = (v: string) => mean(pairs.flatMap(([, b]) => b.events.filter((e) => VOICES[v]!.includes(e.cat) && e.step % 2 === 1 && e.sub === 0).map((e) => (e.swing * 60000) / bpm / 4)));
        // how far a hit's offset is from the same hit two bars earlier (snare, ghost and hats; not across a T bar)
        const drift2 = (b: Break) => {
          const at = new Map(b.events.map((e) => [`${e.cat}|${e.bar}|${e.step}|${e.sub}`, e.offsetMs]));
          const ds: number[] = [];
          for (const e of b.events.filter((x) => x.bar >= 2 && b.plan[x.bar] !== 'T' && b.plan[x.bar - 2] !== 'T' && x.cat !== 'kick')) {
            const o = at.get(`${e.cat}|${e.bar - 2}|${e.step}|${e.sub}`);
            if (o !== undefined) ds.push(Math.abs(o - e.offsetMs));
          }
          return mean(ds);
        };
        rows.push([label(style), DILLA_STRATEGY_LABEL[strat], pct(a), seeds.length, sg(d('kick')), sg(d('snare')), sg(d('hats')), f1(max), `${f1(swingMs('kick'))} / ${f1(swingMs('snare'))} / ${f1(swingMs('hats'))}`, `${f1(mean(pairs.map(([, b]) => drift2(b))))} (${f1(mean(pairs.map(([b0]) => drift2(b0))))})`]);
      }
    }
  out.push(table(['recipe', 'strategy', 'intensity', 'breaks', 'K', 'S', 'H', 'max', 'swing K / S / H', '2-bar diff (0 %)'], rows), '');
  out.push('The 2-bar column counts snare, ghost and hat hits only (the kick leans further every fourth bar, by design). What is left of it is the performance\'s own HUMANISE scatter, which DILLA scales down (to a fifth at 100 %) rather than removing.', '');
  return out.join('\n');
}

// ------------------------------------------------------------------ AMEN

function amenSection(): string {
  const styles: Style[] = ['funk', 'hiphop', 'dnb', 'jungle', 'halftime'];
  const vocab: [Category, number][] = [['kick', 10], ['kick', 11], ['snare', 7], ['snare', 9], ['snare', 15]];
  const out: string[] = ['## 4. BREAK DNA: AMEN at 30, 70 and 100 %', '', `4 bars, ${SEEDS.length} seeds, ROLL GENERATION off. **vocab**: share of the A bars' signature positions present (the kick pair on the "and" and "a" of 3, the snares on the "a" of 2, the "e" of 3 and the "a" of 4); **own K/S kept**: share of the recipe's own kick and snare positions still there; **hats**: timekeeper hits against 0 %; **AMEN hits**: hits the DNA placed; **B downbeat**: share of B bars (bar 4) without a downbeat kick.`, ''];
  const measure = (style: Style, patch: Partial<Recipe>) => {
    const pairs = SEEDS.map((s) => [B(R(style), s), B(R(style, patch), s)] as const);
    const v = mean(pairs.map(([, b]) => { const a = b.events.filter((e) => e.bar < 2); return mean([0, 1].map((bar) => vocab.filter(([c, st]) => a.some((e) => e.bar === bar && e.cat === c && e.step === st)).length / vocab.length)); }));
    const own = mean(pairs.map(([b0, b]) => { const ks = b0.events.filter((e) => e.cat === 'kick' || e.cat === 'snare'); const have = new Set(b.events.map((e) => `${e.cat}|${tick(e)}`)); return ks.length ? ks.filter((e) => have.has(`${e.cat}|${tick(e)}`)).length / ks.length : 1; }));
    const hats = mean(pairs.map(([b0, b]) => b.events.filter((e) => e.role === 'time').length - b0.events.filter((e) => e.role === 'time').length));
    const placed = mean(pairs.map(([, b]) => b.events.filter((e) => e.why.includes('AMEN')).length));
    const bdown = mean(pairs.map(([, b]) => (b.events.some((e) => e.cat === 'kick' && e.bar === 3 && e.step === 0 && e.sub === 0) ? 0 : 1)));
    const hits = mean(pairs.map(([b0, b]) => b.events.length - b0.events.length));
    return [pct(v), pct(own), sg(hats), f1(placed), pct(bdown), sg(hits)];
  };
  const rows: (string | number)[][] = [];
  for (const style of styles) for (const a of [0, 0.3, 0.7, 1]) rows.push([label(style), pct(a), ...(a ? measure(style, { dna: { id: 'amen', amount: a } }) : measure(style, {}))]);
  out.push(table(['recipe', 'influence', 'vocab', 'own K/S kept', 'hats', 'AMEN hits', 'B downbeat', 'hits'], rows), '');
  const rows2: (string | number)[][] = [];
  for (const id of ['neutral', 'lazy', 'angry', 'mechanical', 'sloppy', 'dilla'] as PersonalityId[]) rows2.push([PERSONALITY_LABEL[id], ...measure('funk', { dna: { id: 'amen', amount: 0.7 }, personality: { id, amount: 0.7 } })]);
  out.push('### AMEN 70 % with personalities (FUNK, INTENSITY 70 %)', '', table(['personality', 'vocab', 'own K/S kept', 'hats', 'AMEN hits', 'B downbeat', 'hits'], rows2), '');
  return out.join('\n');
}

// ------------------------------------------------------------------ rolls

function rollsSection(): string {
  const out: string[] = ['## 5. Roll EXPRESSION: event data', '', `JUNGLE and BREAKCORE, ROLLS 100 %, ROLL GENERATION on, 4 bars, ${SEEDS.length} seeds. Per preset: **rolls** and **strokes** per break; **pitch**: lowest and highest stroke pitch (st); **vel first → last**: mean velocity of a roll's first and last stroke; **gap first → last**: mean first and last interval inside a roll (ticks, 12 = a sixteenth); **rev**: share of strokes reversed; **other hits**: hits outside the rolls that differ from CLASSIC (must be 0).`, ''];
  const rows: (string | number)[][] = [];
  for (const style of ['jungle', 'breakcore'] as Style[]) {
    const base = SEEDS.map((s) => B(R(style, { rolls: 1, rollsOn: true }), s));
    for (const p of ROLL_PRESETS) {
      const bs = SEEDS.map((s) => B(R(style, { rolls: 1, rollsOn: true, rollExpr: presetExpr(p) }), s));
      const groups = bs.flatMap((b) => rollGroups(b.events).map((g) => g.events.slice().sort((x, y) => tick(x) - tick(y))));
      const strokes = groups.flat();
      const pitches = strokes.map((e) => e.pitch ?? 0);
      const gaps = groups.filter((g) => g.length > 2).map((g) => [tick(g[1]!) - tick(g[0]!), tick(g[g.length - 1]!) - tick(g[g.length - 2]!)]);
      const other = bs.reduce((n, b, i) => {
        const key = (e: BreakEvent) => JSON.stringify([e.cat, tick(e), e.vel, e.offsetMs, e.pitch ?? 0, !!e.reverse]);
        const a = b.events.filter((e) => e.role !== 'roll').map(key).sort().join();
        const c = base[i]!.events.filter((e) => e.role !== 'roll').map(key).sort().join();
        return n + (a === c ? 0 : 1);
      }, 0);
      rows.push([label(style), ROLL_PRESET_LABEL[p], f1(groups.length / bs.length), f1(strokes.length / bs.length), `${Math.min(0, ...pitches)}..${Math.max(0, ...pitches)}`, `${f1(mean(groups.map((g) => g[0]!.vel)))} → ${f1(mean(groups.map((g) => g[g.length - 1]!.vel)))}`, `${f1(mean(gaps.map((g) => g[0]!)))} → ${f1(mean(gaps.map((g) => g[1]!)))}`, pct(strokes.filter((e) => e.reverse).length / Math.max(1, strokes.length)), other]);
    }
  }
  out.push(table(['recipe', 'preset', 'rolls', 'strokes', 'pitch', 'vel first → last', 'gap first → last', 'rev', 'other hits'], rows), '');
  // one roll in detail
  const b0 = B(R('jungle', { rolls: 1, rollsOn: true }), SEEDS[3]!);
  const g0 = rollGroups(b0.events)[0];
  if (g0) {
    out.push(`### One roll, stroke by stroke (JUNGLE, seed ${SEEDS[3]}, bar ${g0.bar + 1})`, '', 'Each stroke as tick from the roll start / pitch (st) / velocity, R = reversed.', '');
    const rows2: string[][] = [];
    for (const p of ['classic', 'dive', 'rise', 'tumble', 'stutter', 'accelerate', 'pingpong', 'reverseburst', 'chaos'] as const) {
      const b = B(R('jungle', { rolls: 1, rollsOn: true, rollExpr: presetExpr(p) }), SEEDS[3]!);
      const g = rollGroups(b.events).find((x) => x.bar === g0.bar && Math.abs(x.start - g0.start) < TPS);
      const st = g ? g.events.slice().sort((x, y) => tick(x) - tick(y)) : [];
      rows2.push([ROLL_PRESET_LABEL[p], st.map((e) => `${tick(e) - g0.start}/${e.pitch ?? 0}/${e.vel}${e.reverse ? 'R' : ''}`).join(' ')]);
    }
    out.push(table(['preset', 'strokes'], rows2), '');
  }
  return out.join('\n');
}

// ------------------------------------------------------------------ DESTROY and REGEN

function destroySection(): string {
  const out: string[] = ['## 6. DESTROY', '', `FUNK and JUNGLE, 4 bars (16 beats, the first never touched), ${SEEDS.length} seeds, ROLL GENERATION off. **beats**: beats destroyed; **ops**: how often each operation was drawn; **hits**: change in hit count; **first beat changed**: breaks whose first beat differs (must be 0).`, ''];
  const rows: (string | number)[][] = [];
  for (const style of ['funk', 'jungle'] as Style[])
    for (const s of ['stutter', 'pitch', 'reverse', 'gate', 'chaos'] as const)
      for (const amount of [0, 0.3, 0.6, 1]) {
        const ops: Record<string, number> = {};
        let beats = 0;
        let dh = 0;
        let first = 0;
        for (const seed of SEEDS) {
          const b = B(R(style), seed);
          const d = destroy(b.events, { on: true, amount, style: s, variant: 0 }, { plan: b.plan, seed: b.seeds.beat, bpm: b.recipe.bpm, noRolls: true });
          beats += d.report.edited;
          dh += d.events.length - b.events.length;
          for (const [k, v] of Object.entries(d.report.ops)) ops[k] = (ops[k] ?? 0) + v;
          const fb = (evs: BreakEvent[]) => JSON.stringify(evs.filter((e) => tick(e) < 4 * TPS).map((e) => [e.cat, tick(e), e.vel, e.pitch ?? 0, !!e.reverse]).sort());
          if (fb(d.events) !== fb(b.events)) first++;
        }
        rows.push([label(style), s.toUpperCase(), pct(amount), f1(beats / SEEDS.length), Object.entries(ops).map(([k, v]) => `${k} ${v}`).join(', ') || '-', sg(dh / SEEDS.length), first]);
      }
  out.push(table(['recipe', 'style', 'amount', 'beats', 'ops (all seeds)', 'hits', 'first beat changed'], rows), '');
  return out.join('\n');
}

function regenSection(): string {
  const out: string[] = ['## 7. REGEN TRACK', '', `Recipe defaults, 4 bars, ${SEEDS.length} seeds, ROLL GENERATION off. **others identical**: breaks where every other track is byte-identical (must be 100 %); **changed**: of the breaks where the track had hits, those where it differs (an empty track stays empty: its part is played on another track, a ride for instance, and the App says so); **hits before → after** on the track; **anchor kept**: the downbeat kick (KICK) or a backbeat (SNARE) still there.`, ''];
  const rows: (string | number)[][] = [];
  for (const style of ['funk', 'hiphop', 'jungle', 'breakcore'] as Style[])
    for (const cats of [['kick'], ['snare'], ['hat'], ['ghost'], ['htom', 'mtom', 'ltom']] as Category[][]) {
      let same = 0;
      let changed = 0;
      let had = 0;
      let anchor = 0;
      const before: number[] = [];
      const after: number[] = [];
      for (const s of SEEDS) {
        const b = B(R(style), s);
        const r = B(R(style), s, K, { ...seedsFrom(s), regen: regenStep(undefined, cats) });
        const row = (e: BreakEvent) => JSON.stringify([e.cat, tick(e), e.vel, e.offsetMs, e.swing, e.sample, e.role]);
        const pick = (x: Break, mine: boolean) => x.events.filter((e) => cats.includes(e.cat) === mine).map(row).sort().join();
        if (pick(b, false) === pick(r, false)) same++;
        if (b.events.some((e) => cats.includes(e.cat))) {
          had++;
          if (pick(b, true) !== pick(r, true)) changed++;
        }
        before.push(b.events.filter((e) => cats.includes(e.cat)).length);
        after.push(r.events.filter((e) => cats.includes(e.cat)).length);
        if (cats[0] === 'kick' ? r.events.some((e) => e.cat === 'kick' && tick(e) === 0) : cats[0] === 'snare' ? r.events.some((e) => e.cat === 'snare' && e.role === 'backbeat') : true) anchor++;
      }
      rows.push([label(style), cats.length > 1 ? 'TOMS' : cats[0]!.toUpperCase(), pct(same / SEEDS.length), had ? `${pct(changed / had)} of ${had}` : '-', `${f1(mean(before))} → ${f1(mean(after))}`, pct(anchor / SEEDS.length)]);
    }
  out.push(table(['recipe', 'track', 'others identical', 'changed', 'hits before → after', 'anchor kept'], rows), '');
  return out.join('\n');
}

test('writes docs/expressive-report.md', () => {
  const doc = [
    '# Phase 12: expressive engine report',
    '',
    'Generated by `npm run evaluate` (scripts/evaluate-expressive.test.ts). Event data from the engine with sample-free kits; no audio was rendered or listened to for these tables. They show what the engine places; how it sounds is for listening.',
    '',
    tomsSection(),
    personalitiesSection(),
    dillaSection(),
    amenSection(),
    rollsSection(),
    destroySection(),
    regenSection(),
  ].join('\n');
  writeFileSync('docs/expressive-report.md', doc);
}, 600000);
