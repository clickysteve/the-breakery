# Pattern workflow (Phase 17)

How hand edits live with CHOP, how a chosen sample is painted into a track, how the export name
builder is ordered, how edits made during playback are scheduled, where a grid click lands, and
how a library sample joins any kit.

## CHOP with hand edits

CHOP never locks (the lock went in Phase 16). What Phase 17 changes is what a hand edit is
attached to.

* **Origins.** Every hit CHOP moves knows its ORIGIN: the groove hit it is a copy of
  (`BreakEvent.src`). A retrigger stroke's origin is its own place, marked `~`. Its ref is
  `<place>@<origin>`; a hit CHOP left where it was keeps its plain place as its ref, so unchopped
  patterns are unchanged.
* **Anchored edits** (`edits.ts`, layer `v: 2`). A deletion or a change (velocity, timing,
  sample, pitch, reverse) is made on a hit and stays with it:
  1. it applies to the hit of that origin at the place where it was made;
  2. if CHOP moved that hit (another take, slice, amount), to the nearest hit of that origin in
     the same bar: a deleted hit does not come back elsewhere, a quieter snare stays quiet;
  3. otherwise it waits: kept, reported in the pattern's edit line, applied when its hit returns
     (CHOP off, an undo, another take).
* **Never a different hit.** A hit CHOP puts on an edited place that comes from another origin is
  not touched by that edit, so nothing is silently deleted.
* **Added hits** stay where they were placed, once: CHOP never duplicates them, and a generated
  hit landing on the same place does not double them.
* **Moved hits** are a removal (anchored) plus a hand-placed copy, so RE-CHOP cannot bring the
  original back under the moved one. RATCHET strokes are hand-placed and stay put.
* **Each hit takes at most one edit**: exact matches first, then the edits that follow, in order
  of place.
* **Saved breaks.** A layer saved before Phase 17 has no `v`. It keeps its positional meaning, so
  it reproduces exactly; the next edit made on it converts it (`upgradeEdits`) without changing a
  note.
* **Undo and redo** are snapshots of the layer and the events, so BAKE, ADD, CHOP, MOVE, RE-CHOP
  and their undos and redos are exact. ROLLS, RE-ROLL, DESTROY, MUTATE, WILDCARD, regeneration,
  FREEZE and pattern switching all go through the same layer.

## Sample painting

* In INGREDIENTS, click a sample's **name** to choose it for its own track. The row is outlined
  and marked ✎, the INGREDIENTS header shows `✎ <name>`, and the track's row label in PATTERN
  shows ✎. Click it again to release; click another to change. ▶ is still the preview: it plays
  the sample on its own and never changes the choice (it is shown as auditioning while it plays).
* Every hit placed by hand on that row (a click, or a paint drag) plays that exact sample (by its
  id, not its name), overriding the PICK mode (AUTO, ROUND ROBIN and the rest). Hits already in
  the pattern, and every other track, are unaffected.
* The choice is saved with the session. When the sample is no longer in that track (another
  kit, removed, recategorised), the choice is dropped with a status note and the track takes its
  PICK mode again; the sample itself is not touched.

## Export filename order

The TAKEAWAY name builder lists the components in two columns, numbered down each column: 1 to 4
on the left, 5 to 7 on the right (`nameRows`, `namePlace`). The DOM order is the filename order,
so ▲ and ▼, focus and Tab move through 1, 2, 3, 4, 5, 6, 7; moving 4 down puts it at the top of
the right column. Under 300 px wide it is one column. The order is a preference saved in this
browser, as before.

## Live editing

Edits made while the break plays (add, delete, move, timing, sample, RE-CHOP, RE-ROLL,
RE-DESTROY, WILDCARD, undo, redo, regeneration) go through `Player.setBreak`, which switches on
the grid:

* **IMMEDIATE** takes the edit at the next safe step: the first sixteenth past the audio already
  handed to Web Audio. **NEXT BAR** and **NEXT LOOP** are unchanged.
* At the switch, hits whose GRID place is before the boundary finish from the old pattern (a late
  one still plays) and hits from the boundary on come from the new one. The decision is by grid
  place, not performed time, so a timing edit cannot move a hit across the switch.
* Every scheduled hit has an identity (loop, grid place, drum, occurrence) and none is scheduled
  twice: no double triggers, no doubled MIDI note-ons.
* No voice is stopped and the scheduler is never restarted, so ringing sounds ring on.
* The pattern card says what is waiting: `EDIT QUEUED · NEXT STEP` (or BAR, LOOP) for an edit,
  `SWITCHING · NEXT BAR` for a new pattern, `PATTERN ACTIVE` otherwise.

The cause before Phase 17: the switch picked the new list by real time, so a hit already
scheduled whose edited time fell after the switch was scheduled again (a doubled, phasing hit),
and one moved earlier could be dropped.

## Grid snapping

`ui/gridGeometry.ts` is the grid's one coordinate system: drawing, hit testing, the hover frame,
placement and drags all use it.

* A click anywhere inside a SNAP cell places the hit in that cell (floor, never round): 10% or
  90% of a sixteenth is still that sixteenth. A press on a line belongs to the cell on its right;
  past the last cell, to the last cell.
* Every SNAP (1/16, 1/32, 1/64, 1/16T, 1/32T) divides a bar exactly, so cells never cross a bar
  line and triplet cells restart on every bar.
* A dotted frame shows the cell the next click fills (with the painted sample's name in its tip
  when the row has one).
* A dragged hit moves by the whole cells the pointer crosses, so it keeps its offset from the
  grid and the same drag gives the same result from any point of the pressed cell.

## Library reuse

Every sample in this browser's library can join any kit:

* **+ LIB** in INGREDIENTS opens ADD FROM LIBRARY: search, a category filter (the category it
  has in saved kits, or a guess from its name marked `?`), multi-select, ▶ preview, and a ● for
  the tracks it is already in. **Add to <track>** adds the selection to the track selected in
  INGREDIENTS. The LIBRARY tab's **+ ADD** does the same for one sample.
* The destination wins: a sample already in another track is added again to this one (a second
  assignment, `<id>@<track>`) and shares the same audio; nothing is copied or decoded twice. A
  sample already in that track is skipped.
* Saved kits refer to the library sample by id; exported kits (`.kit.zip`) carry the audio, so
  they stay self-contained.
* One undo step: undo removes the assignment from the kit, never the library audio; redo brings
  it back.
