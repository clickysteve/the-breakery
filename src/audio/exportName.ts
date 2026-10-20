/**
 * Export file naming (Phase 15): one builder for every TAKEAWAY file (WAV, LOOP + STEMS, STEMS
 * ONLY, the batch, MIDI, the ZIPs and the files inside them), and the same function draws the
 * live preview, so the preview is always the name you get.
 *
 * A name is an ordered list of components, each on or off (BPM, RECIPE, SEED, KIT NAME,
 * PERSONALITY, BREAK DNA, CUSTOM TEXT), joined by one separator (UNDERSCORE, HYPHEN or SPACE).
 * Stems add their track (_KICK); the master gets _LOOP as the LOOP SUFFIX preference says
 * (ALWAYS, ONLY WITH STEMS, NEVER). Components are made safe for common file systems (Unicode
 * kept); empty components are skipped, so there is never a doubled or trailing separator; a name
 * with nothing in it falls back to "The Breakery".
 *
 * The preferences live in their own localStorage key, outside undo/redo, patterns and audio. The
 * Phase 14 preferences (a base name and RECIPE / BPM / SEED checkboxes) migrate on first read.
 */
import { STYLE_DEFS } from '../engine/styles';
import { PERSONALITY_LABEL } from '../engine/personality';
import { DNA_LABEL } from '../engine/dna';
import type { Break } from '../engine/types';

export const NAME_PARTS = ['bpm', 'recipe', 'seed', 'kit', 'personality', 'dna', 'custom'] as const;
export type NamePart = (typeof NAME_PARTS)[number];
export const NAME_PART_LABEL: Record<NamePart, string> = { bpm: 'BPM', recipe: 'RECIPE', seed: 'SEED', kit: 'KIT NAME', personality: 'PERSONALITY', dna: 'BREAK DNA', custom: 'CUSTOM TEXT' };

export const SEPARATORS = ['underscore', 'hyphen', 'space'] as const;
export type Separator = (typeof SEPARATORS)[number];
export const SEPARATOR_LABEL: Record<Separator, string> = { underscore: 'UNDERSCORE', hyphen: 'HYPHEN', space: 'SPACE' };
const SEP: Record<Separator, string> = { underscore: '_', hyphen: '-', space: ' ' };

export const LOOP_SUFFIXES = ['always', 'stems', 'never'] as const;
export type LoopSuffix = (typeof LOOP_SUFFIXES)[number];
export const LOOP_SUFFIX_LABEL: Record<LoopSuffix, string> = { always: 'ALWAYS', stems: 'ONLY WITH STEMS', never: 'NEVER' };

export interface NamingPrefs {
  /** the components in order, each on or off */
  parts: { id: NamePart; on: boolean }[];
  /** CUSTOM TEXT */
  custom: string;
  sep: Separator;
  loop: LoopSuffix;
}

export const DEFAULT_EXPORT_NAME = 'The Breakery';
const KEY = 'breakery.exportName';
const MAX_LEN = 120;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const KNOWN_EXT = /\.(wav|mid|midi|zip)$/i;

/** BPM, RECIPE and SEED on, in that order: 152_HARDCORE_VELVET-THUNDER-17.wav */
export const defaultNaming = (): NamingPrefs => ({
  parts: NAME_PARTS.map((id) => ({ id, on: id === 'bpm' || id === 'recipe' || id === 'seed' })),
  custom: '',
  sep: 'underscore',
  loop: 'stems',
});

/** Phase 14's preferences: a base name, then RECIPE, BPM and SEED checkboxes in that fixed order. */
interface OldNaming {
  name?: unknown;
  recipe?: unknown;
  bpm?: unknown;
  seed?: unknown;
}

