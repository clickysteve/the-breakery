/** Browser-only integration checks, invoked by mixerAudio.test.ts via Vite and CDP. */
import { Mixer } from '@slopfactory/core/audio';
import { readZip, wavInfo } from '@slopfactory/core/export';
import { emptyMix, mixerStrips } from '../src/app/mix';
import { takeaway, defaultTakeaway } from '../src/audio/takeaway';
import { bake, seedsFrom } from '../src/engine/generate';
import { defaultRecipe } from '../src/engine/styles';
import { CATEGORIES } from '../src/engine/types';
import { Player } from '../src/audio/player';

function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
const near = (a: number, b: number, label: string, tolerance = 2e-4) => check(Math.abs(a - b) < tolerance, `${label}: ${a} != ${b}`);
function peak(data: Float32Array) { return data.reduce((m, v) => Math.max(m, Math.abs(v)), 0); }
function wav(bytes: Uint8Array) {
  const info = wavInfo(bytes); const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Locate PCM data rather than relying on a fixed WAV header size.
  let offset = 12;
  while (view.getUint32(offset, false) !== 0x64617461) offset += 8 + view.getUint32(offset + 4, true) + (view.getUint32(offset + 4, true) % 2);
  const channels = Array.from({ length: 2 }, () => new Float32Array(info.frames));
  for (let i = 0; i < info.frames; i++) for (let c = 0; c < 2; c++) channels[c]![i] = view.getInt16(offset + 8 + (i * 2 + c) * 2, true) / 32768;
  return { info, channels };
}
export async function run() {
  // Actual Web Audio gain and equal-power mono/stereo pan; verify smoothed changes on ringing audio.
  for (const stereo of [false, true]) {
    const ctx = new OfflineAudioContext(2, 4410, 44100);
    const mix = emptyMix(); mix.kick.gain = .5; mix.kick.pan = 1;
    const mixer = new Mixer(ctx, { voices: [...CATEGORIES], strips: mixerStrips(mix), masterGain: .4, fxAvailable: false });
    mixer.output.connect(ctx.destination);
    const buffer = ctx.createBuffer(stereo ? 2 : 1, 4410, 44100);
    buffer.getChannelData(0).fill(.2); if (stereo) buffer.getChannelData(1).fill(.1);
    const source = ctx.createBufferSource(); source.buffer = buffer; source.connect(mixer.input('kick')); source.start();
    const suspend = ctx.suspend(.04).then(() => { mixer.setStrip('kick', { gain: .25, pan: -1 }); mixer.setMasterGain(.8); return ctx.resume(); });
    const rendered = await ctx.startRendering(); await suspend;
    near(rendered.getChannelData(0)[1000]!, 0, 'right pan left silence');
    near(rendered.getChannelData(1)[1000]!, stereo ? .06 : .08, 'channel and master gain');
    near(rendered.getChannelData(1)[4000]!, 0, 'live pan update');
    near(rendered.getChannelData(0)[4000]!, stereo ? .06 : .08, 'live gain on sustained voice');
  }
  const b = bake({ ...defaultRecipe('funk', 1), bpm: 120 }, seedsFrom(42));
  b.events = [
    { cat: 'kick', step: 0, sub: 0, level: 1, role: 'kick', why: '', bar: 0, vel: 100, swing: 0, offsetMs: 10, sample: 'a' },
    { cat: 'snare', step: 3, sub: 6, level: 1, role: 'backbeat', why: '', bar: 0, vel: 85, swing: .2, offsetMs: -4, sample: 'b' },
    { cat: 'ghost', step: 7, sub: 2, level: .3, role: 'ghost', why: '', bar: 0, vel: 45, swing: .1, offsetMs: 3, sample: 'a' },
  ];
  const before = JSON.stringify(b.events);
  const ingredients = { instrument: (id: string) => ({ start(ctx: BaseAudioContext, dest: AudioNode, note: { time: number; velocity: number }) {
    const source = ctx.createBufferSource(); const buffer = ctx.createBuffer(1, 256, ctx.sampleRate);
    buffer.getChannelData(0).fill(id === 'a' ? .1 : .15); source.buffer = buffer;
    const gain = ctx.createGain(); gain.gain.value = note.velocity / 127;
    source.connect(gain).connect(dest); source.start(note.time);
    return { stop(time: number) { source.stop(time); }, end: note.time + 256 / ctx.sampleRate, release() {} };
  } }) } as never;
  const mix = emptyMix(); mix.kick.gain = .6; mix.kick.pan = -1; mix.snare.pan = 1; mix.ghost.gain = .4;
  const opts = { ...defaultTakeaway(), stems: true, tailSeconds: .5, dryStems: false };
  const exported = await takeaway(b, ingredients, opts, .5, undefined, undefined, mix);
  const files = await readZip(exported.bytes);
  const master = wav(files[0]!.data);
  check(files.length === CATEGORIES.length + 1, 'all actual category stems');
  const stems = files.slice(1).map(f => wav(f.data));
  for (const stem of stems) check(JSON.stringify(stem.info) === JSON.stringify(master.info), 'identical WAV formats and lengths');
  check(master.info.sampleRate === 44100 && master.info.bitsPerSample === 16 && master.info.channels === 2, 'PCM stereo 44.1k/16');
  for (let c = 0; c < 2; c++) for (let i = 0; i < master.info.frames; i++) {
    const sum = stems.reduce((a, s) => a + s.channels[c]![i]!, 0);
    near(sum, master.channels[c]![i]!, 'stems reconstruct mix', 4 / 32768);
  }
  const dry = await readZip((await takeaway(b, ingredients, { ...opts, dryStems: true }, .5, undefined, undefined, mix)).bytes);
  for (let n = 1; n < files.length; n++) {
    const a = wav(files[n]!.data), d = wav(dry[n]!.data);
    for (let c = 0; c < 2; c++) {
      near(peak(d.channels[c]!), 2 * peak(a.channels[c]!), 'dry bypass master');
      const onset = (x: Float32Array) => x.findIndex(v => Math.abs(v) > .0001);
      check(onset(a.channels[c]!) === onset(d.channels[c]!), 'dry alignment');
    }
  }
  const full = await takeaway(b, ingredients, { ...opts, stems: false }, .5, undefined, undefined, mix);
  const fullWav = wav(full.bytes);
  for (let c = 0; c < 2; c++) check(fullWav.channels[c]!.every((v, i) => v === master.channels[c]![i]), 'standalone mix matches ZIP mix');
  mix.kick.solo = mix.snare.solo = true; mix.kick.mute = true;
  const muted = await readZip((await takeaway(b, ingredients, opts, .5, undefined, undefined, mix)).bytes);
  for (const c of ['kick', 'ghost']) {
    const stem = wav(muted.find(f => f.name.endsWith(`_${c}.wav`))!.data);
    check(peak(stem.channels[0]!) === 0 && peak(stem.channels[1]!) === 0, 'mute/solo stem silence');
  }
  check(JSON.stringify(b.events) === before, 'events unchanged');
  // Live graph and real analyser taps, including currently sounding audio.
  const player = new Player(ingredients); await player.ensure();
  check(player.ctx?.state === 'running', 'live AudioContext starts');
  player.setMix(mix); player.setLevel(.5); await player.play(b);
  player.setBreak({ ...b, seeds: { ...b.seeds, beat: 99 } });
  const internal = player as any; const boundary = internal.switchAt, start = internal.loopStart;
  mix.snare.gain = .3; mix.snare.pan = -.5; player.setMix(mix); player.setLevel(.4);
  check(player.playing && internal.switchAt === boundary && internal.loopStart === start, 'pending live transition preserved');
  const liveSource = player.ctx!.createConstantSource(); liveSource.offset.value = .1;
  liveSource.connect(internal.mixer.input('snare')); liveSource.start();
  await new Promise(resolve => setTimeout(resolve, 100));
  check(player.meter('snare') > .001 && player.meter('L') > .001, 'actual signal meters');
  liveSource.stop();
  player.stop(); check(player.meter('snare') === 0 && player.meter('L') === 0, 'meters reset');
  await player.ctx!.close();
  await import('../src/main');
  const tab = [...document.querySelectorAll<HTMLElement>('.mtab')].find(e => e.textContent === 'MIXER');
  check(tab, 'MIXER tab exists'); tab.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  for (const c of CATEGORIES) {
    const control = document.querySelector<HTMLElement>(`[aria-label="${c} volume"]`);
    check(control && control.getBoundingClientRect().width > 0, `${c} mixer control visible`);
  }
  const masterControl = document.querySelector<HTMLElement>('[aria-label="Master volume"]')!;
  const region = masterControl.closest('.mwin')!.getBoundingClientRect();
  check(masterControl.getBoundingClientRect().bottom < region.bottom, 'compact master strip fits window');
  return 'Real Web Audio: gain, pan, live updates, WAV, aligned stems, mute/solo, dry/master and transport passed';
}
