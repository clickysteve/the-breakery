/**
 * Browser-only checks of per-hit PITCH and REVERSE with real Web Audio, invoked by expressive.test.ts
 * via Vite and CDP: the offline render (WAV and stems) of the demo snare forwards, reversed and
 * pitched, and the live player's scheduling (which instrument and pitch each note asks for).
 * Measurements of the rendered audio, not listening.
 */
import { readZip, wavInfo } from '@slopfactory/core/export';
import type { SampleInstrument } from '@slopfactory/core/sampler';
import { Ingredients } from '../src/audio/ingredients';
import { Player } from '../src/audio/player';
import { defaultTakeaway, takeaway } from '../src/audio/takeaway';
import { fxSuffix } from '../src/audio/shaped';
import { REVERSED, ROOT_PITCH } from '../src/audio/timeline';
import { bake, seedsFrom } from '../src/engine/generate';
import { defaultRecipe } from '../src/engine/styles';
import type { Break, BreakEvent } from '../src/engine/types';

function check(ok: unknown, message: string): asserts ok { if (!ok) throw new Error(message); }
function wav(bytes: Uint8Array) {
  const info = wavInfo(bytes); const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  while (view.getUint32(offset, false) !== 0x64617461) offset += 8 + view.getUint32(offset + 4, true) + (view.getUint32(offset + 4, true) % 2);
  const d = new Float32Array(info.frames);
  for (let i = 0; i < info.frames; i++) d[i] = view.getInt16(offset + 8 + i * 4, true) / 32768;
  return { rate: info.sampleRate, d };
}
const first = (d: Float32Array, th = 3e-4) => d.findIndex((v) => Math.abs(v) > th);
const last = (d: Float32Array, th = 3e-4) => { for (let i = d.length - 1; i >= 0; i--) if (Math.abs(d[i]!) > th) return i; return -1; };
const peakAt = (d: Float32Array) => d.reduce((m, v, i) => (Math.abs(v) > Math.abs(d[m]!) ? i : m), 0);

