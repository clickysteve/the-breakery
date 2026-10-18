/**
 * Live MIDI: track routing and note mapping (midi/routing.ts), note-safe output and note-off
 * handling (midi/output.ts, midi/router.ts), the player's timing conversion to MIDI timestamps
 * with the internal and an external clock (audio/player.ts, midi/clockIn.ts), clock out, live
 * sample picking for MIDI input (LiveSamplePicker), and MIDI file export with a custom mapping.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { MidiOutputPort } from '@slopfactory/core/midi';
import { emptyMix } from '../src/app/mix';
import { GATE_QUARTERS, Player } from '../src/audio/player';
import { CORE_PPQ, eventTick } from '../src/audio/timeline';
import { bake, seedsFrom } from '../src/engine/generate';
import { emptyKit, type KitIndex } from '../src/engine/kit';
import { LiveSamplePicker } from '../src/engine/samples';
import { defaultRecipe } from '../src/engine/styles';
import { CATEGORIES, GM_NOTE, type Break, type BreakEvent, type Category } from '../src/engine/types';
import { breakMidi, GM_MAPPING, MIDI_PPQ, type MidiMapping } from '../src/midi/breakMidi';
import { CLOCK_LOSS_MS, ExternalClock } from '../src/midi/clockIn';
import { CLOCK, CONTINUE, START, STOP, parseChannel } from '../src/midi/messages';
import { MidiOutput } from '../src/midi/output';
import { MidiRouter } from '../src/midi/router';
import { ANY_PORT, defaultMidiSettings, fileMapping, inputTargets, isGmMapping, OMNI, outRoute, resolvePort, sanitiseMidiSettings, type MidiSettings } from '../src/midi/routing';
import { parseSmf } from '../src/midi/smf';

// ------------------------------------------------------------------ helpers

interface Sent {
  bytes: number[];
  ts: number;
}
class FakePort implements MidiOutputPort {
  sent: Sent[] = [];
  cleared = 0;
  constructor(
    readonly id: string,
    readonly name = id,
    private canClear = false,
  ) {}
  send(bytes: number[], ts = 0): void {
    this.sent.push({ bytes: [...bytes], ts });
  }
  get clear(): (() => void) | undefined {
    return this.canClear ? () => void this.cleared++ : undefined;
  }
  notes(): { on: boolean; ch: number; note: number; vel: number; ts: number }[] {
    return this.sent
      .map((s) => ({ s, m: parseChannel(s.bytes) }))
      .filter(({ m }) => m.type !== 'other')
      .map(({ s, m }) => ({ on: m.type === 'noteon', ch: (m as { channel: number }).channel, note: (m as { note: number }).note, vel: m.type === 'noteon' ? m.velocity : 0, ts: s.ts }));
  }
}

const kit = (n = 3): KitIndex => {
  const k = emptyKit();
  for (const c of CATEGORIES) k[c] = Array.from({ length: n }, (_, i) => `${c}-${i}`);
  return k;
};
const ev = (p: Partial<BreakEvent>): BreakEvent => ({ cat: 'kick', step: 0, sub: 0, level: 1, role: 'kick', why: '', bar: 0, vel: 100, swing: 0, offsetMs: 0, sample: 'kick-0', ...p });
const withEvents = (events: BreakEvent[], bpm = 120, bars: 1 | 2 | 3 | 4 = 1): Break => {
  const b = bake(defaultRecipe('funk', bars), seedsFrom(1));
  return { ...b, recipe: { ...b.recipe, bpm, bars }, events };
};
const settingsTo = (device: string, patch: (s: MidiSettings) => void = () => {}): MidiSettings => {
  const s = defaultMidiSettings();
  s.enabled = true;
  s.output = device;
  patch(s);
  return s;
};

/**
 * A Player on a stand-in audio context whose clock the test moves; performance time = 1000 ms +
 * audio time. The context starts at 1 s (at 0 a browser's output timestamp is not yet valid).
 */
