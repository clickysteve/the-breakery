/**
 * MIXER: one row per drum category (TRACK · LEVEL · PAN · MUTE · SOLO · METER) and the master
 * below a rule. Laid out as one CSS grid, so the headings, every channel row and the master's
 * columns line up by construction, whatever the window's width. The controls are the usual GEM
 * range bars and buttons; the audio routing is the player's (app.setChannel, toggleMute/Solo).
 */
import { CATEGORIES, CATEGORY_LABEL } from '../engine/types';
import { el, setTip } from './dom';
import { Button, RangeBar } from './widgets';
import type { App } from '../app/app';

const db = (g: number) => (g ? `${(20 * Math.log10(g)).toFixed(1)} dB` : '-∞ dB');
const panText = (p: number) => (Math.abs(p) < 0.005 ? 'CENTRE' : `${p < 0 ? 'L' : 'R'}${Math.round(Math.abs(p) * 100)}`);
const dbParse = (t: string) => (t.trim() && Number.isFinite(Number(t)) ? Math.max(0, Math.min(1, 10 ** (Number(t) / 20) / 1.5)) : null);
const dbEdit = (v: number) => (v ? (20 * Math.log10(v * 1.5)).toFixed(1) : '-60');
/** meter scale: -54 dBFS .. 0 dBFS */
const meterFrac = (v: number) => Math.max(0, Math.min(1, (20 * Math.log10(Math.max(v, 1e-5)) + 54) / 54));

export function mixerPanel(parent: HTMLElement, app: App, rect: { w: number; h: number }) {
  const grid = el('div', 'mixgrid', parent, [6, 4, rect.w - 12]);
  grid.setAttribute('role', 'table');
  grid.setAttribute('aria-label', 'Mixer');
  const controls: { update(): void }[] = [];
  const meters: { id: string; fill: HTMLElement }[] = [];
  const cell = (cls = '') => el('div', 'cell ' + cls, grid);
  function meter(host: HTMLElement, id: string, label: string, half = false): void {
    const box = el('div', 'meter' + (half ? ' half' : ''), host);
    box.setAttribute('role', 'meter');
    box.setAttribute('aria-label', label);
    // -12 and -6 dBFS marks
    for (const d of [-12, -6]) el('div', 'mtick', box).style.left = `${Math.round(meterFrac(10 ** (d / 20)) * 100)}%`;
    meters.push({ id, fill: el('div', 'mfill', box) });
  }

  for (const h of ['TRACK', 'LEVEL', 'PAN', 'MUTE', 'SOLO', 'METER']) el('div', 'mhead', grid, undefined, h).setAttribute('role', 'columnheader');

  const names = CATEGORIES.map((c) => {
    const name = el('div', 'mname', grid, undefined, CATEGORY_LABEL[c]);
    name.setAttribute('role', 'rowheader');
    controls.push(
      new RangeBar(cell(), [0, 0], {
        get: () => app.mix[c].gain / 1.5,
        set: (v) => app.setChannel(c, v * 1.5, app.mix[c].pan),
        format: (v) => db(v * 1.5),
        parse: dbParse,
        editText: dbEdit,
        label: `${c} volume`,
        tip: `${CATEGORY_LABEL[c]} LEVEL: silence to +3.5 dB; 0 dB is unity. Changes are heard at once, and TAKEAWAY and its stems follow them. Type a value in dB.`,
      }),
    );
    controls.push(
      new RangeBar(cell(), [0, 0], {
        get: () => (app.mix[c].pan + 1) / 2,
        set: (v) => app.setChannel(c, app.mix[c].gain, Math.abs(v - 0.5) < 0.02 ? 0 : v * 2 - 1),
        format: (v) => panText(v * 2 - 1),
        parse: (t) => (t.trim() && Number.isFinite(Number(t)) ? (Math.max(-100, Math.min(100, Number(t))) + 100) / 200 : null),
        editText: (v) => String(Math.round((v * 2 - 1) * 100)),
        origin: 0.5,
        label: `${c} pan`,
        tip: `${CATEGORY_LABEL[c]} PAN: L100 to R100, CENTRE snaps. Equal-power. Type −100 to 100.`,
      }),
    );
    const mute = new Button(cell(), [0, 0], 'MUTE', { cls: 'small', tip: `MUTE ${CATEGORY_LABEL[c]}: silence it, also while soloed. Playback, MIDI out and TAKEAWAY follow; the break itself does not change.`, onPress: () => app.toggleMute(c) });
    const solo = new Button(cell(), [0, 0], 'SOLO', { cls: 'small', tip: `SOLO ${CATEGORY_LABEL[c]}: hear only the soloed tracks (several can be soloed). Playback, MIDI out and TAKEAWAY follow.`, onPress: () => app.toggleSolo(c) });
    controls.push({
      update: () => {
        mute.on = app.mix[c].mute;
        solo.on = app.mix[c].solo;
      },
    });
    meter(cell(), c, `${CATEGORY_LABEL[c]} meter`);
    return { c, name };
  });

  el('div', 'msep', grid);
  el('div', 'mname', grid, undefined, 'MASTER').setAttribute('role', 'rowheader');
  controls.push(
    new RangeBar(cell(), [0, 0], {
      get: () => app.player.level / 1.5,
      set: (v) => {
        app.player.setLevel(v * 1.5);
        app.changed();
      },
      format: (v) => db(v * 1.5),
      parse: dbParse,
      editText: dbEdit,
      label: 'Master volume',
      tip: 'MASTER LEVEL, for playback and TAKEAWAY alike (the LEVEL in BAKE is the same control). Watch PEAK: lower the levels if it lights.',
    }),
  );
  const out = el('div', 'mhead', cell(), undefined, 'OUTPUT L / R');
  out.style.cssText = 'position:absolute;right:0;top:4px';
  const peak = new Button(cell('span2'), [0, 0], 'PEAK', {
    cls: 'small',
    tip: 'PEAK lights when the output reaches full scale, and stays lit until clicked or playback stops.',
    onPress: () => {
      clipped = false;
      peak.on = false;
    },
  });
  const outCell = cell();
  meter(outCell, 'L', 'Output left', true);
  meter(outCell, 'R', 'Output right', true);
  const note = el('div', 'label tiny', parent, [6, rect.h - 12, rect.w - 12], 'TAKEAWAY, STEMS AND MIDI OUT FOLLOW LEVEL · PAN · MUTE · SOLO · CLICK A NUMBER TO TYPE IT');
  setTip(note, 'Bake ▸ Clear Solo / Mute resets every MUTE and SOLO.');

  let clipped = false;
  let last = 0;
  return {
    update: () => {
      controls.forEach((c) => c.update());
      names.forEach(({ c, name }) => name.classList.toggle('silent', !app.audible(c)));
      if (!app.player.playing) {
        clipped = false;
        peak.on = false;
      }
    },
    tick: () => {
      const now = performance.now();
      if (now - last < 33) return;
      last = now;
      for (const m of meters) {
        const v = app.player.meter(m.id);
        m.fill.style.transform = `scaleX(${meterFrac(v)})`;
        if ((m.id === 'L' || m.id === 'R') && v >= 1) clipped = true;
      }
      if (!app.player.playing) clipped = false;
      peak.on = clipped;
    },
  };
}