export async function run() {
  localStorage.clear();
  const ing = new Ingredients(null);
  ing.loadDemo();
  const snare = ing.kit().snare[0]!;
  const base = ing.instrument(snare) as SampleInstrument;
  const before = Array.from(base.buffer.getChannelData(0).slice(0, 64));
  const b0 = bake({ ...defaultRecipe('funk', 1), bpm: 120 }, seedsFrom(7));
  const one = (expr: Partial<BreakEvent>): Break => ({ ...b0, events: [{ cat: 'snare', bar: 0, step: 4, sub: 0, level: 1, role: 'backbeat', why: '', vel: 120, swing: 0, offsetMs: 0, sample: snare, ...expr }] });
  const opts = { ...defaultTakeaway(), stems: false, tailSeconds: 2 };
  const render = async (expr: Partial<BreakEvent>) => wav((await takeaway(one(expr), ing, opts, 0.8)).bytes);

  const fwd = await render({});
  const rev = await render({ reverse: true });
  const up = await render({ pitch: 12 });
  const down = await render({ pitch: -12 });
  const hit = Math.round(0.5 * fwd.rate); // beat 2 at 120 BPM
  const ms = (f: number) => ((f / fwd.rate) * 1000).toFixed(1);
  const lines: string[] = [];
  for (const [name, r] of [['forward', fwd], ['reversed', rev], ['+12 st', up], ['-12 st', down]] as const) {
    check(first(r.d) >= hit - 2, `${name}: sound before the hit (${first(r.d)} < ${hit})`);
    lines.push(`${name}: onset ${ms(first(r.d) - hit)} ms after the hit, peak at +${ms(peakAt(r.d) - hit)} ms, audible until +${ms(last(r.d) - hit)} ms`);
  }
  check(first(fwd.d) - hit < 0.002 * fwd.rate, 'forward starts on the hit');
  check(first(rev.d) - hit < 0.01 * fwd.rate, `reversed starts at the hit, not after a silent tail (${ms(first(rev.d) - hit)} ms)`);
  check(peakAt(rev.d) - hit > peakAt(fwd.d) - hit + 0.02 * fwd.rate, 'reversed: the attack (peak) comes at the end, later than forwards');
  check(last(up.d) < last(fwd.d) && last(fwd.d) < last(down.d), 'pitch by playback rate: +12 is shorter, -12 longer');
  const fwdLen = last(fwd.d) - hit, upLen = last(up.d) - hit;
  check(upLen > fwdLen * 0.35 && upLen < fwdLen * 0.65, `+12 st is about half the length (${(upLen / fwdLen).toFixed(2)})`);

  // DESTROY's shaping (audio/shaped.ts), measured in the offline render: a quarter note is 0.5 s at 120 BPM
  const q = 0.5 * fwd.rate;
  const gated = await render({ gate: { len: 0.25, fade: 0.01 } });
  check(last(gated.d) - hit <= 0.25 * q + 0.003 * fwd.rate, `GATE 1/16: silent after the gate (${ms(last(gated.d) - hit)} ms)`);
  check(last(gated.d) - hit > 0.25 * q * 0.7, `GATE 1/16: sounds until near the gate (${ms(last(gated.d) - hit)} ms)`);
  const taped = await render({ tape: { len: 0.5, from: 1, to: 0.2 } });
  check(last(taped.d) - hit <= 0.5 * q + 0.003 * fwd.rate, `TAPE STOP (CUT): silent after the stop (${ms(last(taped.d) - hit)} ms)`);
  const partial = await render({ reverse: true, revFrac: 0.3 });
  check(first(partial.d) - hit < 0.01 * fwd.rate, 'partial REVERSE starts on the hit');
  check(last(partial.d) - hit < (last(rev.d) - hit) * 0.5, `partial REVERSE (30%) is shorter than the whole reversed sound (${ms(last(partial.d) - hit)} vs ${ms(last(rev.d) - hit)} ms)`);
  const detuned = await render({ detune: 1200 });
  check(Math.abs((last(detuned.d) - hit) - (last(up.d) - hit)) < 0.01 * fwd.rate, 'detune +1200 cents plays as +12 st');
  lines.push(`DESTROY: gate 1/16 audible until +${ms(last(gated.d) - hit)} ms; tape stop (cut after 1/8) until +${ms(last(taped.d) - hit)} ms; partial reverse 30% until +${ms(last(partial.d) - hit)} ms (whole: +${ms(last(rev.d) - hit)} ms)`);

  // stems: the reversed hit is in the snare stem, nowhere else
  const zip = await readZip((await takeaway(one({ reverse: true, pitch: 5 }), ing, { ...opts, stems: true, dryStems: true }, 0.8)).bytes);
  const stem = (c: string) => wav(zip.find((f) => f.name.endsWith(`_${c}.wav`))!.data);
  check(last(stem('snare').d) > hit, 'the reversed, pitched hit is in the snare stem');
  check(last(stem('kick').d) === -1, 'the kick stem is silent');

  // the reversed copy is cached and the original sample is untouched
  check(ing.instrument(snare + REVERSED) === ing.instrument(snare + REVERSED), 'the reversed copy is cached');
  check(ing.instrument(snare + REVERSED) !== base, 'the reversed copy is a new instrument');
  check(Array.from(base.buffer.getChannelData(0).slice(0, 64)).every((v, i) => v === before[i]), 'the original sample is unchanged');

  // live: the player asks for the reversed instrument and the pitch of each hit
  const asked: { id: string; pitch: number }[] = [];
  const spy = new Proxy(ing, {
    get(t, k) {
      if (k === 'instrument') return (id: string) => {
        const real = t.instrument(id);
        return real && { start(ctx: BaseAudioContext, dest: AudioNode, note: { pitch: number }) { asked.push({ id, pitch: note.pitch }); return real.start(ctx, dest, note as never); } };
      };
      const v = (t as never)[k];
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v;
    },
  });
  const player = new Player(spy as never);
  await player.ensure();
  const live = { ...b0, events: [one({ reverse: true, pitch: -7 }).events[0]!, { ...one({ pitch: 3 }).events[0]!, step: 0 }, { ...one({ gate: { len: 0.25, fade: 0.01 } }).events[0]!, step: 8 }] };
  await player.play(live);
  await new Promise((r) => setTimeout(r, 1400));
  player.stop();
  await player.ctx!.close();
  check(asked.some((a) => a.id === snare + REVERSED && a.pitch === ROOT_PITCH - 7), `live: reversed at -7 st requested (${JSON.stringify(asked.slice(0, 4))})`);
  check(asked.some((a) => a.id === snare && a.pitch === ROOT_PITCH + 3), 'live: forwards at +3 st requested');
  check(asked.some((a) => a.id === snare + fxSuffix({ gate: { len: 0.25, fade: 0.01 } }, 120)), 'live: the gated hit asks for the same shaped instrument as the export');
  lines.push(`live player: ${asked.length} notes scheduled with their instrument and pitch`);

  // the interface: the new controls are there, visible, and use no native dropdowns
  await import('../src/main');
  const app = (window as unknown as { breakery: { app: import('../src/app/app').App } }).breakery.app;
  const press = (el: Element) => el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  const tab = (n: string) => { const t = [...document.querySelectorAll('.mtab')].find((x) => x.textContent?.trim() === n); check(t, `tab ${n}`); press(t); };
  const visible = (text: string) => [...document.querySelectorAll<HTMLElement>('.btn, .label')].some((x) => x.textContent === text && x.getBoundingClientRect().width > 0);
  check(document.querySelectorAll('select').length === 0, 'no native dropdowns');
  tab('PERSONALITY');
  for (const n of ['NEUTRAL', 'ANGRY', 'DILLA', 'HEAVY-HANDED', 'INTENSITY', 'INFLUENCE']) check(visible(n), `PERSONALITY shows ${n}`);
  const dnaSel = document.querySelector<HTMLElement>('[aria-label="Break DNA"]');
  check(dnaSel && dnaSel.getBoundingClientRect().width > 0 && /NONE/.test(dnaSel.textContent ?? ''), 'PERSONALITY shows the BREAK DNA selector (NONE)');
  press([...document.querySelectorAll('.btn')].find((x) => x.textContent === 'LAZY')!);
  check(app.recipe.personality?.id === 'lazy', 'clicking LAZY sets the personality');
  tab('DESTROY');
  for (const n of ['RE-DESTROY', 'STUTTER', 'TAPE STOP', 'CHAOS']) check(visible(n), `DESTROY shows ${n}`);
  tab('ROLLS');
  press([...document.querySelectorAll('.btn')].find((x) => x.textContent === 'EXPRESSION')!);
  for (const n of ['PRESET', 'PITCH', 'VELOCITY', 'TIMING', 'RATCHET', 'REVERSE']) check(visible(n), `ROLLS ▸ EXPRESSION shows ${n}`);
  check(visible('REGEN TRACK'), 'REGEN TRACK is visible under the pattern');
  const kickName = [...document.querySelectorAll<HTMLElement>('.trackname')].find((x) => x.textContent?.trim() === 'KICK');
  check(kickName, 'track names are clickable');
  press(kickName);
  check(app.trackSel.join() === 'kick', `clicking KICK selects the track (${app.trackSel})`);
  check(kickName.classList.contains('trksel') || !!document.querySelector('.trksel'), 'the selected track is marked');
  check(document.querySelectorAll('select').length === 0, 'still no native dropdowns');
  lines.push('interface: PERSONALITY, BREAK DNA, DESTROY, EXPRESSION, REGEN TRACK and track selection present; no native dropdowns');
  return `passed\n${lines.join('\n')}`;
}
