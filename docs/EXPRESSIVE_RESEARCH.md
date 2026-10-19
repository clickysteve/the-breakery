# Phase 12 research notes: the expressive break engine

What the PERSONALITIES, DILLA, BREAK DNA (AMEN), the roll EXPRESSION presets, DESTROY and
REGEN TRACK are based on. Each part separates three things:

* **Established**: what the cited source reports (from its abstract or published summary).
* **Interpretation**: what we take from it for a drum generator. This is our reading, not the
  source's claim.
* **Design**: what the code does. Those are decisions, many of them hand-set, and none of them
  is validated by a listening test yet.

## How these sources were consulted

Web searches made on 19 October 2026 (during this phase) returned each paper's bibliographic
details, abstract or repository summary. The full texts were **not** read for this phase, so
effect sizes and participant counts are given only where a summary states them, and one
discrepancy is noted. Sources marked *earlier* were already in
[BREAKBEAT_RESEARCH.md](BREAKBEAT_RESEARCH.md); its notes on how much of each was read still
apply. Nothing in this phase was auditioned. The numbers in
[expressive-report.md](expressive-report.md) are measured from generated events, not from
listening.

## 1. Microtiming: timing feels, intensity and groove

**Established**

* Danielsen et al. (2015), "Effects of instructed timing and tempo on snare
  drum sound in drum kit performance", *JASA* 138(4), 2301–2316, doi:10.1121/1.4930950. Ten
  expert drummers played a rock pattern laid-back, on the beat and pushed, at three tempi.
  Sound-pressure level, temporal centroid and spectral centroid differed systematically between
  the styles. A majority played laid-back strokes louder than on-the-beat strokes.
* Câmara et al. (2020), "Timing is everything… or is it? Effects of
  instructed timing style, reference and pattern on drum kit sound in groove-based
  performance", *Music Perception* 38(1), 1–26, doi:10.1525/mp.2020.38.1.1. Professional
  drummers played a back-beat and a variation in the three styles, against a metronome and
  against a backing track. Onsets matched the instructed style on every instrument. A backing
  track gave more pronounced timing profiles than a metronome. Duration (snare) and intensity
  (snare and hi-hat) also differed systematically.
* Câmara, Sioros & Danielsen (2022), "Mapping timing and intensity strategies in drum-kit
  performance of a simple back-beat pattern", *Journal of New Music Research* 51(1), 3–26
  (open access). It reports three onset strategies: the whole kit early or late; an early or
  late flam on one instrument; and an ambiguous compound sound, with one instrument on the grid
  and another shifted. Intensity changes were common but did not on their own distinguish the
  styles; raising hi-hat or snare intensity tended to amplify the timing effect. (The summaries
  give 20 drummers for this paper and 22 for the 2020 one; we did not resolve which is right.)
* Davies et al. (2013), "The effect of microtiming deviations on the
  perception of groove in short rhythms", *Music Perception* 30(5), 497–510,
  doi:10.1525/mp.2013.30.5.497. Synthesised jazz, funk and samba patterns with style-typical
  microtiming, scaled from none to about double. Systematic microtiming lowered groove, liking
  and naturalness ratings, except for the simple short-long jazz shuffle, and experts were more
  sensitive than untrained listeners.
* Frühauf, Kopiez & Platz (2013), "Music on the timing grid: the influence of microtiming on the
  perceived groove quality of a simple drum pattern performance". Snare and bass drum shifted
  by -25, -15, 0, +15 and +25 ms in a rock pattern, rated by 93 music students. As summarised by
  citing work, large offsets lowered groove ratings and the quantised version rated highest.
  (We could not confirm the journal from the search results; it is cited here by title only.)
* Senn, Kilchenmann, von Georgi & Bullerjahn (2016), "The effect of expert performance
  microtiming on listeners' experience of groove in swing or funk music", *Frontiers in
  Psychology* 7:1487, doi:10.3389/fpsyg.2016.01487. Real bass and drums performances (swing and
  funk) had their deviations scaled. Ratings stayed high up to the performed magnitude and fell
  for exaggerated ones, and quantised and original versions were rated about equally.

