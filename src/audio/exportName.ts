/**
 * Export file naming: one shared builder for every TAKEAWAY file (WAV, MIDI, stems ZIP and the
 * files inside it). The preferences live in their own localStorage key, outside undo/redo,
 * patterns and audio.
 */
import { STYLE_DEFS } from '../engine/styles';
import type { Break } from '../engine/types';

export interface NamingPrefs {
  name: string;
  recipe: boolean;
  bpm: boolean;
  seed: boolean;
}

export const DEFAULT_EXPORT_NAME = 'The Breakery';
const KEY = 'breakery.exportName';
const MAX_LEN = 120;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const KNOWN_EXT = /\.(wav|mid|midi|zip)$/i;

export const defaultNaming = (): NamingPrefs => ({ name: DEFAULT_EXPORT_NAME, recipe: false, bpm: false, seed: false });

export function loadNaming(): NamingPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<NamingPrefs> | null;
    const d = defaultNaming();
    if (!v || typeof v !== 'object') return d;
    return { name: typeof v.name === 'string' ? v.name : d.name, recipe: v.recipe === true, bpm: v.bpm === true, seed: v.seed === true };
  } catch {
    return defaultNaming();
  }
}

export function saveNaming(p: NamingPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* no storage: this lasts for this visit */
  }
}

/** Make one filename part safe on common systems. Keeps ordinary spaces and readable punctuation. */
export function sanitisePart(s: string): string {
  let t = s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  while (KNOWN_EXT.test(t)) t = t.replace(KNOWN_EXT, '').trim();
  t = t.replace(/[. ]+$/, '').replace(/^\.+/, '').trim();
  return t;
}

/** The base name: sanitised, never empty, never a reserved device name. */
export function baseName(name: string): string {
  let t = sanitisePart(name);
  if (!t) t = DEFAULT_EXPORT_NAME;
  if (RESERVED.test(t.split('.')[0]!)) t = `${t}_`;
  return t;
}

/** Recipe, BPM and seed suffix parts for the break: only enabled options with real values. */
export function metaParts(b: Break | undefined, p: NamingPrefs): string[] {
  const out: string[] = [];
  if (!b) return out;
  if (p.recipe) {
    const label = STYLE_DEFS[b.recipe.style]?.label;
    if (label) out.push(label.toLowerCase().replace(/(^|[^a-z0-9])([a-z0-9])/g, (_m, _a: string, c: string) => c.toUpperCase()).replace(/[^A-Za-z0-9]/g, ''));
  }
  if (p.bpm && Number.isFinite(b.recipe.bpm)) out.push(`${b.recipe.bpm}BPM`);
  // a named seed (VELVET-THUNDER-42) names the file as it is shown; a numeric one stays a number
  const named = b.seedName ? sanitisePart(b.seedName).replace(/ /g, '-') : '';
  if (p.seed && named) out.push(named);
  else if (p.seed && Number.isFinite(b.seeds.beat)) out.push(String(b.seeds.beat));
  return out;
}

/**
 * Build `Base[_Recipe][_BPM][_Seed][_type].ext`. `type` is e.g. 'loop', 'stems' or a track name.
 * The limit applies to the whole name; the base shrinks first, the suffixes and extension stay.
 */
export function buildFileName(p: NamingPrefs, b: Break | undefined, type: string, ext: string): string {
  const tail = [...metaParts(b, p), ...(type ? [sanitisePart(type)] : [])].filter(Boolean).join('_');
  const suffix = (tail ? `_${tail}` : '') + `.${ext.replace(/^\./, '')}`;
  let base = baseName(p.name);
  const room = Math.max(1, MAX_LEN - suffix.length);
  if (base.length > room) base = base.slice(0, room).replace(/[. ]+$/, '') || base.slice(0, room);
  return base + suffix;
}

/** Stem filenames: `Base_..._Kick.wav`, with a short stable suffix (_2, _3) if two would collide. */
export function stemFileNames(p: NamingPrefs, b: Break | undefined, voices: readonly string[]): string[] {
  const seen = new Set<string>();
  return voices.map((v) => {
    const label = sanitisePart(v).replace(/^./, (c) => c.toUpperCase()) || 'Track';
    let name = buildFileName(p, b, label, 'wav');
    for (let n = 2; seen.has(name.toLowerCase()); n++) name = buildFileName(p, b, `${label}_${n}`, 'wav');
    seen.add(name.toLowerCase());
    return name;
  });
}
