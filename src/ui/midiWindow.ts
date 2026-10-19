/**
 * MIDI (MIDI ▸ MIDI Settings…): turn Web MIDI on, choose the default input and output devices
 * and the clock, and route each drum track: OUT (on, device, channel, note) for the break played
 * out to a drum machine or DAW, IN (on, device, channel or OMNI, note, LEARN) for notes that play
 * the track's samples. Channels and notes also go into the MIDI file. A compact window that can
 * be closed, like PALETTE.
 */
import type { MidiPortInfo } from '@slopfactory/core/midi';
import type { MidiRig } from '../app/midi';
import { CATEGORIES, CATEGORY_LABEL, type Category } from '../engine/types';
import { noteName } from '../midi/messages';
import { ANY_PORT, DEFAULT_PORT, OMNI } from '../midi/routing';
import { el, label, setTip } from './dom';
import { GemSelect } from './gemSelect';
import { Button, MWindow, NumBox } from './widgets';
import type { UiContext } from './context';

const W = 440;
const H = 314;
const ROW = 15;
const TOP = 74;

const CLOCK_STATUS: Record<string, string> = {
  off: '',
  waiting: 'WAITING FOR CLOCK',
  detected: 'CLOCK',
  running: 'RUNNING',
  stopped: 'STOPPED',
  lost: 'CLOCK LOST',
};

