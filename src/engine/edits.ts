/**
 * Hand edits: the user's changes to a baked break, kept as a LAYER over the generated events
 * rather than baked into them, so the generator stays deterministic and an edit can be undone,
 * re-applied or carried onto another break.
 *
 * The layer is positional. A generated hit is known by its KEY (category, bar, step, ticks after
 * the step), which the same seeds and recipe always reproduce. The layer says which generated hits
 * are REMOVED, which are CHANGED (velocity, microtiming, sample) and which hits were ADDED by hand
 * (including generated hits that were MOVED: the original is removed and a hand-placed copy added).
 *
 * Re-baking the same seeds (a recipe control, the samples, the length, the engine) re-applies the
 * layer, so edits survive. A change whose generated hit is no longer there is kept (it applies
 * again if the hit comes back) and reported as inactive; hits in bars beyond the pattern's length
 * are kept the same way. Nothing is ever dropped silently.
 *
 * Every function here is pure: it returns a new layer. Undo and redo are snapshots of the layer.
 */
import { swingDelay } from './performance';
import { CATEGORY_LABEL, clamp, STEPS, TPB, TPS, type BreakEvent, type Category, type Recipe, type Role } from './types';

/** A change to one generated hit. */
export interface HitPatch {
  vel?: number;
  offsetMs?: number;
  /** a sample chosen by hand (otherwise the category's PICK mode chooses) */
  sample?: string;
}

/** A hit placed by hand (or a generated hit moved by hand). */
export interface ManualHit {
  id: string;
  cat: Category;
  bar: number;
  step: number;
  sub: number;
  vel: number;
  offsetMs: number;
  sample?: string;
  /** when it was a generated hit moved by hand: what it was */
  from?: { key: string; role: Role; why: string };
}

export interface Edits {
  removed: string[];
  changed: Record<string, HitPatch>;
  added: ManualHit[];
}

export const noEdits = (): Edits => ({ removed: [], changed: {}, added: [] });

/** Manual timing range, milliseconds (wider than the generator's ±18 ms: the user may want a flam or a drag). */
export const MANUAL_OFFSET_MS = 60;

export const hitKey = (e: Pick<BreakEvent, 'cat' | 'bar' | 'step' | 'sub'>): string => `${e.cat}|${e.bar}|${e.step}|${e.sub}`;
const manualRef = (id: string) => `m:${id}`;
const isManualRef = (ref: string) => ref.startsWith('m:');

export function editCount(e: Edits | null | undefined): number {
  if (!e) return 0;
  return e.removed.length + Object.keys(e.changed).length + e.added.length;
}

export const hasEdits = (e: Edits | null | undefined): boolean => editCount(e) > 0;

/** A fingerprint of the layer (for favourites: an edited break is a different break). */
export function editsKey(e: Edits | null | undefined): string {
  if (!hasEdits(e)) return '';
  const x = e!;
  return JSON.stringify([[...x.removed].sort(), Object.keys(x.changed).sort().map((k) => [k, x.changed[k]]), x.added.map((m) => [m.cat, m.bar, m.step, m.sub, m.vel, m.offsetMs, m.sample ?? ''])]);
}

/** A position from the start of the break, in grid ticks. */
export const tickOf = (p: { bar: number; step: number; sub: number }) => p.bar * TPB + p.step * TPS + p.sub;
export function posOf(tick: number): { bar: number; step: number; sub: number } {
  const bar = Math.floor(tick / TPB);
  const r = tick - bar * TPB;
  return { bar, step: Math.floor(r / TPS), sub: r % TPS };
}

const SUB_NAME: Record<number, string> = { 3: '+1/64', 6: '+1/32', 9: '+3/64', 4: '+1/3', 8: '+2/3' };
/** "2.3.2" (bar.beat.sixteenth), with a sub-step suffix ("+1/32", "+1/64", "+1/3" of a sixteenth). */
export function posLabel(p: { bar: number; step: number; sub: number }): string {
  return `${p.bar + 1}.${Math.floor(p.step / 4) + 1}.${(p.step % 4) + 1}${p.sub ? (SUB_NAME[p.sub] ?? `+${p.sub}/12`) : ''}`;
}

