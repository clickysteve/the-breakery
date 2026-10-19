/**
 * LIBRARY (a tab of INGREDIENTS): every sample kept in this browser, from every kit and import,
 * through Slop Factory Core's kit library. Preview one (it plays on its own, never through the
 * break or its transport), add it to the current kit in the category chosen in INGREDIENTS (no
 * second import), delete one no kit uses, or delete every unused sample.
 */
import { Auditioner, type LibrarySample } from '@slopfactory/core/kits';
import type { Slot } from '../audio/ingredients';
import { CATEGORY_LABEL } from '../engine/types';
import { el, esc } from './dom';
import { GemSelect } from './gemSelect';
import { Button } from './widgets';
import type { UiContext } from './context';

const slotLabel = (s: Slot) => (s === 'unsorted' ? 'UNSORTED' : CATEGORY_LABEL[s]);
const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function libraryPanel(parent: HTMLElement, ui: UiContext, target: () => Slot, importFiles: () => void) {
  const { app } = ui;
  const library = app.ingredients.library;
  const panel = el('div', '', parent, [0, 0, 202, 405]);
  panel.style.position = 'absolute';
  el('div', 'label', panel, [6, 8, 190], 'LIBRARY');
  const count = el('div', 'label tiny', panel, [6, 27, 190]);
  const list = new GemSelect(panel, [5, 48, 192, 226], { label: 'Samples in this browser', mode: 'list', onChange: () => showInfo() });
  const info = el('div', 'label tiny', panel, [6, 280, 190]);
  info.style.whiteSpace = 'normal';
  info.style.lineHeight = '10px';
  const audition = new Auditioner({ context: async () => ((await app.player.ensure()) ? app.player.ctx : null) });
  let samples: LibrarySample[] = [];
  let usage = new Map<string, number>();
  let busy = false;

  const current = () => samples.find((s) => s.id === list.value) ?? null;
  const inKit = (id: string) => app.ingredients.items.some((i) => (i.audio ?? i.id) === id);
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    busy = true;
    try {
      await action();
    } catch (e) {
      ui.alert(esc(e instanceof Error ? e.message : String(e)));
    } finally {
      busy = false;
      update();
    }
  };

  const bw = 94;
  const preview = new Button(panel, [5, 306, bw, 18], '▶ PREVIEW', { tip: 'Hear the selected sample (on its own: the break keeps playing as it was)', onPress: () => void run(async () => { const s = current(); if (s && !(await audition.playSample(library, s.id, { name: s.name }))) ui.alert('This browser did not start audio. Click again.'); }) });
  const add = new Button(panel, [103, 306, bw, 18], '+ ADD', {
    tip: 'Add the selected sample to the current kit, in the category selected in INGREDIENTS',
    onPress: () => void run(async () => {
      const s = current();
      if (!s) throw new Error('Select a sample first.');
      if (inKit(s.id)) return app.say(`“${s.name}” is already in the current kit.`);
      await app.ingredients.addFromLibrary(s.id, s.name, target());
      app.say(`Added “${s.name}” to ${slotLabel(target())}.`);
    }),
  });
  const del = new Button(panel, [5, 328, bw, 18], 'DELETE', {
    tip: 'Delete the selected sample from this browser (only when no kit and nothing in INGREDIENTS uses it)',
    onPress: () => void run(async () => {
      const s = current();
      if (!s) throw new Error('Select a sample first.');
      if (!(await ui.confirm(`Delete “${esc(s.name)}” from this browser? Your file on disk is not affected.`, 'Delete'))) return;
      await library.removeSample(s.id);
      audition.forget(s.id);
    }),
  });
  const unused = new Button(panel, [103, 328, bw, 18], 'DEL UNUSED', {
    tip: 'Delete every sample that no saved kit and nothing in INGREDIENTS uses',
    onPress: () => void run(async () => {
      if (!(await ui.confirm('Delete every sample that no saved kit and nothing in INGREDIENTS uses? Your files on disk are not affected.', 'Delete'))) return;
      const n = await library.removeUnused();
      audition.forget();
      app.say(n ? `Deleted ${n} unused sample${n === 1 ? '' : 's'} from this browser.` : 'No unused samples.');
    }),
  });
  new Button(panel, [5, 350, 192, 16], 'IMPORT SAMPLES…', { tip: 'Load WAV or AIFF files into INGREDIENTS (and so into the library)', onPress: importFiles });
  el('div', 'label tiny', panel, [6, 371, 190], 'STORED ONCE · EVERY KIT CAN USE THEM');

  function showInfo(): void {
    const s = current();
    add.text = `+ ${slotLabel(target())}`;
    if (!s) {
      info.textContent = samples.length ? 'Select a sample.' : 'No samples yet: import some, or a kit.';
      return;
    }
    const n = usage.get(s.id) ?? 0;
    info.textContent = [s.duration ? `${s.duration.toFixed(2)} s` : '', s.sampleRate ? `${(s.sampleRate / 1000).toFixed(1)} kHz` : '', s.channels ? (s.channels === 1 ? 'MONO' : 'STEREO') : '', s.format.toUpperCase(), s.size ? kb(s.size) : '', `${n} KIT${n === 1 ? '' : 'S'}`, inKit(s.id) ? 'IN CURRENT KIT' : ''].filter(Boolean).join(' · ');
    for (const b of [preview, add, del]) b.disabled = busy;
  }

  let sig = '';
  async function refresh(): Promise<void> {
    samples = await library.listSamples();
    usage = new Map();
    for (const k of await library.listKits()) {
      const kit = await library.getKit(k.id);
      for (const id of new Set(kit?.instruments.flatMap((i) => i.samples.map((r) => r.sample)) ?? [])) usage.set(id, (usage.get(id) ?? 0) + 1);
    }
    count.textContent = library.persistent ? `${samples.length} SAMPLE${samples.length === 1 ? '' : 'S'} IN THIS BROWSER` : 'BROWSER STORAGE UNAVAILABLE';
    const next = JSON.stringify([samples.map((s) => [s.id, s.name]), app.ingredients.items.length]);
    if (next !== sig) {
      sig = next;
      const previous = list.value;
      list.setOptions(samples.map((s) => ({ value: s.id, label: `${inKit(s.id) ? '● ' : ''}${s.name}` })));
      list.value = samples.some((s) => s.id === previous) ? previous : samples[0]?.id ?? '';
    }
    unused.disabled = busy || !library.persistent;
    showInfo();
  }
  // one refresh at a time; changes meanwhile ask for one more (app changes can come quickly)
  let running: Promise<void> | null = null;
  let again = false;
  const update = (): void => {
    if (running) {
      again = true;
      return;
    }
    running = refresh().finally(() => {
      running = null;
      if (again) {
        again = false;
        update();
      }
    });
  };
  update();
  return { panel, update };
}
