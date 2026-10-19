/**
 * TAKEAWAY: what to render (LOOP, LOOP + STEMS, STEMS ONLY, the BATCH), how (tail or seamless
 * loop, dry stems, MIDI) and the file names: the ordered component builder (each component on or
 * off, moved up or down), the separator, the LOOP suffix, and a live preview drawn by the same
 * functions the export uses (audio/exportName.ts).
 */
import { buildFileName, masterSuffix, movePart, nameRows, NAME_PART_LABEL, SEPARATOR_LABEL, SEPARATORS, LOOP_SUFFIX_LABEL, LOOP_SUFFIXES, stemFileNames, uniqueName, type NamingPrefs } from '../audio/exportName';
import type { TakeawayOptions } from '../audio/takeaway';
import { CATEGORIES, CATEGORY_LABEL, type Break } from '../engine/types';
import { el, setTip } from './dom';
import { GemSelect } from './gemSelect';
import { openDialog } from './dialogs';

export type TakeawayKind = 'loop' | 'loopStems' | 'stems' | 'batch';
const KIND_LABEL: Record<TakeawayKind, string> = { loop: 'LOOP', loopStems: 'LOOP + STEMS', stems: 'STEMS ONLY', batch: 'BATCH' };
const KIND_TIP: Record<TakeawayKind, string> = {
  loop: 'One stereo WAV of the whole mix.',
  loopStems: 'A ZIP: the mix and one aligned stereo WAV per track (all the same length).',
  stems: 'A ZIP of the stems alone: one aligned stereo WAV per track, no mix.',
  batch: 'A ZIP with one WAV of each BATCH candidate, each named from its own break.',
};

export interface TakeawayChoice {
  kind: TakeawayKind;
  opts: TakeawayOptions;
  naming: NamingPrefs;
}