/** The velocity a new hit of a category starts with (a typical stroke). */
export const DEFAULT_VEL: Record<Category, number> = { kick: 104, snare: 108, ghost: 38, hat: 72, open: 84, ride: 76, crash: 106, perc: 78 };

export interface ApplyReport {
  /** removals and changes whose generated hit is not in this break */
  inactive: number;
  /** hand-placed hits in bars beyond the pattern's length */
  outside: number;
}

/**
 * The break's events with the layer applied: removed hits gone, changed hits patched, hand-placed
 * hits added (a hand-placed hit replaces a generated hit of the same category at the same place).
 * Every event gets its `ref` (the generated key, or "m:<id>"), and edited ones say so in `manual`
 * and `editWhy`. Swing for hand-placed hits follows the recipe, so they sit in the groove.
 */
export function applyEdits(events: BreakEvent[], edits: Edits | null | undefined, recipe: Pick<Recipe, 'swing' | 'bars'>): { events: BreakEvent[]; report: ApplyReport } {
  const report: ApplyReport = { inactive: 0, outside: 0 };
  for (const e of events) e.ref = hitKey(e);
  if (!hasEdits(edits)) return { events, report };
  const ed = edits!;
  const keys = new Set(events.map((e) => e.ref!));
  const removed = new Set(ed.removed);
  for (const k of removed) if (!keys.has(k)) report.inactive++;
  for (const k of Object.keys(ed.changed)) if (!keys.has(k) || removed.has(k)) report.inactive++;
  const placed = new Set<string>();
  const added: BreakEvent[] = [];
  for (const m of ed.added) {
    if (m.bar < 0 || m.bar >= recipe.bars) {
      report.outside++;
      continue;
    }
    const k = hitKey(m);
    if (placed.has(k)) continue; // two hand hits on one place: the first wins
    placed.add(k);
    const pos = posLabel(m);
    added.push({
      cat: m.cat,
      bar: m.bar,
      step: m.step,
      sub: m.sub,
      level: m.vel / 127,
      role: 'manual',
      why: m.from ? `moved by hand to ${pos} (generated as ${m.from.role}: ${m.from.why})` : `added by hand at ${pos}`,
      vel: m.vel,
      swing: Math.round(swingDelay(m.step + m.sub / TPS, recipe.swing) * 1000) / 1000 || 0,
      offsetMs: m.offsetMs,
      sample: null,
      ref: manualRef(m.id),
      manual: m.from ? 'moved' : 'added',
      ...(m.sample ? { pinned: m.sample } : {}),
    });
  }
  const out: BreakEvent[] = [];
  for (const e of events) {
    if (removed.has(e.ref!) || placed.has(e.ref!)) continue;
    const p = ed.changed[e.ref!];
    if (p) {
      const notes: string[] = [];
      if (p.vel !== undefined && p.vel !== e.vel) {
        notes.push(`velocity ${e.vel} → ${p.vel}`);
        e.vel = p.vel;
      }
      if (p.offsetMs !== undefined && p.offsetMs !== e.offsetMs) {
        notes.push(`timing ${fmtMs(e.offsetMs)} → ${fmtMs(p.offsetMs)}`);
        e.offsetMs = p.offsetMs;
      }
      if (p.sample) {
        notes.push('sample chosen by hand');
        e.pinned = p.sample;
      }
      if (notes.length) {
        e.manual = 'edited';
        e.editWhy = `Changed by hand: ${notes.join(', ')}.`;
      }
    }
    out.push(e);
  }
  out.push(...added);
  out.sort((a, b) => tickOf(a) - tickOf(b) || a.cat.localeCompare(b.cat));
  return { events: out, report };
}

