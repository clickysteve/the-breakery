import type { KitManager } from '../app/kits';
import type { App } from '../app/app';
import type { ImportEntry } from '../audio/ingredients';

/** What every window needs from the application shell. */
export interface UiContext {
  app: App;
  kits: KitManager | null;
  screen: HTMLElement;
  alert(html: string): void;
  confirm(html: string, ok?: string): Promise<boolean>;
  importEntries(entries: ImportEntry[]): Promise<void>;
  takeaway(): void;
  togglePlay(): void;
}
