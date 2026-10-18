# How The Breakery works

```
INGREDIENTS ──kit index──┐
RECIPE + SEEDS ──────────┤
                         ▼
                   engine/generate.ts  (pure TypeScript, no DOM, no audio)
   phrase plan → foundation → support → phrase development → performance → samples
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
       NotePlayer, look-ahead renderTimeline        GM_NOTE, channel 10
       scheduling             → WAV / ZIP           → midi/smf.ts → .mid
```

## Modules

| Folder | What | Depends on |
|---|---|---|
| `src/engine/` | The generator: `types` (data), `rng` (seeded streams), `meter` (metrical weights, syncopation, Euclid), `styles` (recipes), `foundation` (Layer A), `support` (Layer B), `phrase` (Layer D), `performance` (Layer C), `kit` (sample choice), `generate` (BAKE), `analysis` (metrics), `ascii` (text grids). | nothing (pure, testable in Node) |
| `src/audio/` | `demoKit` (synthesised one-shots), `ingredients` (sample library and storage), `timeline` (Break → Core timeline, the single timing function), `player` (live), `takeaway` (export). | `@slopfactory/core`, engine |
| `src/midi/` | `smf` (Standard MIDI File writer and reader, shared with DOWNBEAT), `breakMidi` (Break → type 1 SMF). | audio/timeline, engine |
| `src/app/` | `app.ts`: state and actions (recipe, seeds, freeze, batch, persistence). | engine, audio |
| `src/ui/` | The 1-bit interface: `widgets`, `dialogs`, `tooltip` (from emmm), one file per window. | app |
| `src/main.ts` | Builds the screen and menus, keyboard, drag-and-drop; wires everything. | all |

## The event model

A `Break` holds the recipe, the seeds, the phrase plan, the performer's feel and a list of
`BreakEvent`s:

| Field | Meaning |
|---|---|
| `cat` | drum category (kick, snare, ghost, hat, open, ride, crash, perc) |
| `bar`, `step`, `sub` | grid position: bar, sixteenth (0–15), ticks after the step (12 per sixteenth: 6 = a 32nd) |
| `level` | the score's nominal dynamic (0–1), before performance |
| `vel` | performed velocity, 1–127 |
| `swing` | swing delay, in sixteenths |
| `offsetMs` | microtiming, milliseconds |
| `role`, `why` | what the hit does musically and why it was placed (shown on hover; kept for slicing and MIDI) |
| `sample` | the sample id, or null (silent) |

The grid position (the *score*) and swing/microtiming/velocity (the *groove*) are kept apart,
as in the Groove MIDI Dataset's representation, so later features can freeze, compare or breed
them separately. `GM_NOTE` in `types.ts` maps categories to General MIDI drum notes, used by the
MIDI file export and, later, MIDI output.

## Seeds and determinism

Every random decision draws from a named stream derived from one of four layer seeds:

| Seed | Streams | FREEZE keeps |
|---|---|---|
| `beat` | foundation, kick/snare variation, fills, crash placement | kick and snare pattern |
| `detail` | timekeeper plan, ghosts, lifts, percussion, their variation | supporting voices |
| `feel` | performance | timing and dynamics tendencies |
| `kit` | main sample per category, alternates | sample choices |

The rhythm never depends on the loaded samples (fallbacks are resolved after generation). The
SEED box sets all four seeds to the same value; BAKE draws a new seed for each layer that is not
frozen. Changing a control re-bakes the same seeds, so its effect is heard on the same break.

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
  that plays, named after it, all on channel 10 with `GM_NOTE` keys and the performed `vel`.
  Notes last a 64th, or end a tick before the same key's next note-on (snare and ghost share
  note 38 across tracks); hits on the same key and tick are merged at the louder velocity.
  `midi/smf.ts` is DOWNBEAT's writer (itself grown from emmm's), so the Slop Factory apps write
  the same files; Core has MIDI interfaces only, no SMF yet. Its reader backs the round-trip
  tests. TAKEAWAY's *+ MIDI* adds the file to the ZIP with stems, or downloads it beside the WAV.
* **Velocity → level** is Core's 1.5-power curve (ghosts at velocity 30 play about −19 dB).
* **Samples** are decoded by Core (WAV/AIFF by Good Bits' parsers, other formats by the
  browser), stored as original bytes in IndexedDB by Core's content-addressed store, and never
  uploaded.

## Where future features fit

* **BREED** (Milestone 3): a child takes layer seeds and recipe values from two parents (e.g.
  beat seed from one, feel from the other, recipe values interpolated) — the layered seeds make
  this natural. Event-level crossover can work bar-by-bar on the `role`-annotated events.
* **OVERBAKE / slicing** (Milestone 4): every hit's exact time is known (`eventSeconds`), so
  slice points come for free; transformations can operate on the event list before rendering.
* **MIDI output**: the file export already turns events into GM notes with `eventTick`; live
  output would send the same notes, and MIDI clock would drive `Player.loopStart`. Nothing in the engine depends on audio, so MIDI output can replace or
  accompany the sampler.
* **Output processing**: Core's Good Bits output stage (12-bit, cassette, …) is available to the
  same Mixer/render path with an AudioWorklet URL; it is deliberately off for now.
