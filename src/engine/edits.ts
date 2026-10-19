/**
 * Hand edits: the user's changes to a baked break, kept as a LAYER over the generated events
 * rather than baked into them, so the generator stays deterministic and an edit can be undone,
 * re-applied or carried onto another break.
 *
 * A generated hit is known by its KEY (category, bar, step, ticks after the step), which the same
 * seeds and recipe always reproduce. The layer says which generated hits are REMOVED, which are
 * CHANGED (velocity, microtiming, sample, pitch, reverse) and which hits were ADDED by hand
 * (including generated hits that were MOVED: the original is removed and a hand-placed copy added).
 *
 * ANCHORS (Phase 17). A hit CHOP moved also knows its ORIGIN (`src`: the groove hit it is a copy
 * of), and its ref is "<key>@<origin>". A removal or change is anchored to the hit it was made on:
 *   1. it applies to the hit with that origin at that place (exactly where it was made);
 *   2. otherwise to the nearest hit of that origin in the same bar (CHOP moved that hit: the edit
 *      follows it, so a deleted hit does not come back elsewhere and a quieter snare stays quiet);
 *   3. otherwise it waits (kept, reported as inactive, applied again when its hit returns).
 * A different hit that CHOP puts on an edited place is never touched by that edit. Each hit takes
 * at most one edit (exact matches first, then the follows in order of place), so nothing doubles.
 * Hits ADDED by hand stay positional: one per place, whatever CHOP does under them.
 * A layer saved before Phase 17 (no `v`) treats its plain keys positionally, as it always did, so
 * saved breaks reproduce exactly; its next edit anchors it (upgradeEdits) without changing a note.
 *
 * Re-baking the same seeds (a recipe control, the samples, the length, the engine, CHOP) re-applies
 * the layer, so edits survive. Hits in bars beyond the pattern's length are kept the same way.
 * Nothing is ever dropped silently.
 *
 * Every function here is pure: it returns a new layer. Undo and redo are snapshots of the layer.
 */
import { swingDelay } from './performance';
import { stream } from './rng';
import { expressStrokes, msPerTick, type RollExpression } from './rollExpr';
import { CATEGORY_LABEL, clamp, safePitch, STEPS, TPB, TPS, type BreakEvent, type Category, type Recipe, type Role } from './types';

/** A change to one generated hit. */
export interface HitPatch {
  vel?: number;
  offsetMs?: number;
  /** a sample chosen by hand (otherwise the category's PICK mode chooses) */
  sample?: string;
  /** EXPRESSION: semitones set by hand (0 is a setting too: it overrides a generated pitch) */
  pitch?: number;
  /** EXPRESSION: reversed or forwards, set by hand (false overrides a generated reverse) */
  reverse?: boolean;
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
  /** a roll hit kept when ROLL GENERATION was turned off, or made by RATCHET (still drawn and counted as a roll) */
  role?: 'roll';
  /** made by RATCHET: one of the strokes the selected hit was split into */
  ratchet?: true;
  /** EXPRESSION: semitones (absent = 0) */
  pitch?: number;
  /** EXPRESSION: played backwards */
  reverse?: true;
}

export interface Edits {
  /** 2: removals and changes are anchored to their hit's origin (Phase 17); absent: a positional layer saved before */
  v?: 2;
  removed: string[];
  changed: Record<string, HitPatch>;
  added: ManualHit[];
}

export const noEdits = (): Edits => ({ v: 2, removed: [], changed: {}, added: [] });

/** Manual timing range, milliseconds (wider than the generator's ±18 ms: the user may want a flam or a drag). */
export const MANUAL_OFFSET_MS = 60;

