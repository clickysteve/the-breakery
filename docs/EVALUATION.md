# Evaluating The Breakery

Does the generator make breaks a producer would want to sample? Audio playing is not evidence
of that. This document says what has been checked, how, what has **not** been checked, and how
to run the listening test that matters most.

## 1. What is tested automatically (`npm test`)

`test/engine.test.ts` and `test/audio.test.ts` (39 tests):

| Area | Checks |
|---|---|
| Determinism | Same recipe + seeds → identical break, for every style; different seeds → different breaks (> 90 % distinct grids over 40 seeds). |
| Validity (fuzz) | 400 random recipes × styles × 1/2/4 bars: velocities are integers 1–127; steps, sub-steps and bars in range; microtiming within ±10 ms; snares never more than 1 ms early; nothing before the loop start; no duplicate hits; every hit has an explanation. |
| Structure | FUNK/HIP-HOP groove bars have snare accents on 2 and 4 (≥ 85 % of seeds); every style but BROKEN starts on a downbeat kick; kicks never land on a backbeat; ghosts are soft, never on a backbeat, and nearer the snare accents than random placement; open hats replace the closed hat on their step; later bars are related to the first; with VARIATION and FILLS at 0, every bar is the groove; phrase plans are A / A T / A A2 A T. |
| Controls | Each control has its stated effect, averaged over 40 seeds: DENSITY adds hits, GHOSTS adds ghosts, SYNCOPATION raises measured syncopation, COMPLEXITY adds extra snares / off-beat kicks / drags, VARIATION lowers bar similarity, FILLS adds fill hits, HUMANISE 0 is exactly on the grid and more humanise means larger deviations, SWING 0 is straight. |
| Freeze / kit | Freezing BEAT keeps kick and snare; freezing KIT keeps sample choices; the rhythm does not depend on which samples are loaded; fallbacks (GHOST → SNARE, HAT ↔ RIDE); missing categories are silent; alternates are deterministic. |
| Timing maths | Grid + swing + microtiming → quarter notes and seconds; Linn swing (66 % = 0.32 of a sixteenth); loop length. |
| Timeline | The Core timeline is valid, one voice per category, sorted, within the loop, and leaves out hits without samples; hat choke settings. |
| Export helpers | Seamless-loop folding; file names; 16-bit WAV header (format, channels, rate, length). |
| Demo kit | Every category present; samples finite, not clipping, not silent. |
| Ingredients | File-name category guesses. |

**Not covered by automated tests:** the offline render itself (`OfflineAudioContext` is not
available in Node) and live playback. See §2.

## 2. Checked by hand in a real browser (Chromium, 18 Oct 2026)

Run in the app's page through the browser's console (`window.breakery` exposes the app):

* **TAKEAWAY timing matches the generator.** A FUNK break was rendered to WAV and parsed; for
  every kick and accented snare, the energy rise in the audio was compared with the event's
  computed time shifted by −4, −2, 0, +2 and +4 ms. Alignment was best at **0 ms** (score
  3.66 vs 2.60 at −2 ms and 0.93 at +2 ms), i.e. the rendered hits sit where the generator put
  them, including swing and microtiming.
* **Format and length.** 44.1 kHz, 16-bit, stereo RIFF/WAVE; BARS + TAIL length = bars + tail
  exactly (4.8 s + 1 s); SEAMLESS LOOP length = the bars exactly (to 0.1 ms) for all four
  styles; STEMS produce a ZIP with the mix plus one file per category used.
* **Clipping.** With the original default level (0.7) the demo kit clipped by ~2 dB and TAKEAWAY
  turned the file down to −1 dBFS, as designed. The default level was lowered to 0.45 and the
  demo kick and crash made quieter. A dense seamless loop can still exceed full scale (the
  folded tail adds to the start), in which case the export is turned down and says so.
* **Playback** starts, loops and reports its position with no console errors.

**Not done:** no one has *listened* to the output as part of this work. The code was written
with Claude (an AI assistant), which cannot listen to audio. The listening test below is the necessary next step.

## 3. Structure versus chance (`npm run evaluate`)

`scripts/evaluate.test.ts` bakes 20 two-bar breaks per style (default recipes, fixed seeds) and
compares them with random patterns that have the same number of hits per category. Full output
with all 20 FUNK grids: [evaluation-report.md](evaluation-report.md). Summary (generated /
random):

