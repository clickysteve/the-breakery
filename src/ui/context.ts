import type { KitSession } from '@slopfactory/core/kits';
import type { App } from '../app/app';
import type { ImportEntry, Slot } from '../audio/ingredients';

/** What every window needs from the application shell. */
export interface UiContext {
  app: App;
  kits: KitSession | null;
  screen: HTMLElement;
  alert(html: string): void;
  confirm(html: string, ok?: string): Promise<boolean>;
  /** import files; `opts.cat`: an explicit destination (dropped on that instrument) */
  importEntries(entries: ImportEntry[], opts?: { cat?: Slot }): Promise<void>;
  takeaway(): void;
  togglePlay(): void;
}