export const hitKey = (e: Pick<BreakEvent, 'cat' | 'bar' | 'step' | 'sub'>): string => `${e.cat}|${e.bar}|${e.step}|${e.sub}`;
/** Where a hit came from: the groove hit CHOP copied it from, or its own key. */
export const originOf = (e: Pick<BreakEvent, 'cat' | 'bar' | 'step' | 'sub' | 'src'>): string => e.src ?? hitKey(e);
/** A generated hit's own ref: its key, with its origin when CHOP moved it there ("snare|1|10|0@snare|1|4|0"). */
export const baseRef = (e: Pick<BreakEvent, 'cat' | 'bar' | 'step' | 'sub' | 'src'>): string => {
  const k = hitKey(e);
  return e.src && e.src !== k ? `${k}@${e.src}` : k;
};
/** An edit key's place and the origin it is anchored to (a plain key: the hit in its own place). */
export function splitRef(ref: string): { pos: string; origin: string } {
  const i = ref.indexOf('@');
  return i < 0 ? { pos: ref, origin: ref } : { pos: ref.slice(0, i), origin: ref.slice(i + 1) };
}
const tickOfKey = (k: string) => {
  const [, bar, step, sub] = k.split('|').map(Number);
  return (bar ?? 0) * TPB + (step ?? 0) * TPS + (sub ?? 0);
};
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
  return JSON.stringify([[...x.removed].sort(), Object.keys(x.changed).sort().map((k) => [k, x.changed[k]]), x.added.map((m) => [m.cat, m.bar, m.step, m.sub, m.vel, m.offsetMs, m.sample ?? '', ...(m.pitch || m.reverse ? [m.pitch ?? 0, !!m.reverse] : [])])]);
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
export const DEFAULT_VEL: Record<Category, number> = { kick: 104, snare: 108, ghost: 38, clap: 100, htom: 96, mtom: 96, ltom: 98, hat: 72, open: 84, ride: 76, crash: 106, perc: 78, fx: 96 };

export interface ApplyReport {
  /** removals and changes whose generated hit is not in this break */
  inactive: number;
  /** hand-placed hits in bars beyond the pattern's length */
  outside: number;
  /** removals and changes that followed their hit to another place (CHOP moved it) */
  followed?: number;
  /** a positional (pre-Phase 17) layer: each plain key that found a hit, and that hit's own ref (upgradeEdits) */
  anchors?: Record<string, string>;
}

/**
 * The break's events with the layer applied: removed hits gone, changed hits patched, hand-placed
 * hits added (a hand-placed hit replaces a generated hit of the same category at the same place).
 * Every event gets its `ref` (the generated key, or "m:<id>"), and edited ones say so in `manual`
 * and `editWhy`. Swing for hand-placed hits follows the recipe, so they sit in the groove.
 */
