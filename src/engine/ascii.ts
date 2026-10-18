/** A plain-text drum grid of a break (tests, debugging and the evaluation report). */
import { CATEGORIES, CATEGORY_LABEL, STEPS, type Break } from './types';

export function asciiGrid(b: Break): string {
  const bars = b.recipe.bars;
  const lines: string[] = [];
  for (const c of CATEGORIES) {
    const evs = b.events.filter((e) => e.cat === c);
    if (!evs.length) continue;
    let row = '';
    for (let bar = 0; bar < bars; bar++) {
      row += '|';
      for (let s = 0; s < STEPS; s++) {
        const here = evs.filter((e) => e.bar === bar && e.step === s);
        if (!here.length) row += s % 4 === 0 ? '.' : ' ';
        else {
          const v = Math.max(...here.map((e) => e.vel));
          const drag = here.some((e) => e.sub > 0);
          row += drag ? '~' : v >= 100 ? 'X' : v >= 70 ? 'x' : v >= 45 ? 'o' : '-';
        }
      }
    }
    lines.push(`${CATEGORY_LABEL[c].padEnd(8)} ${row}|`);
  }
  return lines.join('\n');
}
