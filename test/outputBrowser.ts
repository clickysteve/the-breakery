/** Browser-only checks of OUTPUT (the master output chain), invoked by outputAudio.test.ts via Vite and CDP. */
import { readZip, wavInfo } from '@slopfactory/core/export';
import { emptyMix } from '../src/app/mix';
import { takeaway, defaultTakeaway } from '../src/audio/takeaway';
import { bake, seedsFrom } from '../src/engine/generate';
import { defaultRecipe } from '../src/engine/styles';
import { Player } from '../src/audio/player';
import type { ChainConfig } from '../src/audio/output';

function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function wav(bytes: Uint8Array) {
  const info = wavInfo(bytes); const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  while (view.getUint32(offset, false) !== 0x64617461) offset += 8 + view.getUint32(offset + 4, true) + (view.getUint32(offset + 4, true) % 2);
  const channels = Array.from({ length: 2 }, () => new Float32Array(info.frames));
  for (let i = 0; i < info.frames; i++) for (let c = 0; c < 2; c++) channels[c]![i] = view.getInt16(offset + 8 + (i * 2 + c) * 2, true) / 32768;
  return channels;
}
const chain = (...stages: [string, Record<string, number | string>, boolean?][]): ChainConfig => ({ version: 1, bypass: false, stages: stages.map(([engine, params, enabled = true], i) => ({ id: `s${i + 1}`, engine, enabled, params })) });
const same = (a: Float32Array[], b: Float32Array[]) => a.every((c, k) => c.every((v, i) => v === b[k]![i]));

