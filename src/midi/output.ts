/**
 * MIDI output with note-safety guarantees: DOWNBEAT's MidiOutput (step 3 of Slop Factory Core's
 * MIDI roadmap starts from it), on Core's `MidiOutputPort` interface. One per device.
 *
 * Every note-on gets an id. A (channel, note) pair is released only when every id holding it has
 * been released, so two tracks sharing a channel and note (SNARE and GHOST are both GM 38) never
 * cut each other, and a stale note-off (after a panic or a device change) is ignored instead of
 * cutting a newer note. A repeated note-on for a held pair is preceded by a note-off, so drum
 * machines retrigger cleanly.
 *
 * The output remembers the latest timestamp handed to the device. If the device cannot cancel
 * queued messages (no `clear()`), emergency note-offs are stamped after everything already queued
 * so they cannot be overtaken by a note-on still waiting in the browser's queue.
 */
import type { MidiOutputPort } from '@slopfactory/core/midi';
import { allNotesOff, allSoundOff, noteOff, noteOn } from './messages';

interface Held {
  channel: number;
  note: number;
  ids: Set<number>;
}

export class MidiOutput {
  private held = new Map<number, Held>();
  private nextId = 1;
  private latestQueued = 0;
  /** Note-offs handed to the device for the future; a clear() would drop them. */
  private queuedOffs = new Map<number, number>();
  /** Send failures (diagnostics). */
  errors = 0;
  /** Messages handed to the device (diagnostics). */
  sent = 0;

  constructor(
    private sink: MidiOutputPort | null,
    private now: () => number,
  ) {}

  get device(): MidiOutputPort | null {
    return this.sink;
  }

  /** The device vanished: nothing can be sent to it, so forget its notes. */
  deviceLost(): void {
    this.sink = null;
    this.held.clear();
    this.queuedOffs.clear();
    this.latestQueued = 0;
  }

  /** The device came back (a new port object for the same id). */
  deviceReturned(sink: MidiOutputPort): void {
    this.sink = sink;
    this.latestQueued = 0;
  }

  /** Raw send (clock, transport). */
  send(bytes: number[], timestamp = this.now()): void {
    if (!this.sink) return;
    try {
      this.sink.send(bytes, timestamp);
      this.sent++;
      if (timestamp > this.latestQueued) this.latestQueued = timestamp;
    } catch {
      this.errors++;
    }
  }

  /** Start a note; returns its id. Retriggers if the pair is already held. */
  noteOn(channel: number, note: number, velocity: number, timestamp: number): number {
    const key = channel * 128 + note;
    const id = this.nextId++;
    if (this.queuedOffs.size > 64) {
      const n = this.now();
      for (const [k, at] of this.queuedOffs) if (at <= n) this.queuedOffs.delete(k);
    }
    const h = this.held.get(key);
    if (h && h.ids.size > 0) {
      this.send(noteOff(channel, note), timestamp);
      h.ids.add(id);
    } else {
      this.held.set(key, { channel, note, ids: new Set([id]) });
    }
    this.send(noteOn(channel, note, velocity), timestamp);
    return id;
  }

  /** Release a note by id. Unknown or already released ids are ignored. */
  noteOff(channel: number, note: number, id: number, timestamp: number): void {
    const key = channel * 128 + note;
    const h = this.held.get(key);
    if (!h || !h.ids.delete(id)) return;
    if (h.ids.size === 0) {
      this.held.delete(key);
      this.send(noteOff(channel, note), timestamp);
      if (timestamp > this.now()) this.queuedOffs.set(key, Math.max(timestamp, this.queuedOffs.get(key) ?? 0));
    }
  }

  heldCount(): number {
    return this.held.size;
  }

  /**
   * Release everything now. With `cancelQueued`, ask the device to drop queued messages first;
   * if it cannot, the note-offs are stamped after the latest queued message so a pending note-on
   * cannot overtake them.
   */
  releaseAll(cancelQueued: boolean): void {
    let t = this.now();
    const release = new Map<number, { channel: number; note: number }>();
    for (const [k, h] of this.held) release.set(k, h);
    if (cancelQueued && this.sink && typeof this.sink.clear === 'function') {
      try {
        this.sink.clear();
        this.latestQueued = 0;
        // their note-ons already played: the dropped note-offs must be sent again
        for (const [k, at] of this.queuedOffs) if (at > t) release.set(k, { channel: Math.floor(k / 128), note: k % 128 });
      } catch {
        this.errors++;
      }
    }
    this.queuedOffs.clear();
    if (this.latestQueued > t) t = this.latestQueued + 1;
    this.held.clear();
    for (const h of release.values()) this.send(noteOff(h.channel, h.note), t);
  }

  /** Panic: release tracked notes, then All Notes Off / All Sound Off on every channel. */
  panic(): void {
    this.releaseAll(true);
    const t = Math.max(this.now(), this.latestQueued + 1);
    for (let c = 1; c <= 16; c++) {
      this.send(allNotesOff(c), t);
      this.send(allSoundOff(c), t);
    }
  }
}
