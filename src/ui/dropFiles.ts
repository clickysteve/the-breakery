/**
 * Files and folders dropped from the desktop, as import entries. Shared by the screen-wide drop
 * (categories suggested from names) and the INGREDIENTS drop targets (an explicit category).
 */
import type { ImportEntry } from '../audio/ingredients';

/** Files and folders dropped on the screen (folders read recursively where the browser allows). */
export async function droppedEntries(dt: DataTransfer): Promise<ImportEntry[]> {
  const items = [...dt.items].filter((i) => i.kind === 'file');
  const roots = items.map((i) => (typeof i.webkitGetAsEntry === 'function' ? i.webkitGetAsEntry() : null));
  if (!roots.some((e) => e?.isDirectory)) return [...dt.files].map((file) => ({ file, path: '' }));
  const out: ImportEntry[] = [];
  const fileOf = (e: FileSystemFileEntry) => new Promise<File>((res, rej) => e.file(res, rej));
  const readAll = async (dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> => {
    const reader = dir.createReader();
    const all: FileSystemEntry[] = [];
    // readEntries returns at most ~100 entries per call: read until empty
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) return all;
      all.push(...batch);
    }
  };
  const walk = async (e: FileSystemEntry, depth: number): Promise<void> => {
    if (out.length > 2000 || depth > 12) return;
    if (e.isFile) {
      try {
        out.push({ file: await fileOf(e as FileSystemFileEntry), path: e.fullPath.replace(/^\//, '') });
      } catch {
        /* unreadable: skipped */
      }
    } else if (e.isDirectory) for (const c of await readAll(e as FileSystemDirectoryEntry)) await walk(c, depth + 1);
  };
  for (const r of roots) if (r) await walk(r, 0);
  return out;
}

/** A drag that carries files (not text or a window being moved). */
export const carriesFiles = (dt: DataTransfer | null): boolean => !!dt && [...dt.types].includes('Files');
