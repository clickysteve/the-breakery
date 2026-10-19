# Transformations (Phase 16)

BAKE creates a new idea. The transformations develop the current one: none of them needs BAKE,
and none regenerates the groove, the recipe, the seeds, the kit, the sample assignments or the
mixer.

| Action | What it does |
|---|---|
| **BAKE** | A new underlying groove (new seeds for the layers that are not frozen). |
| **CHOP** on / off | The current groove re-arranged / the groove as it was. Settings kept. |
| **RE-CHOP** | The next chop take (`chop.variant`) of the same groove. |
| **ROLL GENERATION** on / off | The roll transformation on the current groove / off it. A preference. |
| **RE-ROLL** | The next roll take (`recipe.rollTake`) on the same groove. |
| **DESTROY**, **RE-DESTROY** | The finished pattern destroyed / the next take (`destroy2.take`). |
| **MUTATE** | Unchanged: a related variation, a new break in the history. |

## Order

```
SOURCE GROOVE (seeds, recipe; fills and their rolls, toms, CLAP, FX)
  -> CHOP          chopper.ts      beat seed + chop.variant
  -> ROLLS         rollLayer.ts    beat seed (where) + feel seed (how) + rollTake   [revision 6]
  -> EXPRESSION    rollExpr.ts     feel seed + rollExpr.variant
  -> REGEN TRACK, PERSONALITY performance
  -> HAND EDITS    edits.ts        positional layer
  -> samples (PICK modes)
  -> DESTROY       destroy2.ts     beat seed + destroy2.take
  -> playback, WAV, stems, MIDI    (all from `App.current`)
```

Every stage starts from the stage before it, recomputed from the seeds on every change, so
nothing compounds: toggling any of them returns the same result, and changing one stage's
settings or take never redraws another's numbers.

## CHOP

* **Enable**: always available. Before Phase 16 any hand edit locked it (`chopLocked`), and
  ROLL GENERATION off turned a pattern's rolls into hand edits, so CHOP was greyed out on
  ordinary generated patterns.
* **Off** gives the groove back exactly; **on** again gives the same chop until RE-CHOP.
* A CHOP change on an older break never moves it to a newer GROOVE revision (the same holds for
  EXPRESSION and DESTROY): `App.transformWith` keeps its revision, so its groove stays.

## ROLLS (revision 6)

* A roll is LENGTH retriggers of one drum, SPEED apart, ending one stroke before a **candidate**:
  a source hit of a TARGET TRACK (HATS = closed hat and ride, TOMS = the three toms). The hit is
  never moved or changed, and no other hit is touched. Strokes carry `rollOf` (the hit's key).
* **Candidates by PLACEMENT**: PHRASE END, hits in the last two beats of each bar that ends the
  phrase or a section (the last bar, a half-way fill bar, bar 4 of six or more); BEFORE ACCENT,
  backbeats and on-beat hits outside the groove (A) bars; FILLS, hits in T and F bars; ANYWHERE,
  hits after the first bar. Hits that are roll strokes already (a fill's roll, a CHOP retrigger)
  are not candidates.
* **Eligible**: room for at least two strokes before the hit, inside its bar, after the previous
  hit of that drum and clear of any roll (a roll is shortened to fit).
* **PROBABILITY** is the chance each eligible candidate gets a roll, drawn per candidate from
  `roll-layer:<take>:<key>` (answer bars draw alike). 0% none, 100% all, raising it only adds
  rolls. The one ceiling: at most two rolls a bar (the lowest draws first). The recipe's old
  appetite (`rollP`) no longer scales it.
* **No rolls** always says why: ROLL GENERATION OFF, NO TARGET TRACKS, NO SNARE HITS NEAR PHRASE
  ENDS, THE SNARE HITS ... ARE ROLLS ALREADY, NO ROOM FOR A 3-HIT 1/32 ROLL BEFORE ..., PROBABILITY
  0%, or NONE OF THE N ELIGIBLE ... CHOSEN AT x%.
* **RE-ROLL** uses the next take that gives different rolls (up to 16 ahead); if none do, it
  says the settings allow no variety.
* **Off** removes only the generated rolls; RATCHET strokes and kept roll hits stay. **CLEAR
  ROLLS** clears every roll: generated ones by switching ROLL GENERATION off, the rest as hand
  deletions. One undo step; the tab asks first when hand-made roll hits would go.
* **Older breaks** (revision 5 and earlier) keep the old ROLLS layer inside the GROOVE. The first
  roll action (the switch, a setting, RE-ROLL) sets `recipe.rollLayer`: only their rolls move to
  the transformation, their groove stays exactly as it was.
* The tab's line comes from the actual events (after hand edits and DESTROY): `3 ROLLS · 9
  RETRIGGERS`, manual rolls and rolls in fills/CHOP, or `0 ROLLS · <reason>`.

## Hand edits

The edit layer is positional (`cat|bar|step|sub`) and applied after every transformation, as
for every other control. It is never deleted by a transformation: an edit whose hit is not in
the new result is kept and reported as waiting, and applies again when that result returns.
A generated roll stroke deleted by hand stays deleted for that take.

## Undo and redo

One step each, with the exact events restored (snapshots, never recomputed with new randomness):
CHOP on/off, every CHOP setting (a drag is one step), RE-CHOP, ROLL GENERATION on/off, every
roll setting (a drag is one step), RE-ROLL, CLEAR ROLLS, EXPRESSION, DESTROY and RE-DESTROY,
WILDCARD.

## FREEZE

FREEZE chooses which seeds BAKE keeps; it never disables a transformation. The transformations
change no seed, so a frozen groove stays frozen under them, and BAKE with FREEZE BEAT keeps the
chop and rolls (they come from the beat seed). WILDCARD with FREEZE RHYTHM keeps CHOP, EXPRESSION
and DESTROY as before.

## WILDCARD, NEW PATCH

WILDCARD changes CHOP only with its CHOP category, the roll settings only with RECIPE (a new
recipe's defaults) or GENERATION CONTROLS (PROBABILITY), never ROLL GENERATION; its report lists
the roll settings that changed. NEW PATCH resets CHOP and the roll settings to the defaults
(CHOP off, take 0) and keeps ROLL GENERATION (a preference).

## Playback and export

Every change goes through `Player.setBreak`, so IMMEDIATE, NEXT BAR and NEXT LOOP apply and
nothing restarts. WAV, stems and MIDI are rendered from `App.current`, the pattern on screen.
MIDI writes every roll stroke as a GM note of its drum; EXPRESSION's pitch, reverse and DESTROY's
sound shaping are audio only (MIDI has no transposed drum notes).
