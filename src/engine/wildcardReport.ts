/**
 * WILDCARD REPORT (Phase 15): what one WILDCARD press changed, grouped and before → after. Built
 * from the state before and after the press (recipe, seed, sample settings and assignments, mixer,
 * output chain), so it lists exactly what changed and nothing that stayed. Pure: the app passes
 * plain data, and the report is plain data (kept in the undo snapshots, so ⌘Z and redo bring the
 * matching report back).
 */
import { CATEGORIES, CATEGORY_LABEL, RECIPE_KEYS, type Category, type Recipe } from './types';
import { clapActivity, fxActivity } from './clapfx';
import { SAMPLE_MODE_LABEL, modeOf, type SampleSettings } from './samples';
import { STYLE_DEFS } from './styles';
import { DNA_LABEL } from './dna';

export interface ReportRow {
  label: string;
  before: string;
  after: string;
}
export interface ReportGroup {
  title: string;
  rows: ReportRow[];
}
export interface WildcardReport {
  /** "WILDCARD · HARDCORE · 152 BPM · 12 SETTINGS CHANGED" */
  headline: string;
  groups: ReportGroup[];
  /** settings changed (rows over every group) */
  count: number;
  /** what WILDCARD was allowed to change but kept, and why ("TEMPO (TEMPO LOCK)") */
  kept: string[];
}

/** The state a report compares (plain data: no audio). */
export interface ReportState {
  recipe: Recipe;
  seedText: string;
  samples: SampleSettings;
  /** the name of each category's main sample (null: none) */
  main: Partial<Record<Category, string | null>>;
  mix?: Record<Category, { gain: number; pan: number }>;
  /** the output chain: its stages' engine names and parameters */
  output?: { bypass: boolean; stages: { engine: string; enabled: boolean; params: Record<string, unknown> }[] };
}

const NONE = 'NONE';
const pct = (v: number | undefined) => (v === undefined ? NONE : `${Math.round(v * 100)}%`);
const db = (g: number) => (g > 0 ? `${(20 * Math.log10(g)).toFixed(1)} dB` : '-INF dB');
const pan = (p: number) => (Math.abs(p) < 0.005 ? 'CENTRE' : `${p < 0 ? 'L' : 'R'}${Math.round(Math.abs(p) * 100)}`);
const KEY_LABEL: Record<string, string> = {
  density: 'DENSITY',
  complexity: 'COMPLEXITY',
  syncopation: 'SYNCOPATION',
  ghosts: 'GHOSTS',
  swing: 'SWING',
  humanise: 'HUMANISE',
  variation: 'VARIATION',
  fills: 'FILLS',
  toms: 'TOM ACTIVITY',
  rolls: 'ROLLS',
};

/** An object's leaves as "PATH: value" (arrays of scalars joined), for the groups without their own wording. */
function flatten(v: unknown, prefix = '', out = new Map<string, string>()): Map<string, string> {
  if (v === undefined || v === null) return out;
  if (Array.isArray(v) && v.every((x) => typeof x !== 'object' || x === null)) out.set(prefix, v.length ? v.map(String).join(', ').toUpperCase() : NONE);
  else if (typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) flatten(x, prefix ? `${prefix} ${words(k)}` : words(k), out);
  else out.set(prefix, typeof v === 'boolean' ? (v ? 'ON' : 'OFF') : typeof v === 'number' ? String(Math.round(v * 100) / 100) : String(v).toUpperCase());
  return out;
}
const words = (k: string) => k.replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase();

/** The rows of two flattened objects that differ (a missing side reads NONE). */
function diffMaps(a: Map<string, string>, b: Map<string, string>, prefix = ''): ReportRow[] {
  const rows: ReportRow[] = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const before = a.get(k) ?? NONE;
    const after = b.get(k) ?? NONE;
    if (before !== after) rows.push({ label: `${prefix}${k}`.trim() || prefix.trim(), before, after });
  }
  return rows;
}
const row = (label: string, before: string, after: string): ReportRow[] => (before === after ? [] : [{ label, before, after }]);