function rig(settings: MidiSettings, ports: Record<string, FakePort>) {
  const ctx = { currentTime: 1, state: 'running', outputLatency: 0, baseLatency: 0, getOutputTimestamp: () => ({ contextTime: ctx.currentTime, performanceTime: 1000 + ctx.currentTime * 1000 }) };
  const audio: { voice: string; time: number; velocity: number; instrument: string }[] = [];
  const player = new Player({} as never);
  const now = () => 1000 + ctx.currentTime * 1000;
  const router = new MidiRouter(settings, (id) => ports[id] ?? null, now);
  Object.assign(player, {
    ctx,
    notes: { noteOn: (_k: string, voice: string, n: { time: number; velocity: number; instrument: string }) => audio.push({ voice, ...n }), stopAll() {} },
    ensure: async () => true,
  });
  player.midi = router;
  const run = (until: number, step = 0.02) => {
    for (let t = ctx.currentTime; t <= until + 1e-9; t += step) {
      ctx.currentTime = t;
      player.pump();
    }
  };
  return { ctx, player, router, audio, run, now };
}

const players: Player[] = [];
afterEach(() => {
  for (const p of players.splice(0)) p.stop();
});

// ------------------------------------------------------------------ routing and note mapping

describe('MIDI routing', () => {
  it('defaults to General MIDI drums on channel 10, inputs on any channel', () => {
    const s = defaultMidiSettings();
    for (const c of CATEGORIES) {
      expect(s.tracks[c].out).toMatchObject({ on: true, channel: 10, note: GM_NOTE[c] });
      expect(s.tracks[c].in).toMatchObject({ channel: OMNI, note: GM_NOTE[c] });
    }
    expect(s.tracks.kick.out.note).toBe(36);
    expect(s.tracks.snare.out.note).toBe(38);
    expect(s.tracks.hat.out.note).toBe(42);
    expect(s.tracks.open.out.note).toBe(46);
    // GHOST shares SNARE's note going out, but does not double an incoming 38
    expect(s.tracks.ghost.in.on).toBe(false);
    expect(isGmMapping(fileMapping(s))).toBe(true);
    expect(fileMapping(s)).toEqual(GM_MAPPING);
  });

  it('routes a track to its own device, or the default one, or nowhere', () => {
    const s = settingsTo('', (x) => (x.tracks.kick.out.device = 'tr8'));
    expect(outRoute(s, 'kick')).toEqual({ device: 'tr8', channel: 10, note: 36 });
    expect(outRoute(s, 'snare')).toBeNull(); // no default output
    s.output = 'daw';
    expect(outRoute(s, 'snare')).toEqual({ device: 'daw', channel: 10, note: 38 });
    s.tracks.snare.out = { ...s.tracks.snare.out, on: false };
    expect(outRoute(s, 'snare')).toBeNull();
    s.tracks.hat.out = { ...s.tracks.hat.out, channel: 3, note: 60 };
    expect(outRoute(s, 'hat')).toEqual({ device: 'daw', channel: 3, note: 60 });
  });

  it('matches incoming notes by device, channel (or OMNI) and note; shared notes layer', () => {
    const s = defaultMidiSettings();
    expect(inputTargets(s, 'pads', 10, 36)).toEqual(['kick']);
    expect(inputTargets(s, 'pads', 1, 36)).toEqual(['kick']); // OMNI
    expect(inputTargets(s, 'pads', 10, 38)).toEqual(['snare']); // ghost off by default
    expect(inputTargets(s, 'pads', 10, 99)).toEqual([]);
    s.tracks.kick.in.channel = 10;
    expect(inputTargets(s, 'pads', 1, 36)).toEqual([]);
    expect(inputTargets(s, 'pads', 10, 36)).toEqual(['kick']);
    s.input = 'pads';
    expect(inputTargets(s, 'keys', 10, 36)).toEqual([]);
    s.tracks.kick.in.device = ANY_PORT;
    expect(inputTargets(s, 'keys', 10, 36)).toEqual(['kick']);
    s.tracks.ghost.in = { ...s.tracks.ghost.in, on: true };
    s.input = ANY_PORT;
    expect(inputTargets(s, 'pads', 5, 38)).toEqual(['snare', 'ghost']);
    s.tracks.kick.in.on = false;
    expect(inputTargets(s, 'pads', 10, 36)).toEqual([]);
  });

  it('cleans stored settings: clamps channels and notes, fills in what is missing', () => {
    const s = sanitiseMidiSettings({ enabled: true, clock: 'external', output: 'x', tracks: { kick: { out: { channel: 40, note: -5 }, in: { channel: 'z', note: 300 } }, bogus: {} } });
    expect(s.enabled).toBe(true);
    expect(s.clock).toBe('external');
    expect(s.tracks.kick.out).toMatchObject({ on: true, channel: 16, note: 0 });
    expect(s.tracks.kick.in).toMatchObject({ channel: OMNI, note: 127 });
    expect(s.tracks.snare.out.note).toBe(38);
    expect(sanitiseMidiSettings('nonsense')).toEqual(defaultMidiSettings());
  });

  it('finds a device again by name when the browser gives it a new id', () => {
    const ports = [{ id: 'new-1', name: 'TR-8S' }];
    expect(resolvePort('old-1', ports, { 'old-1': 'TR-8S' })).toBe('new-1');
    expect(resolvePort('old-1', ports, {})).toBe('old-1'); // absent: kept, shown as gone
    expect(resolvePort('new-1', ports, {})).toBe('new-1');
    expect(resolvePort(ANY_PORT, ports, {})).toBe(ANY_PORT);
  });
});

