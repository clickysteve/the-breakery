/**
 * Phase 15 dialogs: NEW PATCH (asks first only when the patch has changes, offers KEEP CURRENT
 * KIT) and the WILDCARD REPORT (what the last WILDCARD changed, grouped, with COPY REPORT).
 */
import { reportText, type WildcardReport } from '../engine/wildcardReport';
import { el, esc, setTip } from './dom';
import { openDialog } from './dialogs';

/**
 * Ask what NEW PATCH should do: null = cancelled, otherwise whether to keep the current kit.
 * `dirty`: the patch has changes since the last NEW PATCH. Without them nothing is asked (the
 * current kit is kept), unless `ask` is set (File ▸ New Patch with the default kit).
 */
export async function newPatchDialog(screen: HTMLElement, dirty: boolean, keepKit = true, ask = false): Promise<{ keepKit: boolean } | null> {
  if (!dirty && !ask) return { keepKit };
  let keep = keepKit;
  const ok = await openDialog<boolean>(
    screen,
    `<b>NEW PATCH</b>${dirty ? ': this patch has unsaved changes. FAV (Seeds ▸ Add to Favourites) keeps the break if you want it back later.' : '.'}<br><span style="font-size:9px">The break, recipe, controls, tempo, TEMPO LOCK, seed, FREEZE, PERSONALITY, BREAK DNA, cymbals, CHOP, rolls, DESTROY, MUTATE and hand edits start again. Samples, saved kits, favourites and preferences are kept; the previous break stays in the seed history (◀).</span>`,
    [
      { label: 'Cancel', value: false },
      { label: 'New Patch', value: true, isDefault: true },
    ],
    false,
    (box) => {
      const l = el('label', '', el('div', 'row', box));
      const cb = el('input', '', l);
      cb.type = 'checkbox';
      cb.checked = keep;
      cb.addEventListener('change', () => (keep = cb.checked));
      el('span', '', l, undefined, 'KEEP CURRENT KIT');
      setTip(l, 'On: the samples, their categories and PICK modes stay, and the mixer keeps its levels and pans (SOLO and MUTE are cleared). Off: the demo kit is loaded as a new unsaved kit and the mixer is reset; nothing is deleted (your samples and saved kits stay in the library).');
    },
    330,
  );
  return ok ? { keepKit: keep } : null;
}

/** Copy text to the clipboard; false when the browser refuses (no permission, insecure page). */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* refused: try the old way */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** The WILDCARD REPORT: every setting the last WILDCARD changed, grouped, before → after. */
export async function wildcardReportDialog(screen: HTMLElement, r: WildcardReport): Promise<void> {
  await openDialog<boolean>(
    screen,
    `<b>WILDCARD REPORT</b><br><span style="font-size:9px">${esc(r.headline)}. ⌘Z undoes all of it; redo brings back exactly this.</span>`,
    [{ label: 'Close', value: true, isDefault: true }],
    true,
    (box) => {
      const list = el('div', 'wreport', box);
      list.setAttribute('role', 'table');
      list.setAttribute('aria-label', 'What WILDCARD changed');
      if (!r.groups.length) el('div', 'wrow', list, undefined, 'Only the seed changed.');
      for (const g of r.groups) {
        el('div', 'wgroup', list, undefined, g.title).setAttribute('role', 'rowheader');
        for (const x of g.rows) {
          const row = el('div', 'wrow', list);
          row.setAttribute('role', 'row');
          el('span', '', row, undefined, x.label);
          el('span', '', row, undefined, `${x.before} → ${x.after}`);
        }
      }
      if (r.kept.length) el('div', 'wgroup', list, undefined, `KEPT: ${r.kept.join(', ')}`);
      const bar = el('div', 'wreport-copy', box);
      const copy = el('button', 'mbutton', bar, undefined, 'Copy Report');
      const note = el('span', '', bar);
      note.setAttribute('aria-live', 'polite');
      copy.addEventListener('click', () => {
        void copyText(reportText(r)).then((ok) => {
          note.textContent = ok ? 'COPIED.' : 'THE BROWSER REFUSED THE CLIPBOARD: SELECT THE LIST AND COPY IT.';
          if (!ok) {
            const sel = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(list);
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
        });
      });
    },
    380,
  );
}