export function wildcardReport(a: ReportState, b: ReportState, kept: string[] = []): WildcardReport {
  const ra = a.recipe;
  const rb = b.recipe;
  const groups: ReportGroup[] = [];
  const add = (title: string, rows: ReportRow[]) => rows.length && groups.push({ title, rows });

  add('RECIPE', [...row('RECIPE', STYLE_DEFS[ra.style].label, STYLE_DEFS[rb.style].label), ...row('TEMPO', `${ra.bpm} BPM`, `${rb.bpm} BPM`), ...row('BARS', String(ra.bars), String(rb.bars))]);
  add('SEED', row('SEED', a.seedText, b.seedText));
  add('GENERATION CONTROLS', [
    ...RECIPE_KEYS.flatMap((k) => row(KEY_LABEL[k] ?? words(k), pct(ra[k]), pct(rb[k]))),
    ...row('CLAP ACTIVITY', pct(clapActivity(ra)), pct(clapActivity(rb))),
    ...row('FX ACTIVITY', pct(fxActivity(ra)), pct(fxActivity(rb))),
  ]);
  add('CYMBALS', diffMaps(flatten(ra.cym ?? {}), flatten(rb.cym ?? {})));
  const persona = (r: Recipe) => (r.personality && r.personality.id !== 'neutral' ? `${r.personality.id.toUpperCase()} ${pct(r.personality.amount)}` : 'NEUTRAL');
  add('PERSONALITY', row('PERSONALITY', persona(ra), persona(rb)));
  const dna = (r: Recipe) => (r.dna ? `${DNA_LABEL[r.dna.id as keyof typeof DNA_LABEL] ?? r.dna.id.toUpperCase()} ${pct(r.dna.amount)}` : NONE);
  add('BREAK DNA', row('BREAK DNA', dna(ra), dna(rb)));
  const chopOn = (r: Recipe) => !!r.chop?.on;
  add('CHOP', chopOn(ra) || chopOn(rb) ? diffMaps(flatten(chopOn(ra) ? ra.chop : { on: false }), flatten(chopOn(rb) ? rb.chop : { on: false }), 'CHOP ') : []);
  add('ROLL EXPRESSION', diffMaps(flatten(ra.rollExpr ?? { preset: 'classic' }), flatten(rb.rollExpr ?? { preset: 'classic' }), 'ROLL '));
  const destroyOn = (r: Recipe) => !!r.destroy2?.on;
  add('DESTROY', destroyOn(ra) || destroyOn(rb) ? diffMaps(flatten(destroyOn(ra) ? ra.destroy2 : { on: false }), flatten(destroyOn(rb) ? rb.destroy2 : { on: false }), 'DESTROY ') : row('DESTROY', ra.destroy?.on ? 'ON (CHOP ▸ DESTROY)' : 'OFF', rb.destroy?.on ? 'ON (CHOP ▸ DESTROY)' : 'OFF'));
  add(
    'SAMPLES',
    CATEGORIES.flatMap((c) => [
      ...row(`${CATEGORY_LABEL[c]} SAMPLE`, a.main[c] ?? NONE, b.main[c] ?? NONE),
      ...row(`${CATEGORY_LABEL[c]} SELECTION`, SAMPLE_MODE_LABEL[modeOf(a.samples, c)], SAMPLE_MODE_LABEL[modeOf(b.samples, c)]),
    ]),
  );
  if (a.mix && b.mix) add('MIXER', CATEGORIES.flatMap((c) => [...row(`${CATEGORY_LABEL[c]} LEVEL`, db(a.mix![c].gain), db(b.mix![c].gain)), ...row(`${CATEGORY_LABEL[c]} PAN`, pan(a.mix![c].pan), pan(b.mix![c].pan))]));
  if (a.output && b.output) {
    const chain = (o: NonNullable<ReportState['output']>) => (o.bypass ? 'BYPASSED' : o.stages.filter((s) => s.enabled).map((s) => s.engine.toUpperCase()).join(' > ') || 'CLEAN');
    const params = (o: NonNullable<ReportState['output']>) => new Map(o.stages.flatMap((s) => [...flatten(s.params, s.engine.toUpperCase()).entries()]));
    add('OUTPUT EFFECTS', [...row('CHAIN', chain(a.output), chain(b.output)), ...diffMaps(params(a.output), params(b.output))]);
  }

  const count = groups.reduce((n, g) => n + g.rows.length, 0);
  return { headline: `WILDCARD · ${STYLE_DEFS[rb.style].label} · ${rb.bpm} BPM · ${count} SETTING${count === 1 ? '' : 'S'} CHANGED`, groups, count, kept };
}

/** The report as plain text (COPY REPORT). */
export function reportText(r: WildcardReport): string {
  const lines = [r.headline, ''];
  for (const g of r.groups) {
    lines.push(g.title);
    for (const x of g.rows) lines.push(`  ${x.label}: ${x.before} -> ${x.after}`);
    lines.push('');
  }
  if (r.kept.length) lines.push(`KEPT: ${r.kept.join(', ')}`);
  return lines.join('\n').trimEnd() + '\n';
}
