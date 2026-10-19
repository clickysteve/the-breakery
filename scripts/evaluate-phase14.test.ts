/**
 * `npm run evaluate`: also writes docs/phase14-report.md, the measurements behind Phase 14 (BREAK
 * DNA, the cymbal engine of GROOVE revision 4, DESTROY). Every number is counted from event data
 * baked here; nothing was rendered to audio or listened to.
 */
import { writeFileSync } from 'node:fs';
import { test } from 'vitest';
import { asciiGrid } from '../src/engine/ascii';
import { PRIMARY_REL_LABEL, PRIMARY_RELS, SUB_LABEL, SUB_TICKS, SUBDIVISIONS, type CymbalSettings } from '../src/engine/cymbals4';
import { chaosDestroy, DESTROY_EFFECTS, defaultDestroy2, destroy2, EFFECT_LABEL } from '../src/engine/destroy2';
import { diversity, type Diversity } from '../src/engine/diversity';
import { DNA_IDS, DNA_LABEL, type DnaId } from '../src/engine/dna';
import { bake, seedsFrom } from '../src/engine/generate';
import { defaultRecipe, STYLE_DEFS } from '../src/engine/styles';
import { STYLES, TPB, TPS, type Break, type Recipe, type Style } from '../src/engine/types';

const N = 200;
const SEEDS = Array.from({ length: N }, (_, i) => 5000 + i * 7919);
const f = (x: number, d = 2) => x.toFixed(d);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const at = (style: Style, revision: number, patch: Partial<Recipe> = {}): Recipe => {
  const r = { ...defaultRecipe(style, 4), rollsOn: false, revision, ...patch } as Recipe;
  if (revision >= 4) for (const k of ['hats', 'ride', 'cymbals'] as const) delete (r as unknown as Record<string, unknown>)[k];
  return r;
};
const breaks = (r: Recipe, n = N) => SEEDS.slice(0, n).map((s) => bake(r, seedsFrom(s)));
const D = (bs: Break[]): Diversity => diversity(bs.map((b) => ({ events: b.events, bars: b.recipe.bars })));
const ks = (b: Break) => b.events.filter((e) => e.cat === 'kick' || e.cat === 'snare').map((e) => `${e.cat}${e.bar}.${e.step}.${e.sub}`);

function cymbalSection(): string {
  let md = '## Cymbals: revision 3 / revision 4, default controls\n\n';
  md += 'Each cell is **revision 3 (Phase 13) / revision 4 (now)**, 200 seeds, 4 bars, ROLL GENERATION off.\n\n';
  const rows: [string, (d: Diversity) => string][] = [
    ['Distinct whole patterns', (d) => pct(d.distinctPatterns)],
    ['Distinct bar-1 hat patterns', (d) => pct(d.distinctHats)],
    ['Distinct bar-1 kick+snare', (d) => pct(d.distinctKickSnare)],
    ['Cymbal nearest-neighbour similarity', (d) => f(d.nnCymbals)],
    ['Cymbal hits per bar', (d) => f(d.cymbalDensity, 1)],
    ['Timekeeping classes used (of 8)', (d) => String(d.classCount)],
    ['Breaks with no cymbals', (d) => pct(d.noCymbals)],
  ];
  const data = Object.fromEntries(STYLES.map((s) => [s, [D(breaks(at(s, 3))), D(breaks(at(s, 4)))]])) as Record<Style, Diversity[]>;
  for (const chunk of [STYLES.slice(0, 6), STYLES.slice(6)]) {
    md += `| Measure | ${chunk.map((s) => STYLE_DEFS[s].label).join(' | ')} |\n|---|${chunk.map(() => '---|').join('')}\n`;
    for (const [name, g] of rows) md += `| ${name} | ${chunk.map((s) => data[s].map(g).join(' / ')).join(' | ')} |\n`;
    md += '\n';
  }

  md += '### CLOSED HAT 100%: coverage of the subdivision\n\nThe share of the subdivision\'s positions with a closed hat, over every bar of 20 seeds of every recipe (CLOSED HAT 100%, everything else 0, ACCENT). The same for RIDE 100%.\n\n| Subdivision | Positions a bar | Closed hat coverage | Ride coverage |\n|---|---|---|---|\n';
  const cym = (p: Partial<CymbalSettings>): CymbalSettings => ({ closed: 0, open: 0, ride: 0, crash: 0, sub: '16', rel: 'accent', hatRel: 'accent', choke: true, ...p });
  for (const sub of SUBDIVISIONS.filter((x) => x !== 'auto')) {
    const n = TPB / SUB_TICKS[sub];
    let hit = 0;
    let rideHit = 0;
    let total = 0;
    for (const st of STYLES)
      for (const s of SEEDS.slice(0, 20)) {
        const b = bake(at(st, 4, { cym: cym({ closed: 1, sub }) }), seedsFrom(s));
        const r = bake(at(st, 4, { cym: cym({ ride: 1, sub }) }), seedsFrom(s));
        for (let bar = 0; bar < 4; bar++) {
          const on = (x: Break, cat: string) => new Set(x.events.filter((e) => e.cat === cat && e.bar === bar && (e.step * TPS + e.sub) % SUB_TICKS[sub] === 0).map((e) => e.step * TPS + e.sub)).size;
          hit += on(b, 'hat');
          rideHit += on(r, 'ride');
          total += n;
        }
      }
    md += `| ${SUB_LABEL[sub]} | ${n} | ${pct(hit / total)} | ${pct(rideHit / total)} |\n`;
  }

  md += '\n### Activity curve (FUNK, 1/16, ACCENT): closed hats per bar\n\n| CLOSED HAT | 0% | 25% | 50% | 75% | 100% |\n|---|---|---|---|---|---|\n';
  const curve = [0, 0.25, 0.5, 0.75, 1].map((a) => breaks(at('funk', 4, { cym: cym({ closed: a }) }), 50).reduce((t, b) => t + b.events.filter((e) => e.cat === 'hat').length, 0) / (50 * 4));
  md += `| hits a bar | ${curve.map((x) => f(x, 1)).join(' | ')} |\n`;

  md += '\n### HATS ↔ RIDE relationship (FUNK, both 100%, 1/8)\n\nHits a bar of each family, and how many land on the same position.\n\n| Relationship | Closed hats | Ride | Together |\n|---|---|---|---|\n';
  for (const rel of PRIMARY_RELS) {
    let h = 0;
    let r = 0;
    let both = 0;
    for (const b of breaks(at('funk', 4, { cym: cym({ closed: 1, ride: 1, sub: '8', rel }) }), 30)) {
      const hs = new Set(b.events.filter((e) => e.cat === 'hat').map((e) => `${e.bar}.${e.step}.${e.sub}`));
      const rs = new Set(b.events.filter((e) => e.cat === 'ride').map((e) => `${e.bar}.${e.step}.${e.sub}`));
      h += hs.size;
      r += rs.size;
      both += [...hs].filter((x) => rs.has(x)).length;
    }
    md += `| ${PRIMARY_REL_LABEL[rel]} | ${f(h / 120, 1)} | ${f(r / 120, 1)} | ${f(both / 120, 1)} |\n`;
  }
  return md;
}

