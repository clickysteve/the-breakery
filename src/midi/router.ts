/**
 * Live MIDI out: turns the hits the player schedules into timestamped note-ons and note-offs on
 * each track's device, channel and note (midi/routing.ts), and carries the internal clock out.
 *
 * Note-offs wait in a queue (in time order) until playback has scheduled everything before them,
 * so a note-off never overtakes a later note-on of the same key: a 1/64 roll on one key comes out
 * as on, off, on, off. Each device has its own note-safe MidiOutput (midi/output.ts), so stopping,
 * a new routing, or a device that disappears can never leave a note hanging.
 */
import type { MidiOutputPort } from '@slopfactory/core/midi';
import type { Category } from '../engine/types';
import { MidiOutput } from './output';
import { outRoute, type MidiSettings } from './routing';

interface PendingOff {
  ms: number;
  out: MidiOutput;
  channel: number;
  note: number;
  id: number;
}

export class MidiRouter {
  private outs = new Map<string, MidiOutput>();
  private pending: PendingOff[] = [];
  /** notes sent (diagnostics, tests) */
  notes = 0;

  constructor(
    public settings: MidiSettings,
    /** the port for a device id, or null when it is not connected */
    private port: (id: string) => MidiOutputPort | null,
    private now: () => number,
  ) {}

  /** The device output for an id (made on first use), or null when the device is not connected. */
  private output(id: string): MidiOutput | null {
    let o = this.outs.get(id);
    if (!o) {
      const p = this.port(id);
      if (!p) return null;
      o = new MidiOutput(p, this.now);
      this.outs.set(id, o);
    }
    return o.device ? o : null;
  }

  /** Same key = the same device, channel and note: hits at the same time on the same key are sent once. */
  routeKey(cat: Category): string | null {
    const r = outRoute(this.settings, cat);
    return r ? `${r.device}:${r.channel}:${r.note}` : null;
  }

  /** A hit: note-on at `onMs`, note-off at `offMs` (performance.now() times). False if the track is not sent. */
  hit(cat: Category, velocity: number, onMs: number, offMs: number): boolean {
    const r = outRoute(this.settings, cat);
    if (!r) return false;
    const out = this.output(r.device);
    if (!out) return false;
    this.flush(onMs);
    const id = out.noteOn(r.channel, r.note, velocity, onMs);
    this.notes++;
    const p: PendingOff = { ms: Math.max(onMs + 1, offMs), out, channel: r.channel, note: r.note, id };
    let i = this.pending.length;
    while (i > 0 && this.pending[i - 1]!.ms > p.ms) i--;
    this.pending.splice(i, 0, p);
    return true;
  }

  /** Send the note-offs due at or before `untilMs`. */
  flush(untilMs: number): void {
    while (this.pending.length && this.pending[0]!.ms <= untilMs) {
      const p = this.pending.shift()!;
      p.out.noteOff(p.channel, p.note, p.id, p.ms);
    }
  }

  /** Waiting note-offs (tests). */
  get pendingCount(): number {
    return this.pending.length;
  }

  /** Clock and transport to the CLOCK OUT device. */
  clock(bytes: number[], ms: number): void {
    if (this.settings.clockOut) this.output(this.settings.clockOut)?.send(bytes, ms);
  }

  /** Stop: every note ends now; with `cancelQueued`, messages still waiting in the browser are dropped where possible. */
  releaseAll(cancelQueued: boolean): void {
    this.pending = [];
    for (const o of this.outs.values()) o.releaseAll(cancelQueued);
  }

  /** Panic: release everything, then All Notes Off and All Sound Off on every channel of every device in use. */
  panic(): void {
    this.pending = [];
    for (const o of this.outs.values()) o.panic();
  }

  /** New settings (routing, devices): notes on the old routing are ended first, so none is left hanging. */
  setSettings(s: MidiSettings): void {
    this.releaseAll(false);
    this.settings = s;
  }

  /** A device vanished: forget its notes (nothing can reach it) and its waiting note-offs. */
  deviceLost(id: string): void {
    const o = this.outs.get(id);
    if (!o) return;
    this.pending = this.pending.filter((p) => p.out !== o);
    o.deviceLost();
  }

  /** A device came back. Notes that were sounding when it went are ended there (All Notes Off and All Sound Off on every channel). */
  deviceReturned(id: string): void {
    const o = this.outs.get(id);
    const p = this.port(id);
    if (!o || !p) return;
    o.deviceReturned(p);
    o.panic();
  }

  /** Notes held on every device (tests). */
  heldCount(): number {
    let n = 0;
    for (const o of this.outs.values()) n += o.heldCount();
    return n;
  }
}
