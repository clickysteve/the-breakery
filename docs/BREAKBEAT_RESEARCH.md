# Breakbeat research for The Breakery

What makes a drum break worth sampling, what research says about groove, and which
computational techniques suit a small browser instrument. Written before the generator was
built, and used to design it.

**How to read this document.** Each claim is marked:

* **[D] Documented**: reported by a source listed in the references, with a link. Where only an
  abstract, summary or secondary source was read, that is said.
* **[H] Hypothesis**: our own design reasoning or musical judgement. Not established fact, and
  open to being wrong. These are the things the listening tests (see
  [EVALUATION.md](EVALUATION.md)) should check.

**What was and was not done.** Research was carried out with web search and by reading
open-access papers and pages on 18 October 2026. **No audio was analysed.** No recording was
transcribed, measured or listened to for this document, and no note-for-note transcription of
any copyrighted break is given or used. Descriptions of famous breaks come from published
lessons, articles and encyclopaedia entries, and are summarised at the level of their general
musical features. Several papers were read only as abstracts or summaries; those are flagged.

---

## 1. Key musical findings

### 1.1 Classic breaks: features that recur

The breaks below are cited for their *characteristics*. The Breakery does not reproduce them.

| Break | What the sources describe | Source quality |
|---|---|---|
| *Amen, Brother* (The Winstons, 1969; Gregory Coleman) | Four bars, about seven seconds. Bars 1–2 repeat the song's groove; bar 3 **delays a snare hit**; bar 4 **leaves the first beat empty**, then plays a syncopated figure and an **early crash** [D: Wikipedia, citing *The Economist* 2011]. A constant eighth-note **ride** cymbal, **ghost notes quieter than the 2-and-4 backbeat**, and a **double kick** in the first bar are highlighted by a drum teacher's lesson [D: MusicGurus lesson, partial transcript read]. Tempo is given as roughly 136 BPM by a tutorial cited on Wikipedia [D, secondary]. | Encyclopaedia + lesson summary |
| *Funky Drummer* (James Brown, 1970; Clyde Stubblefield) | **One-handed sixteenth-note hi-hat**; kick on beat 1 and on syncopated sixteenths; snare **backbeat on 2 and 4 surrounded by soft ghost notes**; occasional **open hi-hat accents** on off-beats, one of them falling with the kick [D: Roland "Behind the Beat"; Aeon essay]. Stubblefield played by feel and did not think in terms of "ghost notes" [D: The Current], so any transcription is an interpretation. | Articles and lesson summaries |
| *Think*, *Apache*, *Hot Pants*, *Synthetic Substitution* | Not researched in enough depth to make specific claims. They are widely cited as sampled breaks, but we found no reliable analysis to summarise in the time available. | — |

Features common to the breaks we could read about:

1. **The backbeat is the anchor.** Snare on beats 2 and 4 with the strongest accents, in the
   groove bars [D: both rows above]. Variation tends to happen *around* it: displacement late in
   the phrase (Amen bar 3) rather than in the first bars [D: Amen].
2. **The kick does the syncopating.** Beat 1 is strong; further kicks fall on off-beat
   sixteenths and "and"s, often in pairs ("double kick") [D: Funky Drummer, Amen lesson].
3. **Ghost notes surround the backbeat** and are much softer than it [D].
4. **A continuous timekeeper** (sixteenth hats or eighth ride) holds the subdivision, with
   accents and occasional open-hat lifts [D].
5. **Phrases of more than one bar**: groove bars that repeat, then a varied bar at the end
   (displaced snare, missing downbeat, early crash) that pushes back into the top [D: Amen].
   [H] Two- and four-bar phrases with variation concentrated in the second half of the last bar
   are a good default.

### 1.2 Hi-hat dynamics are patterned, not random

Räsänen et al. (2015) measured Jeff Porcaro's one-handed sixteenth-note hi-hat on *I Keep
Forgettin'* [D: full text read]:

