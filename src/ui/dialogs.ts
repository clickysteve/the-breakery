/**
 * Modal dialogs drawn in the screen (emmm's style): Return = default button, Escape = Cancel.
 */
import { el } from './dom';

let current: { cancel: () => void } | null = null;

export function closeDialog(): boolean {
  if (!current) return false;
  current.cancel();
  return true;
}

export const dialogOpen = (): boolean => !!current;

interface DialogButton<T> {
  label: string;
  value: T;
  isDefault?: boolean;
}

/** A dialog with optional extra content built by `build`. */
export function openDialog<T>(screen: HTMLElement, html: string, buttons: DialogButton<T>[], cancelValue: T, build?: (box: HTMLDivElement) => void, width = 300): Promise<T> {
  closeDialog();
  return new Promise((resolve) => {
    const box = el('div', 'mdialog', screen, [(screen.offsetWidth || 720) / 2 - width / 2, 110, width]);
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const msg = el('div', '', box);
    msg.style.marginBottom = '8px';
    msg.innerHTML = html;
    build?.(box);
    const row = el('div', '', box);
    Object.assign(row.style, { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' });
    const finish = (v: T) => {
      box.remove();
      if (current?.cancel === cancel) current = null;
      resolve(v);
    };
    const cancel = () => finish(cancelValue);
    let def: HTMLButtonElement | null = null;
    for (const b of buttons) {
      const btn = el('button', 'mbutton' + (b.isDefault ? ' default' : ''), row, undefined, b.label);
      btn.addEventListener('click', () => finish(b.value));
      if (b.isDefault) def = btn;
    }
    box.addEventListener('pointerdown', (e) => e.stopPropagation());
    box.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      } else if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        def?.click();
      }
    });
    current = { cancel };
    setTimeout(() => (box.querySelector('input:not([type=radio]):not([type=checkbox])') as HTMLInputElement | null)?.select() ?? (def ?? box.querySelector('button'))?.focus(), 0);
  });
}

export function alertDialog(screen: HTMLElement, html: string): Promise<void> {
  return openDialog(screen, html, [{ label: 'OK', value: true, isDefault: true }], true).then(() => undefined);
}

export function confirmDialog(screen: HTMLElement, html: string, ok = 'OK'): Promise<boolean> {
  return openDialog(screen, html, [{ label: 'Cancel', value: false }, { label: ok, value: true, isDefault: true }], false);
}

export function promptDialog(screen: HTMLElement, html: string, value: string, ok = 'OK'): Promise<string | null> {
  let field: HTMLInputElement | null = null;
  return openDialog<boolean>(screen, html, [{ label: 'Cancel', value: false }, { label: ok, value: true, isDefault: true }], false, (box) => {
    field = el('input', 'mtext', box);
    field.value = value;
    field.style.width = '100%';
  }).then((ok2) => (ok2 && field ? (field as HTMLInputElement).value : null));
}
