/**
 * The Breakery's colour palettes: Slop Factory Core's palette system (the same model, presets,
 * files, preferences and editor as the other Slop Factory instruments), with The Breakery's
 * roles. A purely cosmetic layer: changing palette never changes the break.
 *
 * Roles: Core's shared six, plus HITS (the hits and their velocity bars in PATTERN and BATCH)
 * and HAND EDITS (the marks on hits placed or changed by hand), which follow INK and SELECTION
 * unless a palette gives them colours of their own. The default is ATARI, the original
 * black-and-white look, so nothing changes for anyone who has not chosen a palette.
 */
import { PaletteLibrary, SHARED_PRESETS, SHARED_ROLES, SWAP_INK_PAPER, type PaletteConfig } from '@slopfactory/core/palette';

export const BREAKERY_PALETTES: PaletteConfig = {
  app: 'breakery',
  roles: [
    ...SHARED_ROLES.slice(0, 4),
    { id: 'hits', label: 'Hits', help: 'hits and their velocity in PATTERN and BATCH', css: '--hits', contrast: 3, from: 'ink' },
    { id: 'edits', label: 'Hand edits', help: 'marks on hits placed or changed by hand', css: '--edits', contrast: 2, from: 'selection' },
    ...SHARED_ROLES.slice(4),
  ],
  builtIns: SHARED_PRESETS,
  // palettes made in the other Slop Factory instruments import by the roles they share
  accept: ['emmm-palette', 'downbeat-palette'],
  // a refused entry flashes by swapping ink and paper (inverting a colour palette would clash)
  extraCss: () => `@keyframes mrefuse{0%,49%{filter:none;${SWAP_INK_PAPER}}50%,100%{filter:none}}\n`,
};

export function paletteLibrary(): PaletteLibrary {
  return new PaletteLibrary(BREAKERY_PALETTES);
}
