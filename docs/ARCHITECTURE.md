# How The Breakery works

```
INGREDIENTS ──kit index──┐
RECIPE + SEEDS ──────────┤
                         ▼
                   engine/generate.ts  (pure TypeScript, no DOM, no audio)
   GENERATION (GROOVE, engine 2): PERSONALITY's recipe nudges → phrase plan → foundation
             → support → [mutations] → phrase development (answers, development, chops, fills)
             → BREAK DNA (revision 4: dnaGrammar.ts) → CYMBALS (revision 4: cymbals4.ts)
             → PERSONALITY phrasing → performance
             → AUTO samples → TOMS → ROLLS
   LEGACY (engine 1, v1/, frozen): the first release's generator, then AUTO samples
                         │
   TRANSFORMATION (engine/transform.ts), from the GROOVE every time:
             CHOP (engine/chopper.ts) → roll EXPRESSION (rollExpr.ts) → DESTROY (destroy.ts)
                         │
             → REGEN TRACK (regen.ts: the selected tracks from re-baked candidates)
             → PERSONALITY performance and DILLA timing (personality.ts, dilla.ts)
             → hand EDITS → PICK modes and hand-chosen samples
             → DESTROY (destroy2.ts: the DESTROY tab, on the finished events)
                         │
                         ▼  Break = structured events
          ┌──────────────┼───────────────┐
          ▼              ▼               ▼
   ui/patternWindow  audio/timeline.ts  engine/analysis.ts
   (shows events)    Break → Core Timeline (one function for both)
                         │
              ┌──────────┴──────────┬────────────────────┐
              ▼                     ▼                    ▼
       audio/player.ts        audio/takeaway.ts     midi/breakMidi.ts
       (both resolve note instruments, DESTROY's shaping included, via audio/shaped.ts)
       live: Core Mixer +     offline: Core         eventTick → 960 PPQ,
       NotePlayer, look-ahead renderTimeline        per-track channel/note
       scheduling             → WAV / ZIP           → midi/smf.ts → .mid
         │      ▲
         ▼      │ pulses (EXTERNAL clock)
       midi/router.ts → MidiOutput per device → Web MIDI out (notes, clock)
       app/midi.ts ← midi/access.ts ← Web MIDI in (notes → LiveSamplePicker → Player.live;
                                                  clock → midi/clockIn.ts)
```

## Modules