const fmtMs = (ms: number) => `${ms > 0 ? '+' : ''}${Math.round(ms * 10) / 10} ms`;

// ---------------------------------------------------------------------------- operations

const clone = (e: Edits): Edits => ({ removed: [...e.removed], changed: Object.fromEntries(Object.entries(e.changed).map(([k, v]) => [k, { ...v }])), added: e.added.map((m) => ({ ...m, ...(m.from ? { from: { ...m.from } } : {}) })) });

function newId(e: Edits): string {
  let n = e.added.length + 1;
  const ids = new Set(e.added.map((m) => m.id));
  while (ids.has(String(n))) n++;
  return String(n);
}

/** The event (in the edited break) with this ref. */
export const findRef = (events: BreakEvent[], ref: string | null | undefined): BreakEvent | undefined => (ref ? events.find((e) => e.ref === ref) : undefined);

/** Is there already a hit of this category at that place in the edited break? */
export const occupied = (events: BreakEvent[], cat: Category, p: { bar: number; step: number; sub: number }, except?: string) => events.some((e) => e.cat === cat && e.bar === p.bar && e.step === p.step && e.sub === p.sub && e.ref !== except);

export interface EditResult {
  edits: Edits;
  /** the ref of the hit the operation produced or changed (null: nothing changed) */
  ref: string | null;
}

/** Add a hit by hand. If one is already there, that hit is the result (nothing is added). */
export function addHit(edits: Edits, events: BreakEvent[], hit: { cat: Category; bar: number; step: number; sub: number; vel?: number; offsetMs?: number; sample?: string }): EditResult {
  const there = events.find((e) => e.cat === hit.cat && e.bar === hit.bar && e.step === hit.step && e.sub === hit.sub);
  if (there) return { edits, ref: there.ref ?? null };
  const out = clone(edits);
  const id = newId(out);
  // a generated hit that was removed here comes back as a hand-placed one (the removal stays, so it is not doubled)
  out.added.push({ id, cat: hit.cat, bar: hit.bar, step: hit.step, sub: hit.sub, vel: clamp(Math.round(hit.vel ?? DEFAULT_VEL[hit.cat]), 1, 127), offsetMs: hit.offsetMs ?? 0, ...(hit.sample ? { sample: hit.sample } : {}) });
  return { edits: out, ref: manualRef(id) };
}

export function deleteHit(edits: Edits, ref: string): Edits {
  const out = clone(edits);
  if (isManualRef(ref)) out.added = out.added.filter((m) => manualRef(m.id) !== ref);
  else {
    if (!out.removed.includes(ref)) out.removed.push(ref);
    delete out.changed[ref];
  }
  return out;
}

/**
 * Move a hit to another place (same category). A generated hit becomes a hand-placed one that
 * remembers what it was. Refused (null ref) when another hit of the category is already there.
 */
export function moveHit(edits: Edits, events: BreakEvent[], ref: string, to: { bar: number; step: number; sub: number }): EditResult {
  const e = findRef(events, ref);
  if (!e) return { edits, ref: null };
  if (e.bar === to.bar && e.step === to.step && e.sub === to.sub) return { edits, ref };
  if (occupied(events, e.cat, to, ref)) return { edits, ref: null };
  const out = clone(edits);
  if (isManualRef(ref)) {
    const m = out.added.find((x) => manualRef(x.id) === ref)!;
    Object.assign(m, to);
    return { edits: out, ref };
  }
  const patch = out.changed[ref];
  if (!out.removed.includes(ref)) out.removed.push(ref);
  delete out.changed[ref];
  const id = newId(out);
  out.added.push({ id, cat: e.cat, ...to, vel: e.vel, offsetMs: e.offsetMs, ...(patch?.sample ? { sample: patch.sample } : {}), from: { key: ref, role: e.role, why: e.why } });
  return { edits: out, ref: manualRef(id) };
}