// ------------------------------------------------------------------ note-off handling

describe('note-safe MIDI output', () => {
  it('ends every note, and never lets an old note-off cut a newer note on the same key', () => {
    const port = new FakePort('a');
    let t = 0;
    const out = new MidiOutput(port, () => t);
    const a = out.noteOn(10, 38, 100, 0);
    const b = out.noteOn(10, 38, 40, 5); // a second hold of the same key: retrigger
    out.noteOff(10, 38, a, 10); // a's off must not end b
    expect(out.heldCount()).toBe(1);
    out.noteOff(10, 38, b, 20);
    out.noteOff(10, 38, b, 30); // stale: ignored
    expect(out.heldCount()).toBe(0);
    expect(port.notes().map((n) => [n.on, n.ts])).toEqual([
      [true, 0],
      [false, 5],
      [true, 5],
      [false, 20],
    ]);
  });

  it('releases held notes after everything queued, when the port cannot clear its queue', () => {
    const port = new FakePort('a');
    const out = new MidiOutput(port, () => 0);
    out.noteOn(10, 36, 100, 50); // queued for the future
    out.releaseAll(true);
    const last = port.notes().at(-1)!;
    expect(last.on).toBe(false);
    expect(last.ts).toBeGreaterThan(50);
    expect(out.heldCount()).toBe(0);
  });

  it('sends again the note-offs a clear() dropped', () => {
    const port = new FakePort('a', 'a', true);
    let t = 0;
    const out = new MidiOutput(port, () => t);
    const id = out.noteOn(10, 42, 90, 0);
    t = 1;
    out.noteOff(10, 42, id, 30); // in the browser's queue
    out.releaseAll(true);
    expect(port.cleared).toBe(1);
    const offs = port.notes().filter((n) => !n.on);
    expect(offs.length).toBe(2);
    expect(offs[1]!.ts).toBe(1);
  });

  it('panic: All Notes Off and All Sound Off on all 16 channels', () => {
    const port = new FakePort('a');
    const out = new MidiOutput(port, () => 0);
    out.panic();
    const cc = port.sent.filter((s) => (s.bytes[0]! & 0xf0) === 0xb0);
    expect(cc.length).toBe(32);
    expect(new Set(cc.map((s) => s.bytes[0]! & 0x0f)).size).toBe(16);
    expect(new Set(cc.map((s) => s.bytes[1]))).toEqual(new Set([120, 123]));
  });
});

