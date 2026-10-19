# Kits

INGREDIENTS → **KITS** manages sound collections independently of recipes; INGREDIENTS →
**LIBRARY** is every sample kept in this browser. Both are The Breakery's views of the shared
Slop Factory kit system in Slop Factory Core (`@slopfactory/core/kits`, see Core's
[docs/KITS.md](https://github.com/clickysteve/slopfactory-core/blob/main/docs/KITS.md)): the same
library, kit workflow and kit files as DOWNBEAT.

## KITS

SAVE AS creates a named kit; SAVE updates the current kit (asking for a name if it has none).
Select a saved kit for LOAD, DUPLICATE, RENAME, DELETE or SET DEFAULT. EXPORT exports the current
sounds, including unsaved edits. IMPORT opens a kit file as unsaved sounds; SAVE keeps it as a
kit. A star in the saved list marks the startup default. Without a default, the last saved or
loaded kit opens at startup.

The saved list (Phase 15) shows four states apart: the kit under the pointer (a dotted outline),
the keyboard cursor (a dashed outline while the list has focus), the selected kit (inverted: what
LOAD, DUPLICATE, RENAME, DELETE and SET DEFAULT act on) and the loaded kit (▸). Hovering never
selects, and a release dragged in from elsewhere does not either: a click (press and release on
the same kit) or the arrow keys then Enter or Space select. NEW asks for a name (Untitled Kit,
Untitled Kit 2 …) and saves the empty kit at once, so it is in the list, selected, loaded and
ready for RENAME; SAVE, SAVE AS and DUPLICATE also select the kit they made. The list only ever
shows saved kits (no placeholder rows).

Changes to sample membership, assignments and category selection settings (PICK) mark the
current kit unsaved. NEW, LOAD and IMPORT ask before discarding those changes; leaving the page
uses the browser's unsaved-changes warning. Saving under the name of another kit asks before
replacing it. Recipe and pattern edits do not mark a kit dirty. Kit loads preserve hit
positions, velocity, timing, recipe, seed and undo/redo history, and follow the current playback
transition mode.

## LIBRARY

Every sample kept in this browser, from every kit and import. Select one to see its length,
sample rate, channels, format, size and how many saved kits use it (● marks samples in the
current kit). **▶ PREVIEW** plays it on its own (the break keeps playing as it was; nothing is
scheduled). **+ \<CATEGORY\>** adds it to the current kit, in the category selected in
INGREDIENTS, without importing the file again. **DELETE** deletes it from this browser, refused
while a saved kit or INGREDIENTS uses it; **DEL UNUSED** deletes every sample nothing uses.

## Storage

| Where | What |
|---|---|
| IndexedDB `the-breakery` (Core sample store, as before) | the original bytes of every sample, once, keyed by SHA-256 |
| IndexedDB `the-breakery-kit-library` (Core kit store) | saved kits (which sample plays in which category, PICK settings), the sample index (names, formats, durations), the default and current kit, migration records |
| localStorage `breakery.ingredients.v1` (as before) | the current INGREDIENTS (ids, names, categories) |

Kits refer to samples; they do not contain copies. Duplicating or renaming a kit copies no
audio. Removing an ingredient deletes its audio only when no saved kit uses it, so it cannot
damage saved kits. Quota failures keep the previous saved version and the current sounds;
EXPORT works without browser storage.

Browser storage belongs to the page's address and browser profile: clearing site data removes
saved kits and samples, and DOWNBEAT (another address) cannot see them. Kit files are the
portable backups, and how kits move to DOWNBEAT.

## Kit files

EXPORT writes `<kit name>.kit.zip`: Core's portable kit format (`slopfactory-kit` version 1), a
ZIP holding `manifest.json` and the original bytes of every sample (synthesised demo sounds are
encoded as 16-bit WAV). Each category is an instrument with a role (KICK `kick`, SNARE `snare`,
GHOST `snare-ghost`, HIGH/MID/LOW TOM `tom-high`/`tom-mid`/`tom-low`, HAT `hat-closed`, OPEN HAT
`hat-open`, RIDE `ride`, CRASH `crash`, PERC `perc`, CLAP `clap`, FX `fx`, UNSORTED
`unassigned`), its samples in list
order, its PICK mode (`selection`), the FIXED sample (`primary`) and WEIGHTED weights (`weight`).
File-system paths are excluded.

IMPORT reads `.kit.zip` files from any Slop Factory instrument, and `.breakery-kit` files from
The Breakery's first release. Everything is checked before anything changes (size, paths,
manifest, every sample's fingerprint, that every sample decodes); a failed import changes
nothing.

**A kit from DOWNBEAT:** each drum sound goes to the category of its role (both SNAREs into
SNARE as alternates; CLAP into CLAP (Phase 15; before, PERC); RIM, COWBELL, SHAKER, CLAVE, CONGA
into PERC; PEDAL HAT into HAT); a
role The Breakery has no category for goes to UNSORTED, kept but not played. Those samples keep
their roles, and DOWNBEAT's own settings (volume, pan, tuning, choke) are kept in the kit, so
saving or exporting it from The Breakery and opening it in DOWNBEAT again loses nothing.

## Migration from the first release

The first release kept each saved kit as a complete bundle (all its audio) in IndexedDB
`the-breakery-kits`, with a catalog in localStorage `breakery.kits.v1`. On the first start of
this version every saved kit is moved into the kit library: same id, name, samples, categories
and PICK settings; the default and current kit carried over; each sample stored once. The old
bundles and catalog are **read, never changed or deleted**, so the previous version still finds
them and nothing can be lost. The migration is resumable kit by kit: a kit that cannot be moved
(its bundle missing or damaged) is reported in the status line and tried again at the next
start, while the others are already available. Samples of the current INGREDIENTS are indexed
in the library (their audio is already stored).

The old bundles keep occupying storage. Once you are happy with this version, clearing them is
safe (they are copies).

## Bundled kits

`src/app/bundledKits.ts` lists kits shipped with The Breakery, installed on first launch by
Core's `installBundledKits` (once per id and version, never over your kits, the default only if
you have none; deleting one is respected). There are none yet. To add one (for example a kit
recorded by Keith): build it in The Breakery or DOWNBEAT and EXPORT it, put the file in
`public/kits/` (for example `public/kits/keith.kit.zip`), and add
`servedKit('keith', 1, 'keith.kit.zip')` to `BUNDLED_KITS`. It is fetched from the site only
when it is first installed; no account or server is involved.

## Testing

`test/kits.test.ts` (persistence, sharing audio, export/import into an independent library,
names, dirty tracking, loading while playing, storage failures, malformed and legacy files, demo
audio, the library, other applications' roles, migration) and `test/kitsBrowser.test.ts` (the
real app in Chromium with real IndexedDB: a first-release kit migrated, a sample imported, a kit
saved, a reload, an export with playable audio, a kit load that keeps every hit; Phase 15: the
saved list's hover, cursor, selection and loaded states and every kit operation through the
panel's own buttons, and files dropped on an instrument's row or sample list).
DOWNBEAT's `tests/cross-app/portability.spec.ts` moves a kit from The Breakery to DOWNBEAT and
back through real files.