**Interpretation**

* "Laid-back" and "pushed" are shapes that are partly about loudness and timbre, not only about
  onset. A laid-back drummer in our model plays the backbeat a little louder as well as later.
* Deviations should be **small and systematic**. Across these studies, exaggerated or
  unsystematic deviations lowered groove ratings, while performed-size deviations did no harm.
  So every personality's timing is bounded (40 ms), most offsets stay within about 10 ms, and
  the large ones belong to personalities that are meant to sound loose (DRUNK, SLOPPY).
* Per-instrument asymmetry is a documented strategy (the flam and compound-sound strategies),
  which supports treating kick, snare and hats as separate timing voices.

**Design** (engine/personality.ts)

* Six dimensions per personality: TIMING (a lean per voice, a slow drift, a scatter), DYNAMICS
  (level, contrast, velocity scatter), ENERGY (rushing or dragging, busier bars harder, how
  much the recipe's density and complexity are nudged), DISCIPLINE (how much the scatter repeats
  bar after bar, and how much of the recipe's HUMANISE is tightened), EXPRESSION (ghost
  chatter) and PHRASING (one phrasing behaviour per personality).
* The dimensions interact. DISCIPLINE turns the scatter from per-hit noise into a repeating
  per-position figure. ENERGY adds a rush across the phrase. A laid-back snare (lean over 4 ms)
  is also played louder, after Danielsen et al. 2015.
* INTENSITY 0 is the recipe exactly. Explicit settings keep their meaning at any intensity:
  nudges are proportional, so TOMS 0, ROLLS 0 and GHOSTS 0 stay 0; ROLL GENERATION is never
  touched; added hits are scaled by `(DENSITY / 0.5)^1.5`, so a 20 % recipe gets about a
  quarter of them; and a personality never adds a tom or a roll.
* The 17 personalities and their numbers (PERSONALITY_DIMS) are hand-set characterisations,
  not measured from data.

## 2. DILLA: straight and swung at once

**Established**

* Charnas, D. (2022), *Dilla Time: The Life and Afterlife of J Dilla, the Hip-Hop Producer Who
  Reinvented Rhythm*. MCD/Farrar, Straus and Giroux. As quoted in reviews and interviews (SPIN,
  February 2022; DJ Mag; an essay by Ethan Hein): Charnas describes "Dilla time" as several
  feels at once, some on the grid and some ahead of or behind it, and as straight time set
  against swung time. In the SPIN interview, Charnas says listeners often heard this as sloppy
  or drunken.
* DJ Mag's feature notes that the SP-1200 swings every voice by the same amount, while the MPC
  lets swing be set per voice, and it credits Dilla's MPC work from around 1997–98 with a
  deliberately offset, repeating grid. This hardware point comes from the article, not from the
  book.

**Interpretation**

* The feel is **programmed**: the same deviations repeat. It comes from voices disagreeing with
  each other, not from random looseness, and it is not one formula.

**Design** (engine/dilla.ts)

* Four strategies, one chosen per break from its FEEL seed: PUSH-PULL, POLYSWING, DRAG and
  DRUNK KICK. Each has its own per-voice swing, per-voice lean and a two-bar table of
  per-position deviations. The table varies in the turnaround bar, and the kick leans a little
  further every fourth bar.
* Each voice's swing is moved from the recipe's SWING towards the strategy's swing, replacing it
  rather than adding to it. The performance's own scatter is scaled down to a fifth at 100 %.
  The personality pass leaves timing to DILLA, so nothing is offset twice. Deviations are capped
  at about 9 ms at 30 %, 21 ms at 70 % and 30 ms at 100 %, and 0 % is the baseline exactly.
* The strategy names and numbers are our own; they are not transcriptions of Dilla records.

## 3. BREAK DNA: AMEN

**Established**

