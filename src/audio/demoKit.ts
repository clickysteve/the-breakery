/**
 * The demo kit: original drum one-shots synthesised from code at start-up (no recordings, no
 * downloads), so The Breakery can be tried without assembling a kit. Deterministic: the same
 * code always makes the same sounds. Simple analogue-style recipes (pitch-swept sines, filtered
 * noise, inharmonic square-wave "metal"), deliberately plain; your own samples will sound better.
 */
import { makeRng, type Rng } from '../engine/rng';
import type { Category } from '../engine/types';

export const DEMO_RATE = 44100;

export interface DemoSound {
  id: string;
  name: string;
  cat: Category;
  data: Float32Array;
}

// ------------------------------------------------------------------ small DSP kit

/** RBJ biquad, processed in place. */
function biquad(x: Float32Array, type: 'lp' | 'hp' | 'bp', freq: number, q = 0.707): Float32Array {
  const w = (2 * Math.PI * freq) / DEMO_RATE;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0: number, b1: number, b2: number;
  if (type === 'lp') [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
  else if (type === 'hp') [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  else [b0, b1, b2] = [alpha, 0, -alpha];
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = x[i]!;
    const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    x[i] = y0;
  }
  return x;
}

const buf = (seconds: number) => new Float32Array(Math.round(seconds * DEMO_RATE));

function noise(n: number, rng: Rng): Float32Array {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = rng.next() * 2 - 1;
  return x;
}

/** Exponential decay envelope with a short linear attack. */
function env(n: number, decay: number, attack = 0.001): Float32Array {
  const e = new Float32Array(n);
  const a = Math.max(1, attack * DEMO_RATE);
  for (let i = 0; i < n; i++) e[i] = (i < a ? i / a : 1) * Math.exp(-i / DEMO_RATE / decay);
  return e;
}

function mul(x: Float32Array, e: Float32Array): Float32Array {
  for (let i = 0; i < x.length; i++) x[i] = x[i]! * (e[i] ?? 0);
  return x;
}

function add(into: Float32Array, x: Float32Array, gain = 1): Float32Array {
  for (let i = 0; i < Math.min(into.length, x.length); i++) into[i] = into[i]! + x[i]! * gain;
  return into;
}

function drive(x: Float32Array, amount: number): Float32Array {
  const k = Math.tanh(amount);
  for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i]! * amount) / k;
  return x;
}

/** Scale to a peak level and fade the last 3 ms to avoid a click. */
function finish(x: Float32Array, peak: number): Float32Array {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  const g = m > 0 ? peak / m : 0;
  const fade = Math.round(0.003 * DEMO_RATE);
  for (let i = 0; i < x.length; i++) {
    const f = i > x.length - fade ? (x.length - i) / fade : 1;
    x[i] = x[i]! * g * f;
  }
  return x;
}

/** A sine whose frequency glides exponentially from f0 to f1 with time constant tau. */
function sweep(n: number, f0: number, f1: number, tau: number): Float32Array {
  const x = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / DEMO_RATE;
    const f = f1 + (f0 - f1) * Math.exp(-t / tau);
    ph += (2 * Math.PI * f) / DEMO_RATE;
    x[i] = Math.sin(ph);
  }
  return x;
}

/** Inharmonic square-wave cluster (the classic analogue cymbal "metal"). */
function metal(n: number, base: number): Float32Array {
  const ratios = [1, 1.4471, 1.6170, 1.9265, 2.5028, 2.6637];
  const x = new Float32Array(n);
  for (const r of ratios) {
    const f = base * r;
    for (let i = 0; i < n; i++) x[i] = x[i]! + (((i * f) / DEMO_RATE) % 1 < 0.5 ? 1 : -1);
  }
  return x;
}

// ------------------------------------------------------------------ the sounds

function kick(f0: number, f1: number, tau: number, decay: number, punch: number, seed: number): Float32Array {
  const rng = makeRng(seed);
  const n = buf(decay * 4);
  const body = mul(sweep(n.length, f0, f1, tau), env(n.length, decay, 0.0008));
  const click = mul(biquad(noise(n.length, rng), 'hp', 1500), env(n.length, 0.003));
  add(n, body);
  add(n, click, 0.35);
  return finish(drive(n, punch), 0.82);
}

function snare(t1: number, t2: number, toneDecay: number, noiseDecay: number, bright: number, seed: number): Float32Array {
  const rng = makeRng(seed);
  const n = buf(noiseDecay * 5);
  const tone = add(mul(sweep(n.length, t1 * 1.5, t1, 0.01), env(n.length, toneDecay)), mul(sweep(n.length, t2 * 1.3, t2, 0.008), env(n.length, toneDecay * 0.7)), 0.6);
  const sn = biquad(biquad(noise(n.length, rng), 'bp', bright, 0.6), 'hp', 900);
  mul(sn, env(n.length, noiseDecay, 0.0005));
  add(n, tone, 0.7);
  add(n, sn, 1.6);
  return finish(drive(n, 1.8), 0.9);
}