function patchHit(edits: Edits, events: BreakEvent[], ref: string, p: HitPatch): EditResult {
  const e = findRef(events, ref);
  if (!e) return { edits, ref: null };
  const out = clone(edits);
  if (isManualRef(ref)) {
    const m = out.added.find((x) => manualRef(x.id) === ref)!;
    if (p.vel !== undefined) m.vel = p.vel;
    if (p.offsetMs !== undefined) m.offsetMs = p.offsetMs;
    if ('sample' in p) {
      if (p.sample) m.sample = p.sample;
      else delete m.sample;
    }
  } else {
    const cur = { ...(out.changed[ref] ?? {}) };
    if (p.vel !== undefined) cur.vel = p.vel;
    if (p.offsetMs !== undefined) cur.offsetMs = p.offsetMs;
    if ('sample' in p) {
      if (p.sample) cur.sample = p.sample;
      else delete cur.sample;
    }
    if (Object.keys(cur).length) out.changed[ref] = cur;
    else delete out.changed[ref];
  }
  return { edits: out, ref };
}

export const setVelocity = (edits: Edits, events: BreakEvent[], ref: string, vel: number) => patchHit(edits, events, ref, { vel: clamp(Math.round(vel), 1, 127) });
export const setTiming = (edits: Edits, events: BreakEvent[], ref: string, ms: number) => patchHit(edits, events, ref, { offsetMs: Math.round(clamp(ms, -MANUAL_OFFSET_MS, MANUAL_OFFSET_MS) * 10) / 10 || 0 });
/** A sample chosen by hand, or null to let the category's PICK mode choose again. */
export const setSample = (edits: Edits, events: BreakEvent[], ref: string, sample: string | null) => patchHit(edits, events, ref, { sample: sample ?? undefined });

/** A copy of the hit `ticks` later (the next free place of its category), placed by hand. */
export function duplicateHit(edits: Edits, events: BreakEvent[], ref: string, ticks: number, bars: number): EditResult {
  const e = findRef(events, ref);
  if (!e) return { edits, ref: null };
  for (let t = tickOf(e) + ticks; t < bars * TPB; t += ticks) {
    const p = posOf(t);
    if (!occupied(events, e.cat, p)) return addHit(edits, events, { cat: e.cat, ...p, vel: e.vel, offsetMs: e.offsetMs, ...(e.pinned ? { sample: e.pinned } : {}) });
  }
  return { edits, ref: null };
}

/** Undo every edit of one hit: a changed generated hit goes back to how it was baked; a moved one goes back to its place. */
export function revertHit(edits: Edits, ref: string): EditResult {
  const out = clone(edits);
  if (isManualRef(ref)) {
    const m = out.added.find((x) => manualRef(x.id) === ref);
    if (!m?.from) return { edits, ref: null };
    out.added = out.added.filter((x) => x !== m);
    out.removed = out.removed.filter((k) => k !== m.from!.key);
    return { edits: out, ref: m.from.key };
  }
  if (!out.changed[ref] && !out.removed.includes(ref)) return { edits, ref: null };
  delete out.changed[ref];
  out.removed = out.removed.filter((k) => k !== ref);
  return { edits: out, ref };
}

/**
 * Snap a tick (from the start of the break) to a grid of `snap` ticks within its bar (each bar
 * starts on the grid, so triplet grids restart at every bar line). The end of a bar rounds to the
 * next bar's downbeat, or, in the last bar, to its last grid place: never out of the pattern.
 */
export function snapTick(tick: number, snap: number, bars: number): number {
  const t = clamp(Math.round(tick), 0, bars * TPB - 1);
  const bar = Math.floor(t / TPB);
  let within = Math.round((t - bar * TPB) / snap) * snap;
  if (within >= TPB) {
    if (bar + 1 < bars) return (bar + 1) * TPB;
    within = Math.floor((TPB - 1) / snap) * snap;
  }
  return bar * TPB + within;
}

