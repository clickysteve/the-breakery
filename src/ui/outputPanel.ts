/**
 * OUTPUT: the master output chain (audio/output.ts), after the MIXER and before MASTER LEVEL.
 *
 * Left: the chain, one row per stage in signal order (select it · ON · ▲ ▼ · REMOVE), with
 * + ADD ENGINE and BYPASS ALL. Right: the selected stage's engine (click its name to swap it for
 * another) and its parameters. Bottom: presets. Every control is built from the engines'
 * parameter descriptions (Slop Factory Core), never from a list of known engines: a new engine
 * in Core appears here with its controls and no change to this file. A stage saved by another
 * application with an engine The Breakery does not have is kept, shown as UNAVAILABLE (it passes
 * audio through) and can be removed.
 */
import { formatParam, matchChainPreset, presetsFor, type AudioEngineDef, type ParamDef, type StageConfig } from '@slopfactory/core/engines';
import { OUTPUT_ENGINES } from '../audio/output';
import { el, setTip } from './dom';
import { Button, RangeBar } from './widgets';
import type { App } from '../app/app';

const up = (s: string) => s.toUpperCase();
const ROW = 16;
const LEFT_W = 280;

interface MenuItem {
  label: string;
  tip?: string;
  checked?: boolean;
  disabled?: boolean;
  action: () => void;
}

/** A GEM drop-down under `anchor`, inside `host` (the same look as the menu bar's). */
function dropdown(host: HTMLElement, anchor: HTMLElement, items: MenuItem[]): void {
  host.querySelector('.dropdown.outmenu')?.remove();
  const drop = el('div', 'dropdown outmenu', host);
  drop.setAttribute('role', 'menu');
  drop.style.left = anchor.offsetLeft + 'px';
  drop.style.top = anchor.offsetTop + anchor.offsetHeight + 'px';
  drop.style.minWidth = Math.max(anchor.offsetWidth, 120) + 'px';
  const close = () => {
    drop.remove();
    window.removeEventListener('pointerdown', close);
  };
  drop.addEventListener('pointerdown', (e) => e.stopPropagation());
  for (const it of items) {
    const d = el('div', 'item' + (it.checked ? ' checked' : '') + (it.disabled ? ' disabled' : ''), drop);
    d.setAttribute('role', 'menuitem');
    el('span', '', d, undefined, it.label);
    if (it.tip) setTip(d, it.tip);
    d.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      if (it.disabled) return;
      close();
      it.action();
    });
  }
  setTimeout(() => window.addEventListener('pointerdown', close), 0);
}