* **Every second sixteenth is accented**; the amplitudes form two overlapping distributions.
* Amplitudes form a **repeating two-bar pattern** (high–low–medium–low–very high…), the
  loudest hits coinciding with the snare. Bar-to-bar amplitude correlation is high (mean R = 0.88).
* Timing between hits: 16th interval ≈ 157 ms with SD ≈ 8.7 ms; **short-range anticorrelation**
  (a late hit tends to be followed by an early one; lag-1 r = −0.48) and **long-range
  correlation** over longer spans; slow drift because no click was used.
* The authors suggest drum machines could reproduce such accent patterns "in a straightforward
  manner", combined with long-range correlated fluctuations. One drummer, one song: a limitation
  they state themselves.

### 1.3 Swing

* The common drum-machine swing convention (Roger Linn, 1979; MPCs, Electribes, Logic and
  others) delays **every second sixteenth** (or eighth). 50 % is straight, 66 % is triplet swing,
  75 % the maximum; small amounts (≈ 54 %) "loosen" sixteenth hats without sounding swung
  [D: Attack Magazine; MPC2500 manual as quoted on forums — forum material is secondary].
* Notes on the beat and on the "and" do not move, so kicks and backbeats stay put [D].

### 1.4 Microtiming and groove: what the research actually says

This is the most important area for the design, because "humanise = random timing" is the
default in most software.

* **Random jitter is not how humans deviate.** Human timing fluctuations are long-range
  correlated, not white noise; listeners **strongly preferred long-range correlated
  fluctuations over the uncorrelated randomisation** that standard "humanize" functions
  produce [D: Hennig et al. 2011, abstract and summaries; note the authors hold patents on their
  algorithm].
* **Systematic microtiming did not increase groove** for synthesised jazz, funk and samba
  patterns: ratings of groove, liking and naturalness *fell* as deviations grew, except for a
  simple short-long shuffle [D: Davies et al. 2013, abstract].
* **Quantised drum patterns were rated best** for a simple rock pattern; ±15 and ±25 ms shifts
  lowered ratings; **early shifts were penalised more than late ones**; **snare deviations hurt
  more than bass-drum deviations** [D: Frühauf, Kopiez & Platz 2013, abstract and summaries].
* With **expert performances**, quantised and original timing were rated equally well;
  **exaggerated** timing was rated worse and irritated listeners; ratings peaked for timing
  *tightened* to about 40 % of the original deviation; experts were more sensitive than
  non-experts; swing vs funk made no difference [D: Senn et al. 2016, full text partly read].
* **Intentional timing is also timbral**: drummers asked to play laid-back, on the beat or pushed
  changed the *loudness and sound* of snare strokes as well as their timing; most played
  laid-back strokes louder [D: Danielsen et al. 2015, abstract].

Taken together [H]:

1. Timing deviation should be **small, consistent and structured**: per-instrument tendencies
   (e.g. a slightly late snare, hats leaning slightly ahead), not random scatter.
2. If any fluctuation is added, it should be **correlated** (smooth, drifting) and small, never
   white noise.
3. **Early snares are risky**; laid-back snares should be biased late, and come with a velocity
   lift.
4. **Swing is the safe, well-understood "feel" control**; microtiming is subtle seasoning.
5. The **Humanise** control should default low and be capped at modest values (≈ ±10 ms).

### 1.5 Syncopation and complexity

* Funk drum breaks with **medium syncopation** produced the strongest desire to move and
  pleasure; low and high syncopation produced less — an **inverted U** [D: Witek et al. 2014,
  abstract and summaries; the paper has a 2015 correction we did not read].
* Syncopation can be measured against a **metrical hierarchy**: each grid position has a weight
  (downbeat strongest, then half-bar, beats, eighths, sixteenths); a syncopation is a note on a
  weak position followed by silence on a stronger one (Longuet-Higgins & Lee) [D: described in a
  dataset description and a thesis summary; the original 1984 paper was not read]. Such measures
  correlate with listeners' complexity ratings but with notable outliers [D: Smith & Honing
  2006, abstract].
