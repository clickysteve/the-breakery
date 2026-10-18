/**
 * Sample selection: which of a category's samples each hit plays, chosen per category by a MODE.
 * Runs after generation (both engines), on the finished event list, so playback, WAV export,
 * stems and the pattern view all use the same assignment (it is stored on each event).
 *
 * Every mode is deterministic: the same events, kit, KIT seed and settings give the same
 * samples. Stateful modes (ROUND ROBIN, ALTERNATE, PER BAR) run through the break in time order
 * and START AGAIN at the top of the break, so every loop repeat and every export is identical.
 * RANDOM and WEIGHTED draw from a hash of the KIT seed, the category and the hit's position, so a
 * hit that stays where it is keeps its sample when other hits change (FREEZE SAMPLES).
 *
 *   AUTO        the original behaviour: one main sample per break (KIT seed), occasional
 *               alternates on ghosts, hats, percussion and fill snares
 *   FIXED       always the chosen sample
 *   RANDOM      any sample, per hit
 *   ROUND ROBIN in list order, hit after hit
 *   WEIGHTED    random, in proportion to each sample's weight
 *   VELOCITY    soft hits play the quietest sample, loud hits the loudest (layers by loudness)
 *   ALTERNATE   random, but never the same sample twice in a row (when there are two or more)
 *   PER BAR     one sample per bar, a different one from the previous bar where possible
 *
 * Fallbacks (GHOST plays SNARE samples quietly, HAT and RIDE stand in for each other) are
 * resolved first; the mode of the HIT's category then picks from that pool. A missing FIXED
 * sample falls back to the pool's first sample, and says so.
 */
import { assignSamples, sourceOf, type KitIndex } from './kit';
import { hashString, stream } from './rng';
import { CATEGORIES, CATEGORY_LABEL, type BreakEvent, type Category } from './types';

export const SAMPLE_MODES = ['auto', 'fixed', 'random', 'roundrobin', 'weighted', 'velocity', 'alternate', 'perbar'] as const;
export type SampleMode = (typeof SAMPLE_MODES)[number];

export const SAMPLE_MODE_LABEL: Record<SampleMode, string> = {
  auto: 'AUTO',
  fixed: 'FIXED',
  random: 'RANDOM',
  roundrobin: 'ROUND ROBIN',
  weighted: 'WEIGHTED',
  velocity: 'VELOCITY',
  alternate: 'ALTERNATE',
  perbar: 'PER BAR',
};

export const SAMPLE_MODE_TIP: Record<SampleMode, string> = {
  auto: 'AUTO: one main sample per break (chosen by the KIT seed), with occasional alternates on ghosts, hats, percussion and fills. The original behaviour.',
  fixed: 'FIXED: every hit plays the sample marked ● (click a sample’s ● to choose it).',
  random: 'RANDOM: each hit picks any sample. Deterministic: the same seed and hit position always pick the same one.',
  roundrobin: 'ROUND ROBIN: samples take turns in list order, hit after hit, starting again at the top of the break so every loop is the same.',
  weighted: 'WEIGHTED: random, in proportion to each sample’s weight (the number beside it: click and type 0–9).',
  velocity: 'VELOCITY: soft hits play the quietest sample, loud hits the loudest: velocity layers, ordered by measured loudness.',
  alternate: 'ALTERNATE: random, but never the same sample on two hits in a row.',
  perbar: 'PER BAR: one sample for the whole bar, a different one from the bar before where possible.',
};

export interface CategorySamples {
  mode: SampleMode;
  /** FIXED: the chosen sample id */
  fixed?: string | null;
  /** WEIGHTED: weight per sample id (missing = 1) */
  weights?: Record<string, number>;
}

/** The user's selection settings per category (missing = AUTO). */
export type SampleSettings = Partial<Record<Category, CategorySamples>>;

export interface SampleContext {
  settings?: SampleSettings;
  /** loudness per sample id (any monotonic measure), for VELOCITY */
  loudness?: Record<string, number>;
}

export function modeOf(settings: SampleSettings | undefined, cat: Category): SampleMode {
  const m = settings?.[cat]?.mode;
  return m && (SAMPLE_MODES as readonly string[]).includes(m) ? m : 'auto';
}

