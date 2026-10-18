/**
 * PATTERN: what the generator made. One row per drum category; each hit is drawn at its
 * PERFORMED position (grid + swing + microtiming) with its height showing velocity. Hover a hit
 * for its role and why it is there; click it to hear it. A summary line gives the recipe card.
 */
import { analyse } from '../engine/analysis';
import { swingPercent } from '../engine/performance';
import { STYLE_DEFS } from '../engine/styles';
import { CATEGORIES, CATEGORY_LABEL, STEPS, TPS, type BreakEvent } from '../engine/types';
import { esc, el, setTip, svgEl } from './dom';
import { MWindow } from './widgets';
import type { UiContext } from './context';

const ROLE_MARK: Record<string, string> = { A: 'GROOVE', A2: 'ANSWER', T: 'TURNAROUND' };

export function patternWindow(parent: HTMLElement, ui: UiContext, rect: { x: number; y: number; w: number; h: number }) {
  const { app } = ui;
  const win = new MWindow(parent, { title: 'PATTERN', ...rect });
  const b = win.body;
  const W = rect.w - 2;
  const X0 = 50;
  const Y0 = 22;
  const RH = 16;
  const GW = W - X0 - 6;
  const GH = CATEGORIES.length * RH;

  const card = el('div', 'card', b, [6, 3, W - 12]);
  CATEGORIES.forEach((c, i) => {
    const l = el('div', 'label small', b, [6, Y0 + i * RH + 4], CATEGORY_LABEL[c]);
    l.style.fontSize = '8px';
  });
  const svg = svgEl(GW + 2, GH + 22, '', 'patternsvg');
  svg.style.left = X0 + 'px';
  svg.style.top = Y0 - 10 + 'px';
  b.appendChild(svg);
  const head = el('div', '', b, [X0 + 1, Y0, 1, GH]);
  Object.assign(head.style, { position: 'absolute', background: '#fff', mixBlendMode: 'difference', display: 'none', pointerEvents: 'none' });
  const foot = el('div', 'label tiny', b, [6, Y0 + GH + 16, W - 12]);

  let shown: BreakEvent[] = [];

  svg.addEventListener('pointerdown', (ev) => {
    const t = (ev.target as Element).closest('[data-i]');
    if (!t) return;
    const e = shown[Number(t.getAttribute('data-i'))];
    if (e?.sample) void app.player.audition(e.cat, e.sample, e.vel);
  });

  function draw(): void {
    const br = app.current;
    const r = br.recipe;
    const bars = r.bars;
    const steps = bars * STEPS;
    const cw = GW / steps;
    const sixteenthMs = 60000 / r.bpm / 4;
    const top = 10;
    let s = '<defs><pattern id="dots" width="2" height="2" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="var(--ink)"/></pattern></defs>';
    // beats 2 and 4 shaded, bar lines solid, beats dotted
    for (let i = 0; i < steps; i += 4) {
      const beat = (i / 4) % 4;
      if (beat === 1 || beat === 3) s += `<rect x="${(i * cw).toFixed(2)}" y="${top}" width="${(4 * cw).toFixed(2)}" height="${GH}" fill="url(#dots)" opacity="0.18"/>`;
    }
    for (let i = 0; i <= steps; i++) {
      const x = Math.round(i * cw) + 0.5;
      if (i % STEPS === 0) s += `<line x1="${x}" y1="${top - 10}" x2="${x}" y2="${top + GH}" stroke="var(--ink)"/>`;
      else if (i % 4 === 0) s += `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + GH}" stroke="var(--ink)" stroke-dasharray="1 2"/>`;
    }
    for (let c = 0; c <= CATEGORIES.length; c++) s += `<line x1="0" y1="${top + c * RH + 0.5}" x2="${GW}" y2="${top + c * RH + 0.5}" stroke="var(--ink)" stroke-dasharray="${c === 0 || c === CATEGORIES.length ? '0' : '1 3'}"/>`;
    // bar numbers and roles
    for (let bar = 0; bar < bars; bar++) s += `<text x="${bar * STEPS * cw + 3}" y="${top - 2}" font-size="7" font-family="Silkscreen, monospace">${bar + 1} ${ROLE_MARK[br.plan[bar] ?? 'A']}</text>`;
    // beat numbers
    for (let i = 0; i < steps; i += 4) s += `<text x="${(i * cw + 2).toFixed(1)}" y="${top + GH + 9}" font-size="7" font-family="Silkscreen, monospace">${(i / 4) % 4 + 1}</text>`;

    shown = br.events;
    br.events.forEach((e, idx) => {
      const row = CATEGORIES.indexOf(e.cat);
      const pos16 = e.bar * STEPS + e.step + e.sub / TPS + e.swing + e.offsetMs / sixteenthMs;
      const w = Math.max(2, Math.min(cw * (e.sub ? 0.45 : 0.7), 9));
      const x = pos16 * cw + 1;
      const h = Math.max(2, Math.round((e.vel / 127) * (RH - 3)));
      const y = top + row * RH + RH - h;
      const timing = `${e.swing ? ` · swing +${Math.round(e.swing * sixteenthMs)} ms` : ''}${e.offsetMs ? ` · ${e.offsetMs > 0 ? '+' : ''}${e.offsetMs.toFixed(1)} ms` : ''}`;
      const tip = `${CATEGORY_LABEL[e.cat]} · bar ${e.bar + 1} · ${Math.floor(e.step / 4) + 1}.${(e.step % 4) + 1}${e.sub ? ' + 32nd' : ''} · velocity ${e.vel}${timing}\n${e.why}${e.sample ? ` · ${app.ingredients.name(e.sample)}` : ' · NO SAMPLE (silent)'}`;
      const fill = e.sample ? 'var(--ink)' : 'none';
      s += `<rect class="hit" data-i="${idx}" data-tip="${esc(tip)}" x="${x.toFixed(2)}" y="${y}" width="${w.toFixed(2)}" height="${h}" fill="${fill}" stroke="var(--ink)" stroke-width="${e.sample ? 0 : 1}" ${e.sample ? '' : 'stroke-dasharray="1 1"'}/>`;
    });
    svg.innerHTML = s;

    const st = analyse(br.events, bars);
    const def = STYLE_DEFS[r.style];
    card.textContent = `${def.label} · ${r.bpm} BPM · ${bars} BAR${bars > 1 ? 'S' : ''} · SWING ${Math.round(swingPercent(r.swing))}% · SEED ${br.seeds.beat} · ${st.hits} HITS · SYNC ${st.sync.toFixed(1)} · ${br.timekeeper === 'ride' ? 'RIDE' : 'HATS'} KEEP TIME`;
    setTip(card, `The recipe card. SYNC is the kick/snare syncopation per bar (Longuet-Higgins & Lee style). Seeds: beat ${br.seeds.beat}, detail ${br.seeds.detail}, feel ${br.seeds.feel}, kit ${br.seeds.kit}. Feel: snare ${br.feel.snare >= 0 ? '+' : ''}${br.feel.snare.toFixed(1)} ms, hats ${br.feel.hats >= 0 ? '+' : ''}${br.feel.hats.toFixed(1)} ms, kick ${br.feel.kick >= 0 ? '+' : ''}${br.feel.kick.toFixed(1)} ms.`);
    const silent = CATEGORIES.filter((c) => br.events.some((e) => e.cat === c && !e.sample));
    foot.textContent = silent.length ? `NO SAMPLE FOR: ${silent.map((c) => CATEGORY_LABEL[c]).join(', ')} (DOTTED HITS ARE SILENT)` : 'HOVER A HIT TO SEE WHY IT IS THERE · CLICK TO HEAR IT · HEIGHT = VELOCITY · OFFSET = SWING + FEEL';
  }

  function tick(): void {
    const p = app.player.position();
    const pb = app.player.break;
    if (!p || pb !== app.current) {
      // stopped, or the shown break is queued for the next loop
      if (!p) head.style.display = 'none';
      else {
        head.style.display = 'block';
        head.style.opacity = '0.4';
        head.style.left = X0 + 1 + p.frac * GW + 'px';
      }
      return;
    }
    head.style.display = 'block';
    head.style.opacity = '1';
    head.style.left = X0 + 1 + p.frac * GW + 'px';
  }

  draw();
  return { update: draw, tick, win };
}