export async function run() {
  const b = bake({ ...defaultRecipe('funk', 1), bpm: 120 }, seedsFrom(42));
  b.events = [
    { cat: 'kick', step: 0, sub: 0, level: 1, role: 'kick', why: '', bar: 0, vel: 127, swing: 0, offsetMs: 0, sample: 'a' },
    { cat: 'snare', step: 4, sub: 0, level: 1, role: 'backbeat', why: '', bar: 0, vel: 127, swing: 0, offsetMs: 0, sample: 'b' },
  ];
  // a decaying sine, so processing has something to change
  const ingredients = { instrument: (id: string) => ({ start(ctx: BaseAudioContext, dest: AudioNode, note: { time: number; velocity: number }) {
    const n = 4096; const buffer = ctx.createBuffer(1, n, ctx.sampleRate); const d = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (id === 'a' ? 0.6 : 0.4) * Math.exp(-i / 1500) * Math.sin(i * (id === 'a' ? 0.03 : 0.11));
    const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(dest); source.start(note.time);
    return { stop(time: number) { source.stop(time); }, end: note.time + n / ctx.sampleRate, release() {} };
  } }) } as never;
  const mix = emptyMix();
  const opts = { ...defaultTakeaway(), stems: true, tailSeconds: .2, dryStems: false };

  // 1. the chain reaches the TAKEAWAY master, and only the master
  const plainZip = await readZip((await takeaway(b, ingredients, opts, .5, undefined, undefined, mix, undefined, chain())).bytes);
  const crushed = await takeaway(b, ingredients, opts, .5, undefined, undefined, mix, undefined, chain(['goodbits.crunch', { bits: 2, rateDivide: 1 }]));
  check(!crushed.outputSkipped, 'the chain worklet ran in the export');
  const crushedZip = await readZip(crushed.bytes);
  const plainMaster = wav(plainZip[0]!.data);
  const master = wav(crushedZip[0]!.data);
  check(!same(master, plainMaster), 'OUTPUT changes the master');
  // 2-bit crunch then MASTER LEVEL 0.5: every sample is a multiple of 0.25
  check(master.every((c) => c.every((v) => Math.abs(v * 4 - Math.round(v * 4)) < 1e-3)), 'the master is 2-bit crunched before master level');
  for (let n = 1; n < crushedZip.length; n++) check(same(wav(crushedZip[n]!.data), wav(plainZip[n]!.data)), `stem ${crushedZip[n]!.name} is not processed by OUTPUT`);
  // dry stems as well
  const dryPlain = await readZip((await takeaway(b, ingredients, { ...opts, dryStems: true }, .5, undefined, undefined, mix, undefined, chain())).bytes);
  const dryCrushed = await readZip((await takeaway(b, ingredients, { ...opts, dryStems: true }, .5, undefined, undefined, mix, undefined, chain(['goodbits.crunch', { bits: 2, rateDivide: 1 }]))).bytes);
  for (let n = 1; n < dryCrushed.length; n++) check(same(wav(dryCrushed[n]!.data), wav(dryPlain[n]!.data)), 'dry stems are not processed by OUTPUT');
  // a bypassed chain, a disabled stage and an unknown engine change nothing
  for (const c of [{ ...chain(['goodbits.crunch', { bits: 2, rateDivide: 1 }]), bypass: true }, chain(['goodbits.drive', { type: 'fuzz', amountPct: 100 }, false]), chain(['another-app.reverb', { size: 3 }])]) {
    const r = await takeaway(b, ingredients, { ...opts, stems: false }, .5, undefined, undefined, mix, undefined, c);
    check(same(wav(r.bytes), plainMaster), `no change for ${JSON.stringify(c)}`);
  }

  // 2. live: the player's mixer runs the chain between the mixer and master level
  const player = new Player(ingredients);
  player.setOutput(chain(['goodbits.crunch', { bits: 1, rateDivide: 1 }]));
  await player.ensure();
  check(player.outputProcessing, 'the chain worklet loads live');
  const internal = player as any;
  const an = player.ctx!.createAnalyser(); an.fftSize = 2048;
  internal.mixer.output.connect(an);
  const src = player.ctx!.createOscillator(); src.frequency.value = 200;
  const amp = player.ctx!.createGain(); amp.gain.value = .7;
  src.connect(amp).connect(internal.mixer.input('kick')); src.start();
  const levels = async () => {
    await new Promise((r) => setTimeout(r, 300));
    const d = new Float32Array(2048); an.getFloatTimeDomainData(d);
    return new Set([...d].map((v) => Math.round(v * 1000))).size;
  };
  player.setLevel(1);
  check((await levels()) <= 3, 'live: 1-bit crunch heard');
  player.setOutput({ ...chain(['goodbits.crunch', { bits: 1, rateDivide: 1 }]), bypass: true });
  check((await levels()) > 50, 'live: BYPASS ALL heard at once');
  src.stop();
  await player.ctx!.close();

  // 3. the OUTPUT tab: settings persist, unknown stages survive, controls come from metadata
  localStorage.setItem('breakery.state.v1', JSON.stringify({ output: chain(['goodbits.drive', { type: 'tube', amountPct: 25 }], ['another-app.reverb', { size: 3 }]) }));
  await import('../src/main');
  const app = (window as any).breakery.app;
  check(app.output.stages.length === 2 && app.output.stages[1].engine === 'another-app.reverb', 'saved chain restored, unknown stage kept');
  const tab = [...document.querySelectorAll<HTMLElement>('.mtab')].find((e) => e.textContent === 'OUTPUT');
  check(tab, 'OUTPUT tab exists');
  tab.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  const pane = tab.closest('.mwin')!.querySelector<HTMLElement>('[role="tabpanel"][aria-label="OUTPUT"]')!;
  check(pane.textContent!.includes('UNAVAILABLE'), 'unknown stage shown as UNAVAILABLE');
  check(pane.querySelector('[aria-label="Amount"]'), 'DRIVE amount control built from metadata');
  app.output.add('core.tone');
  await new Promise((r) => setTimeout(r, 50));
  const toneRow = [...pane.querySelectorAll<HTMLElement>('.btn')].find((e) => e.textContent === 'TONE')!;
  toneRow.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  check(pane.querySelector('[aria-label="Cutoff"]'), 'TONE cutoff control appears when TONE is selected');
  const saved = JSON.parse(localStorage.getItem('breakery.state.v1')!);
  check(saved.output.stages.map((s: { engine: string }) => s.engine).join() === 'goodbits.drive,another-app.reverb,core.tone', 'OUTPUT saved with the app settings');
  for (const el of pane.querySelectorAll<HTMLElement>('.btn, .range, .label')) {
    const r = el.getBoundingClientRect(); const p = pane.getBoundingClientRect();
    check(r.width === 0 || (r.right <= p.right + 1 && r.bottom <= p.bottom + 1), `"${el.textContent}" fits inside the OUTPUT pane`);
  }
  return 'OUTPUT: export master only, stems dry, live chain and bypass, persistence, metadata controls passed';
}
