/** Browser-only headroom checks, invoked by headroom.test.ts via Vite and CDP. Renders real stems with Web Audio. */
import { readZip, wavInfo } from '@slopfactory/core/export';
import { emptyMix } from '../src/app/mix';
import { takeaway, defaultTakeaway } from '../src/audio/takeaway';
import { bake, seedsFrom } from '../src/engine/generate';
import { defaultRecipe } from '../src/engine/styles';
import { CATEGORIES, type BreakEvent, type Category } from '../src/engine/types';

function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
const peak = (d: Float32Array) => d.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
function wav(bytes: Uint8Array) {
  const info = wavInfo(bytes); const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  while (view.getUint32(offset, false) !== 0x64617461) offset += 8 + view.getUint32(offset + 4, true) + (view.getUint32(offset + 4, true) % 2);
  const channels = Array.from({ length: 2 }, () => new Float32Array(info.frames));
  for (let i = 0; i < info.frames; i++) for (let c = 0; c < 2; c++) channels[c]![i] = view.getInt16(offset + 8 + (i * 2 + c) * 2, true) / 32768;
  return { info, channels };
}
const db = (x: number) => 20 * Math.log10(x);
const ev = (cat: Category, step: number, sub: number, sample: string, bar = 0): BreakEvent => ({ cat, step, sub, level: 1, role: 'kick', why: '', bar, vel: 127, swing: 0, offsetMs: 0, sample });

export async function run() {
  const b = bake({ ...defaultRecipe('funk', 1), bpm: 120 }, seedsFrom(7));
  // Deliberately loud: overlapping kicks and snares, rapid hats, retriggers and a tom fill, over full-scale-ish samples.
  const events: BreakEvent[] = [];
  for (let s = 0; s < 16; s++) events.push(ev('hat', s, 0, 'hat'), ev('hat', s, 6, 'hat'));
  for (const s of [0, 0, 1, 2, 8, 8, 10]) events.push(ev('kick', s, 0, 'kick'), ev('kick', s, 3, 'kick'));
  for (const s of [4, 4, 12, 12, 13]) events.push(ev('snare', s, 0, 'snare'), ev('snare', s, 2, 'snare'));
  for (const [i, c] of (['htom', 'mtom', 'ltom'] as Category[]).entries()) if (CATEGORIES.includes(c)) events.push(ev(c, 14, i * 4, 'tom'), ev(c, 14, i * 4 + 1, 'tom'));
  b.events = events;
  const level = { kick: 0.9, snare: 0.95, hat: 0.4, tom: 0.7 } as Record<string, number>;
  const ingredients = { instrument: (id: string) => ({ start(ctx: BaseAudioContext, dest: AudioNode, note: { time: number; velocity: number }) {
    const source = ctx.createBufferSource(); const buffer = ctx.createBuffer(1, 4096, ctx.sampleRate);
    const d = buffer.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = level[id]! * Math.cos(i * 0.02) * (1 - i / d.length);
    source.buffer = buffer; source.connect(dest); source.start(note.time);
    return { stop(time: number) { source.stop(time); }, end: note.time + 4096 / ctx.sampleRate, release() {} };
  } }) } as never;

  const mix = emptyMix(); mix.kick.pan = -0.5; mix.snare.pan = 0.5;
  const opts = { ...defaultTakeaway(), stems: true, tailSeconds: 0.3, dryStems: true };

  // 1. The original failure: master level low, nothing muted, stems overlap beyond full scale. Must now succeed.
  const res = await takeaway(b, ingredients, opts, 0.25, undefined, undefined, mix);
  const files = await readZip(res.bytes);
  const master = wav(files[0]!.data);
  const stems = files.slice(1).map(f => ({ name: f.name, ...wav(f.data) }));
  check(files.length === CATEGORIES.length + 1, 'all stems exported');
  check(res.stemReducedDb > 0, `expected shared stem attenuation, got ${res.stemReducedDb}`);
  const stemPeaks = stems.map(s => Math.max(peak(s.channels[0]!), peak(s.channels[1]!)));
  check(Math.max(...stemPeaks) < 32767 / 32768 && Math.max(...stemPeaks) <= 0.9, `stems clip: ${Math.max(...stemPeaks)}`);
  for (const s of stems) check(s.info.frames === master.info.frames && s.info.sampleRate === 44100 && s.info.bitsPerSample === 16 && s.info.channels === 2, 'stem format and length');

  // 2. Compare with the same render forced into headroom by lowering nothing: stems at gain scaled copies of an unattenuated render.
  // The unattenuated reference is made by scaling the loud samples down by the reported factor, so no clamp is involved.
  const g = 10 ** (-res.stemReducedDb / 20);
  for (const k of Object.keys(level)) level[k] = level[k]! * g;
  const ref = await takeaway(b, ingredients, opts, 0.25, undefined, undefined, mix);
  check(ref.stemReducedDb === 0, `reference render should need no attenuation, got ${ref.stemReducedDb}`);
  const refFiles = await readZip(ref.bytes);
  let worst = 0;
  for (let n = 1; n < files.length; n++) {
    const a = wav(files[n]!.data), r = wav(refFiles[n]!.data);
    for (let c = 0; c < 2; c++) for (let i = 0; i < a.info.frames; i++) worst = Math.max(worst, Math.abs(a.channels[c]![i]! - r.channels[c]![i]!));
  }
  check(worst < 4 / 32768, `attenuated stems differ from the pre-scaled render by more than 16-bit rounding: ${worst}`);

  // 3. Pan and silence preserved; master gain and the master clip handling stay separate.
  const byName = (c: string) => stems.find(s => s.name.endsWith(`_${c}.wav`))!;
  const kick = byName('kick'), snare = byName('snare');
  check(peak(kick.channels[0]!) > peak(kick.channels[1]!), 'kick pan left preserved');
  check(peak(snare.channels[1]!) > peak(snare.channels[0]!), 'snare pan right preserved');
  const quiet = emptyMix(); quiet.kick.mute = true;
  const q = await takeaway(b, ingredients, opts, 0.25, undefined, undefined, quiet);
  const qs = (await readZip(q.bytes)).slice(1).map(f => ({ name: f.name, ...wav(f.data) }));
  const qk = qs.find(s => s.name.endsWith('_kick.wav'))!;
  check(peak(qk.channels[0]!) === 0 && peak(qk.channels[1]!) === 0, 'muted stem stays silent');
  const lowMaster = await takeaway(b, ingredients, opts, 0.05, undefined, undefined, mix);
  const hiMaster = await takeaway(b, ingredients, opts, 1, undefined, undefined, mix);
  const a = await readZip(lowMaster.bytes), h = await readZip(hiMaster.bytes);
  for (let n = 1; n < a.length; n++) { const x = wav(a[n]!.data), y = wav(h[n]!.data); let d = 0; for (let c = 0; c < 2; c++) for (let i = 0; i < x.info.frames; i++) d = Math.max(d, Math.abs(x.channels[c]![i]! - y.channels[c]![i]!)); check(d < 2 / 32768, `master gain does not touch dry stems (${a[n]!.name}: ${d}, reduced ${lowMaster.stemReducedDb} vs ${hiMaster.stemReducedDb})`); }

  const kickDb = db(peak(kick.channels[0]!));
  return `headroom passed: shared stem attenuation ${res.stemReducedDb.toFixed(2)} dB, loudest stem ${db(Math.max(...stemPeaks)).toFixed(2)} dBFS, kick L ${kickDb.toFixed(2)} dBFS, max diff vs pre-scaled render ${(worst * 32768).toFixed(2)} LSB, ${files.length} files`;
}
