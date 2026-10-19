/**
 * `npm run evaluate`: also writes docs/diversity-report.md, the diversity measurements behind
 * Phase 13. Every recipe is baked from 200 seeds (4 bars, default controls, ROLL GENERATION off
 * as for a new user) with GROOVE revision 2 (before Phase 13: the baseline) and the current
 * revision, and measured with engine/diversity.ts. Revision 2 still bakes exactly as it did, so
 * the baseline columns are the same numbers docs/diversity-baseline.md recorded before the change.
 * Numbers describe event data only; they do not say how anything sounds.
 */
import { writeFileSync } from 'node:fs';
import { test } from 'vitest';
import { diversity, lane, TIME_CLASSES, timeClass, type Diversity } from '../src/engine/diversity';
import { bake, seedsFrom } from '../src/engine/generate';
import { defaultRecipe, STYLE_DEFS } from '../src/engine/styles';
import { CURRENT_REVISION, STYLES, type Break, type Recipe, type Style } from '../src/engine/types';

export const N = 200;
export const SEEDS = Array.from({ length: N }, (_, i) => 5000 + i * 7919);
const label = (s: Style) => STYLE_DEFS[s].label;
const f = (x: number, d = 2) => x.toFixed(d);
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function recipeAt(style: Style, revision: number, patch: Partial<Recipe> = {}): Recipe {
  const r = { ...defaultRecipe(style, 4), rollsOn: false, revision, ...patch } as Recipe;
  if (revision < 3) {
    // a recipe saved before Phase 13 has none of its fields
    for (const k of ['hats', 'ride', 'cymbals', 'approach'] as const) delete (r as unknown as Record<string, unknown>)[k];
  }
  return r;
}

export const breaksOf = (style: Style, revision: number, patch: Partial<Recipe> = {}): Break[] => SEEDS.map((s) => bake(recipeAt(style, revision, patch), seedsFrom(s)));
const D = (bs: Break[]): Diversity => diversity(bs.map((b) => ({ events: b.events, bars: b.recipe.bars })));

type Row = [string, (d: Diversity) => string];
const ROWS: Row[] = [
  ['Distinct whole patterns', (d) => pct(d.distinctPatterns)],
  ['Distinct bar-1 hat patterns', (d) => pct(d.distinctHats)],
  ['Hat pattern entropy (0–1)', (d) => f(d.hatEntropy)],
  ['Distinct bar-1 ride patterns', (d) => pct(d.distinctRide)],
  ['Distinct bar-1 kick+snare', (d) => pct(d.distinctKickSnare)],
  ['Distinct cymbal accent shapes', (d) => pct(d.distinctAccents)],
  ['Cymbal similarity between seeds', (d) => f(d.simCymbals)],
  ['Cymbal nearest-neighbour similarity', (d) => f(d.nnCymbals)],
  ['Kick+snare similarity between seeds', (d) => f(d.simKickSnare)],
  ['Whole-pattern similarity between seeds', (d) => f(d.simAll)],
  ['Timekeeping classes used (of 8)', (d) => String(d.classCount)],
  ['Commonest timekeeping class share', (d) => pct(d.topClass)],
  ['Bars changing timekeeping class', (d) => f(d.classChanges)],
  ['Phrase forms used (bar repetition shapes)', (d) => String(d.forms)],
  ['Phrase form entropy (bits)', (d) => f(d.formBits)],
  ['Hits per bar (sd)', (d) => `${f(d.density, 1)} (${f(d.densitySd, 1)})`],
  ['Cymbal hits per bar (sd)', (d) => `${f(d.cymbalDensity, 1)} (${f(d.cymbalDensitySd, 1)})`],
  ['Later bars vs bar 1 (sd)', (d) => `${f(d.barSim)} (${f(d.barSimSd)})`],
  ['Kick/snare syncopation (sd)', (d) => `${f(d.sync, 1)} (${f(d.syncSd, 1)})`],
  ['Onsets on 16ths / triplets / 32nds', (d) => `${pct(d.subdivision.sixteenth)} / ${pct(d.subdivision.triplet)} / ${pct(d.subdivision.fine)}`],
  ['Kicks under a cymbal', (d) => pct(d.kickUnderCymbal)],
  ['Breaks with no cymbals', (d) => pct(d.noCymbals)],
  ['Breaks with hats and ride layered', (d) => pct(d.layered)],
];