/** A parameter's control, from its description. Returns something to refresh it with. */
function paramControl(host: HTMLElement, rect: [number, number, number, number], def: ParamDef, get: () => number | boolean | string, set: (v: number | boolean | string) => void, menuHost: HTMLElement): { update(): void } {
  const [x, y, w, h] = rect;
  const name = up(def.label);
  if (def.type === 'continuous' || def.type === 'integer') {
    const log = def.type === 'continuous' && def.scale === 'log' && def.min > 0;
    const toFrac = (v: number) => (log ? Math.log(v / def.min) / Math.log(def.max / def.min) : (v - def.min) / (def.max - def.min));
    const fromFrac = (f: number) => {
      const raw = log ? def.min * Math.pow(def.max / def.min, f) : def.min + f * (def.max - def.min);
      const step = def.type === 'integer' ? 1 : (def.step ?? 0);
      const v = step ? Math.round(raw / step) * step : raw;
      return Math.max(def.min, Math.min(def.max, v));
    };
    const unit = def.unit ? ` ${up(def.unit)}` : '';
    const bar = new RangeBar(host, [x, y, w, h], {
      get: () => toFrac(Number(get())),
      set: (f) => set(fromFrac(f)),
      format: (f) => up(formatParam(def, fromFrac(f))),
      parse: (t) => {
        const n = Number(t);
        return t.trim() && Number.isFinite(n) ? toFrac(Math.max(def.min, Math.min(def.max, n))) : null;
      },
      editText: (f) => String(fromFrac(f)),
      label: def.label,
      tip: `${name}: ${def.min}–${def.max}${unit}${def.neutral !== undefined ? ` (${def.neutral} = OFF)` : ''}${def.description ? `. ${def.description}` : ''}. Heard at once. Type a value.`,
    });
    return bar;
  }
  if (def.type === 'boolean') {
    const b = new Button(host, [x, y, 40, h], 'OFF', { cls: 'small', tip: `${name}${def.description ? `: ${def.description}` : ''}`, onPress: () => set(!get()) });
    return {
      update: () => {
        b.on = !!get();
        b.text = get() ? 'ON' : 'OFF';
      },
    };
  }
  const opts = def.options;
  if (opts.length <= 4) {
    // a few choices: one button each, the current one inverted
    const bw = Math.floor((w - (opts.length - 1) * 2) / opts.length);
    const btns = opts.map((o, i) => new Button(host, [x + i * (bw + 2), y, bw, h], up(o.label), { cls: 'small', tip: `${name}: ${up(o.label)}${o.description ? `, ${o.description}` : ''}`, onPress: () => set(o.value) }));
    return { update: () => btns.forEach((b, i) => (b.on = get() === opts[i]!.value)) };
  }
  // many choices: ◀ [current ▾] ▶
  const step = (d: number) => {
    const i = opts.findIndex((o) => o.value === get());
    set(opts[(i + d + opts.length) % opts.length]!.value);
  };
  new Button(host, [x, y, 14, h], '◀', { cls: 'small', tip: `Previous ${name}`, onPress: () => step(-1) });
  const cur = new Button(host, [x + 16, y, w - 32, h], '', {
    cls: 'small',
    tip: `${name}: click for the list`,
    onPress: () => dropdown(menuHost, cur.el, opts.map((o) => ({ label: up(o.label), tip: o.description, checked: o.value === get(), action: () => set(o.value) }))),
  });
  new Button(host, [x + w - 14, y, 14, h], '▶', { cls: 'small', tip: `Next ${name}`, onPress: () => step(1) });
  return {
    update: () => {
      const o = opts.find((p) => p.value === get());
      cur.text = `${up(o?.label ?? String(get()))} ▾`;
      cur.tip = `${name}: ${up(o?.label ?? '')}${o?.description ? `, ${o.description}` : ''}. Click for the list; ◀ ▶ step.`;
    },
  };
}

