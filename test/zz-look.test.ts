import { it } from 'vitest';
import { bake, seedsFrom } from '../src/engine/generate';
import { defaultRecipe } from '../src/engine/styles';
import { STEPS, type Style } from '../src/engine/types';
const show = (style: Style, seed: number, patch = {}) => {
  const b = bake({ ...defaultRecipe(style, 4), ...patch }, seedsFrom(seed));
  const cats = ['crash','hat','ride','open','htom','mtom','ltom','snare','ghost','kick'] as const;
  const lines = [`${style} seed ${seed} ${JSON.stringify(patch)} plan ${b.plan.join(' ')}`];
  for (const c of cats) {
    let row = '';
    for (let bar = 0; bar < b.recipe.bars; bar++) { row += '|'; for (let s = 0; s < STEPS; s++) { const es = b.events.filter(e => e.cat===c && e.bar===bar && e.step===s); row += es.length ? (es.length>1||es[0]!.sub ? '%' : (es[0]!.vel>=90?'X':es[0]!.vel>=55?'x':'.')) : ' '; } }
    if (row.replace(/[| ]/g,'')) lines.push(`${c.padEnd(5)} ${row}|`);
  }
  const toms = b.events.filter(e => e.cat.endsWith('tom'));
  lines.push('  toms: ' + toms.map(e => `${e.cat}@${e.bar+1}.${e.step} v${e.vel} (${e.why.slice(0,50)})`).slice(0,4).join('; '));
  console.log(lines.join('\n'));
};
it('look', () => {
  for (const seed of [11, 23, 57]) show('funk', seed, { toms: 0.8, fills: 0.6 });
  show('halftime', 5, { toms: 0.7 });
  show('jungle', 9, { toms: 0.8 });
  show('hiphop', 3, { toms: 1, variation: 0.8 });
});
