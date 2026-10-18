/**
 * PALETTE (BREAKERY ▸ Palette…): Slop Factory Core's palette editor, the same one as in the other
 * Slop Factory instruments, in a window that can be closed. Purely cosmetic: nothing here touches
 * the break.
 */
import { applyPalette, paletteEditor, type PaletteLibrary } from '@slopfactory/core/palette';
import { download } from '../audio/takeaway';
import { MWindow } from './widgets';

export function paletteWindow(parent: HTMLElement, lib: PaletteLibrary, at: { x: number; y: number }) {
  const holder = document.createElement('div');
  const ed = paletteEditor(holder, lib, {
    apply: (c) => applyPalette(lib.config, c),
    save: (name, text) => download(name, new TextEncoder().encode(text), 'application/json'),
  });
  const win = new MWindow(parent, { title: 'PALETTE', x: at.x, y: at.y, w: ed.width + 4, h: ed.height + 22, closable: true });
  win.body.appendChild(holder);
  win.close();
  return {
    win,
    show(): void {
      ed.refresh();
      ed.reset();
      win.show();
    },
    toggle(): void {
      if (win.open) win.close();
      else this.show();
    },
  };
}