/** Layer cleaned of anything malformed (from storage or a favourite). */
export function sanitiseEdits(v: unknown, cats: readonly string[]): Edits {
  const out = noEdits();
  if (!v || typeof v !== 'object') return out;
  const o = v as Partial<Edits>;
  const okKey = (k: unknown): k is string => typeof k === 'string' && /^[a-z]+\|\d+\|\d+\|\d+$/.test(k) && cats.includes(k.split('|')[0]!);
  if (Array.isArray(o.removed)) out.removed = [...new Set(o.removed.filter(okKey))];
  if (o.changed && typeof o.changed === 'object')
    for (const [k, p] of Object.entries(o.changed)) {
      if (!okKey(k) || !p || typeof p !== 'object') continue;
      const q: HitPatch = {};
      if (Number.isFinite(p.vel)) q.vel = clamp(Math.round(p.vel!), 1, 127);
      if (Number.isFinite(p.offsetMs)) q.offsetMs = clamp(Number(p.offsetMs), -MANUAL_OFFSET_MS, MANUAL_OFFSET_MS);
      if (typeof p.sample === 'string' && p.sample) q.sample = p.sample;
      if (Object.keys(q).length) out.changed[k] = q;
    }
  if (Array.isArray(o.added))
    for (const m of o.added) {
      if (!m || typeof m !== 'object' || !cats.includes(m.cat)) continue;
      const n = [m.bar, m.step, m.sub].map(Number);
      if (!n.every(Number.isInteger) || n[0]! < 0 || n[1]! < 0 || n[1]! >= STEPS || n[2]! < 0 || n[2]! >= TPS) continue;
      out.added.push({
        id: typeof m.id === 'string' && m.id ? m.id : String(out.added.length + 1),
        cat: m.cat,
        bar: n[0]!,
        step: n[1]!,
        sub: n[2]!,
        vel: clamp(Math.round(Number(m.vel) || DEFAULT_VEL[m.cat]), 1, 127),
        offsetMs: clamp(Number(m.offsetMs) || 0, -MANUAL_OFFSET_MS, MANUAL_OFFSET_MS),
        ...(typeof m.sample === 'string' && m.sample ? { sample: m.sample } : {}),
        ...(m.from && typeof m.from.key === 'string' ? { from: { key: m.from.key, role: m.from.role, why: String(m.from.why ?? '') } } : {}),
      });
    }
  // ids must be unique
  const seen = new Set<string>();
  for (const m of out.added) {
    while (seen.has(m.id)) m.id = `${m.id}x`;
    seen.add(m.id);
  }
  return out;
}

/** One line on what the layer holds (status and tooltips). */
export function describeEdits(e: Edits | null | undefined, report?: ApplyReport): string {
  if (!hasEdits(e)) return 'No hand edits.';
  const x = e!;
  const moved = x.added.filter((m) => m.from).length;
  const parts = [
    x.added.length - moved ? `${x.added.length - moved} added` : '',
    moved ? `${moved} moved` : '',
    x.removed.length - moved ? `${x.removed.length - moved} deleted` : '',
    Object.keys(x.changed).length ? `${Object.keys(x.changed).length} changed` : '',
  ].filter(Boolean);
  let s = `Hand edits: ${parts.join(', ')}.`;
  if (report?.inactive) s += ` ${report.inactive} not active (that generated hit is not in this break).`;
  if (report?.outside) s += ` ${report.outside} beyond the pattern length (kept; lengthen it to hear them).`;
  return s;
}

/** Category label for a ref (for status lines). */
export const refLabel = (events: BreakEvent[], ref: string | null) => {
  const e = findRef(events, ref);
  return e ? `${CATEGORY_LABEL[e.cat]} ${posLabel(e)}` : '';
};