/** A uniform number in [0, 1) from the KIT seed, a purpose and a position: stable per hit. */
function at(kitSeed: number, ...parts: (string | number)[]): number {
  return stream(kitSeed, parts.join('|')).next();
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

/**
 * Assign samples to every event (sets `sample` and `sampleWhy`). `names` is only for the
 * explanations.
 */
export function selectSamples(events: BreakEvent[], kit: KitIndex, kitSeed: number, ctx: SampleContext = {}, names: (id: string) => string = (id) => id): void {
  const settings = ctx.settings ?? {};
  // AUTO first, exactly as engine 1 did it (it consumes its stream for every event)
  assignSamples(events, kit, kitSeed);
  for (const e of events) if (e.sample && modeOf(settings, e.cat) === 'auto') e.sampleWhy = 'AUTO: the break’s main sample' + (e.cat !== sourceOf(kit, e.cat) ? ` (${CATEGORY_LABEL[e.cat]} uses ${CATEGORY_LABEL[sourceOf(kit, e.cat)!]} samples)` : '');

  for (const cat of CATEGORIES) {
    const mode = modeOf(settings, cat);
    if (mode === 'auto') continue;
    const src = sourceOf(kit, cat);
    const evs = events.filter((e) => e.cat === cat);
    if (!src || !evs.length) continue;
    const pool = kit[src];
    const via = cat !== src ? ` (from the ${CATEGORY_LABEL[src]} samples)` : '';
    const label = (id: string) => names(id);
    const cs = settings[cat] ?? { mode };
    const set = (e: BreakEvent, id: string, why: string) => {
      e.sample = id;
      e.sampleWhy = `${why}${via}`;
    };
    if (pool.length === 1) {
      for (const e of evs) set(e, pool[0]!, `${SAMPLE_MODE_LABEL[mode]}: the only sample`);
      continue;
    }
    switch (mode) {
      case 'fixed': {
        const want = cs.fixed && pool.includes(cs.fixed) ? cs.fixed : null;
        for (const e of evs) set(e, want ?? pool[0]!, want ? 'FIXED: the chosen sample' : 'FIXED: no sample chosen (or it was removed), so the first one');
        break;
      }
      case 'random':
        for (const e of evs) {
          const i = Math.floor(at(kitSeed, 'random', cat, e.bar, e.step, e.sub) * pool.length);
          set(e, pool[i]!, `RANDOM: ${label(pool[i]!)} of ${pool.length}`);
        }
        break;
      case 'weighted': {
        const w = pool.map((id) => Math.max(0, cs.weights?.[id] ?? 1));
        const total = w.reduce((a, b) => a + b, 0);
        for (const e of evs) {
          let i = 0;
          if (total > 0) {
            let r = at(kitSeed, 'weighted', cat, e.bar, e.step, e.sub) * total;
            for (i = 0; i < pool.length - 1; i++) {
              r -= w[i]!;
              if (r < 0) break;
            }
          } else i = Math.floor(at(kitSeed, 'weighted', cat, e.bar, e.step, e.sub) * pool.length);
          set(e, pool[i]!, total > 0 ? `WEIGHTED: weight ${w[i]} of ${total}` : 'WEIGHTED: every weight is 0, so equal chances');
        }
        break;
      }
      case 'roundrobin':
        evs.forEach((e, k) => set(e, pool[k % pool.length]!, `ROUND ROBIN: hit ${k + 1}, the ${ordinal((k % pool.length) + 1)} of ${pool.length} in turn`));
        break;
      case 'alternate': {
        let prev = -1;
        const rng = stream(kitSeed, `alternate:${cat}`);
        evs.forEach((e, k) => {
          let i = rng.int(pool.length);
          if (i === prev) i = (i + 1 + rng.int(pool.length - 1)) % pool.length;
          // the last hit also avoids the first, so the loop seam does not repeat either
          if (k === evs.length - 1 && k > 0 && pool.length > 2) {
            const first = pool.indexOf(evs[0]!.sample!);
            while (i === prev || i === first) i = (i + 1) % pool.length;
          }
          prev = i;
          set(e, pool[i]!, `ALTERNATE: not the same as the previous hit`);
        });
        break;
      }
      case 'perbar': {
        const bars = Math.max(...events.map((e) => e.bar)) + 1;
        const rng = stream(kitSeed, `perbar:${cat}`);
        const choice: number[] = [];
        for (let b = 0; b < bars; b++) {
          let i = rng.int(pool.length);
          if (b > 0 && i === choice[b - 1]) i = (i + 1 + rng.int(pool.length - 1)) % pool.length;
          choice.push(i);
        }
        for (const e of evs) set(e, pool[choice[e.bar]!]!, `PER BAR: bar ${e.bar + 1} uses ${label(pool[choice[e.bar]!]!)}`);
        break;
      }
      case 'velocity': {
        const loud = ctx.loudness ?? {};
        // quietest first; ties keep list order
        const order = pool.map((id, i) => ({ id, i, l: loud[id] ?? i })).sort((a, b) => a.l - b.l || a.i - b.i).map((x) => x.id);
        for (const e of evs) {
          const layer = Math.min(order.length - 1, Math.floor(((e.vel - 1) / 127) * order.length));
          set(e, order[layer]!, `VELOCITY: velocity ${e.vel} → layer ${layer + 1} of ${order.length} (${layer === 0 ? 'quietest' : layer === order.length - 1 ? 'loudest' : 'by loudness'})`);
        }
        break;
      }
    }
  }
}

/** How many hits of the break use each sample. */
export function sampleUsage(events: BreakEvent[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of events) if (e.sample) m.set(e.sample, (m.get(e.sample) ?? 0) + 1);
  return m;
}

/** Settings cleaned of unknown modes, unknown categories and non-numeric weights. */
export function sanitiseSampleSettings(s: unknown): SampleSettings {
  const out: SampleSettings = {};
  if (!s || typeof s !== 'object') return out;
  for (const c of CATEGORIES) {
    const v = (s as Record<string, unknown>)[c] as Partial<CategorySamples> | undefined;
    if (!v || typeof v !== 'object') continue;
    const mode = (SAMPLE_MODES as readonly string[]).includes(String(v.mode)) ? (v.mode as SampleMode) : 'auto';
    const weights: Record<string, number> = {};
    if (v.weights && typeof v.weights === 'object') for (const [id, w] of Object.entries(v.weights)) if (Number.isFinite(Number(w))) weights[id] = Math.max(0, Math.min(9, Math.round(Number(w))));
    out[c] = { mode, fixed: typeof v.fixed === 'string' ? v.fixed : null, weights };
  }
  return out;
}

/** A stable short fingerprint of settings (for tests and favourites). */
export const settingsKey = (s: SampleSettings): string => hashString(JSON.stringify(sanitiseSampleSettings(s))).toString(16);