* Sioros & Guedes model syncopation as **transformations** that displace events, add pickups or
  faster notes, applied stepwise to a pattern, and built a real-time generator (kin.rhythmicator)
  with controls for density, variation, syncopation and metrical strength [D: abstracts and
  summaries].

[H] A syncopation **target** (not "more is better") is the right control: the generator should
aim for a chosen amount, defaulting to the middle.

### 1.6 Genre notes (treated as tendencies, not rules)

* **Jungle**: drums around 160–175 BPM (bass often felt at half speed); classic practice is
  **slicing breaks into individual hits and rearranging** them, with many ghost snares, edits,
  rolls and fills [D: production guides — practical, not scholarly sources]. The Amen became
  popular because it was easy to manipulate [D: Wikipedia].
* **Hip-hop** and **funk**: no reliable *analytical* source was found in the time available for
  general stylistic claims beyond the breaks above. Our recipe settings for these are
  [H] musical judgement: hip-hop = slower tempos, more space, strong accents, more swing; funk
  = busier sixteenth hats and ghost notes, syncopated kicks.
* "Broken" is not a documented genre definition here; it is our own label [H] for odd groupings
  and displaced accents.

---

## 2. Computational rhythm generation

| Technique | What it is | Suitability for The Breakery |
|---|---|---|
| **Groove MIDI Dataset / GrooVAE** | 13.6 h, 1,150 MIDI files, 22,000+ bars by 10 drummers on an e-kit, played to a metronome; CC BY 4.0. Models (Seq2Seq / VAE) learn to **humanise** quantised drums, **infill** voices and turn taps into drums. Treats the **score** (quantised hits) separately from the **groove** (velocity and timing offset per hit) [D: Gillick et al. 2019; Magenta dataset page]. | The score/groove split is adopted directly. A neural model is **not** used: it would need TensorFlow.js and model weights, its output is hard to explain or control, and the brief asks for understandable, testable algorithms. The dataset's 9-class drum mapping informed our categories. [H] A future option: statistics (per-step hit and velocity probabilities) extracted from the CC-BY dataset could tune recipes. |
| **Metrical templates + syncopation metrics** | Weighted metrical hierarchy; LHL-style syncopation score [D]. | **Used.** Cheap, explainable; drives kick placement and scores candidates. |
| **Constraint-based generate-and-test** | Sample candidates, reject those breaking rules, keep the one closest to targets. | **Used** for the foundation: candidates are scored against syncopation and density targets and musical constraints. [H] |
| **Conditional probability / relational rules** | Each voice's probabilities depend on what other voices already do. | **Used** for ghosts, hats, open hats, percussion. [H] |
| **Hierarchical phrase generation** | Generate a cell, derive bars from it, add turnarounds. | **Used** (phrase plan A A′ … T). [H] |
| **Markov chains** | Next step depends on previous steps. | **Not used** in Milestone 1: a first-order chain over steps does not know where the backbeat is, and needs training data we do not have. Metrical weights capture the strong/weak structure more directly. [H] |
| **Euclidean rhythms** | k onsets spread as evenly as possible over n steps; generates many traditional timelines [D: Toussaint 2005; Demaine et al. 2009]. | **Used** for the BROKEN recipe's groupings and for percussion. |
| **Syncopation transformations** | Displace onsets to create/remove syncopation stepwise [D: Sioros & Guedes]. | **Used in spirit** for bar variation (shift a kick earlier by a sixteenth, anticipate a snare). |
| **Evolutionary / interactive GA** | Users pick favourites, offspring are bred; known risk: user fatigue [D: Kaliakatsos-Papakostas 2012; evoDrummer (title only); Vogl et al. compare a similarity-driven GA with other variation methods]. | **Milestone 3.** The engine's seeded, layered design makes breeding possible (inherit layer seeds and recipe values). |
| **Neural variation (Vogl & Knees)** | Variations of a seed pattern from a network trained on loop libraries; positive producer feedback [D: NIME 2017 abstract]. | Not used, same reasons as GrooVAE. |

