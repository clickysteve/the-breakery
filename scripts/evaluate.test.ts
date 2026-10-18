/**
 * `npm run evaluate`: bakes 20 breaks per style from fixed seeds, measures them, measures random
 * patterns with the same hits per category, and writes docs/evaluation-report.md, including the
 * 20 FUNK grids for the listening test (docs/EVALUATION.md). Metrics cannot say whether a break
 * grooves; they check that the structure the research describes is there and is not chance.
 */
import { writeFileSync } from 'node:fs';
import { test } from 'vitest';
import { analyse, randomLike, type BreakStats } from '../src/engine/analysis';
import { asciiGrid } from '../src/engine/ascii';
import { bake, seedsFrom } from '../src/engine/generate';
import { makeRng } from '../src/engine/rng';
import { defaultRecipe, STYLE_DEFS } from '../src/engine/styles';
import { STYLES, type Break } from '../src/engine/types';

const N = 20;
const SEEDS = Array.from({ length: N }, (_, i) => 1000 + i);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const f = (x: number, d = 2) => x.toFixed(d);

type Row = { style: string; gen: BreakStats[]; rnd: BreakStats[]; breaks: Break[] };

test('evaluation report', () => {
  const rows: Row[] = STYLES.map((style) => {
    const breaks = SEEDS.map((s) => bake(defaultRecipe(style, 2), seedsFrom(s)));
    const gen = breaks.map((b) => analyse(b.events, 2));
    const rnd = breaks.map((b, i) => analyse(randomLike(b.events, 2, makeRng(i + 1)), 2));
    return { style, gen, rnd, breaks };
  });
  const metric = (name: string, pick: (s: BreakStats) => number, note: string) =>
    `| ${name} | ${rows.map((r) => `${f(mean(r.gen.map(pick)))} / ${f(mean(r.rnd.map(pick)))}`).join(' | ')} | ${note} |`;
  let md = `# Evaluation report (generated)\n\nWritten by \`npm run evaluate\` (scripts/evaluate.test.ts). ${N} two-bar breaks per style, default recipes, seeds ${SEEDS[0]}–${SEEDS[N - 1]}. Each cell: **generated / random baseline** (same hits per category placed uniformly at random on the sixteenth grid). Do not edit by hand.\n\n`;
  md += `| Metric | ${rows.map((r) => STYLE_DEFS[r.style as keyof typeof STYLE_DEFS].label).join(' | ')} | What it shows |\n|---|${rows.map(() => '---|').join('')}---|\n`;
  md += metric('Bars with snare accents on 2 and 4', (s) => s.backbeat24, 'the backbeat anchor (BROKEN displaces it on purpose)') + '\n';
  md += metric('Ghosts within a 16th of a snare accent', (s) => s.ghostsNearAccent, 'ghosts relate to the backbeat') + '\n';
  md += metric('Kicks on a snare accent (per bar)', (s) => s.kickSnareClashes, 'kick and snare interlock rather than collide') + '\n';
  md += metric('Bar 2 similarity to bar 1 (Jaccard)', (s) => s.barSimilarity, 'bars are related, with variation') + '\n';
  md += metric('Kick/snare syncopation per bar', (s) => s.sync, 'syncopation is a controlled amount, not noise') + '\n';
  md += metric('Hits per bar', (s) => s.density, 'same by construction') + '\n';
  md += `\nMean absolute microtiming (generated): ${rows.map((r) => `${STYLE_DEFS[r.style as keyof typeof STYLE_DEFS].label} ${f(mean(r.gen.map((s) => s.meanAbsOffsetMs)), 1)} ms`).join(', ')}.\n`;
  md += `\n## The 20 FUNK breaks for the listening test\n\nLegend: X ≥ 100 velocity, x ≥ 70, o ≥ 45, - softer (ghosts), ~ a 32nd-note hit, . beat with no hit. Load each in The Breakery with RECIPE ▸ FUNK, 2 bars, and its SEED.\n\n`;
  rows[0]!.breaks.forEach((b, i) => {
    md += `### ${i + 1}. Seed ${SEEDS[i]} (${b.plan.join(' ')}, ${b.timekeeper === 'ride' ? 'ride' : 'hats'})\n\n\`\`\`\n${asciiGrid(b)}\n\`\`\`\n\n`;
  });
  writeFileSync('docs/evaluation-report.md', md);
  console.log(md.split('\n## ')[0]);
});
