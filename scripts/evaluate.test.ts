/**
 * `npm run evaluate`: bakes 20 breaks per recipe from fixed seeds with ENGINE 1 (the first
 * release, frozen) and ENGINE 2 (current), measures them, measures random patterns with the same
 * hits per category, and writes docs/evaluation-report.md, including grids for the listening test
 * (docs/EVALUATION.md). Metrics cannot say whether a break grooves; they check that the structure
 * the research describes is there and is not chance, and show what changed between engines.
 */
import { writeFileSync } from 'node:fs';
import { test } from 'vitest';
import { analyse, randomLike, type BreakStats } from '../src/engine/analysis';
import { asciiGrid } from '../src/engine/ascii';
import { bake, seedsFrom } from '../src/engine/generate';
import { makeRng } from '../src/engine/rng';
import { defaultRecipe, STYLE_DEFS } from '../src/engine/styles';
import { STYLES, type Bars, type Break, type Engine, type Style } from '../src/engine/types';
import { V1_STYLES } from '../src/engine/v1/styles';

const N = 20;
const SEEDS = Array.from({ length: N }, (_, i) => 1000 + i);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const f = (x: number, d = 2) => x.toFixed(d);

function run(style: Style, engine: Engine, bars: Bars = 2) {
  const breaks = SEEDS.map((s) => bake(defaultRecipe(style, bars, engine), seedsFrom(s)));
  const gen = breaks.map((b) => analyse(b.events, bars));
  const rnd = breaks.map((b, i) => analyse(randomLike(b.events, bars, makeRng(i + 1)), bars));
  return { breaks, gen, rnd };
}

