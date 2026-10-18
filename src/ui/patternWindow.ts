/**
 * PATTERN: what the generator made. One row per drum category, with SOLO (S) and MUTE (M); each
 * hit is drawn at its PERFORMED position (grid + swing + microtiming) with its height showing
 * velocity. Hover a hit for its role, why it is there and why it plays that sample; click it to
 * hear it. Rows that SOLO / MUTE silence are drawn faint (the events are unchanged). Patterns
 * longer than four bars can be viewed whole or four bars at a time.
 */
import { analyse } from '../engine/analysis';
import { swingPercent } from '../engine/performance';
import { STYLE_DEFS } from '../engine/styles';
import { CATEGORIES, CATEGORY_LABEL, STEPS, TPS, type BreakEvent, type Category } from '../engine/types';
import { anySolo } from '../app/mix';
import { esc, el, setTip, svgEl } from './dom';
import { Button, MWindow } from './widgets';
import type { UiContext } from './context';

const ROLE_MARK: Record<string, string> = { A: 'GROOVE', A2: 'ANSWER', B: 'DEVELOP', F: 'FILL', T: 'TURNAROUND' };
const SHORT: Record<Category, string> = { kick: 'KICK', snare: 'SNARE', ghost: 'GHOST', hat: 'HAT', open: 'OPEN', ride: 'RIDE', crash: 'CRASH', perc: 'PERC' };
const CYCLE: Record<string, string> = { beats: 'ACCENTS ON BEATS', offbeats: 'OFF-BEAT ACCENTS', alternate: 'ALTERNATE 16THS', backbeat: 'ACCENTS WITH THE BACKBEAT', tresillo: '3+3+2 ACCENTS' };