/** Phase 14's preferences as components: the base name as CUSTOM TEXT first, then RECIPE, BPM, SEED as they were ticked. */
export function migrateNaming(o: OldNaming): NamingPrefs {
  const name = typeof o.name === 'string' ? o.name : DEFAULT_EXPORT_NAME;
  const order: NamePart[] = ['custom', 'recipe', 'bpm', 'seed', 'kit', 'personality', 'dna'];
  return {
    parts: order.map((id) => ({ id, on: id === 'custom' ? sanitisePart(name) !== '' : id === 'recipe' || id === 'bpm' || id === 'seed' ? o[id] === true : false })),
    custom: name,
    sep: 'underscore',
    loop: 'stems',
  };
}

/** Stored preferences made safe: every component exactly once (unknown ones dropped, missing ones added off). */
export function sanitiseNaming(v: unknown): NamingPrefs {
  const d = defaultNaming();
  if (!v || typeof v !== 'object') return d;
  const o = v as Partial<Record<keyof NamingPrefs, unknown>> & OldNaming;
  if (!Array.isArray(o.parts)) return migrateNaming(o);
  const seen = new Set<NamePart>();
  const parts: NamingPrefs['parts'] = [];
  for (const p of o.parts as { id?: unknown; on?: unknown }[]) {
    const id = p?.id as NamePart;
    if (!(NAME_PARTS as readonly string[]).includes(id) || seen.has(id)) continue;
    seen.add(id);
    parts.push({ id, on: p.on === true });
  }
  for (const id of NAME_PARTS) if (!seen.has(id)) parts.push({ id, on: false });
  return {
    parts,
    custom: typeof o.custom === 'string' ? o.custom.slice(0, 200) : '',
    sep: (SEPARATORS as readonly string[]).includes(String(o.sep)) ? (o.sep as Separator) : d.sep,
    loop: (LOOP_SUFFIXES as readonly string[]).includes(String(o.loop)) ? (o.loop as LoopSuffix) : d.loop,
  };
}

export function loadNaming(): NamingPrefs {
  try {
    return sanitiseNaming(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return defaultNaming();
  }
}

export function saveNaming(p: NamingPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(sanitiseNaming(p)));
  } catch {
    /* no storage: this lasts for this visit */
  }
}

/**
 * The file name builder's layout: two columns numbered DOWN each column, the first holding the
 * first half (rounded up). Seven components: 1-4 on the left, 5-7 on the right. The rows per column.
 */
export const nameRows = (n: number, columns = 2): number => Math.max(1, Math.ceil(n / columns));

/** Where component `i` (0-based, in filename order) is drawn: its column and row. */
export const namePlace = (i: number, n: number, columns = 2): { col: number; row: number } => ({ col: Math.floor(i / nameRows(n, columns)), row: i % nameRows(n, columns) });

/** A component moved one place up (-1) or down (+1); the order is kept otherwise. */
export function movePart(p: NamingPrefs, id: NamePart, by: -1 | 1): NamingPrefs {
  const i = p.parts.findIndex((x) => x.id === id);
  const j = i + by;
  if (i < 0 || j < 0 || j >= p.parts.length) return p;
  const parts = p.parts.slice();
  [parts[i], parts[j]] = [parts[j]!, parts[i]!];
  return { ...p, parts };
}

/** Make one filename part safe on common systems (Unicode NFC kept; unsafe characters and controls removed). */
export function sanitisePart(s: string): string {
  let t = s
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  while (KNOWN_EXT.test(t)) t = t.replace(KNOWN_EXT, '').trim();
  t = t.replace(/[. ]+$/, '').replace(/^\.+/, '').trim();
  return t;
}

/** What a break offers each component (absent: the component is skipped). */
export interface NameValues {
  bpm?: string;
  recipe?: string;
  seed?: string;
  kit?: string;
  personality?: string;
  dna?: string;
}