export function outputPanel(parent: HTMLElement, app: App, rect: { w: number; h: number }) {
  const W = rect.w;
  const H = rect.h;
  const chain = app.output;
  const RX = LEFT_W + 14;
  const RW = W - RX - 6;
  let selected: string | null = chain.stages[0]?.id ?? null;

  // ------------------------------------------------------------ fixed: header, presets, footer
  el('div', 'label head', parent, [6, 5], 'OUTPUT CHAIN');
  const add = new Button(parent, [LEFT_W - 140, 2, 84, 13], '+ ADD ENGINE', {
    cls: 'small',
    tip: 'Add an engine to the end of the chain (up to 8). Each engine processes what comes out of the one above it.',
    onPress: () =>
      dropdown(
        parent,
        add.el,
        chain.available().map((e) => ({
          label: up(e.name),
          tip: e.description,
          disabled: !chain.canAdd,
          action: () => {
            selected = chain.add(e.id) ?? selected;
          },
        })),
      ),
  });
  const bypass = new Button(parent, [LEFT_W - 52, 2, 52, 13], 'BYPASS ALL', { cls: 'small', tip: 'BYPASS ALL: hear the mix without OUTPUT (settings kept). Crossfaded, no click.', onPress: () => chain.setBypass(!chain.config.bypass) });
  const rowsHost = el('div', '', parent, [0, 20, LEFT_W + 6, ROW * 8]);
  rowsHost.style.position = 'absolute';
  const empty = el('div', 'empty-note', parent, [6, 26, LEFT_W - 6]);
  empty.textContent = 'No engines: the break plays exactly as mixed. + ADD ENGINE puts one after the MIXER and before MASTER LEVEL, for playback and the TAKEAWAY mix alike.';
  const flow = el('div', 'label tiny', parent, [6, 20 + ROW * 8 + 6, LEFT_W]);
  const vrule = el('div', 'rule', parent, [RX - 7, 4, 0, 20 + ROW * 8 + 10]);
  Object.assign(vrule.style, { borderTop: 'none', borderLeft: '1px dotted var(--ink)', height: `${20 + ROW * 8 + 10}px` });
  const detail = el('div', '', parent, [RX, 0, RW, 20 + ROW * 8 + 14]);
  detail.style.position = 'absolute';

  const py = H - 52;
  el('div', 'rule', parent, [6, py - 4, W - 12]);
  el('div', 'label head', parent, [6, py + 1], 'PRESETS');
  const presets = presetsFor(OUTPUT_ENGINES);
  const pw = Math.floor((W - 12 - 58 - (presets.length - 1) * 3) / presets.length);
  const presetBtns = presets.map((p, i) =>
    new Button(parent, [64 + i * (pw + 3), py - 1, pw, 14], p.label, {
      cls: 'small',
      tip: `${p.label}: ${p.description} Replaces the chain.`,
      onPress: () => {
        chain.applyPreset(p);
        selected = chain.stages[0]?.id ?? null;
      },
    }),
  );
  const warn = el('div', 'label tiny', parent, [6, H - 30, W - 12]);
  el('div', 'label tiny', parent, [6, H - 18, W - 12], 'MASTER OUTPUT: AFTER THE MIXER, BEFORE MASTER LEVEL · PLAYBACK AND THE TAKEAWAY MIX FOLLOW · STEMS, PREVIEWS AND MIDI ARE NEVER PROCESSED');

  // ------------------------------------------------------------ dynamic: rows and the selected stage
  let controls: { update(): void }[] = [];
  let shape = '';

  function stageRow(s: StageConfig, i: number): void {
    const y = i * ROW;
    const def = chain.engine(s);
    el('div', 'label small', rowsHost, [6, y + 3], String(i + 1));
    const name = new Button(rowsHost, [18, y, 138, 14], def ? up(def.name) : 'UNAVAILABLE', {
      cls: 'small',
      tip: def ? `${up(def.name)}: ${def.description} Click to edit it on the right.` : `UNAVAILABLE: "${s.engine}" is not an engine The Breakery has (saved by another application). It passes audio through; REMOVE deletes it.`,
      onPress: () => {
        selected = s.id;
        update();
      },
    });
    if (!def) name.el.style.borderStyle = 'dotted';
    const on = new Button(rowsHost, [160, y, 24, 14], 'ON', { cls: 'small', tip: 'ON: this engine processes; off, it is bypassed (settings kept). Crossfaded, no click.', onPress: () => chain.setEnabled(s.id, !chain.stage(s.id)!.enabled) });
    const upB = new Button(rowsHost, [188, y, 14, 14], '▲', { cls: 'small', tip: 'Move up (earlier in the chain)', onPress: () => chain.move(s.id, -1) });
    const dn = new Button(rowsHost, [204, y, 14, 14], '▼', { cls: 'small', tip: 'Move down (later in the chain)', onPress: () => chain.move(s.id, 1) });
    new Button(rowsHost, [222, y, 52, 14], 'REMOVE', {
      cls: 'small',
      tip: 'Remove this engine from the chain',
      onPress: () => {
        const idx = chain.stages.findIndex((x) => x.id === s.id);
        chain.remove(s.id);
        if (selected === s.id) selected = chain.stages[Math.min(idx, chain.stages.length - 1)]?.id ?? null;
      },
    });
    controls.push({
      update: () => {
        const cur = chain.stage(s.id);
        if (!cur) return;
        name.on = selected === s.id;
        on.on = cur.enabled;
        on.disabled = !def;
        const k = chain.stages.findIndex((x) => x.id === s.id);
        upB.disabled = k === 0;
        dn.disabled = k === chain.stages.length - 1;
      },
    });
  }

  function stageDetail(s: StageConfig, i: number, def: AudioEngineDef | undefined): void {
    if (!def) {
      el('div', 'label head', detail, [0, 5], `${i + 1} · UNAVAILABLE`);
      el('div', 'empty-note', detail, [0, 22, RW], `"${s.engine}" was saved by an application with an engine The Breakery does not have. It is kept (and saved) unchanged and passes audio through. REMOVE it on the left to drop it.`);
      return;
    }
    const title = new Button(detail, [0, 2, 170, 13], `${i + 1} · ${up(def.name)} ▾`, {
      cls: 'small',
      tip: 'Swap this stage for another engine (same place in the chain)',
      onPress: () => dropdown(detail, title.el, chain.available().map((e) => ({ label: up(e.name), tip: e.description, checked: e.id === def.id, action: () => chain.replace(s.id, e.id) }))),
    });
    new Button(detail, [RW - 56, 2, 56, 13], 'DEFAULTS', { cls: 'small', tip: `Set every ${up(def.name)} parameter back to its default`, onPress: () => chain.resetParams(s.id) });
    const desc = el('div', 'label tiny', detail, [0, 19, RW]);
    Object.assign(desc.style, { whiteSpace: 'normal', lineHeight: '9px' });
    desc.textContent = up(def.description);
    def.params.forEach((p, k) => {
      const y = 40 + k * 20;
      const lab = el('div', 'label small', detail, [0, y + 3, 84], up(p.label));
      lab.style.whiteSpace = 'nowrap';
      controls.push(paramControl(detail, [88, y, RW - 88, 14], p, () => chain.stage(s.id)?.params[p.id] ?? p.default, (v) => chain.setParam(s.id, p.id, v), detail));
    });
    if (def.origin) el('div', 'label tiny', detail, [0, 40 + def.params.length * 20 + 4, RW], `FROM ${up(def.origin)}`);
  }

  function render(force = false): void {
    if (selected && !chain.stage(selected)) selected = chain.stages[0]?.id ?? null;
    const key = JSON.stringify([chain.stages.map((s) => [s.id, s.engine]), selected]);
    if (key === shape && !force) return;
    shape = key;
    rowsHost.replaceChildren();
    detail.replaceChildren();
    controls = [];
    chain.stages.forEach(stageRow);
    const i = chain.stages.findIndex((s) => s.id === selected);
    if (i >= 0) stageDetail(chain.stages[i]!, i, chain.engine(chain.stages[i]!));
    else el('div', 'empty-note', detail, [0, 22, RW], chain.stages.length ? 'Select an engine on the left to edit it.' : 'Add an engine, or pick a PRESET below.');
  }

  function update(): void {
    render();
    const c = chain.config;
    empty.style.display = c.stages.length ? 'none' : 'block';
    add.disabled = !chain.canAdd;
    bypass.on = c.bypass;
    const names = c.stages.map((s, i) => `${i + 1}${s.enabled && chain.engine(s) ? '' : ' (OFF)'}`);
    flow.textContent = `MIXER ▸ ${c.bypass ? 'BYPASSED' : names.length ? names.join(' ▸ ') : 'DRY'} ▸ MASTER LEVEL ▸ OUT`;
    const m = matchChainPreset(c, presets);
    presetBtns.forEach((b, i) => (b.on = presets[i]!.key === m));
    warn.textContent = app.player.ctx && !app.player.outputProcessing ? 'THIS BROWSER CANNOT RUN OUTPUT (AUDIOWORKLET NEEDS HTTPS OR LOCALHOST): AUDIO PLAYS AND EXPORTS UNPROCESSED' : '';
    controls.forEach((x) => x.update());
  }

  update();
  return { update };
}