function dnaSection(): string {
  let md = '\n## BREAK DNA\n\nFUNK, 4 bars, 100 seeds, ROLL GENERATION off. "Distinct" counts different kick and snare patterns (all four bars); "distance" is the mean number of kick and snare positions that differ from the same seed with no DNA. The kick profile counts, over the 100 seeds, a kick on each sixteenth of bar 1.\n\n| DNA | Distinct (of 100) | Distance at 25 / 50 / 75 / 100% | Hits a bar at 100% | Bar 1 kick profile (16 steps) |\n|---|---|---|---|---|\n';
  const base = breaks(at('funk', 4), 100);
  for (const id of DNA_IDS as readonly DnaId[]) {
    const bs = (a: number) => breaks(at('funk', 4, { dna: { id, amount: a } }), 100);
    const full = bs(1);
    const distinct = new Set(full.map((b) => ks(b).sort().join(' '))).size;
    const dist = [0.25, 0.5, 0.75, 1].map((a) => {
      const x = a === 1 ? full : bs(a);
      return x.reduce((t, b, i) => {
        const p = new Set(ks(b));
        const q = new Set(ks(base[i]!));
        return t + [...p].filter((k) => !q.has(k)).length + [...q].filter((k) => !p.has(k)).length;
      }, 0) / x.length;
    });
    const prof = new Array<number>(16).fill(0);
    for (const b of full) for (const e of b.events) if (e.cat === 'kick' && e.bar === 0) prof[e.step]!++;
    const hits = full.reduce((t, b) => t + b.events.length, 0) / (full.length * 4);
    md += `| ${DNA_LABEL[id]} | ${distinct} | ${dist.map((x) => f(x, 1)).join(' / ')} | ${f(hits, 1)} | \`${prof.map((x) => String(x).padStart(3)).join('')}\` |\n`;
  }
  md += '\n### One break per DNA (FUNK, seed 5000, INFLUENCE 100%)\n';
  for (const id of DNA_IDS as readonly DnaId[]) md += `\n${DNA_LABEL[id]}\n\n\`\`\`\n${asciiGrid(bake(at('funk', 4, { dna: { id, amount: 1 } }), seedsFrom(5000)))}\n\`\`\`\n`;
  return md;
}

function destroySection(): string {
  let md = '\n## DESTROY\n\nDefault settings (the default matrix and probabilities) at MASTER AMOUNT 100%, and CHAOS takes, over 40 seeds of every recipe (4 bars). Per break: hits each effect took, hits added (stutter repeats) and dropped (tape stop).\n\n| Settings | ' + DESTROY_EFFECTS.map((x) => EFFECT_LABEL[x]).join(' | ') + ' | Added (max) | Dropped |\n|---|' + DESTROY_EFFECTS.map(() => '---|').join('') + '---|---|\n';
  for (const [name, mk] of [['DEFAULT', () => ({ ...defaultDestroy2(), on: true })], ['CHAOS', (s: number) => chaosDestroy(defaultDestroy2(), s)]] as const) {
    const hits: Record<string, number> = {};
    let added = 0;
    let maxAdded = 0;
    let dropped = 0;
    let n = 0;
    for (const st of STYLES)
      for (const s of SEEDS.slice(0, 40)) {
        const b = bake(at(st, 4), seedsFrom(s));
        const r = destroy2(b.events, mk(s), { seed: s, bars: 4 }).report!;
        for (const x of DESTROY_EFFECTS) hits[x] = (hits[x] ?? 0) + (r.hits[x] ?? 0);
        added += r.added;
        maxAdded = Math.max(maxAdded, r.added);
        dropped += r.dropped;
        n++;
      }
    md += `| ${name} | ${DESTROY_EFFECTS.map((x) => f(hits[x]! / n, 1)).join(' | ')} | ${f(added / n, 1)} (${maxAdded}) | ${f(dropped / n, 1)} |\n`;
  }
  return md;
}

test('phase 14 report', () => {
  let out = '# Phase 14 report (generated)\n\nWritten by `npm run evaluate` (scripts/evaluate-phase14.test.ts). Do not edit by hand. Numbers describe event data only: nothing here was rendered to audio or listened to.\n\n';
  out += cymbalSection();
  out += dnaSection();
  out += destroySection();
  writeFileSync('docs/phase14-report.md', out);
}, 900_000);