export function diversityTables(revs: number[]): { md: string; data: Record<string, Diversity[]> } {
  const data: Record<string, Diversity[]> = {};
  let md = '';
  for (const s of STYLES) data[s] = revs.map((r) => D(breaksOf(s, r)));
  const head = revs.length > 1 ? 'before / after' : `revision ${revs[0]}`;
  for (const chunk of [STYLES.slice(0, 6), STYLES.slice(6)]) {
    md += `| Measure (${head}) | ${chunk.map(label).join(' | ')} |\n|---|${chunk.map(() => '---|').join('')}\n`;
    for (const [name, g] of ROWS) md += `| ${name} | ${chunk.map((s) => data[s]!.map(g).join(' / ')).join(' | ')} |\n`;
    md += '\n';
  }
  const tc = (rev: number) => `| Recipe | ${TIME_CLASSES.join(' | ')} |\n|---|${TIME_CLASSES.map(() => '---|').join('')}\n${STYLES.map((s) => `| ${label(s)} | ${TIME_CLASSES.map((c) => pct(data[s]![revs.indexOf(rev)]!.timeClasses[c])).join(' | ')} |`).join('\n')}\n`;
  for (const r of revs) md += `\nTimekeeping class of bar 1, revision ${r}:\n\n${tc(r)}`;
  return { md, data };
}

/** The first bar's hats of the first `k` HIP-HOP seeds, as lanes. */
export function hipHopHats(rev: number, k = 24): string {
  const bs = breaksOf('hiphop', rev).slice(0, k);
  return bs.map((b) => `${String(b.seeds.beat).padStart(7)} ${timeClass(b.events, 0).padEnd(10)} |${lane(b.events, ['hat', 'open', 'ride'], 0)}|${lane(b.events, ['hat', 'open', 'ride'], 1)}|  kick |${lane(b.events, ['kick'], 0)}|`).join('\n');
}

test('diversity report', () => {
  const revs = CURRENT_REVISION >= 3 ? [2, CURRENT_REVISION] : [2];
  const { md } = diversityTables(revs);
  let out = `# Diversity report (generated)\n\nWritten by \`npm run evaluate\` (scripts/evaluate-diversity.test.ts). ${N} seeds per recipe, 4 bars, default controls, ROLL GENERATION off. ${revs.length > 1 ? `Each cell is **revision 2 (before Phase 13) / revision ${CURRENT_REVISION} (now)**.` : 'Revision 2 only (the baseline).'} Do not edit by hand.\n\n`;
  out += `Measures (engine/diversity.ts): "distinct" is the number of different onset patterns divided by the number of breaks (100% = every seed different). Similarities are mean Jaccard indices of onset sets (1 = identical). The nearest-neighbour similarity is, for each break, its cymbals' similarity to the most similar other break, averaged: 1.00 means every break has an identical twin. Timekeeping classes sort bar 1's cymbals into none, sparse (3 or fewer), quarters, off-beats, eighths, sixteenths, triplet (any triplet onset) and broken (anything else). Numbers describe event data; nothing here was listened to.\n\n`;
  out += md;
  for (const r of revs) out += `\n## HIP-HOP hats, first 24 seeds, revision ${r}\n\nBar 1 and bar 2 of the cymbals (x hat, O open hat, r ride, ~ off the sixteenth grid), then bar 1's kick.\n\n\`\`\`\n${hipHopHats(r)}\n\`\`\`\n`;
  writeFileSync(revs.length > 1 ? 'docs/diversity-report.md' : 'docs/diversity-baseline.md', out);
}, 600_000);
