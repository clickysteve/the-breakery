/** SWITCH (when a new pattern takes over while playing): remembered across visits; IMMEDIATE until chosen. */
import type { SwitchMode } from '../audio/player';

const KEY = 'breakery.switchMode';
const MODES: SwitchMode[] = ['bar', 'loop', 'immediate'];

export function loadSwitchMode(storage: Pick<Storage, 'getItem'> = localStorage): SwitchMode {
  try {
    const v = storage.getItem(KEY) as SwitchMode | null;
    if (v && MODES.includes(v)) return v;
  } catch {
    /* no storage */
  }
  return 'immediate';
}

export function saveSwitchMode(m: SwitchMode, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    storage.setItem(KEY, m);
  } catch {
    /* no storage: this lasts for this visit */
  }
}
