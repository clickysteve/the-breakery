/**
 * BATCH: the candidates of the last BATCH, as miniature grids. Click one (or press 1–8) to
 * audition it; while playing it starts at the next loop point.
 */
import { BATCH_SIZE } from '../app/app';
import { STEPS, type Break, type Category } from '../engine/types';
import { el, setTip, svgEl } from './dom';
import { MWindow } from './widgets';
import type { UiContext } from './context';

const MINI_ROWS: Category[][] = [['kick'], ['snare'], ['ghost'], ['htom', 'mtom', 'ltom'], ['hat', 'ride', 'open']];

function mini(b: Break, w: number, h: number): string {
  const steps = b.recipe.bars * STEPS;
  const cw = w / steps;
  const rh = h / MINI_ROWS.length;
  let s = '';
  for (let i = STEPS; i < steps; i += STEPS) s += `<line x1="${Math.round(i * cw) + 0.5}" y1="0" x2="${Math.round(i * cw) + 0.5}" y2="${h}" stroke="var(--ink)" stroke-dasharray="1 1"/>`;
  for (const e of b.events) {
    const r = MINI_ROWS.findIndex((cats) => cats.includes(e.cat));
    if (r < 0) continue;
    const hh = Math.max(1, Math.round((e.vel / 127) * (rh - 1)));
    s += `<rect x="${((e.bar * STEPS + e.step) * cw).toFixed(2)}" y="${(r + 1) * rh - hh}" width="${Math.max(1, cw - 0.4).toFixed(2)}" height="${hh}" fill="var(--hits)"/>`;
  }
  return s;
}

export function batchWindow(parent: HTMLElement, ui: UiContext, rect: { x: number; y: number; w: number; h: number }) {
  const { app } = ui;
  const win = new MWindow(parent, { title: 'BATCH', ...rect });
  const b = win.body;
  const W = rect.w - 2;
  const gap = 4;
  // a row of eight in a wide window, or a grid of columns in a narrow one
  const cols = W >= 400 ? BATCH_SIZE : 2;
  const rows = Math.ceil(BATCH_SIZE / cols);
  const cw = Math.floor((W - 8 - gap * (cols - 1)) / cols);
  const ch = Math.min(64, Math.floor((rect.h - 18 - 8 - gap * (rows - 1)) / rows));
  const note = el('div', 'empty-note', b, [8, 12, W - 16]);
  note.textContent = 'Press BATCH (or N) to bake eight candidates from the recipe. Audition them here and keep the one you want; FREEZE keeps chosen layers across the batch.';
  const boxes = Array.from({ length: BATCH_SIZE }, (_, i) => {
    const box = el('div', 'candidate', b, [4 + (i % cols) * (cw + gap), 4 + Math.floor(i / cols) * (ch + gap), cw, ch]);
    box.setAttribute('role', 'button');
    const svg = svgEl(cw - 4, ch - 14);
    Object.assign(svg.style, { position: 'absolute', left: '2px', top: '2px' });
    box.appendChild(svg);
    const lab = el('div', 'clabel', box);
    box.addEventListener('pointerdown', () => app.pick(i));
    return { box, svg, lab };
  });

  function update(): void {
    const has = app.batch.length > 0;
    note.style.display = has ? 'none' : 'block';
    boxes.forEach((x, i) => {
      const c = app.batch[i];
      x.box.style.display = c ? 'block' : 'none';
      if (!c) return;
      x.svg.innerHTML = mini(c, cw - 4, ch - 14);
      x.lab.textContent = `${i + 1} · ${c.seeds.beat}`;
      x.box.classList.toggle('current', app.picked === i);
      x.box.classList.toggle('queued', app.picked === i && app.player.queued);
      setTip(x.box, `Candidate ${i + 1} (seed ${c.seeds.beat}): click or press ${i + 1} to audition`);
    });
  }
  update();
  return { update, win };
}