describe('MIDI router', () => {
  it('queues note-offs so a roll on one key comes out on, off, on, off', () => {
    const port = new FakePort('d');
    const r = new MidiRouter(settingsTo('d'), () => port, () => 0);
    for (let i = 0; i < 4; i++) r.hit('snare', 100, 1000 + i * 20, 1000 + i * 20 + 40); // gate longer than the spacing
    r.flush(Infinity);
    const n = port.notes();
    expect(n.map((x) => x.on)).toEqual([true, false, true, false, true, false, true, false]);
    for (let i = 1; i < n.length; i++) expect(n[i]!.ts).toBeGreaterThanOrEqual(n[i - 1]!.ts);
    expect(r.heldCount()).toBe(0);
  });

  it('sends each track on its own device, channel and note', () => {
    const ports = { a: new FakePort('a'), b: new FakePort('b') };
    const s = settingsTo('a', (x) => {
      x.tracks.hat.out = { ...x.tracks.hat.out, device: 'b', channel: 2, note: 70 };
      x.tracks.perc.out = { ...x.tracks.perc.out, on: false };
    });
    const r = new MidiRouter(s, (id) => ports[id as 'a' | 'b'] ?? null, () => 0);
    expect(r.hit('kick', 110, 10, 20)).toBe(true);
    expect(r.hit('hat', 64, 10, 20)).toBe(true);
    expect(r.hit('perc', 64, 10, 20)).toBe(false);
    r.flush(Infinity);
    expect(ports.a.notes()).toEqual([
      { on: true, ch: 10, note: 36, vel: 110, ts: 10 },
      { on: false, ch: 10, note: 36, vel: 0, ts: 20 },
    ]);
    expect(ports.b.notes()).toEqual([
      { on: true, ch: 2, note: 70, vel: 64, ts: 10 },
      { on: false, ch: 2, note: 70, vel: 0, ts: 20 },
    ]);
  });

  it('leaves no note hanging when stopping, re-routing or losing a device', () => {
    const port = new FakePort('d');
    const r = new MidiRouter(settingsTo('d'), () => port, () => 0);
    r.hit('kick', 100, 10, 50);
    r.hit('snare', 100, 12, 52);
    expect(r.heldCount()).toBe(2);
    r.releaseAll(true);
    expect(r.heldCount()).toBe(0);
    expect(r.pendingCount).toBe(0);
    expect(port.notes().filter((n) => !n.on).length).toBe(2);

    r.hit('kick', 100, 60, 90);
    r.setSettings(settingsTo('d', (x) => (x.tracks.kick.out.note = 35)));
    expect(r.heldCount()).toBe(0);
    expect(port.notes().at(-1)).toMatchObject({ on: false, note: 36 });

    r.hit('kick', 100, 100, 130);
    r.deviceLost('d');
    expect(r.heldCount()).toBe(0);
    expect(r.pendingCount).toBe(0);
    const before = port.sent.length;
    r.deviceReturned('d');
    expect(port.sent.length - before).toBe(32); // All Notes Off / All Sound Off on its return
  });
});

// ------------------------------------------------------------------ timing conversion