export function midiWindow(parent: HTMLElement, ui: UiContext, rig: MidiRig, at: { x: number; y: number }) {
  const win = new MWindow(parent, { title: 'MIDI', x: at.x, y: at.y, w: W, h: H, closable: true });
  const b = win.body;
  const s = () => rig.settings;

  const select = (x: number, y: number, w: number, aria: string, set: (v: string) => void) => new GemSelect(b, [x, y, w, 13], { label: aria, fontSize: 8, onChange: set });
  /** Options: the fixed choices, then the devices; a chosen device that is missing is shown as such. */
  const fill = (e: GemSelect, value: string, fixed: [string, string][], ports: MidiPortInfo[]) => {
    const opts: [string, string][] = [...fixed, ...ports.map((p): [string, string] => [p.id, `${p.connected ? '' : '✕ '}${p.name}`])];
    if (!opts.some(([v]) => v === value)) opts.push([value, `✕ ${s().names[value] ?? 'device'} (gone)`]);
    e.setOptions(opts.map(([v, t]) => ({ value: v, label: t })));
    e.value = value;
  };

  // ------------------------------------------------------------ devices and clock
  const onBtn = new Button(b, [4, 4, 48, 14], 'MIDI ON', {
    tip: 'Turn Web MIDI on (the browser asks for permission once) or off. Off: nothing is sent and incoming notes are ignored; the mapping is kept, and the MIDI file still uses it.',
    onPress: () => (rig.settings.enabled && rig.access.state === 'ready' ? rig.disable() : void rig.enable()),
  });
  const state = el('div', 'label small', b, [58, 7, W - 64]);
  state.style.overflow = 'hidden';
  state.style.textOverflow = 'ellipsis';

  label(b, 4, 25, 'OUT');
  const outSel = select(24, 22, 150, 'Default MIDI output', (v) => rig.setDevices({ output: v }));
  setTip(outSel.el, 'DEFAULT OUTPUT: where tracks set to DEFAULT send their hits. NONE: only tracks with a device of their own are sent.');
  label(b, 182, 25, 'IN');
  const inSel = select(196, 22, 150, 'Default MIDI input', (v) => rig.setDevices({ input: v }));
  setTip(inSel.el, 'DEFAULT INPUT: the device whose notes play tracks set to DEFAULT. ALL INPUTS: any connected device.');
  new Button(b, [W - 88, 22, 40, 13], 'PANIC', { cls: 'small', tip: 'PANIC: All Notes Off and All Sound Off on every channel of every MIDI output in use', onPress: () => rig.panic() });
  new Button(b, [W - 46, 22, 40, 13], 'GM', { cls: 'small', tip: 'Reset every track to General MIDI drums on channel 10 (inputs on any channel). Devices are kept.', onPress: () => rig.resetMapping() });

  label(b, 4, 43, 'CLOCK');
  const intBtn = new Button(b, [34, 40, 28, 13], 'INT', { cls: 'small', tip: 'CLOCK INTERNAL: the break plays at its own BPM (Space). It can send MIDI Clock, Start and Stop (SEND).', onPress: () => rig.setClock('internal') });
  const extBtn = new Button(b, [64, 40, 28, 13], 'EXT', {
    cls: 'small',
    tip: 'CLOCK EXTERNAL: follow MIDI Clock from FROM. Start plays from the top, Stop stops, Continue plays on, Song Position moves; the break follows the sequencer’s tempo pulse by pulse.',
    onPress: () => rig.setClock('external'),
  });
  label(b, 98, 43, 'FROM');
  const clockInSel = select(122, 40, 98, 'External clock input', (v) => rig.setDevices({ clockIn: v }));
  setTip(clockInSel.el, 'FROM: the input an EXTERNAL clock comes from. Choose the device: two clocks at once would play twice as fast.');
  label(b, 226, 43, 'SEND');
  const clockOutSel = select(250, 40, 98, 'Clock output', (v) => rig.setDevices({ clockOut: v }));
  setTip(clockOutSel.el, 'SEND: with the INTERNAL clock, send MIDI Clock, Start and Stop to this output so a drum machine or sequencer can follow The Breakery. OFF: no clock is sent.');
  const clockState = el('div', 'label small', b, [354, 43, W - 358]);

  const sep = el('div', '', b, [4, 58, W - 10, 1]);
  sep.style.borderTop = '1px dotted var(--ink)';
  for (const [x, t] of [
    [4, 'TRACK'],
    [56, 'OUT · DEVICE · CH · NOTE'],
    [226, 'IN · DEVICE · CH · NOTE'],
  ] as const)
    el('div', 'label tiny', b, [x, 63], t);

  // ------------------------------------------------------------ one row per track
  interface Row {
    cat: Category;
    name: HTMLDivElement;
    outOn: Button;
    outDev: GemSelect;
    outCh: NumBox;
    outNote: NumBox;
    inOn: Button;
    inDev: GemSelect;
    inCh: NumBox;
    inNote: NumBox;
    learn: Button;
  }
  const rows: Row[] = CATEGORIES.map((cat, i) => {
    const y = TOP + i * ROW;
    const L = CATEGORY_LABEL[cat];
    const name = el('div', 'label small', b, [4, y + 3, 50], L);
    name.style.padding = '0 2px';
    const out = () => s().tracks[cat].out;
    const inp = () => s().tracks[cat].in;
    const outOn = new Button(b, [56, y, 22, 13], 'OUT', { cls: 'small', tip: `${L} OUT: send this track’s hits as MIDI (on: inverted)`, onPress: () => rig.setTrackOut(cat, { on: !out().on }) });
    const outDev = select(80, y, 84, `${L} output device`, (v) => rig.setTrackOut(cat, { device: v }));
    const outCh = new NumBox(b, [166, y, 20, 13], { get: () => out().channel, set: (v) => rig.setTrackOut(cat, { channel: v }), min: 1, max: 16, pxPerUnit: 6, label: `${L} output channel`, tip: `${L} OUT CHANNEL, 1–16 (General MIDI drums: 10). Also the MIDI file’s channel.` });
    const outNote = new NumBox(b, [188, y, 26, 13], { get: () => out().note, set: (v) => rig.setTrackOut(cat, { note: v }), min: 0, max: 127, pxPerUnit: 3, label: `${L} output note`, tip: '' });
    const inOn = new Button(b, [226, y, 22, 13], 'IN', { cls: 'small', tip: `${L} IN: incoming notes play this track (on: inverted)`, onPress: () => rig.setTrackIn(cat, { on: !inp().on }) });
    const inDev = select(250, y, 84, `${L} input device`, (v) => rig.setTrackIn(cat, { device: v }));
    const inCh = new NumBox(b, [336, y, 28, 13], {
      get: () => inp().channel,
      set: (v) => rig.setTrackIn(cat, { channel: v }),
      min: OMNI,
      max: 16,
      pxPerUnit: 6,
      format: (v) => (v === OMNI ? 'OMNI' : String(v)),
      label: `${L} input channel`,
      tip: `${L} IN CHANNEL: 1–16, or OMNI (type 0) for any channel`,
    });
    const inNote = new NumBox(b, [366, y, 26, 13], { get: () => inp().note, set: (v) => rig.setTrackIn(cat, { note: v }), min: 0, max: 127, pxPerUnit: 3, label: `${L} input note`, tip: '' });
    const learn = new Button(b, [394, y, 38, 13], 'LEARN', { cls: 'small', tip: `LEARN: the next note you play sets ${L}’s input note (and its channel, unless it is OMNI). Click again to cancel.`, onPress: () => rig.learn(cat) });
    return { cat, name, outOn, outDev, outCh, outNote, inOn, inDev, inCh, inNote, learn };
  });

  const note = el('div', 'label tiny', b, [4, TOP + CATEGORIES.length * ROW + 3, W - 10]);
  note.style.whiteSpace = 'normal';
  note.style.lineHeight = '8px';

  function update(): void {
    const st = s();
    const ready = rig.ready;
    onBtn.on = ready;
    onBtn.text = ready ? 'MIDI ON' : 'MIDI OFF';
    const a = rig.access;
    state.textContent = (!st.enabled ? (a.state === 'unsupported' ? a.message : 'MIDI is off. Click MIDI OFF to turn it on.') : a.message).toUpperCase();
    setTip(state, state.textContent);
    const outs = a.outputs();
    const ins = a.inputs();
    fill(outSel, st.output, [['', 'NONE']], outs);
    fill(inSel, st.input, [[ANY_PORT, 'ALL INPUTS']], ins);
    fill(clockInSel, st.clockIn, [[ANY_PORT, 'ANY INPUT']], ins);
    fill(clockOutSel, st.clockOut, [['', 'OFF']], outs);
    intBtn.on = st.clock === 'internal';
    extBtn.on = st.clock === 'external';
    const c = rig.clock;
    clockState.textContent = st.clock === 'external' ? (ready ? `${CLOCK_STATUS[c.status] ?? ''}${c.bpm ? ` ${c.bpm.toFixed(1)}` : ''}` : 'MIDI OFF') : '';
    for (const r of rows) {
      const o = st.tracks[r.cat].out;
      const i = st.tracks[r.cat].in;
      r.outOn.on = o.on;
      r.inOn.on = i.on;
      fill(r.outDev, o.device, [[DEFAULT_PORT, 'DEFAULT']], outs);
      fill(r.inDev, i.device, [[DEFAULT_PORT, 'DEFAULT'], [ANY_PORT, 'ANY']], ins);
      r.outCh.update();
      r.outNote.update();
      r.inCh.update();
      r.inNote.update();
      const conv = r.cat === 'fx' ? ' General MIDI has no effects drum: FX defaults to 27 (High Q in GM2 and GS), a convention, not a standard; set the note your sampler uses.' : r.cat === 'clap' ? ' CLAP defaults to GM Hand Clap (39).' : r.cat === 'perc' ? ' PERC defaults to GM Side Stick (37), so it never shares CLAP’s note.' : '';
      setTip(r.outNote.el, `${CATEGORY_LABEL[r.cat]} OUT NOTE: ${o.note} (${noteName(o.note)}). Also the MIDI file’s note. Type 0–127, or drag.${conv}`);
      setTip(r.inNote.el, `${CATEGORY_LABEL[r.cat]} IN NOTE: ${i.note} (${noteName(i.note)}). Tracks with the same note, channel and device play together.`);
      r.learn.on = rig.learning === r.cat;
      for (const e of [r.outDev.el, r.outCh.el, r.outNote.el]) e.style.opacity = o.on ? '1' : '0.4';
      for (const e of [r.inDev.el, r.inCh.el, r.inNote.el]) e.style.opacity = i.on ? '1' : '0.4';
    }
    note.textContent = !ready
      ? 'CHANNELS AND NOTES ALSO SET THE MIDI FILE (FILE ▸ TAKEAWAY MIDI FILE), WITH MIDI ON OR OFF.'
      : st.clock === 'external'
        ? 'FOLLOWING EXTERNAL CLOCK: START YOUR SEQUENCER TO PLAY. INCOMING NOTES PLAY THE TRACKS AT ANY TIME.'
        : 'OUT FOLLOWS SOLO AND MUTE. INCOMING NOTES PLAY THE TRACKS WHETHER OR NOT THE BREAK IS PLAYING, WITH EACH TRACK’S PICK MODE.';
  }

  /** Activity lights: a track's name inverts briefly when an incoming note plays it. */
  function tick(): void {
    if (!win.open) return;
    const t = performance.now();
    for (const r of rows) r.name.classList.toggle('inv', t - rig.activity[r.cat] < 120);
  }

  rig.onChange(() => win.open && update());
  win.close();
  return {
    win,
    update,
    tick,
    show(): void {
      update();
      win.show();
    },
    toggle(): void {
      if (win.open) win.close();
      else this.show();
    },
  };
}
