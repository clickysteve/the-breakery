# The Breakery

**Freshly baked breaks.** A generative breakbeat instrument for the browser, from the Slop
Factory.

You bring the ingredients (drum one-shots). The Breakery invents the recipe: an original drum
*performance*, with a backbeat that anchors, kicks that syncopate, ghost notes that answer the
snare, hats that keep time with a drummer's accents, a feel, and a turnaround that pushes back
into the top of the loop. Then you take it away as a WAV, to sample, slice and rearrange in your
sampler or DAW.

It is not a step sequencer. You guide it (recipe, tempo, length, density, syncopation, ghosts,
swing, humanise, variation, fills, toms, rolls) and it composes: one to eight bars built as a
phrase, with a groove, an answer, development, fills and a turnaround, tom fills, rolls that lead
into the accents, and in the UK breakbeat recipes chopped, resequenced bars. Then you can take
over: every hit can be added, moved, deleted or changed by hand.

<https://breakery.allmyfriendsaresynths.com/>

## The workflow

| | |
|---|---|
| **INGREDIENTS** | Your samples: KICK, SNARE, GHOST, HIGH TOM, MID TOM, LOW TOM, HAT, OPEN HAT, RIDE, CRASH, PERC, several samples each. **KITS** saves, loads, duplicates, renames, deletes, exports and imports kits; **LIBRARY** holds every sample in this browser, to preview and add to any kit. Kit files (`.kit.zip`) move between browsers and to DOWNBEAT. See [docs/KITS.md](docs/KITS.md). |
| **RECIPE** | Eleven recipes (FUNK, HIP-HOP, JUNGLE, BROKEN, BOOM BAP, HARDCORE, D&B, HALF-TIME, GARAGE, ELECTRO, BREAKCORE), BPM, 1–8 bars, seed (a number or a name), DICE, history, favourites, eight controls and TOM ACTIVITY. |
| **BAKE** | Generate a new break. |
| **BATCH** | Generate eight candidates and audition them. |
| **FREEZE** | Keep RHYTHM (beat, detail and feel) or SAMPLES, or single layers, or your hand EDITS, when baking again. |
| **CHOP** | (a tab beside RECIPE) Transform the GROOVE: re-arrange its phrase (recalls, swaps, repeats, retriggers, drop-outs) with AMOUNT, SLICE SIZE (LARGE, MEDIUM, SMALL, MICRO) and RETRIGGER; RE-CHOP. Non-destructive: the GROOVE is kept. |
| **ROLLS** | (a tab beside RECIPE) Roll generation on/off, probability, length, speed 1/16–1/64 and triplets, dynamics, placement, which drums; CLEAR ROLLS. |
| **DESTROY** | (a tab beside RECIPE) Destroy the finished pattern: STUTTER, PITCH, REVERSE, GATE and TAPE STOP per track (a matrix), each with its own PROBABILITY and settings, a MASTER AMOUNT, RE-DESTROY and CHAOS. Non-destructive: off is the pattern exactly, and the settings are kept. |
| **MUTATE** | (a tab beside RECIPE) MUTATE PATTERN with a style, depth, range and tracks; CREATE RELATED SECTION (verse, chorus, breakdown, build, fill, alternate). |
| **PATTERN** | See every hit and why it is there; edit hits by hand (click to add or delete, shift+click to edit, drag to move; velocity, timing, sample) with undo; SOLO and MUTE each drum. Dense rolls show as one group (ROLL ×N): click to expand. |
| **MIXER** | (a tab beside PATTERN) Level, pan, MUTE, SOLO and a meter for each drum, the master level with output meters and PEAK. |
| **OUTPUT** | (a tab beside BATCH) A master output chain after the mixer and before the master level: up to eight engines in series (OUTPUT STAGE's ten characters, DRIVE, CRUNCH, TONE), each with ON, reorder and REMOVE, BYPASS ALL and presets. Heard at once and rendered into the TAKEAWAY mix; stems stay unprocessed. See [docs/MIXER.md](docs/MIXER.md#output). |
| **TAKEAWAY** | Export WAV: bars + tail, or a seamless loop; full or audible mix; optionally per-drum stems and a MIDI file. |
| **MIDI** | Play the break out to drum machines and DAWs (per-track device, channel and note), play the samples from pads or an external sequencer, follow an external MIDI clock or send one (MIDI ▸ MIDI Settings…). |
| **PALETTE** | The Slop Factory palette editor (BREAKERY ▸ Palette…): Atari, Dark, Amber, Green Screen, C64, Phosphor, Pink Noise, Rave, Paper, or your own. |

OVERBAKE (destructive mutation) and BREED are planned; see *Next steps*.

## Run it locally

You need [Node.js](https://nodejs.org/) 20.19 or newer (22 LTS recommended).

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:5213>. Other commands:

```bash
npm test
```

```bash
npm run build
```

```bash
npm run evaluate
```

`npm run build` type-checks and writes a static site to `dist/` with relative paths (it works
from any folder of any static server). `npm run evaluate` regenerates
[docs/evaluation-report.md](docs/evaluation-report.md).

## Using it

1. **Ingredients.** On a first visit the demo kit is loaded: original sounds synthesised in the
   browser, so you can try everything at once. To use your own: **LOAD…** for files, **FOLDER…**
   for a whole folder and its sub-folders, or drop files or folders anywhere on the screen.
   Dropped on a category's row (or on its sample list), they go to that instrument whatever
   their names say, and a sample already loaded moves there rather than loading twice; dropped
   anywhere else, categories are suggested from folder and file names (`Kicks/`, `BD_01.wav`, `snare ghost.wav`,
   `OH.wav`, `Open Hats/hat 3.wav` …); ambiguous names go to UNSORTED (never discarded), and a
   folder import ends with a review list where you can correct every suggestion. Hidden files
   (`._kick.wav`) and non-audio files are skipped and counted. Select a category to see
   its samples; preview (▶), reassign (the pop-up) or remove (×) each one. A category with no
   samples shows MISSING, NONE: SILENT, or the fallback it uses (GHOST uses SNARE; HAT and RIDE
   stand in for each other). Samples are stored in this browser (IndexedDB) and never uploaded.
   **PICK** chooses how a category with several samples uses them: AUTO (the original: one main
   sample per break with occasional alternates), FIXED (the ● sample), RANDOM, ROUND ROBIN,
   WEIGHTED (type a weight 0–9 beside each sample), VELOCITY (soft hits play the quietest sample,
   loud hits the loudest), ALTERNATE (never twice in a row) or PER BAR. Every choice is
   deterministic, the same in playback and TAKEAWAY, and explained when you hover a hit.
   **KITS** (a tab of INGREDIENTS) keeps sets of sounds: SAVE, SAVE AS, LOAD, DUPLICATE, RENAME,
   DELETE, SET DEFAULT, and EXPORT / IMPORT of portable kit files. The list tells the kit under
   the pointer (dotted), the keyboard cursor (dashed), the selected kit (inverted) and the loaded
   kit (▸) apart; passing over it never selects, a click or Enter does. NEW, SAVE AS and
   DUPLICATE put the new kit in the list at once, selected and ready to RENAME (`.kit.zip`: the kit with its
   audio, readable by any Slop Factory instrument, DOWNBEAT included). Loading a kit changes the
   sounds only: the break, recipe and history stay. **LIBRARY** lists every sample kept in this
   browser: ▶ PREVIEW, add one to the current kit in the selected category (no second import),
   delete what no kit uses. Each sample is stored once, however many kits use it.
2. **Recipe.** Pick a recipe (it sets every control to its defaults), then adjust. Every change
   re-bakes the same seed, so you hear what the control does to this break. Hover any control
   for what it does. **Every number can be typed**: click it (the value is selected), type,
   Return; Escape cancels; ↑ ↓ step (Shift: by 10); drag up/down to sweep. Range bars: click or
   drag, or double-click to type a value. **BARS** is 1–8. **SEED** takes a number or any words
   ("funky chicken", VELVET-THUNDER-42): the same seed and recipe always bake the same break
   (names ignore case and extra spaces; numbers stay numbers, so old numeric seeds bake as they
   always did). A seed alone is not the break: the recipe and its settings come with it, which is
   why the history and favourites keep both. **DICE** rolls a memorable named seed (BAKE, BATCH
   and WILDCARD name their breaks the same way, and exports carry the name); **◀ ▶** (or ← →) move through the history; **FAV** saves the break (recipe, seeds,
   mutations and sample settings; favourites are in the **Seeds** menu). **TOM ACTIVITY** sets how
   much the toms play: from an occasional fill at the end of the phrase to tom phrases through
   it. The **MUTATE** tab (U) makes a related variation by changing the
   groove itself, so every bar follows: a **STYLE** (MUSICAL, SUBTLE, RHYTHMIC, FILLS, SPARSE,
   DENSE, WILD), a **DEPTH**, a **RANGE** (the last part of the phrase) and ALL or chosen
   **TRACKS**; **CREATE RELATED SECTION** makes a verse, chorus, breakdown, build, fill or
   alternate section from the current break. Each is a new break in the history (◀ returns).
   Under the dice, **CHOP** and **ROLLS** show whether each is on and open its tab. A break saved by the first release opens as
   **LEGACY** and plays exactly as it did; **USE GROOVE** re-bakes it with today's generator.
   The **CHOP** tab re-arranges the GROOVE's phrase as a producer would chop a break: **AMOUNT**
   (0 is the GROOVE exactly; low keeps it recognisable, high fragments it), **SLICE SIZE** and
   **RETRIGGER** (fast re-strikes, written as rolls you can edit). Each recipe chops in its own way.
   Every change is recalculated from the GROOVE (seeds unchanged); **RE-CHOP** tries another chop.
   Once you edit a hit by hand, CHOP is applied and stays fixed until you undo the edits.
3. **Bake.** **BAKE** (B) for a new break; **BATCH** (N) for eight candidates (1–8 to audition).
   **FREEZE RHYTHM** keeps hit placement and performance and changes only the samples; **FREEZE
   SAMPLES** keeps the sample choices; or freeze single layers: BEAT (kick and snare), DETAIL
   (ghosts, hats, percussion, cymbals), FEEL (timing and dynamics).
4. **Listen and look.** Space plays/stops; changes arrive at the loop point. The PATTERN shows
   each hit at its performed position (swing and feel included), with height for velocity.
   Hover a hit to see why it is there ("ghost on 1a: anticipates the backbeat on 2") and why it
   plays its sample; shift+click it to hear it. **S** and **M** beside each row SOLO and MUTE that drum,
   at once, without changing the break (if any row is soloed, only soloed rows play: SOLO wins over
   MUTE); the **MIXER** tab adds level, pan and meters, and **OUTPUT** a chain of master
   processing (lo-fi character, saturation, bit and rate reduction, tone). **VIEW** shows every bar, or 4, 2 or 1 bar
   at a time (◀ ▶ to page). A roll too dense to see hit by hit is drawn as one outlined group
   (**ROLL ×N**): click it to expand it to its bar, where every hit of it is drawn (dithered, so
   the main hits stay strongest) and edited on its own; right-click it to delete the whole roll.
5. **Edit by hand.** Click an empty place in the PATTERN to add a hit (on the **SNAP** grid:
   1/16, 1/32, 1/64, 1/16T, 1/32T); click a hit to delete it (a click toggles); **shift+click** a
   hit to select it (and hear it); drag a hit sideways to move it (past a small threshold, so a
   click never moves it; a 32nd stays a 32nd: moves keep a hit's offset from the grid); drag from
   an empty place to paint several; right-click a hit, press Delete or Backspace, or **DEL**, to
   delete it; Escape deselects. The strip under the grid sets the selected hit's **VEL** (1–127), **TIME**
   (± ms against its place and swing), **SAMPLE** (any loaded sample, or its category's PICK
   mode), and has ◀ ▶ (move by a SNAP step; ← → too), **DUP**, **DEL** and **REVERT** (back to the
   generated hit). ⌘Z / ⇧⌘Z undo and redo every edit; **CLEAR EDITS** removes them all. Hits you
   placed or moved carry a ■, hits you changed a □, and their explanation says what you did.
   Edits are part of the break: playback (at once), TAKEAWAY, stems and MIDI all use them.
   **Recipe, sample and length changes keep your edits** (re-applied to the re-baked break; edits
   in bars beyond a shorter length are kept for when it grows again). **A new break** (BAKE,
   BATCH, a seed, DICE, MUTATE, the history) starts unedited, and your edits stay with the old
   break in the history (◀ returns to it) and in a favourite; **FREEZE EDITS** (E) carries them
   onto new breaks instead.
6. **Rolls and toms.** The **ROLLS** tab: **ROLL GENERATION** (ENABLED / DISABLED: your
   setting, off to begin with and kept through recipe changes, BAKE, BATCH, seeds, MUTATE and
   reloads; off, new breaks get no rolls (a fill's roll plays as a plain fill, CHOP's RETRIGGER
   makes none), and the rolls already in the pattern are kept until **CLEAR ROLLS** deletes them), **PROBABILITY** (0 = no new rolls), **LENGTH** (hits per roll), **SPEED** (1/16,
   1/16T, 1/32, 1/32T, 1/64), **DYNAMICS** (EVEN, CRESCENDO, DECRESCENDO, ALTERNATING, HUMAN),
   **PLACEMENT** (BEFORE ACCENT, PHRASE END, FILLS, ANYWHERE) and the **TARGET TRACKS** that may
   roll (SNARE, HATS, PERC, TOMS, KICK), with the number of rolls in the pattern. Every roll leads
   into something (a backbeat, the loop point, a tom fill, a beat) and its strokes are real hits
   you can edit one by one. **TOM ACTIVITY** (RECIPE) is independent of ROLLS and sets how much
   the toms play: how many phrases, how long, on how many toms and where. 0% is none; 20% an
   occasional short fill at a phrase end; 50% noticeable fills and the odd answer; 75% frequent
   multi-tom phrases; 100% very active (descending and rising runs, snare into toms, linear fills,
   dotted-eighth groupings, answers to the backbeat, accents inside the bar) without taking over.
   The phrases use the toms the kit has (three, two or one); without tom samples the tom hits
   still go to MIDI and are silent here.
7. **Expression, personality and destruction** (Phase 12).
   * **Pitch and reverse per hit.** Select a hit: **PITCH** (-24..+24 semitones, by playback
     rate: higher is shorter) and **REV** (the sample plays backwards from the hit). Both are
     hand edits (⌘Z), heard live and in every export. MIDI keeps its GM notes and ignores them.
   * **RATCHET** (selected hit): split it into 2 to 16 strokes over 1/16 to 1/2, shaped by the
     ROLLS tab's EXPRESSION.
   * **ROLLS ▸ EXPRESSION**: how every roll moves. PRESET (CLASSIC, PITCH DIVE, PITCH RISE,
     TUMBLE, STUTTER, ACCELERATE, DECELERATE, FADE AWAY, SWELL, PING-PONG, REVERSE BURST, CHAOS),
     **DICE**, PITCH contour with START and END, VELOCITY, TIMING, RATCHET and REVERSE. It
     shapes the rolls there are; it never turns ROLL GENERATION on.
   * **PERSONALITY** tab: who plays the break. 17 personalities (NEUTRAL, ANGRY, FRANTIC, LAZY,
     SLOPPY, NERVOUS, CONFIDENT, DRUNK, MECHANICAL, MANIC, MINIMALIST, SHOW-OFF, STUBBORN,
     PLAYFUL, HEAVY-HANDED, DELICATE, DILLA) and **INTENSITY** (0% = the recipe exactly). Your
     settings keep their meaning: TOMS 0 stays without toms, ROLLS off stays off, a sparse
     DENSITY stays sparse. **DILLA**: kick, snare and hats each in their own time, repeating.
   * **BREAK DNA** (same tab): **NONE** or **AMEN**, with **INFLUENCE** (Phase 14 adds seven
     more; see item 9).
   * **CHOP ▸ DESTROY** (Phase 12): replaced by the **DESTROY** tab in Phase 14. A break saved
     with it still plays as saved, and the DESTROY tab can remove it.
   * **REGEN TRACK** (X, or **Bake ▸ Regen Track**): click a track name in the PATTERN to select
     it (shift-click for more), then regenerate just those tracks. Everything else stays exactly
     as it was; one ⌘Z goes back. It works even with FREEZE on, because you asked for it.
8. **Rhythmic intelligence and WILDCARD** (Phase 13).
   * Every new break chooses a **groove approach** within its recipe (backbeat, sparse, pushed,
     lopsided, half-time, break-derived, two-step, rolling, linear, ghost-led, syncopated,
     four-to-the-floor, skip, fragments, shuffle), a **phrase form** (A A2 A T, A A2 B T,
     A B A T …) and a way of developing its motif. So a new seed gives a different groove, not
     the same one with a few kicks moved. VARIATION 0 still repeats exactly.
   * **CYMBALS** tab (or the HATS · RIDE button in RECIPE):
     * **HI-HAT ACTIVITY** (closed and open hats) and **RIDE ACTIVITY** choose what the cymbals
       play, from sparse accents and quarters through off-beats, broken eighths, 3+3+2, eighths,
       a jazz ride, linear and triplet figures, to skipping sixteenths, sixteenths and (with
       ROLLS on) rapid bursts. 0% means none of that cymbal, whatever the personality.
     * **RELATIONSHIP**: ALTERNATE (one keeps time, the other rests, punctuates or takes over
       for some bars), LAYER or INDEPENDENT.
     * The tab also shows what this break chose.
   * **Tempo**:
     * Choosing a recipe picks a tempo from its range (FUNK 86–124, D&B 160–182, and so on).
     * **LOCK** beside the BPM box keeps the tempo through recipe changes, RANDOM RECIPE,
       WILDCARD and REGEN.
     * **RND** rolls a new tempo for the same break.
     * BAKE never changes the tempo, and the BPM box always sets it.
   * **WILDCARD** (W, beside BAKE): re-imagine the break.
     * Each press gives a new recipe, tempo and controls, and now and then a personality, BREAK
       DNA, CHOP or DESTROY, all drawn around the new recipe's own character.
     * The **Wildcard** menu says what it may change. Samples, mixer and output effects are off
       until you switch them on.
     * FREEZE and TEMPO LOCK are respected, nothing is downloaded or deleted, and solo and mute
       are never touched.
     * One ⌘Z undoes all of it.
9. **BREAK DNA, DESTROY, seeds and cymbals** (Phase 14).
   * **BREAK DNA** (PERSONALITY tab): eight generative grammars informed by classic breaks and
     drumming traditions: AMEN, FUNKY DRUMMER, APACHE, THINK, IMPEACH, ROACHCLIP (recordings),
     BOOGIE and MOTORIK (traditions). Each is a vocabulary (kick cells per beat, a backbeat,
     ghosts and percussion, a phrase unit and how it develops, cymbal and CHOP leans), so every
     seed gives a different break in that language, not a copy of the record. **INFLUENCE** 0% is
     NONE exactly and more influence is the same break with more of the DNA. It never changes the
     tempo, the kit, the mixer or the samples, never adds toms or rolls, and leaves the
     personality to you. **DICE** picks another DNA. No audio from any recording is used or
     shipped. Research: [docs/break-dna-research.md](docs/break-dna-research.md).
   * **DESTROY** tab: switch it on (**ENABLED**), choose which effects may touch which tracks
     (the matrix), then each effect's **PROBABILITY** (how many hits) and how hard: STUTTER
     (repeats, subdivision, even, accelerating or decelerating, a velocity and pitch contour),
     PITCH (range, up, down or both, semitones or free, fixed, dive or rise), REVERSE (whole or
     partial, every hit, alternating or clusters), GATE (length, hard or soft, rhythmic) and TAPE
     STOP (duration, pitch fall, cut or resume). **MASTER AMOUNT** scales every probability,
     **RE-DESTROY** draws another take, **CHAOS** randomises the settings. One undo step each.
     It is heard the same live, in the WAV and in the stems. Hand-edited hits are never
     destroyed, and the repeats are not rolls (ROLL GENERATION stays as you set it). MIDI has the
     hits (repeats included) on each drum's own note: pitch, reverse, gate and tape stop are
     sample playback, which General MIDI cannot carry.
   * **CYMBALS** tab: **CLOSED HAT**, **OPEN HAT**, **RIDE** and **CRASH** activity, each 0–100%.
     For the closed hats and the ride, activity is coverage of the **SUBDIVISION** (AUTO, 1/4,
     1/8, 1/16, 1/32, TRIPLET): 100% plays every position, 0% none, and more activity plays the
     same strokes and more. **HATS ↔ RIDE** (ACCENT, INDEPENDENT, ALTERNATE, LAYER, EXCLUSIVE,
     CALL & RESPONSE) shares the time between them; **OPEN / CLOSED** (ACCENT, ALTERNATE, LAYER,
     INDEPENDENT) and **CHOKE** (on: a closed hat cuts a ringing open hat) shape the hi-hat.
     **THIS BREAK** shows what the engine chose and what the break actually plays, with **REGEN**
     for each cymbal track. A break from Phase 13 keeps its HI-HAT and RIDE ACTIVITY until you
     change a cymbal control, which carries them over.
10. **New patch, CLAP and FX, the WILDCARD report** (Phase 15).
    * **File ▸ New Patch…** (⌘N where the browser allows it; Chrome keeps ⌘N for a new window)
      starts again: the break, recipe, every control, tempo, seed, FREEZE, PERSONALITY, BREAK
      DNA, cymbals, CHOP, rolls, DESTROY, MUTATE and hand edits. Samples, saved kits, favourites
      and preferences stay, and the previous break stays in the seed history (◀). It asks first
      only when the patch has changes, with **KEEP CURRENT KIT** (on: the kit and mixer levels
      stay; off: the demo kit as a new unsaved kit, nothing deleted). There is no SAVE in that
      dialog because patches are not saved as files: FAV keeps a break. **New Patch with Default
      Kit…** asks with KEEP CURRENT KIT off.
    * **File ▸ Clear Pattern** removes every hit and keeps the settings (one ⌘Z brings them
      back). **File ▸ Reset Controls** sets every control to the recipe's defaults and keeps the
      recipe, tempo, seed and the pattern you hear until the next bake or control change.
    * **13 tracks**: KICK, SNARE, GHOST, CLAP, HIGH TOM, MID TOM, LOW TOM, HAT, OPEN HAT, RIDE,
      CRASH, PERC, FX. **CLAP ACTIVITY** layers claps on the backbeat, then answers and pushes, in
      each recipe's own idiom (ELECTRO and GARAGE clap more than FUNK). **FX ACTIVITY** places
      sparse, structural hits (the top of the phrase, section changes, fills; at most two a bar);
      with no FX samples they are silent. FX are never rolled or chopped away. Both are new in
      GROOVE revision 5: a break saved before keeps its exact hits. PERC keeps its role. MIDI:
      CLAP is GM 39 (Hand Clap), FX 27, and PERC moves to 37 (Side Stick) so no two tracks share
      a note; a saved routing with PERC on 39 keeps it and turns CLAP's input off.
    * **WILDCARD** now ends in one status line (`WILDCARD · HARDCORE · 152 BPM · 12 SETTINGS
      CHANGED`); click it (or **Wildcard ▸ Wildcard Report…**) for the **WILDCARD REPORT**: every
      setting it changed, grouped, before and after, with **COPY REPORT**. It stays until the
      next WILDCARD or NEW PATCH, and ⌘Z and redo bring the matching report back. **RANDOMISE
      SAMPLE ASSIGNMENTS** and **RANDOMISE SAMPLE SELECTION MODES** are separate toggles (both
      off by default); the modes change only tracks with two or more samples, never with KIT
      frozen.
    * **Undo** covers every action (DESTROY and RE-DESTROY, CHOP and RE-CHOP, rolls, personality,
      DNA, cymbals, WILDCARD, REGEN, sample categories and PICK modes, CLEAR PATTERN, RESET
      CONTROLS, hand edits): one step each, a slider sweep or a dropped folder is one step, and
      redo is exact. Undo never deletes a sample.
    * **PATTERN**: all 13 rows fit. Under the grid: SNAP, REGEN TRACK, the selected track, UNDO,
      REDO, CLEAR EDITS; then `SELECTED: NONE` (or the selected hit), the MUTED and NO SAMPLE
      counts, and **[?]** for the editing help.
11. **Takeaway** (T). **LOOP** (one WAV), **LOOP + STEMS** (a ZIP: the mix and one aligned WAV per
   track), **STEMS ONLY** (a ZIP of the stems) or **BATCH** (a ZIP with a WAV of each BATCH
   candidate; also **File ▸ Takeaway Batch (ZIP)…**). *Bars + tail* lets the last hits ring out;
   *Seamless loop* is exactly the bars' length with the tail folded onto the start, for looping
   at the stated tempo. What you hear is what you get (SOLO and MUTE included). 44.1 kHz, 16-bit
   stereo. **File names** are built from components you order and switch on: BPM, RECIPE, SEED,
   KIT NAME, PERSONALITY, BREAK DNA and CUSTOM TEXT, joined by an UNDERSCORE, HYPHEN or SPACE
   (`152_HARDCORE_CHICKENHAT.wav`, or `CHICKENHAT_HARDCORE_152.wav`). Stems add their track
   (`_KICK.wav`, `_HIGH_TOM.wav`); the mix gets `_LOOP` as **LOOP SUFFIX** says (ALWAYS, ONLY
   WITH STEMS, NEVER). Names are made safe for every common system (Unicode kept), never empty
   and never doubled; the preview in the dialog is drawn by the same function as the export.
   The earlier name settings carry over. If the mix would clip, it is turned down to −1 dBFS
   (all files by the same amount) and the status line says so. *+ MIDI* adds a MIDI file of
   the break (inside the ZIP when there are stems, otherwise as a second download).
12. **MIDI file** (M, or **File ▸ Takeaway MIDI File**): the break as a Standard MIDI File
   (type 1, 960 PPQ, tempo and 4/4), General MIDI drums on channel 10 (kick 36, snare and ghost
   38, clap 39, high tom 50, mid tom 47, low tom 45, closed hat 42, open hat 46, crash 49, ride
   51, perc 37, FX 27) or each track's channel and note from the MIDI window, one named track per drum, with
   the performed velocities, swing and microtiming exactly as they play. Exactly the bars'
   length, named like `breakery_funk_100bpm_2bar_seed4242.mid`. It needs no samples: every hit
   of the score is written, including hits that are silent here for want of a sample.
13. **Palette** (**BREAKERY ▸ Palette…**): the same palette editor as the other Slop Factory
   instruments (it lives in Slop Factory Core). Choose a palette, or edit any colour (a built-in
   palette is copied first), rename, duplicate, delete, import and export palette files (emmm and
   DOWNBEAT palettes import too), or go back to Atari, the original black and white. Remembered
   in this browser; never part of a break.
14. **MIDI** (**MIDI ▸ MIDI Settings…**): click **MIDI OFF** to turn Web MIDI on (the browser asks
    once). Everything is remembered in this browser, devices included (found again by name if
    the browser renumbers them).
    * **Out**: choose the default OUT device; the break plays out to it while it plays here, every
      hit (sampled or not) with its velocity, swing, microtiming, rolls and hand edits, as a
      64th-note Note On / Note Off. Each track (row) has OUT on/off, its own device (or DEFAULT),
      channel 1–16 and note 0–127; GM drums on channel 10 by default (**GM** resets). OUT follows
      SOLO and MUTE. Stopping, a new routing, a device unplugged or **PANIC** never leave a note
      hanging.
    * **In**: notes from the default IN device (or ALL INPUTS, or each track's own device) on the
      track's channel (or OMNI) and note play that track's samples, at the incoming velocity and
      with the track's PICK mode (ROUND ROBIN takes turns, VELOCITY picks the layer, PER BAR
      uses the bar playing, …), whether or not the break is playing: The Breakery is also a drum
      module for a hardware sequencer. **LEARN** sets a track's note from the next note played.
      GHOST's input is off by default, so a snare note plays SNARE once; give GHOST its own note
      to play ghost samples. A track's name lights when MIDI plays it.
    * **Clock**: INT plays at the break's BPM and can SEND MIDI Clock, Start and Stop to an output.
      EXT follows MIDI Clock FROM an input: Start plays from the top, Stop stops (keeping the
      position), Continue plays on, Song Position moves; the break plays at the sequencer's tempo,
      locked pulse by pulse (swing and microtiming placed between pulses). Space rejoins a running
      clock. A clock that stops arriving (CLOCK LOST) releases every note.

`?seed=12345` or `?seed=funky%20chicken` in the address sets the seed. Keys: **BREAKERY ▸ Keys…**.

## How it generates

A layered generator, deterministic from seeds (engine 2):

1. **Approach and phrase form** (revision 3): a groove approach within the recipe, and a phrase
   form for the length from A (groove), A2 (answer), B (development), F (a short half-way fill)
   and T (turnaround). Four bars can be A A2 A T, A A A2 T, A A2 B T, A B A T and others; every
   form ends in T. Revision 2 recipes keep the fixed plans (4 bars: A A2 A T).
2. **Foundation**: backbeat snares (2 and 4, or 3 in HALF-TIME; displaced in some recipes), fixed
   kicks where the recipe has a skeleton (D&B), kicks chosen from metrical preferences, relations to
   the snares and a liking for pairs; many candidates are scored against target density and target
   *syncopation* (a moderate amount grooves best). HARDCORE can layer a four-on-the-floor kick.
3. **Supporting voices**, conditioned on the foundation: the hats and ride from a cymbal approach
   chosen by HI-HAT and RIDE ACTIVITY, placed against each bar's kicks, snares and fills, and
   developed through the phrase (revision 3; before, eighths with one repeating accent cycle);
   open-hat lifts; ghost-note figures around the true backbeats (anticipation, rebound, two-stroke
   pickups); percussion in the gaps, on the backbeat or on the off-beats.
4. **Phrase development**: answers and development bars vary the groove, mostly in their second
   half; JUNGLE, HARDCORE and BREAKCORE **chop** development bars (blocks of the groove resequenced,
   after Collins' and Hockman & Davies' descriptions of breakbeat cutting) and end on rolls.
5. **Performance**: velocity by role and accent cycle; Linn-style swing (subtle by default, as
   measured in classic breaks); consistent per-drum tendencies (the snare laid back more on 2 than
   on 4, never early; hats ahead; accents a touch late) with small *correlated* drifts, not jitter.
6. **Toms**: tom phrases at phrase ends first (the turnaround, the half-way fill, the end of
   each four bars), then inside bars, more and longer as TOM ACTIVITY rises (revision 2: a
   steeper curve, tom-led at 100 %), never in the loop's first beat; re-voicing a snare run or playing their own figure, never on a backbeat; after the
   performance and from their own streams, so they change no other hit.
7. **Rolls**: runs of strokes at their own subdivision, each leading into an anchor, at most one
   a bar, never in the first groove bar; also after the performance, so they change no other hit.
8. **Transformations**: CHOP, roll EXPRESSION, DESTROY, then REGEN TRACK and the PERSONALITY's
   performance (DILLA's timing), each from the GROOVE every time, so they never compound.
9. **Sample selection** per category (PICK), then your **hand edits**.
10. **DESTROY** (the tab, Phase 14) on the finished events.

With revision 4 (Phase 14), BREAK DNA's grammar is blended into the developed phrase and the
cymbal engine then places every cymbal family (steps 3 and 4 above for the cymbals), before the
personality and the performance. Saved breaks of revision 3 and earlier bake exactly as before.

With revision 5 (Phase 15), CLAP and FX are layered on the finished groove after the rolls, from
their own streams, so every other hit is exactly what revision 4 made: claps first layer the
backbeat, then add the recipe's offbeats, answers and pushes as CLAP ACTIVITY rises (a prefix of
one ranking, so more activity only adds claps); FX take structural places (the top of the
phrase, the bars a MUTATE reaches, fills), at most two a bar. Revision 4 breaks bake exactly as
before (a fingerprint test checks every recipe, personality, DNA, CHOP and DESTROY).

Why each of these choices: [docs/BREAKBEAT_RESEARCH.md](docs/BREAKBEAT_RESEARCH.md). How the
code is organised: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Deployment

The site is static and deployed to GitHub Pages by
[.github/workflows/pages.yml](.github/workflows/pages.yml) on every push to `main` (or by hand
from the Actions tab): `npm ci`, type check, tests, build, deploy. Any failure stops the deploy.
The `CNAME` file holds the custom domain `breakery.allmyfriendsaresynths.com`, which points at
GitHub Pages (`clickysteve.github.io`).

One-time setup: **Settings ▸ Pages ▸ Source: GitHub Actions**, and the custom domain set to
`breakery.allmyfriendsaresynths.com` (with HTTPS enforced once the certificate is issued).

Shared audio infrastructure and the palettes come from
[Slop Factory Core](https://github.com/clickysteve/slopfactory-core) (sampler, mixer, offline
renderer, output engines, WAV/ZIP export, sample storage, the sample library, kits and kit
files, palettes and the palette editor), pinned to a commit in `package.json`; the interface follows [emmm](https://github.com/clickysteve/emmm)'s 1-bit
look, and the grid editing follows DOWNBEAT's conventions (click to add, right-click to delete,
drag, ⌘Z).

## Current limitations

* **Engine 2 is not yet evaluated by ear**, and neither are rolls and tom fills. They are
  checked by tests and by inspecting generated patterns ([docs/EVALUATION.md](docs/EVALUATION.md)),
  but their listening tests have not been run.
* **CHOP is not yet evaluated by ear.** It is checked by tests and by reading generated grids
  ([docs/chop-report.md](docs/chop-report.md)); no listening test has been run.
* Breaks saved with the first release's generator open as LEGACY and reproduce exactly, but a
  typed seed now always bakes with the current GROOVE (before, with engine 1 selected, it baked an
  engine 1 break). There is no engine selector.
* CHOP is fixed once a pattern has hand edits (they are positional, on the chopped result).
* 4/4 only. Hits sit on a grid of 12 ticks per sixteenth (so 1/32, 1/64 and 16th and 32nd
  triplets, not quintuplets).
* Toms never borrow another drum's sound: with no tom samples, tom hits are silent. A visitor
  with the demo kit gets its three new toms once; anyone else loads toms (or **DEMO**).
* Hand edits are positional. A change to a generated hit whose seed or recipe no longer makes
  that hit is kept but inactive (the status line says so). Moving a hit keeps its category (no
  dragging between rows).
* While playing, an edit is heard from the next hit not yet scheduled: a hit deleted within the
  next 150 ms may still sound once.
* Chops rearrange hits, not audio: no slice tails, time-stretch or resampling. Pitch is per hit
  and by playback rate only (higher is shorter, as on a sampler); there is no time-stretch.
* **Phase 12 is not yet evaluated by ear**: the personalities, DILLA, AMEN, roll EXPRESSION,
  DESTROY, REGEN TRACK and the recalibrated TOM ACTIVITY are checked by tests and by measured
  event data ([docs/expressive-report.md](docs/expressive-report.md)), not by listening. The
  personality and DILLA numbers are hand-set characterisations, not fitted to recordings.
* The Phase 12 CHOP ▸ DESTROY (kept for breaks saved with it) works on events: its GATE and
  TAPE STOP are approximations (hits removed, or moved, lowered and softened), and like CHOP it is
  fixed once there are hand edits. The Phase 14 DESTROY tab shapes the sound of each hit instead.
* REGEN TRACK overrides FREEZE (it is an explicit request) and leaves a track with no hits alone.
* **Phase 15 is not yet evaluated by ear.** CLAP and FX placement is checked by tests and
  measured event data, not listened to; the per-recipe CLAP and FX idioms are hand-set.
  * Undoing an import moves samples back to their old categories but keeps samples that the
    import added (undo never deletes a sample); remove them in INGREDIENTS.
  * A patch is not a file: NEW PATCH offers no SAVE (FAV keeps a break, KITS keep sounds).
  * ⌘N reaches the page in Safari and Firefox; Chrome keeps it for a new window.
  * COPY REPORT needs the browser's clipboard permission; where it is refused, the report is
    selected for copying by hand.
* **Phase 14 is not yet evaluated by ear.** The BREAK DNA grammars, the cymbal engine and
  DESTROY are checked by tests and measured event data ([docs/phase14-report.md](docs/phase14-report.md));
  DESTROY's sound shaping is measured in a real Web Audio offline render (when a gated or
  stopped hit falls silent), not listened to.
  * The grammars are informed by sources read only as search summaries; no recording was
    listened to ([docs/break-dna-research.md](docs/break-dna-research.md)). They are
    interpretations, not transcriptions.
  * With activity meaning coverage, the default cymbals use fewer timekeeping classes than
    Phase 13 (the figures show at moderate activity; at high activity a grid fills).
  * TAPE STOP slows one track, not the whole mix. MIDI files leave out pitch, reverse, gate and
    tape stop.
* **Phase 13 is not yet evaluated by ear.** The groove approaches, phrase forms, cymbal
  vocabularies, tempo profiles and WILDCARD are checked by tests and measured event data
  ([docs/diversity-report.md](docs/diversity-report.md)), not by listening.
  * The per-recipe weights are hand-set from sources read only as search summaries
    ([docs/rhythmic-research.md](docs/rhythmic-research.md)).
  * New breaks are more varied and a little less self-similar from bar to bar than before.
  * The tempo of a playing pattern changes at the switch point with the internal clock. An
    external MIDI clock keeps its own tempo.
* A sparse recipe with an energetic personality (FRANTIC) still gains some hits (up to about a
  fifth at 100 % INTENSITY in the measured recipes).
* Recipe values are hand-set hypotheses; some genre rules are not from reliable sources (see
  the research notes, §7).
* Kits live in this browser (and this address): DOWNBEAT and other browsers get them as kit
  files. The first release's saved kits are migrated, and their old copies are kept (they use
  storage until site data is cleared). Kits exported by this version cannot be imported by the
  first release.
* Typed numbers need a hardware keyboard.
* The demo kit is synthetic and plain. Use real one-shots for real results.
* MIDI note lengths are fixed (a 64th). With the GM mapping SNARE and GHOST share note 38 (on
  separate tracks in the file); hits on the same device, channel and note at the same moment are
  sent (and written) once, at the louder velocity.
* Web MIDI needs Chrome, Edge, Opera or Firefox (not Safari), a secure page (https or
  localhost) and the user's permission. Browsers start audio only after a click or key on the
  page: until then, incoming notes and an external Start are ignored (the status line says so).
* Live MIDI out is stamped to be heard with the audio, through the audio output's reported
  latency (`getOutputTimestamp`); hardware with its own latency may need its own offset.
* EXTERNAL clock: the downbeat after Start is known only when its pulse arrives, so it can play
  a few milliseconds late (the audio output latency); the rest of the loop is scheduled ahead.
  MIDI clock is not passed through, and clock out is off while following. Two inputs sending
  clock at once (FROM: ANY INPUT) would double the tempo: choose the device.
* Most browsers cannot drop MIDI already queued: on stop, hits in the 150 ms look-ahead still
  go out, each with its Note Off.
* No OVERBAKE, BREED, audio slicing or effects.
* Desktop-first: the fixed screen (880 × 470)
  scales to fit; phones work best in landscape (in portrait it is small).

## Next steps

1. Run the listening tests (docs/EVALUATION.md §4: engine 1 vs 2, timing, long patterns,
   recipes, sample modes, MUTATE, rolls, toms, editing, CHOP at low, medium and high AMOUNT per
   recipe) with a real kit and tune from them.
2. Calibrate fill, tom and roll tendencies from the Groove MIDI Dataset; flams and drags as
   their own gestures; dragging a hit to another row (change its drum).
3. BREED two favourites; a MUTATE strength measured by rhythmic edit distance.
4. Audio slicing (OVERBAKE): play chopped events as slices of the rendered break, at its known
   hit times, with tails, pitch and time-stretch.
5. MIDI: per-device latency offsets, note maps for common drum machines, Program Change, MIDI
   Learn for the recipe controls (Core's planned `ParameterRegistry`), and moving the MIDI code
   into Slop Factory Core when its shared MIDI modules land.

## Research references

The research behind the design, with links and notes on how much of each source was read:
[docs/BREAKBEAT_RESEARCH.md](docs/BREAKBEAT_RESEARCH.md). Key sources: the Groove MIDI
Dataset and GrooVAE (Gillick et al. 2019); swing in classic breaks (Frane 2017); breakbeat
resequencing in hardcore, jungle and drum & bass (Hockman & Davies 2015); automatic breakbeat
cutting (Collins 2001); microtiming and groove (Davies et al. 2013; Frühauf, Kopiez & Platz 2013;
Senn et al. 2016; Hellmer et al. 2015; Danielsen et al. 2015; Câmara et al. 2020 and 2022); correlated timing fluctuations
(Hennig et al. 2011; Räsänen et al. 2015); syncopation and groove (Witek et al. 2014); Euclidean
rhythms (Toussaint 2005). Phase 12 (personalities, DILLA, AMEN, expression):
[docs/EXPRESSIVE_RESEARCH.md](docs/EXPRESSIVE_RESEARCH.md), adding Charnas, *Dilla Time* (2022).
Phase 13 (groove approaches, cymbals, tempo): [docs/rhythmic-research.md](docs/rhythmic-research.md),
adding Senn et al. 2018, Pressing 2002, Garcia 2005, Butler 2006 and genre sources.

## Licence

MIT. No recorded breaks are included or reproduced; the demo kit is synthesised by the code.