---

## 3. Proposed generation technique (the design)

A layered generator, top-down, deterministic from a seed. Each layer has its own random stream
(derived from the seed and the layer name), so one layer can be kept while others change.

1. **Phrase plan (Layer D)** — decide each bar's role: `A` (groove), `A′` (answer: the groove
   with variation, mostly in its second half), `T` (turnaround: variation + fill at the end).
   2 bars → `A T`; 4 bars → `A A′ A T`; 1 bar → `A`.
2. **Foundation (Layer A)** — for the groove cell: backbeat snares (style decides displacement
   and half-time); kicks from a weighted metrical template: weights combine metrical strength,
   style preferences, and relational rules (no kick on a backbeat, favour kicks just after
   backbeats and before beat 3, allow pairs). Draw many candidates, score each against
   **target density** and **target syncopation** (LHL-style), keep the best.
3. **Supporting voices (Layer B)**, conditioned on the foundation:
   * **Timekeeper** (hats or ride): eighths or sixteenths depending on style and density; the
     hat lifts (opens) on chosen off-beats and closes on the next hit (choke group); gaps where
     the open hat rings.
   * **Ghost snares**: candidates scored by relation to the backbeat (the sixteenth before:
     "anticipation"; after: "rebound") and to kicks (avoid unison with kicks); count from
     the GHOSTS control.
   * **Percussion**: complements the composite rhythm (fills gaps; Euclidean spread over free
     steps) or reinforces backbeats.
   * **Cymbal**: crash at the top of the phrase or with the turnaround's syncopated hit.
4. **Phrase development (Layer D, again)** — derive `A′` and `T` from `A` with variation
   operators: shift a kick a sixteenth (syncopation transformation), add/remove a ghost, delay
   a backbeat (Amen-like), drop the downbeat after a fill, insert a snare run / flam in the
   last beat(s) (FILLS controls length and density).
5. **Performance (Layer C)**:
   * **Velocity** by role: backbeat > downbeat kick > other kicks > timekeeper accents >
     ghosts; hats accented on alternate sixteenths with a two-bar accent pattern (§1.2); small
     *correlated* variation (smoothed random walk), never independent noise.
   * **Swing**: Linn-style delay of the second sixteenth of each eighth, from the SWING control.
   * **Microtiming**: per-voice tendencies chosen once per break ("feel"): snare 0 to slightly
     late (never early, §1.4), hats on or slightly ahead, kick on the grid; a small correlated
     drift scaled by HUMANISE, capped at ±10 ms; ghosts get a little more freedom than
     backbeats; a laid-back snare gets a small velocity lift (§1.4, Danielsen).
6. **Sample choice** — one main sample per category per break (seeded), with occasional
   alternates for ghosts and hats if several are loaded.

Every event carries its **role** ("backbeat", "ghost: anticipates backbeat", "fill") so the
pattern view can explain what the generator did, and later slicing/MIDI features can use it.

---

## 4. Limitations and uncertainties

* **No audio analysis, no listening by the author of this document.** All claims about breaks
  come from texts; descriptions of famous breaks are second-hand.
* Several key papers were read as abstracts or summaries only (Davies 2013, Frühauf 2013,
  Witek 2014, Hennig 2011, Danielsen 2015, Smith & Honing 2006, Sioros & Guedes, Vogl & Knees).
  The original Longuet-Higgins & Lee (1984) paper was not read; the syncopation measure used is
  our implementation of the idea as described secondarily.
* The microtiming literature **disagrees** (exactitude vs participatory discrepancies); results
  depend on style, instrument and listener expertise. Our design takes the cautious middle:
  small structured deviations, defaulting low.
* The Porcaro hi-hat study is one drummer and one song.
* Genre descriptions for jungle come from production guides, not scholarship; hip-hop and funk
  recipe settings are musical judgement.
