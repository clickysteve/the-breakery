import type { App } from '../app/app';

/** What every window needs from the application shell. */
export interface UiContext {
  app: App;
  screen: HTMLElement;
  alert(html: string): void;
  confirm(html: string, ok?: string): Promise<boolean>;
  importFiles(files: File[]): Promise<void>;
  takeaway(): void;
  togglePlay(): void;
}
