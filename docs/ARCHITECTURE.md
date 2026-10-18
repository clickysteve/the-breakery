# How The Breakery works

```
INGREDIENTS ──kit index──┐
RECIPE + SEEDS ──────────┤
                         ▼
                   engine/generate.ts  (pure TypeScript, no DOM, no audio)
   engine 2: phrase plan → foundation → support → [mutations] → phrase development
             (answers, development, chops, fills) → performance → AUTO samples
             → TOMS → ROLLS → hand EDITS → PICK modes and hand-chosen samples
   engine 1 (v1/, frozen): the first release's generator, then AUTO samples → hand EDITS → PICK
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
| `src/engine/` | The generator: `types` (data), `rng` (seeded streams), `meter` (metrical weights, syncopation, Euclid), `styles` (recipes, and `FLOURISH`: each recipe's toms and rolls), `foundation` (Layer A), `support` (Layer B), `phrase` (Layer D: 1–8 bar plans, variation, fills, MUTATE), `chop` (event-level resequencing and fill rolls), `performance` (Layer C), `toms` (tom fills), `rolls` (ROLLS), `kit` (AUTO sample choice, fallbacks), `samples` (sample-selection modes), `edits` (the hand-edit layer and its operations), `generate` (BAKE, engine dispatch, named seeds, mutation), `analysis` (metrics), `ascii` (text grids). `v1/`: engine 1, frozen. | nothing (pure, testable in Node) |
| `src/audio/` | `demoKit` (synthesised one-shots), `ingredients` (sample library, storage, folder import, loudness), `categorise` (category suggestions from paths), `timeline` (Break → Core timeline, the single timing function), `player` (live), `takeaway` (export). | `@slopfactory/core`, engine |
| `src/midi/` | `smf` (Standard MIDI File writer and reader, shared with DOWNBEAT), `breakMidi` (Break → type 1 SMF), `messages` (builders and parsing), `output` (note-safe output per device), `router` (live hits → timestamped notes, queued note-offs, clock out), `routing` (per-track settings, defaults, input matching), `clockIn` (external clock follower), `access` (Web MIDI wrapper). Built on Core's MIDI interfaces. | audio/timeline, engine, Core midi types |
| `src/app/` | `app.ts`: state and actions (recipe, seeds and names, freeze, batch, history, favourites, MUTATE, sample settings, solo/mute, hand edits with undo/redo and selection, persistence); `seeds.ts` (history, favourites, DICE names); `mix.ts` (solo/mute precedence); `midi.ts` (MidiRig: MIDI settings, devices, input, clock source). | engine, audio, midi |
| `src/ui/` | The 1-bit interface: `widgets`, `dialogs`, `tooltip` (from emmm), one file per window (`patternWindow` is also the grid editor and the selected-hit strip; `rollsWindow` is ROLLS · TOMS; `midiWindow` is MIDI), `palette` (The Breakery's palette roles) and `paletteWindow` (Core's palette editor in a window). | app, Core palette |
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
play their own figure in fill bars, keep the backbeat, and decide once for every answer bar. A
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
browsers and versions. BAKE draws a new seed for each layer that is not frozen. Changing a control
re-bakes the same seeds, so its effect is heard on the same break. MUTATE appends a mutation
(its own seed plus which layers it may change) to `seeds.mut`; each one applies a few variation
operations to the groove cell before the phrase is developed.

## Engines and reproducibility

`Recipe.engine` says which generator baked a break. Engine 1 (`src/engine/v1/`, with its own frozen
recipe table) is the first release's code; `test/engine1.test.ts` checks 120 reference breaks from
that release still come out identical, sample choices included (AUTO is the original sample
choice). A saved recipe without an engine is engine 1. Engine 1 knows only the original four
recipes and ignores mutations; choosing a new recipe switches to engine 2. Tune engine 2 freely;
never change `v1/`.

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
  The `Player` keeps musical time in quarter notes mapped to audio time through an anchor; every
  hit it schedules also goes to `MidiRouter` stamped in `performance.now()` time through
  `getOutputTimestamp()` (smoothed), so MIDI is heard with the audio. Note-offs wait in a queue
  until everything before them is scheduled; each device's `MidiOutput` releases a key only when
  every note holding it has ended, retriggers held keys, and on stop drops queued messages
  (`clear()`, where the browser has it) or stamps its note-offs after everything queued.
* **External clock.** `ExternalClock` is pulse-locked (DOWNBEAT's and ANVIL's choice): pulse n
  is quarter n/24 from the start of the song and becomes the player's anchor, with the measured
  pulse period placing what lies between pulses; the look-ahead is capped at 12 pulses past the
  last one, so a clock that stops stops the music. Start, Stop, Continue and Song Position drive
  the transport; a silent clock is LOST after 500 ms. With the internal clock the player can send
  F8 at 24 per quarter (tempo changes at the loop point included), Start and Stop.
* **MIDI in.** Every connected input is heard; `inputTargets` maps device, channel (or OMNI) and
  note to tracks, and `LiveSamplePicker` (engine/samples.ts) applies the track's PICK mode hit by
  hit. Live hits go through the main mixer at once (SOLO and MUTE apply).
* **Velocity → level** is Core's 1.5-power curve (ghosts at velocity 30 play about −19 dB).
* **Samples** are decoded by Core (WAV/AIFF by Good Bits' parsers, other formats by the
  browser), stored as original bytes in IndexedDB by Core's content-addressed store, and never
  uploaded.

## Where future features fit

* **BREED**: a child takes layer seeds and recipe values from two parents (e.g.
  beat seed from one, feel from the other, recipe values interpolated) — the layered seeds make
  this natural. Event-level crossover can work bar-by-bar on the `role`-annotated events.
* **OVERBAKE / audio slicing**: every hit's exact time is known (`eventSeconds`), so slice points
  come for free; `chop.ts` already resequences events, and an audio engine could play the chopped
  events as slices of a rendered break (with tails, pitch and stretch).
* **Shared MIDI in Core**: `src/midi/` (except `breakMidi`) is written against Core's MIDI
  interfaces so it can move into Core as roadmap steps 1–5 (messages, access, output, clock,
  clock-in) and be adopted by the other instruments.
* **Output processing**: Core's Good Bits output stage (12-bit, cassette, …) is available to the
  same Mixer/render path with an AudioWorklet URL; it is deliberately off for now.