export function applyEdits(events: BreakEvent[], edits: Edits | null | undefined, recipe: Pick<Recipe, 'swing' | 'bars'>): { events: BreakEvent[]; report: ApplyReport } {
  const report: ApplyReport = { inactive: 0, outside: 0 };
  for (const e of events) e.ref = baseRef(e);
  if (!hasEdits(edits)) return { events, report };
  const ed = edits!;
  const removed = new Set(ed.removed);
  // hand-placed hits replace a generated hit of their drum at their place: an edit never lands on one
  const placedAt = new Set(ed.added.filter((m) => m.bar >= 0 && m.bar < recipe.bars).map(hitKey));
  const { target, followed, anchors } = resolve(events, [...new Set([...ed.removed, ...Object.keys(ed.changed)])], ed.v !== 2, placedAt);
  if (followed) report.followed = followed;
  if (anchors) report.anchors = anchors;
  for (const k of removed) if (!target.has(k)) report.inactive++;
  for (const k of Object.keys(ed.changed)) if (!target.has(k) || removed.has(k)) report.inactive++;
  // the edit each hit takes (by the edit's key: a followed hit answers to it from now on)
  const editOf = new Map<BreakEvent, string>();
  for (const [k, e] of target) {
    editOf.set(e, k);
    e.ref = k;
  }
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
      role: m.role === 'roll' || m.from?.role === 'roll' ? 'roll' : 'manual',
      why: m.from ? `moved by hand to ${pos} (generated as ${m.from.role}: ${m.from.why})` : m.ratchet ? `ratchet stroke at ${pos}, made by hand` : m.role === 'roll' ? `roll hit at ${pos}, kept when roll generation was turned off` : `added by hand at ${pos}`,
      vel: m.vel,
      swing: Math.round(swingDelay(m.step + m.sub / TPS, recipe.swing) * 1000) / 1000 || 0,
      offsetMs: m.offsetMs,
      sample: null,
      ref: manualRef(m.id),
      manual: m.from ? 'moved' : 'added',
      ...(m.sample ? { pinned: m.sample } : {}),
      ...(m.pitch ? { pitch: m.pitch } : {}),
      ...(m.reverse ? { reverse: true as const } : {}),
    });
  }
  const out: BreakEvent[] = [];
  for (const e of events) {
    const k = editOf.get(e);
    if ((k && removed.has(k)) || placed.has(hitKey(e))) continue;
    const p = k ? ed.changed[k] : undefined;
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
      if (p.pitch !== undefined && p.pitch !== (e.pitch ?? 0)) {
        notes.push(`pitch ${fmtPitch(e.pitch ?? 0)} → ${fmtPitch(p.pitch)}`);
        if (p.pitch) e.pitch = p.pitch;
        else delete e.pitch;
      }
      if (p.reverse !== undefined && p.reverse !== !!e.reverse) {
        notes.push(p.reverse ? 'reversed' : 'played forwards');
        if (p.reverse) e.reverse = true;
        else delete e.reverse;
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

/**
 * Which hit each removal or change applies to (see ANCHORS above). `legacy`: plain keys are places
 * (a layer saved before Phase 17). Deterministic: exact matches first, then the follows in order
 * of their place (and key), each to the nearest unclaimed hit of its origin in its bar.
 */
function resolve(events: BreakEvent[], keys: string[], legacy: boolean, placedAt: Set<string>): { target: Map<string, BreakEvent>; followed: number; anchors?: Record<string, string> } {
  const target = new Map<string, BreakEvent>();
  const claimed = new Set<BreakEvent>();
  const byRef = new Map<string, BreakEvent>();
  const byPos = new Map<string, BreakEvent>();
  for (const e of events) {
    byRef.set(e.ref ?? baseRef(e), e);
    byPos.set(hitKey(e), e);
  }
  const anchors: Record<string, string> = {};
  const positional = (k: string) => legacy && !k.includes('@');
  for (const k of keys) {
    const e = positional(k) ? byPos.get(k) : byRef.get(k);
    if (!e || claimed.has(e)) continue;
    target.set(k, e);
    claimed.add(e);
    if (positional(k)) anchors[k] = baseRef(e);
  }
  let followed = 0;
  const rest = keys.filter((k) => !target.has(k) && !positional(k)).sort((a, b) => tickOfKey(splitRef(a).pos) - tickOfKey(splitRef(b).pos) || (a < b ? -1 : a > b ? 1 : 0));
  if (rest.length) {
    const byOrigin = new Map<string, BreakEvent[]>();
    for (const e of events) {
      if (placedAt.has(hitKey(e))) continue;
      const o = originOf(e);
      byOrigin.set(o, [...(byOrigin.get(o) ?? []), e]);
    }
    for (const k of rest) {
      const { pos, origin } = splitRef(k);
      const [cat, bar] = pos.split('|');
      const t = tickOfKey(pos);
      let best: BreakEvent | null = null;
      for (const e of byOrigin.get(origin) ?? []) {
        if (claimed.has(e) || e.cat !== cat || String(e.bar) !== bar) continue;
        if (!best || Math.abs(tickOf(e) - t) < Math.abs(tickOf(best) - t) || (Math.abs(tickOf(e) - t) === Math.abs(tickOf(best) - t) && tickOf(e) < tickOf(best))) best = e;
      }
      if (!best) continue;
      target.set(k, best);
      claimed.add(best);
      followed++;
    }
  }
  return { target, followed, ...(legacy && Object.keys(anchors).length ? { anchors } : {}) };
}

/**
 * A positional layer (saved before Phase 17) made anchored, for its next edit: each plain key that
 * found a hit takes that hit's ref (`report.anchors`), so what plays does not change; one waiting
 * for its hit keeps its key (now: the hit in its own place). An anchored layer is returned as it is.
 */
export function upgradeEdits(edits: Edits, report: ApplyReport | null | undefined): Edits {
  if (edits.v === 2) return edits;
  const a = report?.anchors ?? {};
  const to = (k: string) => a[k] ?? k;
  const out = clone(edits);
  out.v = 2;
  out.removed = [...new Set(out.removed.map(to))];
  out.changed = Object.fromEntries(Object.entries(out.changed).map(([k, p]) => [to(k), p]));
  for (const m of out.added) if (m.from) m.from.key = to(m.from.key);
  return out;
}

const fmtMs = (ms: number) => `${ms > 0 ? '+' : ''}${Math.round(ms * 10) / 10} ms`;
/** "+7 st", "-12 st", "0 st" */
export const fmtPitch = (st: number) => `${st > 0 ? '+' : ''}${st} st`;

// ---------------------------------------------------------------------------- operations

const clone = (e: Edits): Edits => ({ ...(e.v === 2 ? { v: 2 as const } : {}), removed: [...e.removed], changed: Object.fromEntries(Object.entries(e.changed).map(([k, v]) => [k, { ...v }])), added: e.added.map((m) => ({ ...m, ...(m.from ? { from: { ...m.from } } : {}) })) });

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
export function addHit(edits: Edits, events: BreakEvent[], hit: { cat: Category; bar: number; step: number; sub: number; vel?: number; offsetMs?: number; sample?: string; role?: 'roll'; pitch?: number; reverse?: boolean }): EditResult {
  const there = events.find((e) => e.cat === hit.cat && e.bar === hit.bar && e.step === hit.step && e.sub === hit.sub);
  if (there) return { edits, ref: there.ref ?? null };
  const out = clone(edits);
  const id = newId(out);
  // a generated hit that was removed here comes back as a hand-placed one (the removal stays, so it is not doubled)
  out.added.push({ id, cat: hit.cat, bar: hit.bar, step: hit.step, sub: hit.sub, vel: clamp(Math.round(hit.vel ?? DEFAULT_VEL[hit.cat]), 1, 127), offsetMs: hit.offsetMs ?? 0, ...(hit.sample ? { sample: hit.sample } : {}), ...(hit.role === 'roll' ? { role: 'roll' as const } : {}), ...expr(hit) });
  return { edits: out, ref: manualRef(id) };
}

/** A hit's EXPRESSION as stored on a hand-placed hit (nothing for the defaults). */
const expr = (e: { pitch?: number; reverse?: boolean }): Pick<ManualHit, 'pitch' | 'reverse'> => ({ ...(safePitch(e.pitch) ? { pitch: safePitch(e.pitch) } : {}), ...(e.reverse ? { reverse: true as const } : {}) });

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
  out.added.push({ id, cat: e.cat, ...to, vel: e.vel, offsetMs: e.offsetMs, ...(patch?.sample ? { sample: patch.sample } : {}), ...expr(e), from: { key: ref, role: e.role, why: e.why } });
  return { edits: out, ref: manualRef(id) };
}

function patchHit(edits: Edits, events: BreakEvent[], ref: string, p: HitPatch): EditResult {
  const e = findRef(events, ref);
  if (!e) return { edits, ref: null };
  if ((p.vel === undefined || p.vel === e.vel)
    && (p.offsetMs === undefined || p.offsetMs === e.offsetMs)
    && (!('sample' in p) || (p.sample ?? null) === (e.pinned ?? null))
    && (p.pitch === undefined || p.pitch === (e.pitch ?? 0))
    && (p.reverse === undefined || p.reverse === !!e.reverse)) return { edits, ref };
  const out = clone(edits);
  if (isManualRef(ref)) {
    const m = out.added.find((x) => manualRef(x.id) === ref)!;
    if (p.vel !== undefined) m.vel = p.vel;
    if (p.offsetMs !== undefined) m.offsetMs = p.offsetMs;
    if ('sample' in p) {
      if (p.sample) m.sample = p.sample;
      else delete m.sample;
    }
    if (p.pitch !== undefined) {
      if (p.pitch) m.pitch = p.pitch;
      else delete m.pitch;
    }
    if (p.reverse !== undefined) {
      if (p.reverse) m.reverse = true;
      else delete m.reverse;
    }
  } else {
    const cur = { ...(out.changed[ref] ?? {}) };
    if (p.vel !== undefined) cur.vel = p.vel;
    if (p.offsetMs !== undefined) cur.offsetMs = p.offsetMs;
    if ('sample' in p) {
      if (p.sample) cur.sample = p.sample;
      else delete cur.sample;
    }
    if (p.pitch !== undefined) cur.pitch = p.pitch;
    if (p.reverse !== undefined) cur.reverse = p.reverse;
    if (Object.keys(cur).length) out.changed[ref] = cur;
    else delete out.changed[ref];
  }
  return { edits: out, ref };
}

export const setVelocity = (edits: Edits, events: BreakEvent[], ref: string, vel: number) => patchHit(edits, events, ref, { vel: clamp(Math.round(vel), 1, 127) });
export const setTiming = (edits: Edits, events: BreakEvent[], ref: string, ms: number) => patchHit(edits, events, ref, { offsetMs: Math.round(clamp(ms, -MANUAL_OFFSET_MS, MANUAL_OFFSET_MS) * 10) / 10 || 0 });
/** A sample chosen by hand, or null to let the category's PICK mode choose again. */
export const setSample = (edits: Edits, events: BreakEvent[], ref: string, sample: string | null) => patchHit(edits, events, ref, { sample: sample ?? undefined });
/** EXPRESSION: the hit transposed (semitones, ±24, by playback rate). */
export const setPitch = (edits: Edits, events: BreakEvent[], ref: string, st: number) => patchHit(edits, events, ref, { pitch: safePitch(st) });
/** EXPRESSION: the hit played backwards, or forwards. */
export const setReverse = (edits: Edits, events: BreakEvent[], ref: string, on: boolean) => patchHit(edits, events, ref, { reverse: on });

/** A copy of the hit `ticks` later (the next free place of its category), placed by hand. */
export function duplicateHit(edits: Edits, events: BreakEvent[], ref: string, ticks: number, bars: number): EditResult {
  const e = findRef(events, ref);
  if (!e) return { edits, ref: null };
  for (let t = tickOf(e) + ticks; t < bars * TPB; t += ticks) {
    const p = posOf(t);
    if (!occupied(events, e.cat, p)) return addHit(edits, events, { cat: e.cat, ...p, vel: e.vel, offsetMs: e.offsetMs, ...(e.pinned ? { sample: e.pinned } : {}), ...expr(e) });
  }
  return { edits, ref: null };
}

/** RATCHET spans: the length the strokes share, in grid ticks. */
export const RATCHET_SPANS = [12, 24, 48, 96] as const;
export const RATCHET_SPAN_LABEL: Record<number, string> = { 12: '1/16', 24: '1/8', 48: '1/4', 96: '1/2' };

/**
 * RATCHET: the hit split into `n` strokes over `span` grid ticks from its place, played with the
 * ROLLS tab's EXPRESSION (its pitch, velocity and timing contours and reverse; CLASSIC: even
 * strokes at the hit's velocity). The strokes are hand-placed roll hits (one undo step), so each
 * can be edited, and ROLL GENERATION has nothing to do with them: a ratchet is an explicit edit.
 * Strokes stop at the end of the pattern and never double another hit of the drum.
 */
export function ratchetHit(edits: Edits, events: BreakEvent[], ref: string, n: number, span: number, shape: Omit<RollExpression, 'preset' | 'variant' | 'ratchet'>, bpm: number, bars: number): EditResult {
  const e = findRef(events, ref);
  if (!e || n < 2) return { edits, ref: null };
  const t0 = tickOf(e);
  const room = Math.min(span, bars * TPB - t0);
  const strokes = expressStrokes(room, [e.vel], { ...shape, ratchet: n }, stream(t0, `ratchet:${e.cat}`), msPerTick(bpm), (t) => (t0 + t) % TPS === 0);
  if (strokes.length < 2) return { edits, ref: null };
  let out = deleteHit(edits, ref);
  let first: string | null = null;
  for (const s of strokes) {
    const p = posOf(t0 + s.tick);
    if (occupied(events, e.cat, p, ref)) continue;
    const id = newId(out);
    out = clone(out);
    out.added.push({
      id,
      cat: e.cat,
      ...p,
      vel: clamp(Math.round(s.vel), 1, 127),
      offsetMs: Math.round(clamp(e.offsetMs + s.ms, -MANUAL_OFFSET_MS, MANUAL_OFFSET_MS) * 10) / 10 || 0,
      ...(e.pinned ? { sample: e.pinned } : {}),
      role: 'roll',
      ratchet: true,
      ...expr({ pitch: (e.pitch ?? 0) + s.pitch, reverse: s.reverse || !!e.reverse }),
    });
    first ??= manualRef(id);
  }
  return { edits: out, ref: first };
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
  // a layer saved before Phase 17 stays positional (it reproduces exactly); its next edit anchors it
  if (o.v !== 2) delete out.v;
  const okKey = (k: unknown): k is string => typeof k === 'string' && /^[a-z]+\|\d+\|\d+\|\d+(@~?[a-z]+\|\d+\|\d+\|\d+)?$/.test(k) && k.split('@').every((p) => cats.includes(p.replace('~', '').split('|')[0]!));
  if (Array.isArray(o.removed)) out.removed = [...new Set(o.removed.filter(okKey))];
  if (o.changed && typeof o.changed === 'object')
    for (const [k, p] of Object.entries(o.changed)) {
      if (!okKey(k) || !p || typeof p !== 'object') continue;
      const q: HitPatch = {};
      if (Number.isFinite(p.vel)) q.vel = clamp(Math.round(p.vel!), 1, 127);
      if (Number.isFinite(p.offsetMs)) q.offsetMs = clamp(Number(p.offsetMs), -MANUAL_OFFSET_MS, MANUAL_OFFSET_MS);
      if (typeof p.sample === 'string' && p.sample) q.sample = p.sample;
      if (p.pitch !== undefined && Number.isFinite(Number(p.pitch))) q.pitch = safePitch(p.pitch);
      if (typeof p.reverse === 'boolean') q.reverse = p.reverse;
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
        ...(m.role === 'roll' ? { role: 'roll' as const } : {}),
        ...(m.ratchet === true && m.role === 'roll' ? { ratchet: true as const } : {}),
        ...expr(m),
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
  if (report?.followed) s += ` ${report.followed} followed ${report.followed === 1 ? 'its hit' : 'their hits'} to where CHOP moved ${report.followed === 1 ? 'it' : 'them'}.`;
  if (report?.inactive) s += ` ${report.inactive} not active (that generated hit is not in this break).`;
  if (report?.outside) s += ` ${report.outside} beyond the pattern length (kept; lengthen it to hear them).`;
  return s;
}

/** Category label for a ref (for status lines). */
export const refLabel = (events: BreakEvent[], ref: string | null) => {
  const e = findRef(events, ref);
  return e ? `${CATEGORY_LABEL[e.cat]} ${posLabel(e)}` : '';
};