| Metric | FUNK | HIP-HOP | JUNGLE | BROKEN |
|---|---|---|---|---|
| Bars with snare accents on 2 and 4 | 0.82 / 0.05 | 0.95 / 0.03 | 0.70 / 0.00 | 0.50 / 0.05 |
| Ghosts within a sixteenth of a snare accent | 0.66 / 0.39 | 0.78 / 0.50 | **0.52 / 0.53** | 0.60 / 0.44 |
| Kicks on a snare accent, per bar | 0.05 / 0.78 | 0.00 / 0.55 | 0.03 / 0.85 | 0.05 / 0.93 |
| Bar 2 similarity to bar 1 | 0.81 / 0.37 | 0.82 / 0.18 | 0.68 / 0.20 | 0.77 / 0.28 |
| Kick/snare syncopation per bar | 4.25 / 5.28 | 3.08 / 5.85 | 4.53 / 5.53 | 5.15 / 5.75 |

What this does and does not show:

* The generated breaks have the structure the research describes (an anchored backbeat,
  interlocking kick and snare, related bars) far more than chance. That separates them from
  "random drum patterns", one of the brief's questions. It does **not** show they groove.
* **JUNGLE ghosts are no nearer the accents than chance.** JUNGLE has many extra snare accents,
  so almost any position is near one; the metric cannot tell, and the ghost placement may not be
  doing anything audible in this style. To be judged by ear.
* Random patterns are *more* syncopated than generated ones. That is expected (random onsets
  land on weak positions), and the generator aims at a moderate target (§1.5 of the research).
  Whether the default targets are the right amount is a listening question.
* Default HUMANISE gives about 0.4–1.4 ms mean deviation: deliberately tight (research
  suggests exaggerated timing irritates listeners), possibly too subtle to hear. Turn HUMANISE
  up to judge.

## 4. Listening test procedure

Do this with a coherent kit of real drum one-shots (the demo kit is synthetic and plain; it is
for trying the app, not for judging the generator).

1. Load the kit; check every category in INGREDIENTS shows OK (or an intended fallback).
2. RECIPE ▸ FUNK, 2 bars, default controls. For each of the 20 seeds in
   [evaluation-report.md](evaluation-report.md) (1000–1019): type the SEED, loop the break for
   at least four cycles, and score it below. Then repeat with five seeds each for HIP-HOP,
   JUNGLE and BROKEN.
3. Score each 1–5 (5 = strongly agree), and write one line about anything wrong:

| # | Question |
|---|---|
| Q1 | It establishes a recognisable groove within two cycles. |
| Q2 | The second bar varies the first in a meaningful way (not identical, not unrelated). |
| Q3 | Ghost notes sound like a drummer's ghost notes (placement and level). |
| Q4 | The timing feels intentional, not sloppy and not mechanical. |
| Q5 | The turnaround leads back into the top of the loop. |
| Q6 | It sounds like a performance, not a random pattern. |
| Q7 | I would sample this (whole, or as slices). |

4. As a control, mix in three random patterns without telling the listener which: bake with
   COMPLEXITY, SYNCOPATION, VARIATION and FILLS at 1 and GHOSTS at 1 (the nearest the app gets to
   chaos), or generate them with `randomLike` in `src/engine/analysis.ts`. If the random ones
   score as well on Q1/Q6, the generator is not doing its job.
5. Record: listener, kit used, date, scores, notes. Add the summary to this file, including the
   failures.

**Pass mark (our hypothesis, to be revised):** mean Q1 and Q6 ≥ 3.5 for FUNK and HIP-HOP, at
least 5 of 20 FUNK breaks scoring Q7 ≥ 4, and the hidden random patterns scoring clearly lower.

## 5. Known weaknesses (before any listening)

* Not listened to. All musical claims are untested by ear.
* The fill vocabulary is small (snare run, delayed backbeat + early crash, drop-out, stutter);
  no tom fills (there is no TOM category yet).
* No half-time or double-time feels; no 3/4 or other metres.
* Hat dynamics follow one accent model (beats > eighths > sixteenths, louder with the
  backbeat, a two-bar idiosyncrasy) based on a single published analysis of one drummer.
* Recipe numbers are hand-set hypotheses. BROKEN in particular is our own invention.
* JUNGLE here generates new patterns at jungle tempos; real jungle is mostly about chopping
  and rearranging existing breaks, which belongs to the planned slicing laboratory.
* The demo kit is synthesised and plain.