* The Amen break: the drum break in The Winstons' "Amen, Brother" (1969, the B-side of "Color
  Him Father"), played by Gregory C. Coleman. It is four bars, about seven seconds, starting
  about 1:26 into the track. The commonly cited description (Wikipedia, "Amen break"; a
  Substack essay on Coleman) is that the first two bars repeat the groove, the third delays a
  snare, and the fourth leaves its first beat empty, then plays a syncopated figure with an
  early crash. Accounts differ on who directed the break.
* Resequencing the Amen and similar breaks in hardcore, jungle and drum & bass: Hockman &
  Davies 2015 (*earlier*). Automatic breakbeat cutting in the style of early 1990s jungle:
  Collins 2001, "Further Automatic Breakbeat Cutting Methods", Generative Art conference
  (*earlier*; the search confirmed the paper and its BBCut code).

**Interpretation**

* The identity is in the **construction**: an A A A′ B unit, a kick pair late in the bar,
  syncopated snares around the backbeats, a delayed backbeat in A′, and a B bar that drops the
  downbeat. The exact per-hit positions inside each figure are our reading of the commonly
  cited description and of common transcriptions; they were not transcribed from the recording
  for this phase.

**Design** (engine/dna.ts)

* No audio is used: no recording is sampled, copied or shipped. AMEN is a vocabulary of grid
  figures, with two A′ variants and three B variants chosen from the BEAT seed.
* INFLUENCE blends the vocabulary into the recipe's own phrase, before the personality and the
  performance. The core figures arrive first, the recipe's own kicks and snares are given up as
  influence grows, and from 60 % the timekeeper thins to eighths. 0 % is the recipe exactly.
* It never adds a tom or a roll. HALFTIME keeps its own backbeat on 3. With CHOP on, the chop
  leans towards snare-led edits, motifs, gaps and turnarounds, and its retriggers grow only
  with ROLL GENERATION on.
* The registry takes another DNA as one more entry (DNA_IDS).

## 4. IDM rolls, ratchets and DESTROY

**Established**

* Collins 2001 (above): parameterised breakbeat cutting, with offsets, cut sizes and repeat
  counts under algorithmic control, and subdivisions that are awkward to enter in a sequencer.

**Interpretation and design**

* The roll EXPRESSION contours (pitch, velocity, timing), ratchets of 2 to 16, reverse modes,
  the 12 presets and DICE, and the DESTROY operations (STUTTER, REVERSE, PITCH DIVE and RISE,
  GATE, SKIP, FREEZE, TAPE STOP) are **design**. They follow common production practice
  (sampler retriggers, pitch by playback rate, reversed hits, tape stops). No source was
  consulted for their specific shapes, and none is claimed.
* Pitch is by playback rate: +12 semitones plays the sample twice as fast and half as long.
  Measured with real Web Audio in test/expressiveBrowser.ts, the demo snare at +12 rings for
  about half as long as at 0.
* A reversed hit plays its sample backwards from the hit's position. The sample's silent tail
  (below -60 dB of its peak) is trimmed first, so the swell starts on the grid rather than after
  silence, and a 2 ms fade avoids a click where the tail was cut.
* DESTROY works on events, not audio. GATE removes the hits in the closed sixteenths. TAPE STOP
  moves, lowers and softens each hit along a falling playback rate, which approximates a real
  tape stop but does not bend a ringing sample.

## 5. REGEN TRACK and TOM ACTIVITY

These are design, measured in [expressive-report.md](expressive-report.md). REGEN TRACK draws
six candidates from the full generator and keeps the selected tracks of the best fit; its
scoring rules are listed in engine/regen.ts. TOM ACTIVITY's revision 2 curve is a hand-set
target (§1 of the report). Revision 1 breaks still bake as before.

## What is not yet known

* Whether any personality, DILLA strategy, AMEN influence, preset or DESTROY style sounds good.
  That needs listening with a real kit (docs/EVALUATION.md §4 lists the procedure).
* Whether the personality numbers match real drummers. A natural next step is to fit them to
  recorded performances, for example the Groove MIDI Dataset (Gillick et al. 2019, *earlier*).