export async function takeawayDialog(screen: HTMLElement, current: Break, batch: readonly Break[], start: TakeawayOptions, naming0: NamingPrefs, kitName: string | null, kind0?: TakeawayKind): Promise<TakeawayChoice | null> {
  const o: TakeawayOptions = { ...start, mix: 'audible' };
  let naming: NamingPrefs = JSON.parse(JSON.stringify(naming0)) as NamingPrefs;
  let kind: TakeawayKind = kind0 ?? (o.stems ? (o.stemsOnly ? 'stems' : 'loopStems') : 'loop');
  if (kind === 'batch' && batch.length < 2) kind = 'loop';
  const r = current.recipe;
  const ok = await openDialog<boolean>(
    screen,
    `<b>TAKEAWAY</b>: render to 44.1 kHz, 16-bit stereo WAV.<br><span style="font-size:9px">${r.bars} bar${r.bars > 1 ? 's' : ''} at ${r.bpm} BPM, exactly as it plays here. Rendered in your browser; nothing is uploaded.</span>`,
    [
      { label: 'Cancel', value: false },
      { label: 'Take away', value: true, isDefault: true },
    ],
    false,
    (box) => {
      const radios = (name: string, values: readonly string[], label: (v: string) => string, tip: (v: string) => string, get: () => string, set: (v: string) => void, disabled?: (v: string) => boolean) => {
        const row = el('div', 'row', box);
        row.setAttribute('role', 'radiogroup');
        for (const v of values) {
          const l = el('label', '', row);
          const i = el('input', '', l);
          i.type = 'radio';
          i.name = name;
          i.checked = get() === v;
          i.disabled = !!disabled?.(v);
          i.addEventListener('change', () => {
            set(v);
            refresh();
          });
          el('span', '', l, undefined, label(v));
          setTip(l, tip(v));
        }
        return row;
      };
      radios('tkind', ['loop', 'loopStems', 'stems', 'batch'], (v) => KIND_LABEL[v as TakeawayKind], (v) => (v === 'batch' && batch.length < 2 ? 'BATCH: make a batch first (BATCH, or N).' : KIND_TIP[v as TakeawayKind]), () => kind, (v) => (kind = v as TakeawayKind), (v) => v === 'batch' && batch.length < 2);
      radios('tmode', ['tail', 'loop'], (v) => (v === 'tail' ? 'BARS + TAIL' : 'SEAMLESS LOOP'), (v) => (v === 'tail' ? 'The bars, then the tail so the last hits ring out' : 'Exactly the bars’ length; the tail is folded back onto the start so it loops cleanly in a sampler'), () => o.mode, (v) => (o.mode = v as TakeawayOptions['mode']));

      const row2 = el('div', 'row', box);
      el('span', '', row2, undefined, 'Tail');
      new GemSelect(row2, null, {
        label: 'Tail length in seconds',
        options: [0.5, 1, 2, 4, 8].map((t) => ({ value: String(t), label: `${t} s` })),
        value: String(o.tailSeconds),
        cls: 'tailsel',
        onChange: (v) => (o.tailSeconds = Number(v)),
      });
      const check = (host: HTMLElement, text: string, tip: string, get: () => boolean, set: (v: boolean) => void) => {
        const l = el('label', '', host);
        const c = el('input', '', l);
        c.type = 'checkbox';
        c.checked = get();
        c.addEventListener('change', () => {
          set(c.checked);
          refresh();
        });
        el('span', '', l, undefined, text);
        setTip(l, tip);
        return c;
      };
      check(row2, '+ MIDI', 'Also a MIDI file of the break (General MIDI drums on channel 10, or the channels and notes set in the MIDI window; swing, microtiming and rolls kept), in the ZIP with stems or as a second download', () => o.midi, (v) => (o.midi = v));
      check(row2, 'DRY STEMS', 'Stems bypass master gain (channel gain, pan, MUTE and SOLO are kept). All stems have identical lengths, silent tracks included.', () => o.dryStems ?? true, (v) => (o.dryStems = v));

      // ---- the file name builder
      el('div', 'rule', box).style.cssText = 'position:static;height:0;border-top:1px dotted var(--ink);margin:6px 0 4px';
      el('div', 'row', box, undefined, 'FILE NAME');
      // numbered DOWN each column (1-4 left, 5-7 right): the DOM stays in filename order, so the
      // arrows, focus and Tab follow it; one column when the dialog is narrow (style.css)
      const list = el('div', 'nameparts', el('div', 'namebox', box));
      list.setAttribute('role', 'list');
      list.setAttribute('aria-label', 'File name components, in order');
      const custom = el('input', '', el('div', 'row', box));
      custom.type = 'text';
      custom.maxLength = 80;
      custom.placeholder = 'CUSTOM TEXT';
      custom.value = naming.custom;
      custom.style.width = '100%';
      custom.setAttribute('aria-label', 'Custom text in the file name');
      setTip(custom, 'CUSTOM TEXT: any words (any language). Unsafe characters are removed. Tick CUSTOM TEXT above to use it.');
      custom.addEventListener('input', () => {
        naming.custom = custom.value;
        refresh();
      });
      const row3 = el('div', 'row', box);
      el('span', '', row3, undefined, 'SEPARATOR');
      new GemSelect(row3, null, { label: 'Separator', options: SEPARATORS.map((v) => ({ value: v, label: SEPARATOR_LABEL[v] })), value: naming.sep, cls: 'tailsel', onChange: (v) => ((naming.sep = v as NamingPrefs['sep']), refresh()) });
      el('span', '', row3, undefined, 'LOOP SUFFIX');
      const ls = new GemSelect(row3, null, { label: 'LOOP suffix on the mix', options: LOOP_SUFFIXES.map((v) => ({ value: v, label: LOOP_SUFFIX_LABEL[v] })), value: naming.loop, cls: 'tailsel', onChange: (v) => ((naming.loop = v as NamingPrefs['loop']), refresh()) });
      setTip(ls.el, 'LOOP SUFFIX: when the mix’s file name ends in _LOOP. ONLY WITH STEMS tells it apart from the stems beside it.');
      const preview = el('div', '', box);
      preview.style.cssText = 'font-size:9px;margin-top:4px;overflow-wrap:anywhere;border:1px solid var(--ink);padding:2px 4px';
      preview.setAttribute('aria-live', 'polite');

      const drawParts = () => {
        list.replaceChildren();
        list.style.gridTemplateRows = `repeat(${nameRows(naming.parts.length)}, auto)`;
        naming.parts.forEach((p, i) => {
          const row = el('div', '', list);
          row.setAttribute('role', 'listitem');
          row.dataset.part = p.id;
          row.style.cssText = 'display:flex;align-items:center;gap:3px';
          const l = el('label', '', row);
          l.style.flex = '1';
          const c = el('input', '', l);
          c.type = 'checkbox';
          c.checked = p.on;
          c.addEventListener('change', () => {
            naming.parts[i] = { ...p, on: c.checked };
            refresh();
          });
          el('span', '', l, undefined, `${i + 1}. ${NAME_PART_LABEL[p.id]}`);
          for (const [t, by, tip] of [['▲', -1, 'Move up'], ['▼', 1, 'Move down']] as const) {
            const b = el('button', 'mbutton', row, undefined, t);
            b.style.cssText = 'padding:0 3px;min-width:0;font-size:8px;line-height:9px';
            b.disabled = (by < 0 && i === 0) || (by > 0 && i === naming.parts.length - 1);
            b.setAttribute('aria-label', `${tip}: ${NAME_PART_LABEL[p.id]}`);
            b.addEventListener('click', () => {
              naming = movePart(naming, p.id, by);
              drawParts();
              refresh();
              (list.querySelectorAll('button')[(i + by) * 2 + (by < 0 ? 0 : 1)] as HTMLButtonElement | undefined)?.focus();
            });
          }
        });
      };
      function refresh(): void {
        const lines: string[] = [];
        if (kind === 'batch') {
          const seen = new Set<string>();
          lines.push(buildFileName(naming, current, 'BATCH', 'zip', kitName), ...batch.slice(0, 3).map((b) => `  ${uniqueName(buildFileName(naming, b, masterSuffix(naming, false), 'wav', kitName), seen, naming)}`), ...(batch.length > 3 ? [`  … ${batch.length - 3} more`] : []));
        } else if (kind === 'loop') {
          lines.push(buildFileName(naming, current, masterSuffix(naming, false), 'wav', kitName));
          if (o.midi) lines.push(buildFileName(naming, current, '', 'mid', kitName));
        } else {
          const master = kind === 'loopStems' ? [buildFileName(naming, current, masterSuffix(naming, true), 'wav', kitName)] : [];
          const stems = stemFileNames(naming, current, CATEGORIES.map((c) => CATEGORY_LABEL[c]), kitName, master);
          lines.push(buildFileName(naming, current, 'STEMS', 'zip', kitName), ...master.map((m) => `  ${m}`), `  ${stems[0]}`, `  ${stems[1]}`, `  … ${stems.length - 2} more stems`);
        }
        preview.textContent = '';
        lines.forEach((t, i) => {
          if (i) preview.appendChild(document.createElement('br'));
          preview.appendChild(document.createTextNode(t));
        });
      }
      drawParts();
      refresh();
    },
    380,
  );
  if (!ok) return null;
  o.stems = kind === 'loopStems' || kind === 'stems';
  o.stemsOnly = kind === 'stems';
  return { kind, opts: o, naming };
}
