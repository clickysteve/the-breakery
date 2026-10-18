import { CATEGORIES, CATEGORY_LABEL } from '../engine/types';
import { el, label } from './dom';
import { Button, RangeBar } from './widgets';
import type { App } from '../app/app';

const db = (g: number) => g ? `${(20 * Math.log10(g)).toFixed(1)} dB` : '-∞ dB';
const panText = (p: number) => Math.abs(p) < .005 ? 'CENTRE' : `${p < 0 ? 'L' : 'R'}${Math.round(Math.abs(p) * 100)}`;
/** Compact horizontal channel strips using the existing GEM controls. */
export function mixerPanel(parent: HTMLElement, app: App, width: number) {
  const controls: { update(): void }[] = [];
  const meters: { id: string; fill: HTMLElement }[] = [];
  function meter(id: string, x: number, y: number, w: number) {
    const box = el('div', '', parent, [x, y, w, 7]);
    Object.assign(box.style, { border: '1px solid var(--ink)', overflow: 'hidden' });
    const fill = el('div', '', box);
    Object.assign(fill.style, { height: '100%', background: 'var(--ink)', transformOrigin: 'left', width: '100%', transform: 'scaleX(0)' });
    box.setAttribute('role', 'meter'); box.setAttribute('aria-label', `${id} level`);
    meters.push({ id, fill });
  }
  label(parent, 8, 6, 'CHANNEL'); label(parent, 104, 6, 'LEVEL'); label(parent, 228, 6, 'PAN');
  for (const [i, c] of CATEGORIES.entries()) {
    const y = 21 + i * 19;
    label(parent, 8, y + 3, CATEGORY_LABEL[c]);
    controls.push(new RangeBar(parent, [98, y, 116, 14], {
      get: () => app.mix[c].gain / 1.5, set: v => app.setChannel(c, v * 1.5, app.mix[c].pan),
      format: v => db(v * 1.5), label: `${c} volume`, tip: 'Channel gain: silence to +3.5 dB; unity is 0 dB.',
      parse: t => Number.isFinite(Number(t)) ? Math.max(0, Math.min(1, 10 ** (Number(t) / 20) / 1.5)) : null,
      editText: v => v ? (20 * Math.log10(v * 1.5)).toFixed(1) : '-60',
    }));
    controls.push(new RangeBar(parent, [220, y, 82, 14], {
      get: () => (app.mix[c].pan + 1) / 2, set: v => app.setChannel(c, app.mix[c].gain, v * 2 - 1),
      format: v => panText(v * 2 - 1), label: `${c} pan`, tip: 'Pan: -100 left, 0 centre, +100 right. Equal-power stereo panner.',
      parse: t => Number.isFinite(Number(t)) ? (Math.max(-100, Math.min(100, Number(t))) + 100) / 200 : null,
      editText: v => String(Math.round((v * 2 - 1) * 100)),
    }));
    const mute = new Button(parent, [309, y, 35, 14], 'MUTE', { cls: 'small', onPress: () => app.toggleMute(c) });
    const solo = new Button(parent, [348, y, 35, 14], 'SOLO', { cls: 'small', onPress: () => app.toggleSolo(c) });
    controls.push({ update: () => { mute.on = app.mix[c].mute; solo.on = app.mix[c].solo; } });
    meter(c, 390, y + 3, width - 400);
  }
  const y = 25 + CATEGORIES.length * 19;
  label(parent, 8, y + 3, 'MASTER');
  controls.push(new RangeBar(parent, [98, y, 204, 14], {
    get: () => app.player.level / 1.5, set: v => { app.player.setLevel(v * 1.5); app.changed(); },
    format: v => db(v * 1.5), label: 'Master volume', tip: 'Master gain. Watch PEAK and lower levels if it lights.',
    parse: t => Number.isFinite(Number(t)) ? Math.max(0, Math.min(1, 10 ** (Number(t) / 20) / 1.5)) : null,
    editText: v => v ? (20 * Math.log10(v * 1.5)).toFixed(1) : '-60',
  }));
  const peak = new Button(parent, [309, y, 74, 14], 'PEAK', { cls: 'small', tip: 'Peak held until clicked or playback stops.', onPress: () => { clipped = false; peak.on = false; } });
  meter('L', 390, y, width - 400); meter('R', 390, y + 9, width - 400);
  let clipped = false, last = 0;
  return {
    update: () => { controls.forEach(c => c.update()); if (!app.player.playing) { clipped = false; peak.on = false; } },
    tick: () => {
      const now = performance.now(); if (now - last < 33) return; last = now;
      for (const m of meters) {
        const v = app.player.meter(m.id);
        m.fill.style.transform = `scaleX(${Math.max(0, Math.min(1, (20 * Math.log10(Math.max(v, 1e-5)) + 54) / 54))})`;
        if ((m.id === 'L' || m.id === 'R') && v >= 1) clipped = true;
      }
      if (!app.player.playing) clipped = false;
      peak.on = clipped;
    },
  };
}
