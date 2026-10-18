# The Breakery

**Freshly baked breaks.** A generative breakbeat instrument for the browser, from the Slop
Factory.

You bring the ingredients (drum one-shots). The Breakery invents the recipe: an original drum
*performance*, with a backbeat that anchors, kicks that syncopate, ghost notes that answer the
snare, hats that keep time with a drummer's accents, a feel, and a turnaround that pushes back
into the top of the loop. Then you take it away as a WAV, to sample, slice and rearrange in your
sampler or DAW.

It is not a step sequencer. You guide it (style, tempo, density, syncopation, ghosts, swing,
humanise, variation, fills) and it composes.

<https://breakery.allmyfriendsaresynths.com/>

## The workflow

| | |
|---|---|
| **INGREDIENTS** | Your sample library: KICK, SNARE, GHOST, HAT, OPEN HAT, RIDE, CRASH, PERC, several samples each. |
| **RECIPE** | Style (FUNK, HIP-HOP, JUNGLE, BROKEN), BPM, 1/2/4 bars, seed, and eight controls. |
| **BAKE** | Generate a new break. |
| **BATCH** | Generate eight candidates and audition them. |
| **FREEZE** | Keep chosen layers (BEAT, DETAIL, FEEL, KIT) when baking again. |
| **TAKEAWAY** | Export WAV: bars + tail, or a seamless loop; optionally per-drum stems and a MIDI file. |

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
   browser, so you can try everything at once. To use your own: **LOAD…** (or drop WAV/AIFF
   files anywhere on the screen). File names like `BD_01.wav`, `snare ghost.wav` or `OH.wav` are
   sorted into categories automatically; anything else goes to UNSORTED. Select a category to see
   its samples; preview (▶), reassign (the pop-up) or remove (×) each one. A category with no
   samples shows MISSING, NONE: SILENT, or the fallback it uses (GHOST uses SNARE; HAT and RIDE
   stand in for each other). Samples are stored in this browser (IndexedDB) and never uploaded.
2. **Recipe.** Pick a style (it sets every control to that style's defaults), then adjust.
   Every change re-bakes the same seed, so you hear what the control does to this break.
   Hover any control for what it does.
3. **Bake.** **BAKE** (B) for a new break; **BATCH** (N) for eight candidates (1–8 to audition).
   **FREEZE** a layer to keep it: BEAT (kick and snare), DETAIL (ghosts, hats, percussion,
   cymbals), FEEL (timing and dynamics), KIT (sample choices).
4. **Listen and look.** Space plays/stops; changes arrive at the loop point. The PATTERN shows
   each hit at its performed position (swing and feel included), with height for velocity.
   Hover a hit to see why it is there ("ghost on 1a: anticipates the backbeat on 2"); click it to
   hear it.
5. **Takeaway** (T). *Bars + tail* lets the last hits ring out; *Seamless loop* is exactly the
   bars' length with the tail folded onto the start, for looping at the stated tempo. *+ Stems*
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

`?seed=12345` in the address sets the seed. Keys: **BREAKERY ▸ Keys…**.

## How it generates

A layered generator, deterministic from seeds:

1. **Phrase plan**: groove, answer, turnaround (A / A T / A A2 A T).
2. **Foundation**: backbeat snares (displaced in some styles), kicks chosen from metrical
   preferences and their relation to the snares; many candidates are scored against target
   density and target *syncopation* (a moderate amount grooves best), and the best is kept.
3. **Supporting voices**, conditioned on the foundation: hats/ride in eighths or sixteenths with
   open-hat lifts; ghost snares anticipating and answering the backbeat; percussion in the gaps.
4. **Phrase development**: later bars are variations of the first, mostly in their second
   half; the last bar gets a fill.
5. **Performance**: velocity by role and a two-bar hat-accent contour; Linn-style swing;
   per-drum timing tendencies (snare a touch late, never early) with small *correlated* drifts —
   not random jitter.

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

* **Not yet evaluated by ear.** The generator has been checked by automated tests and by
  comparing its structure with random patterns ([docs/EVALUATION.md](docs/EVALUATION.md)), but
  the listening test there has not been run.
* 4/4 only; sixteenth grid with 32nd-note drags; no half-time feel, no toms.
* Small fill vocabulary. Recipe values are hand-set hypotheses.
* The demo kit is synthetic and plain. Use real one-shots for real results.
* MIDI is file export only: no MIDI output, clock or input. Note lengths are fixed (a 64th),
  and SNARE and GHOST share GM note 38 (on separate tracks); hits on the same note at the same
  tick are written once.
* No OVERBAKE, BREED, slicing, pitch or effects.
* Desktop-first: the fixed screen scales to fit; phones work best in landscape.

## Next steps

1. Run the listening test (docs/EVALUATION.md §4) with a real kit and tune recipes from it.
2. Milestone 2: richer fills (toms), half-time, better JUNGLE ghost/edit behaviour, per-style
   hat models, smarter sample choice (e.g. softer snare samples for ghosts).
3. Milestone 3: BREED (layer-seed and recipe inheritance), controlled mutation, keeping
   favourites.
4. Milestone 4 (jungle laboratory): slice the rendered break at its known hit times,
   rearrange, retrigger, pitch; OVERBAKE.
5. MIDI: live MIDI output and clock in/out (the file export's note mapping and timing carry
   over); a choice of note map for drum machines that are not General MIDI.

## Research references

The research behind the design, with links and notes on how much of each source was read:
[docs/BREAKBEAT_RESEARCH.md](docs/BREAKBEAT_RESEARCH.md). Key sources: the Groove MIDI
Dataset and GrooVAE (Gillick et al. 2019); microtiming and groove (Davies et al. 2013;
Frühauf, Kopiez & Platz 2013; Senn et al. 2016); correlated timing fluctuations (Hennig et al.
2011; Räsänen et al. 2015); syncopation and groove (Witek et al. 2014); Euclidean rhythms
(Toussaint 2005).

## Licence

MIT. No recorded breaks are included or reproduced; the demo kit is synthesised by the code.