test('evaluation report', () => {
  const label = (s: Style) => STYLE_DEFS[s].label;
  const metrics: [string, (s: BreakStats) => number, string, boolean?][] = [
    ['Bars with snare accents on 2 and 4', (s) => s.backbeat24, 'the backbeat anchor (BROKEN displaces it, HALF-TIME has one on 3)'],
    ['Ghosts within a 16th of any snare accent', (s) => s.ghostsNearAccent, 'engine 1’s metric'],
    ['Ghosts within two 16ths of a true backbeat', (s) => s.ghostsNearBackbeat, 'ghosts relate to the backbeat, not just to any snare'],
    ['Kicks on a snare accent (per bar)', (s) => s.kickSnareClashes, 'kick and snare interlock (HARDCORE layers a floor kick on purpose)'],
    ['Later-bar similarity to bar 1 (Jaccard)', (s) => s.barSimilarity, 'bars are related, with variation'],
    ['Kick/snare syncopation per bar', (s) => s.sync, 'a controlled amount, not noise'],
    ['Hat velocity drift between bars', (s) => s.hatAccentDrift, 'lower = a repeating accent cycle'],
    ['Mean |microtiming| (ms)', (s) => s.meanAbsOffsetMs, 'engine 1 was judged too subtle', false],
    ['Beat-2 backbeat timing (ms)', (s) => s.lag2Ms, 'laid back', false],
    ['Beat-4 backbeat timing (ms)', (s) => s.lag4Ms, 'nearer the grid than beat 2 in engine 2', false],
    ['Chopped / rolled hits per bar', (s) => s.chops, 'event-level resequencing', false],
    ['Hits per bar', (s) => s.density, '', false],
  ];

  let md = `# Evaluation report (generated)\n\nWritten by \`npm run evaluate\` (scripts/evaluate.test.ts). ${N} breaks per recipe and engine, default recipes, seeds ${SEEDS[0]}–${SEEDS[N - 1]}. Do not edit by hand.\n\n`;
  md += `Numbers describe structure only. They cannot say whether a break grooves: see the listening test in [EVALUATION.md](EVALUATION.md).\n\n`;

  // ---- 1. engine 1 vs engine 2 on the original four
  md += `## 1. The original four recipes, two bars: engine 1 / engine 2 / random\n\nEach cell: **engine 1 / engine 2 / random baseline** (the engine-2 break's hits placed uniformly at random on the sixteenth grid; – where a random placement says nothing).\n\n`;
  md += `| Metric | ${V1_STYLES.map(label).join(' | ')} | What it shows |\n|---|${V1_STYLES.map(() => '---|').join('')}---|\n`;
  const pair = V1_STYLES.map((s) => ({ s, e1: run(s, 1), e2: run(s, 2) }));
  for (const [name, pick, note, cmp] of metrics) md += `| ${name} | ${pair.map((p) => `${f(mean(p.e1.gen.map(pick)))} / ${f(mean(p.e2.gen.map(pick)))} / ${cmp === false ? '–' : f(mean(p.e2.rnd.map(pick)))}`).join(' | ')} | ${note} |\n`;

  // ---- 2. every engine-2 recipe
  md += `\n## 2. Every engine-2 recipe, four bars: generated / random\n\n`;
  const all = STYLES.map((s) => ({ s, r: run(s, 2, 4) }));
  md += `| Metric | ${all.map((a) => label(a.s)).join(' | ')} |\n|---|${all.map(() => '---|').join('')}\n`;
  for (const [name, pick, , cmp] of metrics) md += `| ${name} | ${all.map((a) => (cmp === false ? f(mean(a.r.gen.map(pick)), 1) : `${f(mean(a.r.gen.map(pick)), 1)} / ${f(mean(a.r.rnd.map(pick)), 1)}`)).join(' | ')} |\n`;
  md += `\nDefault tempo: ${all.map((a) => `${label(a.s)} ${STYLE_DEFS[a.s].bpm[2]}`).join(', ')} BPM.\n`;

  // ---- 3. pattern lengths
  md += `\n## 3. Pattern lengths (engine 2, FUNK and JUNGLE): later-bar similarity to bar 1\n\n| Bars | ${[1, 2, 3, 4, 5, 6, 7, 8].join(' | ')} |\n|---|${[1, 2, 3, 4, 5, 6, 7, 8].map(() => '---|').join('')}\n`;
  for (const style of ['funk', 'jungle'] as Style[]) {
    const cells = ([1, 2, 3, 4, 5, 6, 7, 8] as Bars[]).map((bars) => f(mean(SEEDS.map((s) => analyse(bake(defaultRecipe(style, bars), seedsFrom(s)).events, bars).barSimilarity))));
    md += `| ${label(style)} | ${cells.join(' | ')} |\n`;
  }
  md += `| Phrase plan | ${([1, 2, 3, 4, 5, 6, 7, 8] as Bars[]).map((bars) => bake(defaultRecipe('funk', bars), seedsFrom(1)).plan.join(' ')).join(' | ')} |\n`;

  // ---- 4. grids for listening
  const legend = 'Legend: X ≥ 100 velocity, x ≥ 70, o ≥ 45, - softer (ghosts), ~ a hit between sixteenths (32nd, roll), . beat with no hit.';
  const grids = (title: string, bs: Break[], howTo: string) => {
    md += `\n## ${title}\n\n${legend} ${howTo}\n\n`;
    bs.forEach((b, i) => {
      md += `### ${i + 1}. Seed ${b.seeds.beat} (${b.plan.join(' ')}, ${b.timekeeper === 'ride' ? 'ride' : 'hats'}${b.feel.cycle ? `, ${b.feel.cycle}` : ''})\n\n\`\`\`\n${asciiGrid(b)}\n\`\`\`\n\n`;
    });
  };
  grids('4. The 20 FUNK breaks, engine 2 (listening test A)', pair[0]!.e2.breaks, 'Load each with RECIPE ▸ FUNK, 2 bars, ENGINE 2 and its SEED; switch to ENGINE 1 for the same seed to compare.');
  grids('5. Five JUNGLE breaks, 8 bars, engine 2 (listening test C)', SEEDS.slice(0, 5).map((s) => bake(defaultRecipe('jungle', 8), seedsFrom(s))), 'RECIPE ▸ JUNGLE, 8 bars.');
  writeFileSync('docs/evaluation-report.md', md);
  console.log(md.split('\n## 4.')[0]);
});