function hat(decay: number, base: number, noiseMix: number, seed: number, seconds: number): Float32Array {
  const rng = makeRng(seed);
  const n = buf(seconds);
  const m = metal(n.length, base);
  add(n, m, 0.25);
  add(n, noise(n.length, rng), noiseMix);
  biquad(n, 'bp', 10000, 0.9);
  biquad(n, 'hp', 7000);
  mul(n, env(n.length, decay, 0.0004));
  return finish(n, 0.62);
}

function ride(seed: number): Float32Array {
  const rng = makeRng(seed);
  const n = buf(2.2);
  add(n, metal(n.length, 310), 0.2);
  add(n, noise(n.length, rng), 0.25);
  biquad(n, 'hp', 3500);
  mul(n, env(n.length, 0.7, 0.0006));
  const bell = mul(sweep(n.length, 2450, 2450, 1), env(n.length, 0.45));
  add(n, bell, 0.18);
  return finish(n, 0.5);
}

function crash(seed: number): Float32Array {
  const rng = makeRng(seed);
  const n = buf(3);
  add(n, noise(n.length, rng), 0.7);
  add(n, metal(n.length, 420), 0.18);
  biquad(n, 'hp', 4200);
  biquad(n, 'lp', 14000);
  mul(n, env(n.length, 0.9, 0.004));
  return finish(n, 0.42);
}

function shaker(seed: number): Float32Array {
  const rng = makeRng(seed);
  const n = buf(0.18);
  add(n, noise(n.length, rng));
  biquad(n, 'bp', 6500, 1.2);
  mul(n, env(n.length, 0.035, 0.008));
  return finish(n, 0.55);
}

function rim(): Float32Array {
  const n = buf(0.15);
  add(n, mul(sweep(n.length, 1750, 1700, 0.01), env(n.length, 0.022)));
  add(n, mul(sweep(n.length, 2600, 2550, 0.01), env(n.length, 0.012)), 0.5);
  return finish(drive(n, 2), 0.6);
}

function bongo(): Float32Array {
  const n = buf(0.5);
  add(n, mul(sweep(n.length, 420, 330, 0.02), env(n.length, 0.11, 0.0008)));
  return finish(drive(n, 1.4), 0.7);
}

/** A tom: a pitched membrane that drops in pitch as it rings, with a little stick noise. */
function tom(f0: number, f1: number, decay: number, seed: number): Float32Array {
  const rng = makeRng(seed);
  const n = buf(decay * 5);
  add(n, mul(sweep(n.length, f0, f1, 0.06), env(n.length, decay, 0.001)));
  add(n, mul(sweep(n.length, f0 * 1.5, f1 * 1.5, 0.04), env(n.length, decay * 0.4)), 0.2);
  add(n, mul(biquad(noise(n.length, rng), 'bp', f1 * 5, 1.1), env(n.length, 0.018)), 0.35);
  return finish(drive(n, 1.3), 0.78);
}

/** Demo sounds added after the first release: given once to visitors who already have the demo kit. */
export const NEW_DEMO_IDS = ['demo:tom-high', 'demo:tom-mid', 'demo:tom-low'];

let cache: DemoSound[] | null = null;

/** The demo kit (built once, about 0.1 s of computation). */
export function demoKit(): DemoSound[] {
  if (cache) return cache;
  const s = (id: string, name: string, cat: Category, data: Float32Array): DemoSound => ({ id: `demo:${id}`, name, cat, data });
  cache = [
    s('kick-round', 'DEMO KICK ROUND', 'kick', kick(150, 48, 0.04, 0.32, 1.6, 1)),
    s('kick-tight', 'DEMO KICK TIGHT', 'kick', kick(200, 58, 0.025, 0.2, 2.4, 2)),
    s('snare-fat', 'DEMO SNARE FAT', 'snare', snare(185, 330, 0.11, 0.17, 3000, 3)),
    s('snare-crack', 'DEMO SNARE CRACK', 'snare', snare(230, 420, 0.07, 0.13, 4500, 4)),
    s('ghost-soft', 'DEMO GHOST SOFT', 'ghost', snare(200, 360, 0.05, 0.07, 3500, 5)),
    s('hat-tight', 'DEMO HAT TIGHT', 'hat', hat(0.038, 380, 0.45, 6, 0.25)),
    s('hat-loose', 'DEMO HAT LOOSE', 'hat', hat(0.06, 340, 0.7, 7, 0.3)),
    s('open-hat', 'DEMO OPEN HAT', 'open', hat(0.32, 360, 0.6, 8, 1.4)),
    s('ride', 'DEMO RIDE', 'ride', ride(9)),
    s('crash', 'DEMO CRASH', 'crash', crash(10)),
    s('shaker', 'DEMO SHAKER', 'perc', shaker(11)),
    s('rim', 'DEMO RIM', 'perc', rim()),
    s('bongo', 'DEMO BONGO', 'perc', bongo()),
    s('tom-high', 'DEMO TOM HIGH', 'htom', tom(250, 185, 0.22, 12)),
    s('tom-mid', 'DEMO TOM MID', 'mtom', tom(185, 135, 0.28, 13)),
    s('tom-low', 'DEMO TOM LOW', 'ltom', tom(128, 88, 0.36, 14)),
  ];
  return cache;
}