* No break other than Amen and Funky Drummer was researched in useful depth (Think, Apache, Hot
  Pants and Synthetic Substitution are named in the brief but not analysed here).
* The syncopation target values and all probability weights in the recipes are **design
  hypotheses**, tuned by inspection of generated patterns and metrics, not fitted to data.

---

## 5. How the findings shape The Breakery

| Finding | Design decision |
|---|---|
| Backbeat anchors, kick syncopates, ghosts surround the backbeat (§1.1) | Foundation first (kick/snare), supporting voices conditioned on it; relational ghost placement. |
| Variation late in the phrase (§1.1) | Phrase plan A / A′ / T with variation concentrated in the second half and in the last bar. |
| Patterned hat dynamics (§1.2) | Alternating-sixteenth accents with a repeating two-bar accent contour. |
| Random humanisation is not preferred; microtiming can hurt; early snares worst (§1.4) | HUMANISE is small, correlated, per-voice and capped; snares never pushed early; SWING is separate and Linn-style. |
| Medium syncopation grooves most (§1.5) | SYNCOPATION is a *target*, default in the middle; candidates scored against it. |
| Score vs groove separation (GrooVAE) | Event = quantised position + separate velocity, swing and timing offset; freeze/breed can treat them separately. |
| Explainability and testability | Rule- and metric-based generation in plain TypeScript; no neural network; seeded determinism. |
| Jungle = sliced, rearranged breaks (§1.6) | Retain per-hit metadata (exact sample positions of every hit) for the future slicing laboratory. |

---

## 6. References

Links were checked on 18 October 2026. "Read" says how much of each source was read.

**Groove, microtiming and expressive timing**

* Davies, M., Madison, G., Silva, P., & Gouyon, F. (2013). The effect of microtiming deviations on
  the perception of groove in short rhythms. *Music Perception* 30(5). Read: abstract.
  <https://repositorio.inesctec.pt/handle/123456789/3901>
* Frühauf, J., Kopiez, R., & Platz, F. (2013). Music on the timing grid: The influence of
  microtiming on the perceived groove quality of a simple drum pattern performance. *Musicae
  Scientiae* 17(2). Read: abstract / summaries. <https://doi.org/10.1177/1029864913486793>
* Senn, O., Kilchenmann, L., von Georgi, R., & Bullerjahn, C. (2016). The effect of expert
  performance microtiming on listeners' experience of groove in swing or funk music. *Frontiers
  in Psychology* 7:1487. Read: most of full text.
  <https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2016.01487/full>
* Hennig, H., Fleischmann, R., Fredebohm, A., et al. (2011). The nature and perception of
  fluctuations in human musical rhythms. *PLoS ONE* 6(10): e26457. Read: abstract and
  summaries. <https://pmc.ncbi.nlm.nih.gov/articles/PMC3202537>
* Räsänen, E., Pulkkinen, O., Virtanen, T., Zollner, M., & Hennig, H. (2015). Fluctuations of
  hi-hat timing and dynamics in a virtuoso drum track of a popular music recording. *PLoS ONE*
  10(6): e0127902. Read: full text. <https://pmc.ncbi.nlm.nih.gov/articles/PMC4454559/>
* Danielsen, A., Waadeland, C. H., Sundt, H. G., & Witek, M. A. G. (2015). Effects of instructed
  timing and tempo on snare drum sound in drum kit performance. *JASA* 138(4), 2301–2316. Read:
  abstract. <https://research.birmingham.ac.uk/en/publications/effects-of-instructed-timing-and-tempo-on-snare-drum-sound-in-dru/>

**Syncopation and rhythmic complexity**

* Witek, M. A. G., Clarke, E. F., Wallentin, M., Kringelbach, M. L., & Vuust, P. (2014).
  Syncopation, body-movement and pleasure in groove music. *PLoS ONE* 9(4): e94446 (correction
  2015). Read: abstract and summaries. <https://ideas.repec.org/a/plo/pone00/0094446.html>