/** The components' values for a break (and the current kit's name). */
export function nameValues(b: Break | undefined, kitName?: string | null): NameValues {
  const v: NameValues = {};
  if (kitName) v.kit = kitName;
  if (!b) return v;
  if (Number.isFinite(b.recipe.bpm)) v.bpm = String(b.recipe.bpm);
  const label = STYLE_DEFS[b.recipe.style]?.label;
  if (label) v.recipe = label;
  // a named seed as it is shown (one token: spaces become hyphens); a numeric one stays a number
  v.seed = b.seedName ? sanitisePart(b.seedName).replace(/ /g, '-') : String(b.seeds.beat);
  const p = b.recipe.personality;
  if (p && p.id !== 'neutral') v.personality = PERSONALITY_LABEL[p.id] ?? p.id.toUpperCase();
  const d = b.recipe.dna;
  if (d) v.dna = DNA_LABEL[d.id as keyof typeof DNA_LABEL] ?? d.id.toUpperCase();
  return v;
}

/** Join parts with the separator: empty parts skipped, runs of the separator (and spaces around it) collapsed, none at the ends. */
function join(parts: string[], sep: string): string {
  const out = parts.map((x) => x.trim()).filter(Boolean).join(sep);
  if (sep === ' ') return out.replace(/\s+/g, ' ').trim();
  const e = sep.replace(/[-]/g, '\\-');
  return out
    .replace(new RegExp(`\\s*${e}[${e}\\s]*`, 'g'), sep)
    .replace(new RegExp(`^${e}+|${e}+$`, 'g'), '');
}

/**
 * The file name for a break: the enabled components in order, then `suffix` (LOOP, STEMS, a
 * track) and the extension. The 120-character limit shrinks the components first; the suffix and
 * extension stay. Never empty, never a reserved device name.
 */
export function buildFileName(p: NamingPrefs, b: Break | undefined, suffix: string, ext: string, kitName?: string | null): string {
  const values = nameValues(b, kitName);
  const sep = SEP[p.sep] ?? '_';
  const comps = p.parts.filter((x) => x.on).map((x) => sanitisePart(x.id === 'custom' ? p.custom : (values[x.id] ?? '')));
  let base = join(comps, sep);
  if (!base) base = DEFAULT_EXPORT_NAME;
  const tail = sanitisePart(suffix).replace(/ /g, sep);
  const dotExt = `.${ext.replace(/^\./, '')}`;
  const room = Math.max(1, MAX_LEN - dotExt.length - (tail ? sep.length + tail.length : 0));
  if (base.length > room) base = base.slice(0, room).replace(/[. _-]+$/, '') || base.slice(0, room);
  let stem = join([base, tail], sep);
  // a reserved device name (CON, NUL ...) gets a trailing underscore
  if (RESERVED.test(stem)) stem = `${stem}_`;
  return stem + dotExt;
}

/** The master's suffix: LOOP as the preference says (ONLY WITH STEMS: when stems are exported with it). */
export const masterSuffix = (p: NamingPrefs, withStems: boolean): string => (p.loop === 'always' || (p.loop === 'stems' && withStems) ? 'LOOP' : '');

/** Stem file names: the break's name and the track (_KICK, _HIGH_TOM), unique (a _2, _3 if two would collide). */
export function stemFileNames(p: NamingPrefs, b: Break | undefined, voices: readonly string[], kitName?: string | null, taken: Iterable<string> = []): string[] {
  const seen = new Set([...taken].map((s) => s.toLowerCase()));
  return voices.map((v) => {
    const label = sanitisePart(v).toUpperCase() || 'TRACK';
    let name = buildFileName(p, b, label, 'wav', kitName);
    for (let n = 2; seen.has(name.toLowerCase()); n++) name = buildFileName(p, b, `${label} ${n}`, 'wav', kitName);
    seen.add(name.toLowerCase());
    return name;
  });
}

/** A name not yet used in `seen` (case-insensitive): the name, or NAME_2.ext, NAME_3.ext ... */
export function uniqueName(name: string, seen: Set<string>, p: NamingPrefs): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let out = name;
  for (let n = 2; seen.has(out.toLowerCase()); n++) out = `${stem}${SEP[p.sep] ?? '_'}${n}${ext}`;
  seen.add(out.toLowerCase());
  return out;
}