describe('player → MIDI timing', () => {
  it('sends every hit at its time (swing and microtiming kept) with its velocity, and a short note-off', async () => {
    const port = new FakePort('d');
    const R = rig(settingsTo('d'), { d: port });
    players.push(R.player);
    const events = [ev({ step: 0, vel: 120 }), ev({ cat: 'hat', step: 1, swing: 0.32, vel: 70, sample: 'hat-0' }), ev({ cat: 'snare', step: 4, offsetMs: 10, vel: 110, sample: 'snare-0' }), ev({ cat: 'perc', step: 6, sub: 4, vel: 50, sample: null })];
    const b = withEvents(events, 120);
    await R.player.play(b);
    R.run(2.9);
    const start = 2000 + 60; // play() starts 60 ms ahead
    const on = port.notes().filter((n) => n.on);
    const q = (e: BreakEvent) => eventTick(e, 120) / CORE_PPQ;
    expect(on.map((n) => [n.note, n.vel])).toEqual([
      [36, 120],
      [42, 70],
      [38, 110],
      [39, 50], // no sample: silent here, but still sent
    ]);
    on.forEach((n, i) => expect(n.ts).toBeCloseTo(start + q(events[i]!) * 500, 6));
    expect(on[1]!.ts - start).toBeCloseTo((1.32 / 4) * 500, 6); // the swing delay
    expect(on[2]!.ts - start).toBeCloseTo(500 + 10, 1); // +10 ms microtiming
    const offs = port.notes().filter((n) => !n.on);
    expect(offs.length).toBe(4);
    offs.forEach((n, i) => expect(n.ts - on[i]!.ts).toBeCloseTo(GATE_QUARTERS * 500, 6));
    // audio plays the sampled hits at the same moments
    expect(R.audio.map((a) => a.instrument)).toEqual(['kick-0', 'hat-0', 'snare-0']);
    R.audio.forEach((a, i) => expect(1000 + a.time * 1000).toBeCloseTo(on[i]!.ts, 6));
  });

  it('loops seamlessly (the second pass is one loop later) and keeps manual edits, rolls and length', async () => {
    const port = new FakePort('d');
    const R = rig(settingsTo('d'), { d: port });
    players.push(R.player);
    const b = bake({ ...defaultRecipe('jungle', 3), rolls: 1, swing: 0.4, humanise: 0.6 }, seedsFrom(77), kit());
    const edited = { ...b, events: [...b.events, ev({ bar: 2, step: 15, sub: 6, cat: 'kick', role: 'manual', manual: 'added' as const, vel: 33 })] };
    expect(edited.events.some((e) => e.role === 'roll')).toBe(true);
    await R.player.play(edited);
    const loopMs = 3 * 4 * (60000 / edited.recipe.bpm);
    R.run(1 + (2 * loopMs) / 1000 + 0.05);
    const on = port.notes().filter((n) => n.on);
    // first pass: one note-on per hit and key moment (snare and ghost on the same tick are sent once, the louder)
    const keys = new Set(edited.events.map((e) => `${Math.round((eventTick(e, edited.recipe.bpm) / CORE_PPQ) * 960)}:${GM_NOTE[e.cat]}`));
    const first = on.filter((n) => n.ts < 2060 + loopMs - 1e-6);
    expect(first.length).toBe(keys.size);
    const second = on.filter((n) => n.ts >= 2060 + loopMs - 1e-6 && n.ts < 2060 + 2 * loopMs - 1e-6);
    expect(second.length).toBe(first.length);
    second.forEach((n, i) => expect(n.ts - first[i]!.ts).toBeCloseTo(loopMs, 6));
    expect(first.some((n) => n.note === 36 && n.vel === 33)).toBe(true); // the hand-placed kick
  });

  it('follows SOLO and MUTE, and ends every note on stop', async () => {
    const port = new FakePort('d');
    const R = rig(settingsTo('d'), { d: port });
    players.push(R.player);
    const mix = emptyMix();
    mix.kick.mute = true;
    R.player.setMix(mix);
    await R.player.play(withEvents([ev({ step: 0 }), ev({ cat: 'snare', step: 0, sample: 'snare-0' }), ev({ cat: 'snare', step: 8, sample: 'snare-0' })]));
    R.run(1.2);
    expect(port.notes().filter((n) => n.on).map((n) => n.note)).toEqual([38]);
    R.player.stop();
    expect(R.router.heldCount()).toBe(0);
    expect(R.router.pendingCount).toBe(0);
    const n = port.notes();
    expect(n.filter((x) => x.on).length).toBe(n.filter((x) => !x.on).length);
  });

  it('sends the internal clock: Start, 24 pulses per quarter at the tempo, Stop', async () => {
    const port = new FakePort('c');
    const R = rig(settingsTo('', (s) => (s.clockOut = 'c')), { c: port });
    players.push(R.player);
    await R.player.play(withEvents([ev({ step: 0 })], 100));
    R.run(2.2);
    R.player.stop();
    const rt = port.sent.filter((s) => s.bytes[0]! >= 0xf8);
    expect(rt[0]!.bytes).toEqual([START]);
    const clocks = rt.filter((s) => s.bytes[0] === CLOCK);
    expect(clocks[0]!.ts).toBeCloseTo(rt[0]!.ts, 6);
    for (let i = 1; i < clocks.length; i++) expect(clocks[i]!.ts - clocks[i - 1]!.ts).toBeCloseTo(60000 / 100 / 24, 6);
    expect(clocks.length).toBeGreaterThan(24 * 1.5);
    expect(rt.at(-1)!.bytes).toEqual([STOP]);
  });
});