* Smith, L. M., & Honing, H. (2006). Evaluating and extending computational models of rhythmic
  syncopation in music. *Proc. ICMC*. Read: abstract.
  <https://www.mcg.uva.nl/mcg-2023/abstracts/smith-honing-2006.html>
* Longuet-Higgins, H. C., & Lee, C. S. (1984). The rhythmic interpretation of monophonic music.
  *Music Perception* 1(4). **Not read**; described via the syncopation dataset notes at
  <https://code.soundsoftware.ac.uk/hg/syncopation-dataset/rev/1376d0f32c65> and the thesis
  summary at <https://www.politesi.polimi.it/retrieve/1dda9eed-4115-408c-a95c-63c3f25ac24a/Executive_Summary_Maucione_2023_12.pdf>
* Sioros, G., & Guedes, C. (2014). Syncopation as transformation / Transforming musical rhythms:
  meter and syncopation. Read: abstracts.
  <https://bpb-us-e1.wpmucdn.com/wp.nyu.edu/dist/4/23414/files/2022/01/SiorosGuedes2014.pdf>
* Toussaint, G. (2005). The Euclidean algorithm generates traditional musical rhythms. *Bridges*.
  Read: summary. <https://cgm.cs.mcgill.ca/~godfried/publications/banff.pdf>
* Demaine, E. D., et al. (2009). The distance geometry of music. *Computational Geometry*.
  Read: summary. <https://dspace.mit.edu/handle/1721.1/96166>

**Computational drum generation**

* Gillick, J., Roberts, A., Engel, J., Eck, D., & Bamman, D. (2019). Learning to groove with
  inverse sequence transformations. *ICML*. Read: abstract and summaries.
  <https://arxiv.org/abs/1905.06118>
* Groove MIDI Dataset (Magenta). Read: dataset page. <https://magenta.tensorflow.org/datasets/groove>
* Vogl, R., & Knees, P. (2017). An intelligent drum machine for electronic dance music production
  and performance. *NIME*. Read: abstract. <https://nime.org/proc/nime2017_rvogl/>
* Kaliakatsos-Papakostas, M., et al. (2012). Interactive evolution of 8-bit melodies with genetic
  programming (on user fatigue in interactive evolution). Read: abstract.
  <https://gpbib.cs.ucl.ac.uk/gp-html/Kaliakatsos-Papakostas_2012_SC.html>
* Vogl, R., et al. An intelligent interface for drum pattern variation and comparative evaluation
  of algorithms (similarity lookup vs neural vs GA). Read: abstract.
  <https://repositori.upf.edu/items/4868a3f6-789f-4028-9789-1d66daee423b>

**Breaks, swing and production practice**

* "Amen break", Wikipedia (citing *The Economist*, "Seven seconds of fire", 17 Dec 2011).
  <https://en.wikipedia.org/wiki/Amen_break>
* Max Sedgley, "The Winstons – Amen, Brother" lesson, MusicGurus (partial transcript).
  <https://www.musicgurus.com/fr/courses/iconic-drum-breaks-vol-1/lessons/learn-drums-the-winstons-amen-brother>
* Roland Articles, "Behind the Beat: Funky Drummer by James Brown".
  <https://articles.roland.com/behind-the-beat-funky-drummer-by-james-brown/>
* Aeon, "What drum machines can teach us about artificial intelligence".
  <https://aeon.co/essays/what-drum-machines-can-teach-us-about-artificial-intelligence>
* The Current, "Pride and pain: The story of the Funky Drummer" (2020).
  <https://www.thecurrent.org/feature/2020/02/11/pride-and-pain-the-story-of-the-funky-drummer>
* Attack Magazine, "Swing in DAWs and drum machines".
  <https://attackmagazine.com/technique/passing-notes/daw-drum-machine-swing/2>
* eMastered, "How to make jungle music" (production guide).
  <https://emastered.com/blog/how-to-make-jungle-music>