| Folder | What | Depends on |
|---|---|---|
| `src/engine/` | The generator: `types` (data), `rng` (seeded streams), `meter` (metrical weights, syncopation, Euclid), `styles` (recipes, `FLOURISH`: each recipe's toms and rolls, and `VOCAB`: each recipe's grooves and cymbal vocabulary), `approaches` (groove approaches, phrase forms, motifs), `cymbals` (hats and ride, revision 3), `cymbals4` (the cymbal engine, revision 4), `dna` and `dnaGrammar` (BREAK DNA), `destroy2` (the DESTROY tab), `tempo` (tempo profiles), `wildcard` (WILDCARD), `foundation` (Layer A), `support` (Layer B), `phrase` (Layer D: 1–8 bar plans, variation, fills, MUTATE), `chop` (event-level resequencing and fill rolls), `performance` (Layer C), `toms` (tom fills), `rolls` (ROLLS), `kit` (AUTO sample choice, fallbacks), `samples` (sample-selection modes), `edits` (the hand-edit layer and its operations), `generate` (BAKE, engine dispatch, named seeds, mutation), `analysis` (metrics), `ascii` (text grids). `v1/`: engine 1, frozen. | nothing (pure, testable in Node) |
| `src/audio/` | `demoKit` (synthesised one-shots), `ingredients` (the current kit's samples by category, folder import, loudness; storage and the sample library through Core's `KitLibrary`), `categorise` (category suggestions from paths), `timeline` (Break → Core timeline, the single timing function), `player` (live), `takeaway` (export), `shaped` (DESTROY's sound shaping as an instrument). | `@slopfactory/core`, engine |
| `src/midi/` | `smf` (Standard MIDI File writer and reader, shared with DOWNBEAT), `breakMidi` (Break → type 1 SMF), `messages` (builders and parsing), `output` (note-safe output per device), `router` (live hits → timestamped notes, queued note-offs, clock out), `routing` (per-track settings, defaults, input matching), `clockIn` (external clock follower), `access` (Web MIDI wrapper). Built on Core's MIDI interfaces. | audio/timeline, engine, Core midi types |
| `src/app/` | `app.ts`: state and actions (recipe, seeds and names, freeze, batch, history, favourites, MUTATE, sample settings, solo/mute, hand edits with undo/redo and selection, persistence); `seeds.ts` (history, favourites, DICE names); `mix.ts` (solo/mute precedence); `midi.ts` (MidiRig: MIDI settings, devices, input, clock source); `kits.ts` (The Breakery's side of Core's kit system: categories as kit roles, INGREDIENTS and PICK settings as kit instruments and back, the legacy `.breakery-kit` reader and migration; see [KITS.md](KITS.md)); `bundledKits.ts` (kits shipped with The Breakery: none yet). | engine, audio, midi, Core kits |
| `src/ui/` | The 1-bit interface: `widgets`, `dialogs`, `tooltip` (from emmm), one file per window (`patternWindow` is also the grid editor and the selected-hit strip; `recipeWindow` holds the RECIPE, CYMBALS (`cymbalsTab`), PERSONALITY (`personalityTab`), CHOP (`chopTab`), ROLLS (`rollsTab`), DESTROY (`destroyTab`) and MUTATE (`mutateTab`) tabs, `patternWindow` the PATTERN and MIXER (`mixerPanel`) tabs, and `gridEdit` the grid's click and drag rules; `midiWindow` is MIDI), `palette` (The Breakery's palette roles) and `paletteWindow` (Core's palette editor in a window).; `kitsPanel` and `libraryPanel` (the KITS and LIBRARY tabs of INGREDIENTS: views of Core's KitSession and KitLibrary) | app, Core palette, Core kits |
| `src/main.ts` | Builds the screen and menus, keyboard, drag-and-drop; wires everything. | all |

## The event model

A `Break` holds the recipe, the seeds, the phrase plan, the performer's feel and a list of
`BreakEvent`s:

| Field | Meaning |
|---|---|
| `cat` | drum category (kick, snare, ghost, htom, mtom, ltom, hat, open, ride, crash, perc) |
| `bar`, `step`, `sub` | grid position: bar, sixteenth (0–15), ticks after the step (12 per sixteenth: 6 = a 32nd) |
| `level` | the score's nominal dynamic (0–1), before performance |
| `vel` | performed velocity, 1–127 |
| `swing` | swing delay, in sixteenths |
| `offsetMs` | microtiming, milliseconds |
| `role`, `why` | what the hit does musically and why it was placed (shown on hover; kept for slicing and MIDI) |
| `sample` | the sample id, or null (silent) |
| `ref` | identity for editing: the generated hit's key `cat\|bar\|step\|sub`, or `m:<id>` for a hand-placed hit |
| `manual`, `editWhy`, `pinned` | edited by hand (`added`, `moved` or `edited`), what was changed, and a sample chosen by hand |

The grid position (the *score*) and swing/microtiming/velocity (the *groove*) are kept apart,
as in the Groove MIDI Dataset's representation, so later features can freeze, compare or breed
them separately. `GM_NOTE` in `types.ts` maps categories to General MIDI drum notes, used by the
MIDI file and live MIDI out (as the default per-track mapping, midi/routing.ts).

## Hand edits

`edits.ts` keeps the user's edits as a LAYER over the generated events, not baked into them, so
the generator stays deterministic. The layer is positional: generated hits it removes or changes
(by key), and hits added by hand (a moved generated hit is a removal plus a hand-placed copy that
remembers what it was). `bake(…, edits)` applies it after the AUTO sample choice (whose
sequential stream must not shift when a hit is added) and before the PICK modes, so playback,
TAKEAWAY, stems, MIDI and the pattern view all use the edited events. Hand-placed hits take swing
from the recipe; their timing field is microtiming on top.

The App keeps the layer with the current break: re-baking the same seeds (recipe, samples, length,
engine) re-applies it; edits that no longer find their hit, or lie beyond a shorter length, are
kept and reported. A new break (BAKE, BATCH, a seed, MUTATE, the history) starts unedited, and the
old break keeps its edits in its history entry (and favourite); FREEZE EDITS carries the layer
onto new breaks instead. Undo and redo are snapshots of the layer (and the selection); a drag is
one step; quick changes of one number coalesce. Live playback takes an edit at once
(`Player.update`), from the next hit not yet scheduled.

## Toms and rolls

`toms.ts` and `rolls.ts` (engine 2) run AFTER the performance and the AUTO sample choice, each
from its own streams (the BEAT seed for what and where, the FEEL seed for how), so they never
change another hit's velocity, timing or sample; at 0 they add nothing and draw nothing, and every
recipe saved before them (no TOMS or ROLLS field = 0) bakes exactly as before
(`test/engine2.test.ts` checks 132 reference breaks). Tom fills re-voice a generated snare run or
play their own figure, keep the backbeat, and decide once for every answer bar.

`Recipe.revision` (CURRENT_REVISION, engine 2; absent = 0) versions what TOM ACTIVITY and ROLL
GENERATION do, so saved breaks reproduce exactly (`test/fixtures/toms-rolls-rev0-golden.json`).
Revision 0 is the fills as released (`addToms`: one all-or-nothing draw per bar, weighted by the
bar's role, so in a 4-bar plan almost only the turnaround could get toms). Revision 1
(`addTomPhrases`) ranks phrase slots through the pattern (phrase ends first, then inside bars),
and TOM ACTIVITY sets how many are used, how long they are and how many toms they span, with the
recipe's `TomPhrasing` (FLOURISH) leaning it; a fixed number of draws per bar keeps everything
else in place, and `tomVoices` spreads the phrases over the toms the kit has. In revision 1 a
roll never removes a tom phrase hit, and ROLL GENERATION off (`holdsRolls`) holds back every
roll: the fills' rolls play as plain fills and CHOP's RETRIGGER makes none. ROLL GENERATION is
the user's preference (`App.rollGeneration`, saved, off for a new user); every new or changed
recipe is baked with it (`App.fresh`), and a restored break that disagrees follows it with its
rolls kept as hits. A
roll is N strokes exactly SPEED ticks apart ending one stroke before its anchor (swing moves the
roll as a whole); it never crosses a bar line or runs over a backbeat, downbeat kick, crash, tom
fill or another roll, and the hands it needs stop timekeeping and ghosts under it. The toms are
three categories like any other (samples, PICK modes, solo/mute, stems, MIDI notes 50/47/45) with
no fallback.

## Palettes

Colour palettes come from Slop Factory Core (`@slopfactory/core/palette`, Core 0.3.0): the
model, presets, palette files, preferences and editor that the first instrument had, made
generic. `src/ui/palette.ts` declares The Breakery's roles (Core's shared six plus HITS and HAND
EDITS) and uses the shared presets; `applyPalette` writes one style sheet of CSS custom
properties, which everything on the screen draws with (a test checks the interface has no colours
of its own). Preferences live in `breakery.palette.*`, never in a break.

## Seeds and determinism

Every random decision draws from a named stream derived from one of four layer seeds:

| Seed | Streams | FREEZE keeps |
|---|---|---|
| `beat` | foundation, kick/snare variation, chops, fills, crash placement, tom fills, rolls | kick and snare pattern, tom fills and rolls (FREEZE BEAT; RHYTHM = beat + detail + feel) |
| `detail` | timekeeper plan, ghosts, lifts, percussion, their variation | supporting voices |
| `feel` | performance, and how tom fills and rolls are played | timing and dynamics tendencies |
| `kit` | sample selection (AUTO's main sample and alternates; RANDOM, ALTERNATE, PER BAR …) | sample choices (FREEZE SAMPLES) |

The rhythm never depends on the loaded samples (fallbacks and sample selection are resolved after
generation). The SEED box sets all four seeds to the same value: a number, or a name hashed with
32-bit FNV-1a over its normalised UTF-8 bytes (`hashSeedName`), so names are stable across
browsers and versions. Numbers of up to nine digits stay numbers, so every saved numeric seed
bakes as it always did. Names are case-insensitive for the hash (the display keeps the case typed)
so a name read aloud or retyped reproduces the break. BAKE, DICE, BATCH, RANDOM RECIPE and
WILDCARD give each new break a memorable name (`seeds.ts diceName`: ADJECTIVE-NOUN-NN), kept as
`Break.seedName` and shown in the SEED box, the batch, the pattern card and export file names. A
seed alone does not reproduce a break: the recipe (and FREEZE, mutations, regenerations, hand
edits) do too, which is why the history and favourites keep all of them. BAKE draws a new seed for each layer that is not frozen. Changing a control
re-bakes the same seeds, so its effect is heard on the same break. MUTATE appends a mutation
(its own seed plus which layers it may change) to `seeds.mut`; each one applies a few variation
operations to the groove cell before the phrase is developed.

## Generation, transformation and reproducibility

There is one generator the user sees, **GROOVE**: the recipe-driven generator (`Recipe.engine` 2,
`v2/`, with the Phase 7 JUNGLE `jungleCuts`). `groove()` in generate.ts bakes it. There is no
engine selector any more.

`Recipe.engine` still says which generator baked a break, because saves must reproduce. Engine 1
(`src/engine/v1/`, with its own frozen recipe table) is the first release's code, now internal
only: `test/engine1.test.ts` checks 120 reference breaks from that release still come out
identical, sample choices included. A saved recipe without an engine is engine 1. Such a break
(restored state, history, favourites) loads as **LEGACY** and plays exactly as saved; the app never
re-labels its metadata. RECIPE ▸ **USE GROOVE** (`App.useCurrentGroove`) re-bakes the same seeds
and controls with the GROOVE (JUNGLE gets `jungleCuts`), one undoable step. Anything that makes a
new break (BAKE, BATCH, a typed seed, DICE, a seed from a link, RANDOM RECIPE, a recipe change)
leaves LEGACY and uses the GROOVE; MUTATE is refused on a LEGACY break with a message. Tune the
GROOVE freely; never change `v1/`.

Known compatibility limit: before this change a typed seed with engine 1 selected baked an engine 1
break; it now bakes a GROOVE break. Breaks already saved with engine 1 still reproduce from the
state, the history and the favourites.

**Transformations** (`engine/transform.ts`) run after the GROOVE and before the hand edits:
`RESULT = transform(GROOVE, recipe, seeds)`. They always start from the GROOVE baked from the seeds,
never from an earlier result, so they never compound, and a transformation that is off returns its
input unchanged. CHOP is the first; `TRANSFORMS` is the list a later one joins. Their settings live
in the recipe (`Recipe.chop`), so they travel with the history, favourites, batch, undo and the
saved state, and a recipe without them (every older save) is unchanged.

## CHOP

`engine/chopper.ts` re-arranges the GROOVE's phrase at the event level (no audio is sliced):

* **Analysis.** `atomicSpans` finds rolls and tom fills (never cut). Backbeats, ghosts, the bar
  roles of the phrase plan (groove, answer, development, fill, turnaround), crashes and floor kicks
  (anchors that stay put) come from the events' roles.
* **Slicing.** `slicePhrase` cuts each bar on the SLICE SIZE grid (LARGE 8, MEDIUM 4, SMALL 2,
  MICRO 1 sixteenths); the recipe's `grain` joins neighbours into longer phrases (FUNK) or splits
  them into fragments (BREAKCORE). No slice cuts through a span.
* **Choosing slices.** Each slice has a chance from AMOUNT, the bar's role (turnarounds and fills
  more, the first groove bar least), its position and backbeat and fill protection. Slices are
  ranked once (weighted keys) and the expected count is edited, so a higher AMOUNT edits the same
  slices and more. The first slice is never edited, so the loop starts as itself.
* **Operations.** RECALL an earlier fragment (motif reuse, call and response, displaced
  fragments), SWAP with the next slice, REPEAT the previous slice, DOUBLE or RETRIGGER a drum in a
  fast burst (written as `role: 'roll'`, so ROLLS and the PATTERN group them), GAP (a drop-out, at
  most one per bar). RETRIGGER scales doubles and retriggers; at 0 none are added. Recipes weigh
  the same operations (`CHOP_STYLE`): FUNK long fragments and a held backbeat, HIP-HOP and BOOM BAP
  motifs and gaps, JUNGLE snare-led cuts and fast retriggers, D&B controlled edits with turnaround
  emphasis, BREAKCORE tiny fragments and many retriggers.
* **Continuity.** Moved hits keep their velocity, sample and feel; swing is recomputed at the new
  place. Recipes with a strong backbeat re-anchor it, refuse new snares on beats 1 and 3, and
  restore a backbeat to bars left without one. Overlaps keep the louder hit, ghosts under a snare
  and hats under an open hat are dropped.
* **Determinism.** Streams `chop-slices`, `chop`, `chop-order` from the BEAT seed (plus the RE-CHOP
  `variant`), with a fixed number of draws per slice, so FREEZE BEAT keeps the chop and the same
  inputs always give the same result.

Copies carry the sample the GROOVE chose for their source hit, so FREEZE SAMPLES and the kit seed
are respected. **Hand edits after CHOP**: CHOP is a preview, recalculated at every change, until the
first hand edit. The edits are positional and were made on the chopped result, so CHOP is then
APPLIED (fixed: `App.chopLocked`); `setChop` refuses with a message rather than move hits under the
edits. Undoing the edits, or CLEAR ALL HAND EDITS, frees it. Nothing is discarded silently.
`npm run evaluate` writes `docs/chop-report.md` (grids and measures, not a listening test).

## The expressive engine (Phase 12)

Research, interpretation and design decisions: [EXPRESSIVE_RESEARCH.md](EXPRESSIVE_RESEARCH.md).
Measured event data: [expressive-report.md](expressive-report.md) (`npm run evaluate`).

* **Per-hit PITCH and REVERSE.** `BreakEvent.pitch` (semitones, -24..+24, absent = 0) and
  `reverse` (absent = forwards). Absent fields are the old behaviour exactly. `audio/timeline.ts`
  maps them for every renderer: `notePitch` (Core's note pitch, `ROOT_PITCH` + semitones, so
  pitch is by playback rate) and `noteInstrument` (the sample id with `~rev`). `Ingredients`
  resolves `~rev` to a reversed copy (`audio/reverse.ts`: silent tail trimmed below -60 dB, a
  2 ms fade-in, cached per sample; the original is never changed), so the live player, the
  offline render, WAV, stems and batch all play the same thing. The player warms reversed
  copies when a break is set. MIDI ignores both (GM notes, no pitch bend): a MIDI file of an
  expressed break is byte-identical to the plain one.
* **Roll EXPRESSION** (`rollExpr.ts`, recipe `rollExpr`, absent = CLASSIC): pitch, velocity and
  timing contours, ratchet counts, reverse modes, 12 presets and DICE (`diceExpr(seed)`).
  `expressRolls` reshapes each roll group as a whole from stream `roll-expr:<variant>:<start>`
  of the FEEL seed, after CHOP, and touches no other hit. It shapes rolls that exist; it never
  makes rolls, so ROLL GENERATION off still means no new rolls. **RATCHET** (`edits.ratchetHit`)
  is a hand edit: the selected hit split into n strokes with the same contours, as hand-placed
  roll hits (one undo step).
* **DESTROY** (`destroy.ts`, recipe `destroy`): after CHOP and EXPRESSION, on beat windows.
  Beats are ranked once (weighted keys from the BEAT seed), so more AMOUNT destroys the same
  beats and more; each beat's operation comes from its own stream. The loop's first beat is never
  destroyed. It starts from the GROOVE every time, so it never compounds; AMOUNT 0 is the
  identity. Operations are event approximations: GATE removes hits in closed sixteenths, TAPE
  STOP moves, lowers and softens each hit along a falling rate. With ROLL GENERATION off,
  STUTTER repeats sixteenths (role `chop`) instead of making 1/32 rolls. Fixed once there are
  hand edits, like CHOP.
* **PERSONALITY** (`personality.ts`, recipe `personality`, absent = NEUTRAL) acts in three
  places: `personaRecipe` (bounded, proportional nudges of the recipe, so 0 stays 0),
  `personaBars` (phrasing edits of the developed bars; never adds a tom or a roll; additions
  scale with DENSITY) and `personaPerform` (timing and dynamics of the finished events; a roll
  moves as a whole). INTENSITY 0 is the recipe exactly.
* **DILLA** (`dilla.ts`) is the DILLA personality's timing: one of four strategies from the FEEL
  seed, per-voice swing (replacing the recipe's, not added), per-voice lean and a two-bar table.
  `personaPerform` leaves timing to it, so nothing is offset twice.
* **BREAK DNA** (`dna.ts`, recipe `dna`, absent = NONE): AMEN, a construction vocabulary
  (A A A′ B) blended into the developed bars at INFLUENCE; `dnaChopStyle` leans CHOP towards
  Amen-style edits. No audio is involved.
* **REGEN TRACK** (`regen.ts`, seeds `regen`: a lineage of `{cats, n}` steps). Baking a step
  re-bakes the whole GROOVE and transformations from six candidate seeds (`regenSeeds`: hashed
  from the BEAT seed, the tracks and the step, keeping FEEL and KIT), scores each candidate's
  selected tracks against the tracks that stay, and swaps in the best. Every other track is
  byte-identical, because the personality's busy-bar dynamics are counted from the events before
  REGEN and roll leads are found per drum. It is an explicit request, so it applies whatever
  FREEZE says (the status line says so). It is kept by `reseed` only when BEAT and DETAIL are both
  frozen, as mutations are. An empty track is left alone (its part is on another track).
* **Revision 2** (`CURRENT_REVISION = 2`): TOM ACTIVITY's recalibrated curve (`toms.tomCurve`)
  and longer phrases. Recipes saved with revision 1 (or 0) still bake exactly as before.
* **Persistence.** All of the above live in the recipe or seeds, so history, favourites, undo,
  reloads and batch carry them; `entryKey` includes them only when active, so earlier keys are
  unchanged. `App.carried()` keeps CHOP, DESTROY, EXPRESSION, PERSONALITY and DNA across recipe
  changes.

## Rhythmic intelligence (Phase 13)

Research, interpretation and design decisions: [rhythmic-research.md](rhythmic-research.md).
Measured event data: [diversity-report.md](diversity-report.md) against the baseline in
[diversity-baseline.md](diversity-baseline.md) (`npm run evaluate`).

* **Revision 3** (`CURRENT_REVISION = VOCAB_REVISION = 3`). Every new behaviour below is gated
  on `usesVocab(recipe)` (engine 2, revision 3 or later). Recipes saved with revision 2 or
  earlier keep identical random draws: test/phase13.test.ts fingerprints 396 revision 2 breaks
  against the output of main at the merge of Phase 12.
* **Composition order** in `bakeV2`:
  1. A **groove approach** comes from stream `approach` of the BEAT seed (`approaches.ts`
     `chooseGroove`, weighted by `VOCAB[style].grooves`). It shapes the StyleDef that
     `foundation.ts` uses. With revision 3, the foundation keeps a random candidate near the
     best instead of always the best.
  2. Support (ghosts and percussion) runs. With revision 3 it no longer lays down the
     timekeeping.
  3. A **phrase form** comes from stream `form` (`chooseForm`; every form ends in T) and a
     **motif** from stream `motif` (`chooseMotif`). The answer bars develop the motif
     (`phrase.ts` `developMotif`).
  4. Shuffle grooves move hits onto the triplet grid (`onTriplets`). `performance.ts` does not
     swing those hits again.
  5. The **cymbals** are added by `addCymbals` (`cymbals.ts`, stream `cymbals` of the DETAIL
     seed). It draws one plan per phrase and renders it per bar against each bar's kicks,
     snares and fill marks (`FillMark`, recorded by `developPhrase`).
  6. The approach is returned as `Break.approach` (groove, form, motif, hats, ride,
     development), shown in the CYMBALS tab and the pattern card's tooltip.
* **HI-HAT and RIDE ACTIVITY** are `Recipe.hats` and `Recipe.ride`. When absent they default to
  `VOCAB[style]` (`hatActivity`, `rideActivity`). **RELATIONSHIP** is `Recipe.cymbals` (absent
  means ALTERNATE).
  * At 0, `generate.silence` removes that family after every later layer, and `flourish`
    drops the hat roll target.
  * Personalities scale their cymbal additions by the activity (`personality.ts` `tkRoom`).
* **Tempo** (`tempo.ts`): `TEMPO_PROFILES` and `tempoFor(style, seed)`.
  * `App.setStyle` and `App.randomRecipe` take their tempo from the profile, or keep it with
    `App.tempoLock` (saved as a preference, not an undo step). `App.diceTempo` re-rolls the
    tempo of the same break. BAKE never changes the tempo.
  * `Player.schedule` changes an internal clock's tempo at the switch point, keeping the
    position in beats. An external clock is never re-timed.
* **WILDCARD** (`wildcard.ts`). `wildcardRecipe` is pure and seeded, and `App.wildcard(seed)`
  applies it.
  * It reseeds the layers that are not frozen. The KIT seed changes only with SAMPLE
    ASSIGNMENTS on and KIT not frozen.
  * Optionally it moves the mixer (`wildcardMix`; solo and mute are kept) and applies an output
    preset (`OutputChain.applyPreset`, Core unchanged).
  * One press is one undo step. A snapshot that changed the mixer or output carries them as
    `extras`, which `restoreSnapshot` puts back, and redo re-applies them.
  * The settings (`App.wildcardSettings`) are saved with the app state, and edited in the
    Wildcard menu.
* **Interface**:
  * `ui/cymbalsTab.ts` is the CYMBALS tab of the RECIPE window. The RECIPE tab's HATS · RIDE
    button opens it.
  * LOCK and RND sit beside the BPM box.
  * WILDCARD sits beside BAKE. The Wildcard menu holds the category toggles, and the W key
    triggers WILDCARD.
* `destroy.ts` fix: FREEZE with ROLL GENERATION off now copies only the roll hits that sit on
  the sixteenth grid, as `chop` hits, so no new 1/32 rolls appear.

## BREAK DNA, cymbals, DESTROY and seeds (Phase 14)

Research and design: [break-dna-research.md](break-dna-research.md). Measured event data:
[phase14-report.md](phase14-report.md) (`npm run evaluate`).

* **Revision 4** (`CURRENT_REVISION = CYMBAL_REVISION = 4`). Revision 4 is gated on `usesCym4`
  (engine 2, revision 4 or later). Revision 3 and earlier bake exactly as before:
  test/phase13.test.ts and test/fixtures/toms-rolls-rev0-golden.json fingerprint them.
* **Pipeline** (bakeV2, revision 4), after the phrase is developed:
  1. shuffle grooves move onto the triplet grid;
  2. the closed hats, open hats, ride and crashes the phrase layers made are stripped (the cymbal
     engine owns them);
  3. **BREAK DNA** (`blendGrammar`) blends the grammar's kick, snare, ghost and percussion
     figures into the bars at INFLUENCE;
  4. **CYMBALS** (`addCymbals4`) place every cymbal family from its activity, the subdivision,
     the relationships and the DNA's leans, against each bar's kicks, snares and fill marks;
  5. PERSONALITY phrasing, then the 100% strokes are restored (a personality or fill cannot
     thin a family set to 100%), then performance.
  Then, as before: AUTO samples, toms, rolls, `silence` (a family at 0 is removed after every
  layer), `keepFull` (a family at 100% gets back any stroke a later layer took), the
  transformations, REGEN TRACK, PERSONALITY performance, hand edits and the samples. **DESTROY**
  runs last, on the finished events (`destroy2`), so it destroys what you hear, hand edits
  included (hand-edited hits themselves are never destroyed).
* **BREAK DNA** (`dnaGrammar.ts`): eight grammars (`DNA_DEFS`). INFLUENCE is monotonic because
  every figure's threshold is a fixed draw from the BEAT seed: a higher influence is the same
  break with more of the DNA. 0 (or NONE) returns the bars untouched. The DNA never changes the
  tempo, the kit, the mixer or the samples, never adds toms, rolls or cymbals (it only leans the
  cymbal engine), and respects every recipe control and FREEZE (it reads only the BEAT seed).
  DICE (`App.diceDna`) picks another DNA, keeping INFLUENCE (60% when there was none). The
  PERSONALITY tab holds the selector (`GemSelect`: arrows, Home, End, Page Up and Down, Space,
  Return and Escape), with the DNA's description and source in its tip.
* **Cymbals** (`cymbals4.ts`): `Recipe.cym` (CymbalSettings). CLOSED HAT and RIDE ACTIVITY are
  coverage of the SUBDIVISION: each bar plays the top round(activity × positions) positions by
  score (metric weight, the figure's lean, a seeded noise that does not depend on the activity),
  so more activity plays the same strokes and more, 100% plays every position the relationship
  allows, 0% none. OPEN HAT ACTIVITY works the same over the open-hat positions; CRASH ACTIVITY
  over the phrase marks (at most two a bar). The PRIMARY RELATIONSHIP decides which positions each
  family may use; OPEN/CLOSED decides how open hats sit with the closed ones. With OPEN-HAT CHOKE
  off, closed hats are marked `free`, which the shared `hatChoke` reads, so live playback,
  exports and stems agree. `migrateCym` carries a revision 3 recipe's HI-HAT ACTIVITY, RIDE
  ACTIVITY and RELATIONSHIP into revision 4 when it is changed (`App.fresh`).
* **DESTROY** (`destroy2.ts`): `Recipe.destroy2`, separate from the Phase 12 CHOP ▸ DESTROY
  (`Recipe.destroy`, still baked for breaks that have it, removable from the DESTROY tab). A
  track × effect matrix, a PROBABILITY per effect, MASTER AMOUNT, TAKE (RE-DESTROY) and CHAOS.
  The fixed order is STUTTER, PITCH, REVERSE, GATE, TAPE STOP; conflicts are resolved as the
  header of destroy2.ts lists. Repeats are bounded (8 a hit, `MAX_NEW` a pattern, never past the
  next hit of the track). The effects are fields of the hit (`revFrac`, `detune`, `gate`,
  `tape`); `noteInstrument` encodes them, in seconds at the tempo, into the instrument id
  (`~fx:`), and `Ingredients.instrument` builds a `ShapedInstrument` for it, so the player and the
  offline render play the same note. Changes are heard through the switching mode (IMMEDIATE,
  NEXT BAR, NEXT LOOP) like any other change.
  * **MIDI**: the hits (a stutter's repeats are notes) on each track's own note. Pitch, reverse,
    gate and tape stop are sample playback, not General MIDI, so they are not in the file; a
    drum note is never transposed to another drum.
  * **FREEZE**: the draws come from the BEAT seed, so FREEZE BEAT keeps which hits are destroyed;
    WILDCARD with FREEZE RHYTHM keeps the DESTROY settings.
* **Persistence and undo**: `cym`, `destroy2` and `dna` are recipe fields, so they are saved,
  carried by the history, favourites, batch and links, and each change is one undo step.
  `sanitiseRecipe` sanitises them and, for revision 4, drops the revision 3 fields (`hats`,
  `ride`, `cymbals`). Older saves load unchanged.
* **WILDCARD**: GENERATION CONTROLS scatters the four cymbal activities around the new recipe's
  own and usually keeps AUTO and ACCENT; BREAK DNA draws from the eight; DESTROY is usually off
  and sometimes a CHAOS take at a moderate MASTER AMOUNT (an earlier CHOP ▸ DESTROY is switched
  off).

## Sample selection

`samples.ts` runs after generation on the finished events and stores the chosen sample and the
reason (`sampleWhy`) on each event, so playback, export, stems and the pattern view agree. Stateful
modes restart at the top of the break (every loop is identical); RANDOM and WEIGHTED hash the KIT
seed with the hit's position, so a hit keeps its sample when other hits change.

## Solo and mute

`app/mix.ts` holds the rule (any SOLO wins; otherwise MUTE silences), which is Core's mixer rule:
live playback sets Core's strip gates (immediate, also on ringing sounds), and TAKEAWAY's AUDIBLE
MIX filters the timeline and MIDI by the same rule. Previews use a second, ungated mixer.

## Audio

* **One timing function.** `audio/timeline.ts` turns grid + swing + microtiming into Core ticks
  (96 000 per quarter note). Live playback converts those same ticks to seconds; export renders
  the same timeline. Preview and TAKEAWAY therefore agree.
* **Live.** `Player` schedules hits on the AudioContext clock with a 150 ms look-ahead, pumped by
  a Worker timer (25 ms) so background tabs keep time. Core's `Mixer` (one voice per category) and
  `NotePlayer` (polyphony, hat choke group) play Core `SampleInstrument`s. A new break waits for
  the loop point.
* **OUTPUT.** `audio/output.ts` gives the app's engine registry (every Core built-in audio
  engine), the chain worklet URL and the seed. `App.output` is Core's headless `OutputChain`,
  restored from and saved with the app settings (not undo); each change goes to
  `Player.setOutput`, which hands it to the live Core `Mixer`'s master chain (after the channel
  strips, before master gain, crossfaded), and TAKEAWAY passes the same configuration to
  `renderTimeline` (master output only). `ui/outputPanel.ts` builds every control from the
  engines' parameter descriptions; nothing in The Breakery names an engine.
* **Export.** Core's `renderTimeline` (OfflineAudioContext, same graph) renders the mix and
  optional per-category stems; `takeaway.ts` folds the tail for seamless loops, turns everything
  down by one shared gain only if the mix would clip, and encodes 16-bit WAV with Core.
* **MIDI file.** `midi/breakMidi.ts` takes each event's Core tick from `eventTick` (the same
  function as the audio) and divides by 100 to 960 PPQ, so swing and microtiming survive to
  about 0.6 ms. Type 1: a conductor track (name, tempo, 4/4), then one track per drum category
  that plays, named after it, on each track's channel and note from the MIDI window (GM drums,
  channel 10 and `GM_NOTE`, by default) with the performed `vel`. Notes last a 64th, or end a
  tick before the same channel and key's next note-on (snare and ghost share note 38 across
  tracks); hits on the same channel, key and tick are merged at the louder velocity.
  `midi/smf.ts` is DOWNBEAT's writer (itself grown from emmm's), so the Slop Factory apps write
  the same files; Core has MIDI interfaces only, no SMF yet. Its reader backs the round-trip
  tests. TAKEAWAY's *+ MIDI* adds the file to the ZIP with stems, or downloads it beside the WAV.
