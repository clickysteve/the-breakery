/**
 * Following an external MIDI clock, on Slop Factory Core's `ClockFollower` interface.
 *
 * Pulse-locked, as in DOWNBEAT and ANVIL (one of the two philosophies in Core's MIDI roadmap):
 * pulse n *is* musical position n/24 quarter notes from the start of the song, so The Breakery can
 * never drift from the sequencer. What happens between pulses (swing, microtiming, rolls) is
 * placed with the measured pulse period (DOWNBEAT's PulseEstimator), a few pulses ahead.
 *
 *   FA Start      play from the top: the first F8 after it is the downbeat
 *   FB Continue   play on from where Stop left off (or from a Song Position)
 *   FC Stop       stop, keeping the position
 *   F2 Song Pos.  while stopped, move to a position (MIDI beats: sixteenths)
 *   F8 Clock      advance one pulse; while stopped, only the tempo is measured
 *
 * A clock that stops arriving while running (CLOCK_LOSS_MS) is LOST: playback is told, so held
 * MIDI notes are released; when pulses resume it carries on from the next pulse.
 */
import type { ClockFollower } from '@slopfactory/core/midi';
import { CLOCK, CLOCK_PPQ, CONTINUE, SONG_POSITION, START, STOP } from './messages';

export const CLOCK_LOSS_MS = 500;

const SHORT = 6;
const LONG = 48;
const GAP_FACTOR = 4;

/** Measures a 24 PPQN clock stream (DOWNBEAT's scheduler/pulses.ts). */
export class PulseEstimator {
  private times: number[] = [];
  private shown: number | null = null;

  add(t: number): void {
    const last = this.times[this.times.length - 1];
    if (last !== undefined) {
      const dt = t - last;
      const p = this.periodMs();
      // a long silence (clock stopped and restarted) is not a slow tempo
      if (dt <= 0 || dt > 1000 || (p !== null && dt > p * GAP_FACTOR)) this.times = [];
    }
    this.times.push(t);
    if (this.times.length > LONG + 1) this.times.splice(0, this.times.length - (LONG + 1));
  }

  reset(): void {
    this.times = [];
    this.shown = null;
  }

  /** Mean of the last few intervals (places events between pulses), or null. */
  periodMs(): number | null {
    const n = Math.min(SHORT, this.times.length - 1);
    if (n < 1) return null;
    return (this.times[this.times.length - 1]! - this.times[this.times.length - 1 - n]!) / n;
  }

  /** Least-squares tempo over up to two beats, or null before a quarter beat. */
  rawBpm(): number | null {
    const n = this.times.length;
    if (n - 1 < CLOCK_PPQ / 4) return null;
    const t0 = this.times[0]!;
    const mx = (n - 1) / 2;
    let my = 0;
    for (const t of this.times) my += t - t0;
    my /= n;
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < n; i++) {
      const dx = i - mx;
      sxy += dx * (this.times[i]! - t0 - my);
      sxx += dx * dx;
    }
    const p = sxy / sxx;
    return p > 0 ? 60000 / (p * CLOCK_PPQ) : null;
  }

  /** Displayed tempo with hysteresis, so jitter does not make it flicker. */
  bpm(): number | null {
    const raw = this.rawBpm();
    if (raw === null) {
      this.shown = null;
      return null;
    }
    const tol = Math.max(0.15, raw * 0.002);
    if (this.shown === null || Math.abs(raw - this.shown) > tol) this.shown = Math.round(raw * 10) / 10;
    return this.shown;
  }
}

/** What the follower tells playback. Pulse numbers count from the start of the song, 24 per quarter. */
export interface ClockEvents {
  /** FA, or FB: play from pulse `from` (0 for Start) */
  start(from: number): void;
  /** FC (or switching away from the external clock) */
  stop(): void;
  /** pulse `n` happened at `ms` (performance.now() time); `periodMs` = the measured pulse period */
  pulse(n: number, ms: number, periodMs: number | null): void;
  /** the clock stopped arriving while running */
  lost(): void;
  /** status or tempo changed (for display) */
  changed(): void;
}

export class ExternalClock implements ClockFollower {
  status: ClockFollower['status'] = 'off';
  bpm = 0;
  readonly pulses = new PulseEstimator();
  /** the next pulse's position from the start of the song */
  next = 0;
  running = false;
  private lastMs = -Infinity;

  constructor(
    private events: ClockEvents,
    private now: () => number,
  ) {}

  /** Start or stop following (switching to the internal clock stops). */
  setActive(on: boolean): void {
    if (on === (this.status !== 'off')) return;
    if (!on && this.running) this.events.stop();
    this.running = false;
    this.next = 0;
    this.pulses.reset();
    this.lastMs = -Infinity;
    this.set(on ? 'waiting' : 'off');
  }

  /** Feed one realtime or system common status byte (data: Song Position's two bytes). */
  receive(status: number, time: number, data?: number[]): void {
    if (this.status === 'off') return;
    const now = this.now();
    // a timestamp from the future, or long past, is not to be trusted: use now
    const t = Number.isFinite(time) && time > 0 && time <= now + 5 && time >= now - 1000 ? time : now;
    if (status === CLOCK) this.pulse(t);
    else if (status === START) {
      this.next = 0;
      this.running = true;
      this.events.start(0);
      this.set('running');
    } else if (status === CONTINUE) {
      if (this.running) return;
      this.running = true;
      this.events.start(this.next);
      this.set('running');
    } else if (status === STOP) {
      if (!this.running) return;
      this.running = false;
      this.events.stop();
      this.set('stopped');
    } else if (status === SONG_POSITION && data && data.length >= 2 && !this.running) {
      this.next = ((data[0]! & 0x7f) | ((data[1]! & 0x7f) << 7)) * 6;
      this.events.changed();
    }
  }

  /** Feed raw MIDI bytes (several messages may share one packet). */
  receiveBytes(bytes: ArrayLike<number>, time: number): void {
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i]!;
      if (b === SONG_POSITION) {
        if (i + 2 < bytes.length) this.receive(b, time, [bytes[i + 1]!, bytes[i + 2]!]);
        i += 2;
      } else if (b >= 0xf8) this.receive(b, time);
      else if (b >= 0x80) return; // a channel message: not the clock's business
    }
  }

  private pulse(t: number): void {
    this.pulses.add(t);
    this.lastMs = t;
    const bpm = this.pulses.bpm();
    if (bpm !== null && bpm !== this.bpm) {
      this.bpm = bpm;
      this.events.changed();
    }
    if (!this.running) {
      this.set('detected');
      return;
    }
    const n = this.next++;
    if (this.status !== 'running') this.set('running');
    this.events.pulse(n, t, this.pulses.periodMs());
  }

  /** Call regularly (a timer): notices a clock that stopped arriving. */
  watch(): void {
    if (this.status === 'off') return;
    const silent = this.now() - this.lastMs > CLOCK_LOSS_MS;
    if (!silent) return;
    if (this.running && this.status !== 'lost') {
      this.pulses.reset();
      this.events.lost();
      this.set('lost');
    } else if (!this.running && this.status === 'detected') {
      this.pulses.reset();
      this.bpm = 0;
      this.set('waiting');
    }
  }

  private set(s: ClockFollower['status']): void {
    if (s === this.status) return;
    this.status = s;
    this.events.changed();
  }
}