describe('external MIDI clock', () => {
  /** A clock at `bpm` from the sequencer, driving a player whose break is at another tempo. */
  function follow(bpm: number) {
    const port = new FakePort('d');
    const R = rig(settingsTo('d'), { d: port });
    players.push(R.player);
    R.player.clock = 'external';
    const status: string[] = [];
    const clock = new ExternalClock(
      {
        start: (from) => void R.player.follow(R.player.break!, from),
        stop: () => R.player.stop(),
        pulse: (n, ms, p) => R.player.pulse(n, ms, p),
        lost: () => R.player.clockLost(),
        changed: () => status.push(clock.status),
      },
      R.now,
    );
    clock.setActive(true);
    const period = 60000 / (bpm * 24);
    let ms = 2000;
    /** advance the sequencer's time by `pulses` clock pulses */
    const pulses = async (n: number) => {
      for (let i = 0; i < n; i++) {
        R.ctx.currentTime = (ms - 1000) / 1000;
        clock.receive(CLOCK, ms);
        R.player.pump();
        ms += period;
        await Promise.resolve();
      }
    };
    const send = async (b: number) => {
      R.ctx.currentTime = (ms - 1000) / 1000;
      clock.receive(b, ms);
      await Promise.resolve();
      await Promise.resolve();
    };
    return { R, port, clock, pulses, send, period, at: () => ms, status };
  }

  it('plays at the sequencer’s tempo, locked to its pulses, from Start', async () => {
    const f = follow(90);
    const events = [ev({ step: 0 }), ev({ cat: 'snare', step: 4, sample: 'snare-0' }), ev({ cat: 'hat', step: 6, swing: 0.25, sample: 'hat-0' }), ev({ cat: 'kick', step: 10 })];
    f.R.player.setBreak(withEvents(events, 140)); // the break says 140 BPM; the clock says 90
    await f.pulses(30); // clock while stopped: tempo only
    expect(f.port.notes().length).toBe(0);
    expect(f.clock.bpm).toBeCloseTo(90, 0);
    await f.send(START);
    const t0 = f.at(); // the first pulse after Start is the downbeat
    await f.pulses(24 * 4 + 2);
    const on = f.port.notes().filter((n) => n.on && n.ts < t0 + 4 * (60000 / 90) - 1);
    expect(on.map((n) => n.note)).toEqual([36, 38, 42, 36]);
    const msPerQuarter = 60000 / 90;
    on.forEach((n, i) => expect(n.ts - t0).toBeCloseTo((eventTick(events[i]!, 140) / CORE_PPQ) * msPerQuarter, 3));
  });

  it('Stop ends every note; Continue plays on from where it stopped; a silent clock is LOST', async () => {
    const f = follow(120);
    f.R.player.setBreak(withEvents([ev({ step: 0 }), ev({ cat: 'snare', step: 4, sample: 'snare-0' }), ev({ cat: 'snare', step: 12, sample: 'snare-0' })], 120));
    await f.send(START);
    await f.pulses(12); // to the 2nd eighth: only the downbeat kick has played
    await f.send(STOP);
    expect(f.R.player.playing).toBe(false);
    expect(f.R.router.heldCount()).toBe(0);
    expect(f.port.notes().filter((n) => n.on).map((n) => n.note)).toEqual([36]);
    await f.send(CONTINUE);
    const t1 = f.at();
    await f.pulses(24 * 3);
    const on = f.port.notes().filter((n) => n.on);
    expect(on.map((n) => n.note)).toEqual([36, 38, 38]);
    // the snare on beat 2 is 12 pulses after the point Continue resumed from
    expect(on[1]!.ts - t1).toBeCloseTo(12 * f.period, 3);
    // the clock stops arriving
    f.R.ctx.currentTime += (CLOCK_LOSS_MS + 100) / 1000;
    f.clock.watch();
    expect(f.clock.status).toBe('lost');
    expect(f.R.router.heldCount()).toBe(0);
  });
});

// ------------------------------------------------------------------ MIDI input: sample choice