* **Live MIDI.** Slop Factory Core's `@slopfactory/core/midi` has interfaces only (no shared
  implementation yet: its `docs/MIDI-ROADMAP.md`), so The Breakery implements them with the
  code the roadmap names as the starting points: DOWNBEAT's message builders, note-safe
  `MidiOutput`, Web MIDI wrapper (grown for several devices) and pulse estimator, behind Core's
  `MidiOutputPort`, `MidiInputPort`, `MidiPortInfo` and `ClockFollower`, ready to move into Core.
  The `Player` schedules on *song time*: the audio clock itself with the internal clock, or a
  mapping that each external clock pulse re-anchors; every hit it schedules also goes to `MidiRouter` stamped in `performance.now()` time through
  `getOutputTimestamp()` (smoothed), so MIDI is heard with the audio. Note-offs wait in a queue
  until everything before them is scheduled; each device's `MidiOutput` releases a key only when
  every note holding it has ended, retriggers held keys, and on stop drops queued messages
  (`clear()`, where the browser has it) or stamps its note-offs after everything queued.
* **External clock.** `ExternalClock` is pulse-locked (DOWNBEAT's and ANVIL's choice): pulse n
  is quarter n/24 from the start of the song and anchors the player's song time, with the measured
  pulse period placing what lies between pulses; the look-ahead is capped at 12 pulses past the
  last one, so a clock that stops stops the music. Start, Stop, Continue and Song Position drive
  the transport; a silent clock is LOST after 500 ms. With the internal clock the player can send
  F8 at 24 per quarter at the playing tempo, Start and Stop.
