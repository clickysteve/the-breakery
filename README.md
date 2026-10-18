# The Breakery

**Freshly baked breaks.** A generative breakbeat instrument for the browser, from the Slop
Factory.

You bring the ingredients (drum one-shots). The Breakery invents the recipe: an original drum
*performance*, with a backbeat that anchors, kicks that syncopate, ghost notes that answer the
snare, hats that keep time with a drummer's accents, a feel, and a turnaround that pushes back
into the top of the loop. Then you take it away as a WAV, to sample, slice and rearrange in your
sampler or DAW.

It is not a step sequencer. You guide it (recipe, tempo, length, density, syncopation, ghosts,
swing, humanise, variation, fills) and it composes: one to eight bars built as a phrase, with a
groove, an answer, development, fills and a turnaround, and in the UK breakbeat recipes chopped,
resequenced bars and rolls.

<https://breakery.allmyfriendsaresynths.com/>

## The workflow

| | |
|---|---|
| **INGREDIENTS** | Your sample library: KICK, SNARE, GHOST, HAT, OPEN HAT, RIDE, CRASH, PERC, several samples each. |
| **RECIPE** | Eleven recipes (FUNK, HIP-HOP, JUNGLE, BROKEN, BOOM BAP, HARDCORE, D&B, HALF-TIME, GARAGE, ELECTRO, BREAKCORE), ENGINE 1/2, BPM, 1–8 bars, seed (a number or a name), DICE, history, favourites, MUTATE, and eight controls. |
| **BAKE** | Generate a new break. |
| **BATCH** | Generate eight candidates and audition them. |
| **FREEZE** | Keep RHYTHM (beat, detail and feel) or SAMPLES, or single layers, when baking again. |
| **PATTERN** | See every hit and why it is there; SOLO and MUTE each drum. |
| **TAKEAWAY** | Export WAV: bars + tail, or a seamless loop; full or audible mix; optionally per-drum stems and a MIDI file. |

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
   Categories are suggested from folder and file names (`Kicks/`, `BD_01.wav`, `snare ghost.wav`,
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
2. **Recipe.** Pick a recipe (it sets every control to its defaults), then adjust. Every change
   re-bakes the same seed, so you hear what the control does to this break. Hover any control
   for what it does. **Every number can be typed**: click it (the value is selected), type,
   Return; Escape cancels; ↑ ↓ step (Shift: by 10); drag up/down to sweep. Range bars: click or
   drag, or double-click to type a value. **BARS** is 1–8. **SEED** takes a number or any words
   ("funky chicken"): the same seed, recipe and engine always bake the same break. **DICE** rolls a
   named seed; **◀ ▶** (or ← →) move through the history; **FAV** saves the break (recipe, seeds,
   mutations and sample settings; favourites are in the **Seeds** menu); **MUT** makes a related
   variation by changing the groove a little, so every bar follows. **ENGINE** switches between
   the current generator (2) and the first release's (1), kept so old breaks reproduce and so you
   can compare them on the same seed.
3. **Bake.** **BAKE** (B) for a new break; **BATCH** (N) for eight candidates (1–8 to audition).
   **FREEZE RHYTHM** keeps hit placement and performance and changes only the samples; **FREEZE
   SAMPLES** keeps the sample choices; or freeze single layers: BEAT (kick and snare), DETAIL
   (ghosts, hats, percussion, cymbals), FEEL (timing and dynamics).
4. **Listen and look.** Space plays/stops; changes arrive at the loop point. The PATTERN shows
   each hit at its performed position (swing and feel included), with height for velocity.
   Hover a hit to see why it is there ("ghost on 1a: anticipates the backbeat on 2") and why it
   plays its sample; click it to hear it. **S** and **M** beside each row SOLO and MUTE that drum,
   at once, without changing the break (if any row is soloed, only soloed rows play: SOLO wins over
   MUTE). Patterns longer than four bars can be viewed whole or four bars at a time.
5. **Takeaway** (T). *Bars + tail* lets the last hits ring out; *Seamless loop* is exactly the
   bars' length with the tail folded onto the start, for looping at the stated tempo. *Full mix*
   renders every drum; *Audible mix* only what SOLO / MUTE leave audible (files named
   `_audible`; stems and MIDI follow the same choice). *+ Stems*
   adds one WAV per drum in a ZIP. 44.1 kHz, 16-bit stereo, named like
   `breakery_funk_100bpm_2bar_seed4242.wav`. If the mix would clip, it is turned down to −1 dBFS
   (all files by the same amount) and the status line says so. *+ MIDI* adds a MIDI file of
   the break (inside the ZIP when there are stems, otherwise as a second download).
6. **MIDI file** (M, or **File ▸ Takeaway MIDI File**): the break as a Standard MIDI File
   (type 1, 960 PPQ, tempo and 4/4), General MIDI drums on channel 10 (kick 36, snare and ghost
   38, closed hat 42, open hat 46, crash 49, ride 51, perc 39), one named track per drum, with
   the performed velocities, swing and microtiming exactly as they play. Exactly the bars'
   length, named like `breakery_funk_100bpm_2bar_seed4242.mid`. It needs no samples: every hit
   of the score is written, including hits that are silent here for want of a sample.

`?seed=12345` or `?seed=funky%20chicken` in the address sets the seed. Keys: **BREAKERY ▸ Keys…**.

## How it generates

A layered generator, deterministic from seeds (engine 2):

1. **Phrase plan** for the length: A (groove), A2 (answer), B (development), F (a short half-way
   fill), T (turnaround). 1 bar: A · 2: A T · 4: A A2 A T · 8: A A2 A F | A A2 B T. Answers
   repeat; the half-way fill and the turnaround use the same kind of fill.
2. **Foundation**: backbeat snares (2 and 4, or 3 in HALF-TIME; displaced in some recipes), fixed
   kicks where the recipe has a skeleton (D&B), kicks chosen from metrical preferences, relations to
   the snares and a liking for pairs; many candidates are scored against target density and target
   *syncopation* (a moderate amount grooves best). HARDCORE can layer a four-on-the-floor kick.
3. **Supporting voices**, conditioned on the foundation: hats/ride with one repeating accent cycle;
   open-hat lifts; ghost-note figures around the true backbeats (anticipation, rebound, two-stroke
   pickups); percussion in the gaps, on the backbeat or on the off-beats.
4. **Phrase development**: answers and development bars vary the groove, mostly in their second
   half; JUNGLE, HARDCORE and BREAKCORE **chop** development bars (blocks of the groove resequenced,
   after Collins' and Hockman & Davies' descriptions of breakbeat cutting) and end on rolls.
5. **Performance**: velocity by role and accent cycle; Linn-style swing (subtle by default, as
   measured in classic breaks); consistent per-drum tendencies (the snare laid back more on 2 than
   on 4, never early; hats ahead; accents a touch late) with small *correlated* drifts, not jitter.
6. **Sample selection** per category (PICK).

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

Shared audio infrastructure comes from
[Slop Factory Core](https://github.com/clickysteve/slopfactory-core) (sampler, mixer, offline
renderer, WAV/ZIP export, sample storage), pinned to a commit in `package.json`; the interface
follows [emmm](https://github.com/clickysteve/emmm)'s 1-bit look.

## Current limitations

* **Engine 2 is not yet evaluated by ear.** The first release was liked by its user; engine 2's
  changes are checked by tests and by comparing structure with engine 1 and random patterns
  ([docs/EVALUATION.md](docs/EVALUATION.md)), but its listening tests have not been run.
* Changing engines changes the break: engine 2 bakes different breaks from the same seeds. Breaks
  saved before engine 2 open with engine 1 and reproduce exactly.
* 4/4 only; sixteenth grid with 32nd and faster roll subdivisions; no toms.
* Chops rearrange hits, not audio: no slice tails, pitch, time-stretch or resampling.
* Recipe values are hand-set hypotheses; some genre rules are not from reliable sources (see
  the research notes, §7).
* Typed numbers need a hardware keyboard.
* The demo kit is synthetic and plain. Use real one-shots for real results.
* MIDI is file export only: no MIDI output, clock or input. Note lengths are fixed (a 64th),
  and SNARE and GHOST share GM note 38 (on separate tracks); hits on the same note at the same
  tick are written once.
* No OVERBAKE, BREED, slicing, pitch or effects.
* Desktop-first: the fixed screen scales to fit; phones work best in landscape.

## Next steps

1. Run the listening tests (docs/EVALUATION.md §4: engine 1 vs 2, timing, long patterns,
   recipes, sample modes, MUTATE) with a real kit and tune from them.
2. Toms and a richer fill vocabulary; calibrate tendencies from the Groove MIDI Dataset.
3. BREED two favourites; a MUTATE strength measured by rhythmic edit distance.
4. Audio slicing (OVERBAKE): play chopped events as slices of the rendered break, at its known
   hit times, with tails, pitch and time-stretch.
5. MIDI: live MIDI output and clock in/out (the file export's note mapping and timing carry
   over); a choice of note map for drum machines that are not General MIDI.

## Research references

The research behind the design, with links and notes on how much of each source was read:
[docs/BREAKBEAT_RESEARCH.md](docs/BREAKBEAT_RESEARCH.md). Key sources: the Groove MIDI
Dataset and GrooVAE (Gillick et al. 2019); swing in classic breaks (Frane 2017); breakbeat
resequencing in hardcore, jungle and drum & bass (Hockman & Davies 2015); automatic breakbeat
cutting (Collins 2001); microtiming and groove (Davies et al. 2013; Frühauf, Kopiez & Platz 2013;
Senn et al. 2016; Hellmer et al. 2015; Danielsen et al. 2015); correlated timing fluctuations
(Hennig et al. 2011; Räsänen et al. 2015); syncopation and groove (Witek et al. 2014); Euclidean
rhythms (Toussaint 2005).

## Licence

MIT. No recorded breaks are included or reproduced; the demo kit is synthesised by the code.
