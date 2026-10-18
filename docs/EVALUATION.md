# Evaluating The Breakery

Does the generator make breaks a producer would want to sample? Audio playing is not evidence
of that, and tests passing is not evidence that engine 2 sounds better than engine 1. This
document says what has been checked, how, what has **not** been checked, and how to run the
listening tests that matter.

**Status (October 2026).** The first release was listened to by its user, who found the breaks
"already sound pretty good". Engine 2 and everything added since have **not** been listened to:
the code was written with Claude (an AI assistant), which cannot listen to audio. Every musical
change is a hypothesis until §4 is done.

## 1. What is tested automatically (`npm test`, 98 tests)

| File | Area | Checks |
|---|---|---|
| `engine1.test.ts` | Reproducibility | **Engine 1 is frozen**: 120 reference breaks baked by the first release (all four recipes, 1/2/4 bars, random recipes and tempi, with and without a kit) are reproduced exactly: events, velocities, swing, microtiming, roles, plans and sample choices (`test/fixtures/engine1-golden.json`). Recipes without an engine field load as engine 1. Engine 2 gives different breaks from the same seeds. |
| `engine.test.ts` | Engine 2 (the original suite, now run on engine 2) | Determinism; validity fuzz over 400 random recipes; backbeat on 2 and 4; downbeat kick; ghosts soft and nearer the snare accents than random; kicks never on a backbeat in groove bars (a layered floor kick aside); open hats replace closed; later bars related; phrase plans; each control has its effect; freeze; sanitising (bars clamped 1–8, engine rules). |
| `features.test.ts` | Pattern length | Every recipe × every length 1–8: valid events inside their bars, every bar used, phrase plan per length; loop length, Core timeline length and MIDI length exact; no event after the loop point beyond the microtiming cap; groove bars identical to bar 1 and answers identical to each other in 8 bars; half-way fills present; no fills with FILLS 0; an 8-bar bake under 25 ms. |
| | Recipes | HALF-TIME's single backbeat on 3; D&B's kicks on 1 and the "and" of 3; GARAGE's kicks off beats 2 and 4 and heavy swing; HARDCORE's floor kick; ELECTRO with no ghosts, swing or microtiming; BOOM BAP's exact loop; JUNGLE and BREAKCORE chop development bars, FUNK never; the groove bar never chopped; chopped hits explain their source. |
| | Performance | Beat-2 backbeat later than beat 4 (FUNK, HIP-HOP); engine 2 deviates more than engine 1 but stays modest; hat accent cycles repeat; HUMANISE 0 on the grid. |
| | Named seeds | Numbers stay numbers; names hashed with FNV-1a over UTF-8 to fixed values ("funky chicken" = 296892441); case and spacing ignored; same name → same break; DICE names. |
| | History, favourites | Back/forward, forward branch dropped, repeats ignored, recipe edits update the current entry, bounded, survives save/reload, bad data rejected; favourites keep recipe, engine, seeds, mutations, name and sample settings and reproduce. |
| | MUTATE | Deterministic; related (mean onset similarity > 0.75) yet different (> 80 %); respects FREEZE BEAT; nothing when beat and detail are frozen; BAKE drops mutations unless they are frozen. |
| | Sample selection | AUTO = the original; FIXED (and a removed fixed sample); ROUND ROBIN order restarting at the top; WEIGHTED never picks weight 0; RANDOM/WEIGHTED stable per position when other hits change; VELOCITY layers by loudness, including borrowed SNARE samples for ghosts; ALTERNATE never repeats (also across the loop seam); PER BAR one sample per bar; rhythm independent of samples; FREEZE SAMPLES keeps the kit seed; single-sample and empty categories. |
| | Solo / mute | Precedence (SOLO wins, Core's rule); audible export timeline and MIDI leave out silenced categories; events unchanged; file names. |
| | Folder import | Suggestions from folders and names, abbreviations, refinements (Open Hats/hat → OPEN HAT), ambiguity → UNSORTED, hidden and non-audio files skipped. |
| `audio.test.ts`, `midi.test.ts` | As before | Timing maths, timeline, choke, loop folding, WAV header, demo kit, MIDI writer and round trip. |

**Not covered by automated tests:** the offline render itself (`OfflineAudioContext` is not
available in Node), live playback, and the interface. See §2.

## 2. Checked by hand in a real browser (Chromium, October 2026)

From the first release (still valid; the timing path is unchanged): TAKEAWAY hits align with the
generator's times at 0 ms; WAV format and lengths; clipping protection; playback.

New in this release, checked through the app and `window.breakery`:

* **Typed numbers.** Clicking BPM selects the value; typing 1-2-8 and Return set 128; Escape
  cancelled 999; 300 was clamped to 220 with the refusal flash; ↑ stepped it. The SEED box took
  "funky chicken" (seed 296892441). BARS took 8.
* **8 bars.** The pattern showed A A2 A F A A2 B T with page buttons; the 5–8 page worked.
* **SOLO / MUTE during playback.** With KICK and SNARE soloed (KICK also muted), analysers on Core's
  post-gate taps read HAT peak **0.000**, KICK 1.46, SNARE 1.45; after clearing, HAT read 0.42 within
  ~1.6 s of playing, i.e. at once.
* **Export.** An 8-bar seamless loop at 220 BPM rendered to 8.727279 s against a loop length of
  8.727273 s (one sample's rounding). With HAT muted, AUDIBLE MIX gave 7 files (mix, 5 stems, MIDI)
  against 8 for FULL MIX, named `_audible`.
* **Sample selection.** ROUND ROBIN alternated the two demo kicks and explained each hit; typing a
  weight of 0 removed that kick from WEIGHTED.
* **History, favourites, MUTATE.** MUT twice gave "+1", "+2"; FAV saved; ◀ ▶ moved through history.
* **Folder import** (synthetic WAVs in a folder tree): the review dialog listed suggestions, put the
  ambiguous "kick snare combo" and "whoosh" in UNSORTED first, skipped `readme.txt`, ignored a
  `._kick01.wav` resource fork. (A real folder drop from the desktop was not automated: the browser
  automation cannot drag a directory. The picker uses `webkitdirectory`, the drop uses
  `webkitGetAsEntry`, both widely supported; please try both once.)
* No console errors.

## 3. Structure versus chance, and engine 1 versus engine 2 (`npm run evaluate`)

`scripts/evaluate.test.ts` bakes 20 breaks per recipe and engine from fixed seeds and writes
[evaluation-report.md](evaluation-report.md). Excerpt, original four recipes, two bars,
**engine 1 / engine 2 / random**:

| Metric | FUNK | HIP-HOP | JUNGLE | BROKEN |
|---|---|---|---|---|
| Ghosts within two 16ths of a true backbeat | 0.78 / 0.81 / 0.46 | 0.83 / 0.84 / 0.53 | 0.69 / 0.75 / 0.42 | 0.74 / 0.77 / 0.57 |
| Hat velocity drift between bars (lower = repeating cycle) | 3.0 / 3.4 / 19.4 | 3.7 / 4.2 / 10.8 | 2.8 / 2.6 / 13.0 | 2.7 / 3.1 / 19.7 |
| Mean \|microtiming\| (ms) | 1.1 / 2.0 | 1.4 / 2.4 | 0.4 / 0.9 | 0.8 / 1.2 |
| Beat-2 / beat-4 backbeat timing (ms) | 1.9, 1.6 / 5.9, 2.1 | 2.8, 2.6 / 8.2, 3.3 | 0.4, 0.3 / 1.5, 0.9 | 0.8, 0.5 / 2.1, 0.5 |
| Bar 2 similarity to bar 1 | 0.81 / 0.81 / 0.37 | 0.82 / 0.83 / 0.19 | 0.68 / 0.63 / 0.19 | 0.77 / 0.80 / 0.31 |
| Chopped / rolled hits per bar | 0 / 0 | 0 / 0 | 0 / 2.65 | 0 / 0.13 |

What this shows and does not show:

* Engine 2 keeps engine 1's structure (backbeat anchor, related bars, interlocking kick and snare)
  and changes what it was designed to change: ghosts nearer the true backbeats (JUNGLE most), feel
  concentrated on the beat-2 snare, chops in JUNGLE. It does **not** show that engine 2 sounds better.
* "Ghosts within a 16th of **any** snare accent" (engine 1's metric) is still no better than chance
  for JUNGLE (0.51 vs 0.50): with chops and extra snares almost every position is near some snare.
  The backbeat-relative metric is the meaningful one; the ear decides.
* Default microtiming is still small overall (1–2.6 ms). The audible change, if any, is the
  laid-back beat-2 snare. Turn HUMANISE up to judge the timing model.

## 4. Listening tests

Use a coherent kit of real drum one-shots (the demo kit is for trying the app, not judging it).
Load it with FOLDER… and check the review. Loop each break at least four cycles. Score 1–5
(5 = strongly agree) and write one line about anything wrong. Mix in hidden controls where noted.

**Questions** (as before): Q1 recognisable groove within two cycles · Q2 later bars vary the first
meaningfully · Q3 ghosts sound like a drummer's · Q4 timing feels intentional · Q5 the turnaround
leads back into the top · Q6 a performance, not a random pattern · Q7 I would sample this.

**A. Old versus new (the key test).** FUNK, 2 bars, the 20 seeds 1000–1019 in
evaluation-report.md §4. For each seed play ENGINE 1, then ENGINE 2 (the button in RECIPE), in a
random order you note down but do not look at while scoring. Score Q1–Q7 for each. Then repeat with
five seeds each for HIP-HOP and JUNGLE. Also answer: **A1** which of the pair would you keep?

**B. Timing.** FUNK, 2 bars, five seeds. Score Q4 at HUMANISE 0, the default, and 1, for both
engines. Does the beat-2 snare lay-back read as feel or as a mistake? At which setting?

**C. Long patterns.** JUNGLE 8 bars (seeds in report §5), FUNK 8 bars, BOOM BAP 4 bars. Additional
questions: **C1** the phrase has a shape (it goes somewhere and comes back); **C2** the half-way fill
and the final turnaround relate; **C3** the chopped bars sound like edits of *this* break, not a
different one. Compare with the same seeds at 1, 2 and 4 bars: does a short loop lose anything?

**D. Recipes.** Five seeds each of the seven new recipes at default settings. **D1** it has a
recognisable identity distinct from the others; **D2** the name fits (a tendency, not authenticity);
**D3** something is missing or wrong (write what). Hidden control: three BREAKCORE-like random
patterns (`randomLike` in `src/engine/analysis.ts`) scored on Q6.

**E. Sample selection.** Load three or more hats and three or more snares. On one FUNK seed, play
each PICK mode for HAT and SNARE: AUTO, FIXED, RANDOM, ROUND ROBIN, WEIGHTED, VELOCITY, ALTERNATE,
PER BAR. **E1** the mode is audible; **E2** it helps the groove (VELOCITY on SNARE should make ghosts
use the quietest sample); **E3** TAKEAWAY matches playback (export and listen in a DAW).

**F. MUTATE.** On three breaks you like, press MUT five times, scoring after each: **F1** still the
same break; **F2** a variation worth keeping. Then ◀ back.

Record listener, kit, date, scores and notes, and add the summary here, including failures.

**Pass marks (hypotheses, to be revised):** in A, engine 2 preferred (A1) for at least 11 of 20 FUNK
seeds and mean Q1/Q6 no lower than engine 1; in C, mean C1 ≥ 3.5; in D, D1 ≥ 3.5 for at least five
of the seven new recipes, and the hidden random patterns clearly lower on Q6.

## 5. Known weaknesses (before listening)

* Nothing in engine 2 has been listened to.
* Recipe numbers, ghost figures, accent cycles, chop weights and phrase plans are hypotheses.
  D&B's two-step skeleton and ELECTRO's patterns are not from reliable sources (research §7).
* Chops copy hits, not audio: no tails, pitch, time-stretch or resampling (research §4.2).
* JUNGLE's "any snare" ghost metric is still at chance (§3).
* Fill vocabulary has no toms (no TOM category).
* VELOCITY orders samples by an RMS loudness measure of their first 150 ms, which may not match
  how loud they sound.
* MUTATE only applies to engine 2; engine 1 ignores mutations so its breaks stay as released.
* Typed entry needs a hardware keyboard (as in emmm); the boxes are not text inputs.