describe('live sample picking (MIDI input)', () => {
  const k = kit(3);
  it('follows each PICK mode', () => {
    const p = new LiveSamplePicker(() => 0.5);
    const main = p.pick('kick', 100, k, 7, {});
    expect(k.kick).toContain(main);
    expect(p.pick('kick', 10, k, 7, {})).toBe(main); // AUTO: the break's main sample
    expect(p.pick('kick', 100, k, 7, { settings: { kick: { mode: 'fixed', fixed: 'kick-2' } } })).toBe('kick-2');
    const rr = { settings: { snare: { mode: 'roundrobin' as const } } };
    expect([0, 1, 2, 3].map(() => p.pick('snare', 100, k, 7, rr))).toEqual(['snare-0', 'snare-1', 'snare-2', 'snare-0']);
    const vel = { settings: { hat: { mode: 'velocity' as const } }, loudness: { 'hat-0': 3, 'hat-1': 1, 'hat-2': 2 } };
    expect(p.pick('hat', 1, k, 7, vel)).toBe('hat-1'); // quietest
    expect(p.pick('hat', 127, k, 7, vel)).toBe('hat-0'); // loudest
    const alt = { settings: { perc: { mode: 'alternate' as const } } };
    let prev = '';
    for (let i = 0; i < 20; i++) {
      const s = p.pick('perc', 100, k, 7, alt)!;
      expect(s).not.toBe(prev);
      prev = s;
    }
  });

  it('uses the same fallbacks as the break, and the bar now playing for PER BAR', () => {
    const p = new LiveSamplePicker();
    const k2 = kit(2);
    k2.ghost = [];
    expect(k2.snare).toContain(p.pick('ghost', 30, k2, 1, {})); // GHOST plays SNARE samples
    k2.htom = [];
    expect(p.pick('htom', 100, k2, 1, {})).toBeNull(); // toms never borrow
    const events = [ev({ bar: 0, sample: 'kick-0' }), ev({ bar: 1, sample: 'kick-1' })];
    const perbar = { settings: { kick: { mode: 'perbar' as const } } };
    expect(p.pick('kick', 100, k2, 1, perbar, 1, events)).toBe('kick-1');
    expect(p.pick('kick', 100, k2, 1, perbar, 0, events)).toBe('kick-0');
  });
});

// ------------------------------------------------------------------ MIDI file export

describe('MIDI file with per-track mapping', () => {
  it('writes each track on its channel and note, keeping tempo, timing, velocity and length', () => {
    const b = bake({ ...defaultRecipe('dnb', 3), rolls: 1, swing: 0.5, humanise: 0.7 }, seedsFrom(12));
    const map: MidiMapping = JSON.parse(JSON.stringify(GM_MAPPING));
    map.kick = { channel: 1, note: 24 };
    map.ghost = { channel: 10, note: 40 };
    map.hat = { channel: 2, note: 42 };
    const s = parseSmf(breakMidi(b, undefined, map).bytes);
    expect(s.format).toBe(1);
    expect(s.bpm).toBeCloseTo(b.recipe.bpm, 3);
    expect(s.lastTick).toBeGreaterThanOrEqual(3 * 4 * MIDI_PPQ);
    const want = new Map<string, number>();
    for (const e of b.events) {
      const k = `${Math.round((eventTick(e, b.recipe.bpm) * MIDI_PPQ) / CORE_PPQ)}:${map[e.cat].channel}:${map[e.cat].note}`;
      want.set(k, Math.max(want.get(k) ?? 0, Math.round(e.vel)));
    }
    expect(s.notes.length).toBe(want.size);
    for (const n of s.notes) {
      expect(want.get(`${n.tick}:${n.channel}:${n.note}`)).toBe(n.velocity);
      expect(n.offTick).not.toBeNull();
    }
    const cats = (c: Category) => b.events.filter((e) => e.cat === c).length;
    expect(s.notes.filter((n) => n.channel === 1 && n.note === 24).length).toBe(cats('kick'));
    expect(s.notes.filter((n) => n.channel === 2).length).toBe(new Set(b.events.filter((e) => e.cat === 'hat').map((e) => eventTick(e, b.recipe.bpm))).size);
    // ghosts on their own note are no longer merged into the snares
    expect(s.notes.some((n) => n.note === 40)).toBe(b.events.some((e) => e.cat === 'ghost'));
  });

  it('is the GM file by default', () => {
    const b = bake(defaultRecipe('funk', 2), seedsFrom(3));
    expect(breakMidi(b).bytes).toEqual(breakMidi(b, undefined, GM_MAPPING).bytes);
    expect(breakMidi(b).bytes).toEqual(breakMidi(b, undefined, fileMapping(defaultMidiSettings())).bytes);
  });
});