export function patternWindow(parent: HTMLElement, ui: UiContext, rect: { x: number; y: number; w: number; h: number }) {
  const { app } = ui;
  const win = new MWindow(parent, { title: 'PATTERN', ...rect });
  const b = win.body;
  const W = rect.w - 2;
  const X0 = 70;
  const Y0 = 22;
  const RH = 16;
  const GW = W - X0 - 6;
  const GH = CATEGORIES.length * RH;
  /** null = every bar; otherwise the first bar of a four-bar page */
  let page: number | null = null;

  const card = el('div', 'card', b, [6, 3, W - 12]);
  const pageBtns = [null, 0, 4].map((p, i) =>
    new Button(b, [W - 6 - (3 - i) * 26, 1, 24, 11], p === null ? 'ALL' : `${p + 1}–${p + 4}`, {
      cls: 'small',
      tip: p === null ? 'Show every bar' : `Show bars ${p + 1}–${p + 4} at full size`,
      onPress: () => {
        page = p;
        draw();
      },
    }),
  );
  const rowCtl = CATEGORIES.map((c, i) => {
    const l = el('div', 'label small', b, [6, Y0 + i * RH + 4], SHORT[c]);
    l.style.fontSize = '8px';
    setTip(l, CATEGORY_LABEL[c]);
    const s = new Button(b, [42, Y0 + i * RH + 2, 12, 12], 'S', { cls: 'small sm', tip: `SOLO ${CATEGORY_LABEL[c]}: hear only the soloed rows (several can be soloed; SOLO wins over MUTE). Playback changes at once; the break itself does not change.`, onPress: () => app.toggleSolo(c) });
    const m = new Button(b, [55, Y0 + i * RH + 2, 12, 12], 'M', { cls: 'small sm', tip: `MUTE ${CATEGORY_LABEL[c]}: silence this row (unless a row is soloed). Playback changes at once; the break itself does not change.`, onPress: () => app.toggleMute(c) });
    return { l, s, m };
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

  /** The bars on screen: [first, count]. */
  function view(): [number, number] {
    const bars = app.current.recipe.bars;
    if (page === null || bars <= 4 || page >= bars) return [0, bars];
    return [page, Math.min(4, bars - page)];
  }

  function draw(): void {
    const br = app.current;
    const r = br.recipe;
    const bars = r.bars;
    if (bars <= 4) page = null;
    const [b0, nb] = view();
    const steps = nb * STEPS;
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
      else if (i % 4 === 0 && cw * 4 >= 6) s += `<line x1="${x}" y1="${top}" x2="${x}" y2="${top + GH}" stroke="var(--ink)" stroke-dasharray="1 2"/>`;
    }
    for (let c = 0; c <= CATEGORIES.length; c++) s += `<line x1="0" y1="${top + c * RH + 0.5}" x2="${GW}" y2="${top + c * RH + 0.5}" stroke="var(--ink)" stroke-dasharray="${c === 0 || c === CATEGORIES.length ? '0' : '1 3'}"/>`;
    // silenced rows: a faint wash
    CATEGORIES.forEach((c, i) => {
      if (!app.audible(c)) s += `<rect x="0" y="${top + i * RH + 1}" width="${GW}" height="${RH - 1}" fill="url(#dots)" opacity="0.35"/>`;
    });
    // bar numbers and roles (short names when bars are narrow)
    const barW = STEPS * cw;
    for (let k = 0; k < nb; k++) {
      const bar = b0 + k;
      const role = br.plan[bar] ?? 'A';
      const mark = barW >= 70 ? ROLE_MARK[role] : role;
      s += `<text x="${k * barW + 3}" y="${top - 2}" font-size="7" font-family="Silkscreen, monospace">${bar + 1}${barW >= 30 ? ' ' + mark : ''}</text>`;
    }
    // beat numbers (only when there is room)
    if (cw * 4 >= 8) for (let i = 0; i < steps; i += 4) s += `<text x="${(i * cw + 2).toFixed(1)}" y="${top + GH + 9}" font-size="7" font-family="Silkscreen, monospace">${(i / 4) % 4 + 1}</text>`;

    shown = br.events;
    br.events.forEach((e, idx) => {
      if (e.bar < b0 || e.bar >= b0 + nb) return;
      const row = CATEGORIES.indexOf(e.cat);
      const pos16 = (e.bar - b0) * STEPS + e.step + e.sub / TPS + e.swing + e.offsetMs / sixteenthMs;
      const w = Math.max(1.5, Math.min(cw * (e.sub ? 0.45 : 0.7), 9));
      const x = pos16 * cw + 1;
      const h = Math.max(2, Math.round((e.vel / 127) * (RH - 3)));
      const y = top + row * RH + RH - h;
      const timing = `${e.swing ? ` · swing +${Math.round(e.swing * sixteenthMs)} ms` : ''}${e.offsetMs ? ` · ${e.offsetMs > 0 ? '+' : ''}${e.offsetMs.toFixed(1)} ms` : ''}`;
      const sub = e.sub ? (e.sub === 6 ? ' + 32nd' : ` + ${e.sub}/12`) : '';
      const sample = e.sample ? `\nSample: ${app.ingredients.name(e.sample)}${e.sampleWhy ? ` (${e.sampleWhy})` : ''}` : '\nNO SAMPLE (silent)';
      const tip = `${CATEGORY_LABEL[e.cat]} · bar ${e.bar + 1} · ${Math.floor(e.step / 4) + 1}.${(e.step % 4) + 1}${sub} · velocity ${e.vel}${timing}\n${e.why}${sample}${app.audible(e.cat) ? '' : '\n(silenced by SOLO / MUTE)'}`;
      const fill = e.sample ? 'var(--ink)' : 'none';
      const faint = app.audible(e.cat) ? '' : ' opacity="0.35"';
      s += `<rect class="hit" data-i="${idx}" data-tip="${esc(tip)}" x="${x.toFixed(2)}" y="${y}" width="${w.toFixed(2)}" height="${h}" fill="${fill}" stroke="var(--ink)" stroke-width="${e.sample ? 0 : 1}" ${e.sample ? '' : 'stroke-dasharray="1 1"'}${faint}/>`;
    });
    svg.innerHTML = s;

    const st = analyse(br.events, bars);
    const def = STYLE_DEFS[r.style];
    const long = bars > 4;
    card.style.width = `${W - 12 - (long ? 84 : 0)}px`;
    pageBtns.forEach((p, i) => {
      p.el.style.display = long ? '' : 'none';
      p.on = [null, 0, 4][i] === page;
      if (i === 2) p.disabled = bars <= 4;
    });
    const mut = br.seeds.mut?.length ? ` +${br.seeds.mut.length}` : '';
    card.textContent = `${def.label} · ${r.bpm} BPM · ${bars} BAR${bars > 1 ? 'S' : ''} · SWING ${Math.round(swingPercent(r.swing))}% · SEED ${app.seedText}${mut} · ${st.hits} HITS · SYNC ${st.sync.toFixed(1)}${long ? '' : ` · ${br.timekeeper === 'ride' ? 'RIDE' : 'HATS'}`} · E${r.engine}`;
    setTip(
      card,
      `The recipe card. SYNC is the kick/snare syncopation per bar (Longuet-Higgins & Lee style). Phrase: ${br.plan.join(' ')}. Seeds: beat ${br.seeds.beat}, detail ${br.seeds.detail}, feel ${br.seeds.feel}, kit ${br.seeds.kit}${mut ? `, ${br.seeds.mut!.length} mutation(s)` : ''}. ${br.timekeeper === 'ride' ? 'Ride' : 'Hats'} keep time${br.feel.cycle ? `, ${CYCLE[br.feel.cycle]?.toLowerCase()}` : ''}. Feel: snare ${br.feel.snare >= 0 ? '+' : ''}${br.feel.snare.toFixed(1)} ms (on 2; less on 4), hats ${br.feel.hats >= 0 ? '+' : ''}${br.feel.hats.toFixed(1)} ms, kick ${br.feel.kick >= 0 ? '+' : ''}${br.feel.kick.toFixed(1)} ms. Engine ${r.engine}.`,
    );
    const solo = anySolo(app.mix);
    rowCtl.forEach((rc, i) => {
      const c = CATEGORIES[i]!;
      rc.s.on = app.mix[c].solo;
      rc.m.on = app.mix[c].mute;
      rc.l.style.opacity = app.audible(c) ? '1' : '0.45';
      rc.m.el.classList.toggle('overridden', solo && app.mix[c].mute);
    });
    const silent = CATEGORIES.filter((c) => br.events.some((e) => e.cat === c && !e.sample));
    const muted = CATEGORIES.filter((c) => !app.audible(c) && br.events.some((e) => e.cat === c));
    foot.textContent = silent.length
      ? `NO SAMPLE FOR: ${silent.map((c) => CATEGORY_LABEL[c]).join(', ')} (DOTTED HITS ARE SILENT)`
      : muted.length
        ? `SILENCED BY ${solo ? 'SOLO' : 'MUTE'}: ${muted.map((c) => CATEGORY_LABEL[c]).join(', ')} · TAKEAWAY: FULL OR AUDIBLE MIX`
        : 'HOVER A HIT: WHY IT IS THERE · CLICK: HEAR IT · HEIGHT = VELOCITY · OFFSET = SWING + FEEL';
  }

  function tick(): void {
    const p = app.player.position();
    const pb = app.player.break;
    if (!p) {
      head.style.display = 'none';
      return;
    }
    const [b0, nb] = view();
    const bars = pb?.recipe.bars ?? 1;
    const at = p.frac * bars - b0; // bars from the view's start
    if (at < 0 || at >= nb) {
      head.style.display = 'none';
      return;
    }
    head.style.display = 'block';
    // the shown break is queued for the next loop: a faint playhead
    head.style.opacity = pb !== app.current ? '0.4' : '1';
    head.style.left = X0 + 1 + (at / nb) * GW + 'px';
  }

  draw();
  return { update: draw, tick, win };
}