* **MIDI in.** Every connected input is heard; `inputTargets` maps device, channel (or OMNI) and
  note to tracks, and `LiveSamplePicker` (engine/samples.ts) applies the track's PICK mode hit by
  hit. Live hits go through the main mixer at once (SOLO and MUTE apply).
* **Velocity → level** is Core's 1.5-power curve (ghosts at velocity 30 play about −19 dB).
* **Samples** are decoded by Core (WAV/AIFF by Good Bits' parsers, other formats by the
  browser), stored as original bytes in IndexedDB by Core's content-addressed store, indexed in
  Core's kit library (one copy per file, shared by every kit) and never uploaded. Decoded audio
  is cached by the library, so loading a kit again does not decode again.

## Where future features fit

* **BREED**: a child takes layer seeds and recipe values from two parents (e.g.
  beat seed from one, feel from the other, recipe values interpolated) — the layered seeds make
  this natural. Event-level crossover can work bar-by-bar on the `role`-annotated events.
* **OVERBAKE / audio slicing**: every hit's exact time is known (`eventSeconds`), so slice points
  come for free; `chop.ts` and CHOP (`chopper.ts`) already resequence events, and an audio engine could play the chopped
  events as slices of a rendered break (with tails, pitch and stretch).
* **Shared MIDI in Core**: `src/midi/` (except `breakMidi`) is written against Core's MIDI
  interfaces so it can move into Core as roadmap steps 1–5 (messages, access, output, clock,
  clock-in) and be adopted by the other instruments.
* **Output processing**: Core's Good Bits output stage (12-bit, cassette, …) is available to the
  same Mixer/render path with an AudioWorklet URL; it is deliberately off for now.
