/**
 * Category suggestions for imported samples, from file names and folder names. A convenience:
 * every suggestion can be corrected, and anything unclear goes to UNSORTED (never discarded).
 *
 * - File name first, then the folders from the nearest to the outermost ("Kit/Snares/01.wav" →
 *   SNARE from its folder).
 * - A folder that REFINES the file's category wins ("Open Hats/hat 3.wav" → OPEN HAT;
 *   "Ghosts/snare 2.wav" → GHOST).
 * - Ambiguous names stay UNSORTED ("kick snare combo.wav"): a wrong guess is worse than none.
 * - Words are found inside longer names ("closedhat01" → HAT); short abbreviations (bd, sd, hh, ch,
 *   oh, cym …) only as whole letter groups, so "chord" is not a closed hat.
 */
import type { Category } from '../engine/types';

export type Slot = Category | 'unsorted';

type Rule = { cat: Category; words?: RegExp; abbr?: string[] };

// order matters only for display; ambiguity is decided by refinements below
const RULES: Rule[] = [
  { cat: 'ghost', words: /ghost/ },
  { cat: 'open', words: /open|ohh/, abbr: ['oh', 'ohh', 'ophat', 'oph'] },
  { cat: 'ride', words: /ride/, abbr: ['rd'] },
  { cat: 'crash', words: /crash|splash|china|cymbal/, abbr: ['cym', 'cy', 'cr'] },
  { cat: 'kick', words: /kick|bass ?drum|bassdrum|\bkik/, abbr: ['bd', 'kik', 'kck', 'kd'] },
  { cat: 'snare', words: /snare/, abbr: ['sd', 'snr', 'sn'] },
  { cat: 'hat', words: /hat|hihat|closed/, abbr: ['hh', 'ch', 'chh', 'cht', 'hats'] },
  { cat: 'clap', words: /clap/, abbr: ['cp', 'clp'] },
  { cat: 'perc', words: /perc|shaker|shakr|tamb|conga|bongo|rimshot|cowbell|woodblock|clave|cabasa|guiro|fingersnap|agogo|triangle|timbale|cajon|maraca/, abbr: ['rs', 'cb', 'sh', 'rim', 'snap', 'block', 'shk'] },
  // effects: impacts, risers, sweeps, zaps (a plain "noise" or "reverse" could be anything)
  { cat: 'fx', words: /impact|riser|uplift|downlift|sweep|whoosh|swoosh|laser|\bzap/, abbr: ['fx', 'sfx', 'zap', 'efx'] },
  // toms only by their position: a plain "tom" could be any of the three (see suggestCategory)
  { cat: 'htom', words: /(hi|high|rack|small)[ _-]?tom|tom[ _-]?(hi|high)\b/, abbr: ['ht', 'htom', 'hitom'] },
  { cat: 'mtom', words: /(mid|middle|med)[ _-]?tom|tom[ _-]?mid/, abbr: ['mt', 'mtom', 'midtom'] },
  { cat: 'ltom', words: /(lo|low|floor|big)[ _-]?tom|tom[ _-]?(lo|low)\b/, abbr: ['lt', 'ltom', 'lotom', 'ft'] },
];

/** A tom of no stated size ("tom 2.wav", "Toms/"): which one it is cannot be told from the name. */
const PLAIN_TOM = /(^|[^a-z])toms?([^a-z]|$)|tom\d/;

/** Categories whose names contain another's word, or that are a kind of another. */
const REFINES: [Category, Category][] = [
  ['ghost', 'snare'],
  ['open', 'hat'],
  ['ride', 'hat'],
  ['crash', 'hat'],
];
const refines = (a: Category, b: Category) => REFINES.some(([x, y]) => x === a && y === b);

/** Every category a name suggests (most specific first when one refines another). */
export function matches(name: string): Category[] {
  const n = name.toLowerCase().replace(/\.[a-z0-9]{2,5}$/, '');
  const groups = n.split(/[^a-z]+/).filter(Boolean);
  const out: Category[] = [];
  for (const r of RULES) {
    if ((r.words && r.words.test(n)) || (r.abbr && r.abbr.some((a) => groups.includes(a)))) out.push(r.cat);
  }
  // drop a category refined by another that also matched ("open hat" is OPEN, not HAT too)
  return out.filter((c) => !out.some((o) => o !== c && refines(o, c)));
}

/** Category from a file name, or 'unsorted' (also when ambiguous). */
export function guessCategory(name: string): Slot {
  const m = matches(name);
  return m.length === 1 ? m[0]! : 'unsorted';
}

export interface Suggestion {
  cat: Slot;
  /** why, for the review list */
  reason: string;
}

/** Category for a file at a relative path ("Drum Kit/Kicks/kick01.wav"). */
export function suggestCategory(path: string): Suggestion {
  const parts = path.split(/[\\/]/).filter(Boolean);
  const file = parts.pop() ?? path;
  const fm = matches(file);
  const folders = parts.reverse();
  const folderCat = (() => {
    for (const f of folders) {
      const m = matches(f);
      if (m.length === 1) return { cat: m[0]!, folder: f };
      if (m.length > 1) return { cat: null, folder: f };
    }
    return null;
  })();
  if (fm.length === 1) {
    const c = fm[0]!;
    if (folderCat?.cat && refines(folderCat.cat, c)) return { cat: folderCat.cat, reason: `folder “${folderCat.folder}” (more specific than the file name)` };
    return { cat: c, reason: 'file name' };
  }
  if (fm.length > 1) {
    // the folder can settle an ambiguous name if it agrees with one of the candidates
    if (folderCat?.cat && fm.includes(folderCat.cat)) return { cat: folderCat.cat, reason: `folder “${folderCat.folder}” (the file name was ambiguous)` };
    return { cat: 'unsorted', reason: `ambiguous name (${fm.join(' or ')}): please choose` };
  }
  if (folderCat?.cat) return { cat: folderCat.cat, reason: `folder “${folderCat.folder}”` };
  if (folderCat) return { cat: 'unsorted', reason: `ambiguous folder “${folderCat.folder}”: please choose` };
  if ([file, ...folders].some((f) => PLAIN_TOM.test(f.toLowerCase()))) return { cat: 'unsorted', reason: 'a tom, but not which one: choose HIGH, MID or LOW TOM' };
  return { cat: 'unsorted', reason: 'no category in the name or folders: please choose' };
}

/** Files to skip before decoding: macOS resource forks, hidden files, non-audio. */
export const AUDIO_EXT = /\.(wav|wave|aif|aiff|flac|mp3|ogg|m4a)$/i;
export function importable(path: string, type = ''): 'audio' | 'hidden' | 'other' {
  const name = path.split(/[\\/]/).pop() ?? path;
  if (name.startsWith('.') || name.startsWith('._') || /(^|[\\/])__MACOSX([\\/]|$)/.test(path)) return 'hidden';
  return AUDIO_EXT.test(name) || type.startsWith('audio/') ? 'audio' : 'other';
}
