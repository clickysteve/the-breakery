/**
 * Web MIDI access: device discovery, hot-plug, every output and every input. Grown from
 * DOWNBEAT's MidiAccess (step 2 of Slop Factory Core's MIDI roadmap) for several devices at once,
 * on Core's MidiPortInfo / MidiOutputPort / MidiInputPort interfaces.
 *
 * The Breakery never requires a device. Without Web MIDI (or with access refused) it plays
 * through its own sounds as before.
 */
import type { MidiInputPort, MidiOutputPort, MidiPortInfo } from '@slopfactory/core/midi';

export type MidiState = 'unsupported' | 'idle' | 'pending' | 'denied' | 'ready';

export interface MidiAccessEvents {
  /** the list of ports (or their state) changed */
  ports(): void;
  lost(kind: 'input' | 'output', id: string, name: string): void;
  returned(kind: 'input' | 'output', id: string, name: string): void;
  /** a message from an input */
  message(inputId: string, data: Uint8Array, timeStamp: number): void;
}

class WebMidiOut implements MidiOutputPort {
  /**
   * Only where the browser can drop queued messages (not every browser implements it). Without
   * it, MidiOutput stamps its emergency note-offs after everything already queued, so a note-on
   * still waiting in the browser cannot sound after its note-off and hang.
   */
  readonly clear?: () => void;
  constructor(private port: MIDIOutput) {
    const p = port as MIDIOutput & { clear?: () => void };
    if (typeof p.clear === 'function') this.clear = () => p.clear!();
  }
  get id(): string {
    return this.port.id;
  }
  get name(): string {
    return this.port.name ?? this.port.id;
  }
  send(bytes: number[], timestamp?: number): void {
    this.port.send(bytes, timestamp);
  }
}

class WebMidiIn implements MidiInputPort {
  constructor(private port: MIDIInput) {}
  get id(): string {
    return this.port.id;
  }
  get name(): string {
    return this.port.name ?? this.port.id;
  }
  listen(handler: (bytes: Uint8Array, timestamp: number) => void): () => void {
    const fn = (e: Event) => {
      const m = e as MIDIMessageEvent;
      if (m.data) handler(m.data, m.timeStamp);
    };
    this.port.addEventListener('midimessage', fn);
    // adding a listener does not open the port in every browser (onmidimessage does): open it
    void this.port.open?.().catch(() => {});
    return () => this.port.removeEventListener('midimessage', fn);
  }
}

export class MidiAccess {
  access: MIDIAccess | null = null;
  state: MidiState = MidiAccess.supported() ? 'idle' : 'unsupported';
  message = MidiAccess.supported() ? 'MIDI is off.' : 'This browser has no Web MIDI. The Breakery still plays; use Chrome, Edge, Opera or Firefox for MIDI.';
  private connected = new Map<string, boolean>();
  private listening = new Map<string, () => void>();

  constructor(private events: MidiAccessEvents) {}

  static supported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
  }

  async request(): Promise<MidiState> {
    if (!MidiAccess.supported() || this.access) return this.state;
    this.state = 'pending';
    this.message = 'Asking the browser for MIDI access…';
    this.events.ports();
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
    } catch (err) {
      this.state = 'denied';
      this.message = `MIDI access was refused (${err instanceof Error ? err.message : String(err)}). Allow MIDI for this site in the browser’s site settings, then turn MIDI on again.`;
      this.events.ports();
      return this.state;
    }
    this.access.onstatechange = (e: Event) => this.handleState((e as MIDIConnectionEvent).port);
    this.state = 'ready';
    this.message = 'MIDI ready.';
    this.access.inputs.forEach((p) => this.track(p));
    this.access.outputs.forEach((p) => this.track(p));
    this.events.ports();
    return this.state;
  }

  outputs(): MidiPortInfo[] {
    const list: MidiPortInfo[] = [];
    this.access?.outputs.forEach((p) => list.push({ id: p.id, name: p.name ?? p.id, manufacturer: p.manufacturer ?? undefined, connected: p.state === 'connected' }));
    return list;
  }

  inputs(): MidiPortInfo[] {
    const list: MidiPortInfo[] = [];
    this.access?.inputs.forEach((p) => list.push({ id: p.id, name: p.name ?? p.id, manufacturer: p.manufacturer ?? undefined, connected: p.state === 'connected' }));
    return list;
  }

  /** An output by id, or null when it is not connected. */
  output(id: string): MidiOutputPort | null {
    const p = this.access?.outputs.get(id);
    return p && p.state === 'connected' ? new WebMidiOut(p) : null;
  }

  /** Listen to an input while it is connected (and again when it is replugged). */
  private attach(p: MIDIInput): void {
    if (this.listening.has(p.id)) return;
    const id = p.id;
    this.listening.set(
      id,
      new WebMidiIn(p).listen((data, t) => this.events.message(id, data, t)),
    );
  }

  private detach(id: string): void {
    this.listening.get(id)?.();
    this.listening.delete(id);
  }

  private track(p: MIDIPort): void {
    const on = p.state === 'connected';
    this.connected.set(p.id, on);
    if (p.type === 'input' && on) this.attach(p as MIDIInput);
  }

  private handleState(p: MIDIPort | null): void {
    if (!p) return;
    const was = this.connected.get(p.id);
    const on = p.state === 'connected';
    this.connected.set(p.id, on);
    if (p.type === 'input') {
      if (on) this.attach(p as MIDIInput);
      else this.detach(p.id);
    }
    if (was === true && !on) this.events.lost(p.type as 'input' | 'output', p.id, p.name ?? p.id);
    else if (was === false && on) this.events.returned(p.type as 'input' | 'output', p.id, p.name ?? p.id);
    this.events.ports();
  }
}
