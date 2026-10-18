# Breakbeat research for The Breakery

What makes a drum break worth sampling: where breakbeats came from, how influential breaks are
built, what research says about groove, how jungle producers transformed breaks, and which
computational techniques suit a small, deterministic browser instrument. The first version of
this document (October 2026, before the generator existed) designed engine 1; this second
version (also October 2026) informed engine 2, the 1–8 bar phrases and the new recipes.

## How to read this document

Every significant claim carries a marker:

* **[D] Documented**: reported by a source in the references (§10), which also says how much of
  each source was read: *full text*, *partly*, or *abstract / summary only*.
* **[I] Reasonable inference**: our reading of documented material, where the step from source
  to claim is short and stated.
* **[H] Design hypothesis**: our own musical judgement or design reasoning. Not established and
  open to being wrong. These are what the listening tests ([EVALUATION.md](EVALUATION.md)) are for.

**What was and was not done.** Research used web search and reading of open-access papers,
encyclopaedia entries, interviews and production articles. Two papers were read in full as text
extracted from their PDFs (Hockman & Davies 2015; Collins 2001); one in full in the first pass
(Räsänen et al. 2015); most others as abstracts or summaries, and some only through search-engine
summaries of a page, which is weaker still and is marked *summary via search*. **No audio was
analysed and no recording was listened to.** The author (Claude, an AI assistant) cannot listen.
No note-for-note transcription of any copyrighted break is given or used, and none was invented:
where no reliable transcription could be read, this document says so. No recordings or samples
are used by The Breakery.

---

## 1. Historical development

### 1.1 Funk and soul drumming (late 1960s – mid 1970s)

* Breaks are short sections of funk and soul records where the other instruments drop out and the
  drummer plays alone or nearly alone [D: Wikipedia "Break (music)"; Hockman & Davies 2015].
* The most-sampled breaks were often not solos in the virtuoso sense. Ethan Hein reports that James
  Brown told Clyde Stubblefield not to "cut loose" in *Funky Drummer*, so he kept playing the main
  groove "with more emphasis but not a lot of variation" [D: Hein, summary of article]. [I] A
  break that *keeps the groove* is more useful to a sampler than one that departs from it.
* The players were often anonymous studio or band musicians: the *Impeach the President*
  drummer is unnamed; the *Apache* drum track may be by Jim Gordon or Kat Hendrikse (sessions were
  tracked twice and it is unclear which was used) [D: Stereogum columns, summary via search].

### 1.2 DJs extend the break (1973 →)

* DJ Kool Herc's "merry-go-round" (Bronx, from 1973) used two copies of the same record on two
  turntables, switching back and forth to extend the short break dancers waited for. The earliest
  example he described went from James Brown's *Give It Up or Turnit a Loose* into the break of
  the Incredible Bongo Band's *Bongo Rock* [D: Wikipedia "DJ Kool Herc"; Rolling Stone; summary via
  search; the details rest largely on Herc's own recollection].
* [I] The first breakbeat practice was therefore **repetition of a short drum phrase**, with the
  seam between copies as part of the music. The loop point matters: what happens at the end of
  the phrase leads back into its start.
* Labels later did the same in the studio: Polydor's 1986 *In the Jungle Groove* includes a
  "Bonus Beat Reprise" that loops the *Funky Drummer* break for about three minutes [D: Hein].

### 1.3 Sampling and drum machines in hip-hop (1980s)

* Roger Linn describes how drum-machine **swing** works (delaying alternate sixteenths; the LM-1
  offered 50, 54, 58, 60, 62, 66, 70 and 75 %), that **quantise** began as a bug he kept ("call
  this bug a feature"), that he found **randomising** timing "didn't help much", and that none of
  the great grooves on his machines used it; he calls swing the most important factor in groove
  [D: Linn interview, Attack Magazine, read in summary].
* Hip-hop producers looped sampled breaks under raps, and also rebuilt them: Audio Two's *Top
  Billin'* "reorders [the] component drum hits" of *Impeach the President* into a different beat
  [D: Hein]. [I] Two habits coexist: the **looped live break** (feel preserved) and the
  **programmed, quantised and swung** beat built from one-shots (feel imposed by the machine).

### 1.4 Breakbeat hardcore, jungle and drum & bass (UK, c. 1990–1997)

* Breakbeat hardcore "combines four-on-the-floor rhythms with breakbeats usually sampled from
  hip-hop"; Simon Reynolds describes producers using "looped breakbeats to funk up house's
  four-to-the-floor machine-beat" on cheap home setups (Atari ST, Cubase) [D: Wikipedia "Breakbeat
  hardcore", citing Reynolds, *Energy Flash*, pp. 96–97; read the article].
* Hardcore, jungle and drum & bass (HJDB) emerged from affordable samplers (e.g. the Akai S950);
  breaks were recorded into a sampler and **an arrangement was created by reordering MIDI notes
  associated with segments of the break ("resequencing")**; transformations include pitch-shifting,
  time-stretching, filtering, resampling and resequencing; producers are recognised by their choice
  of breaks and the transformations they use [D: Hockman & Davies 2015, full text].
* Common sources in HJDB include the Amen, *Apache* and Ike Turner's *Funky Mule* [D: Hockman &
  Davies 2015], *Think* (the "second most sampled" break after the Amen according to WhoSampled, as
  reported by Attack Magazine) [D: summary via search].
* Akai samplers' time-stretch let producers change a break's length without changing its pitch;
  its artefacts gave a "metallic, grainy" sound associated with the genre [D: Attack Magazine via
  search summary, weak].
* By late 1992 hardcore fragmented into darkcore, hardcore jungle and 4-beat [D: Wikipedia, citing
  Reynolds]. Jungle is described as built on "rapid breakbeats" and "heavily syncopated percussive
  loops", with the Amen especially common [D: Wikipedia "Jungle music", citing Butler 2006 and
  Rambarran 2021; Butler not read]. Drum and bass is usually given as 160–180 BPM [D: secondary].

### 1.5 Big beat, breaks and contemporary breakbeat

* Not researched in useful depth in the time available. Hockman & Davies mention a resurgence of
  break manipulation by artists such as Fracture and Om Unit [D]. Breakcore uses the *Think* break,
  usually sped up [D: Wikipedia "Think break", summary via search]. We make no further claims.

### 1.6 How the rhythmic vocabulary changed

| Period | Material | What happens to time | Source level |
|---|---|---|---|
| Funk/soul break | A drummer's groove | Human microtiming, subtle swing, dynamics; the groove kept, intensified | [D] §1.1, §2.2 |
| DJ break extension | The same phrase repeated | Repetition; the loop seam | [D] §1.2 |
| Hip-hop sampling | Loops; one-shots in drum machines | Quantise + swing; loops repeat exactly; hits reordered | [D] §1.3 |
| Hardcore | Breaks over a four-on-the-floor kick, sped up | Tempo raised; machine kick layered under live feel | [D] §1.4 |
| Jungle / D&B | Breaks cut into slices and resequenced | New arrangements from old hits; repeats, rolls, displaced snares; time-stretch | [D] §1.4, §4 |

[I] What makes a rhythm recognisably *breakbeat* rather than a drum-machine pattern: (a) it
comes from (or behaves like) a **performed groove** with a backbeat anchor, syncopated kicks,
ghost notes and a continuous timekeeper; (b) it is **treated as material**: repeated, cut and
rearranged, so that hits appear in places a drummer would not have played them while keeping
their sound and dynamics. The generator now models both: performance (engine 1 and 2) and
event-level rearrangement (engine 2's CHOP, §4).

---

## 2. Influential breaks

### 2.1 What could and could not be established

| Break | What reliable sources describe | Limitation |
|---|---|---|
| *Amen, Brother* (The Winstons, 1969; Gregory Coleman) | Four bars, about seven seconds (other sources: 5–6 s). Bars 1–2 repeat the groove; bar 3 **delays a snare hit**; bar 4 **leaves the first beat empty**, then plays a syncopated figure and an **early crash** [D: Wikipedia citing *The Economist*]. Constant eighth-note ride, ghost notes softer than the 2-and-4 backbeat, a double kick in bar 1 [D: MusicGurus lesson, partial transcript]. Its prominence in HJDB is documented [D: Hockman & Davies]. | Length disagrees between sources. No transcription reproduced. |
| *Funky Drummer* (James Brown, 1970; Clyde Stubblefield) | One-handed sixteenth hi-hat; kick on 1 and syncopated sixteenths; backbeat surrounded by soft ghost notes; occasional open-hat accents, one falling with a kick [D: Roland "Behind the Beat"; Aeon]. "Very light swing", sometimes behind the beat; every slice point on a sixteenth [D: Hein]. Stubblefield did not think in terms of "ghost notes" [D: The Current]. | Note-level transcriptions exist (Modern Drummer 2024; funkydrummer.com) but are images we could not read. |
| *Think (About It)* (Lyn Collins, 1972; John "Jabo" Starks) | The drum break with the "Yeah! Woo!" shouts; very widely sampled; usually played sped up in jungle, D&B and breakcore [D: Wikipedia, Splice, Attack via search]. | No rhythmic transcription read. Tempo not found. |
| *Apache* (Incredible Bongo Band, 1973) | Drum kit with prominent bongos and congas (King Errisson); "hip-hop's national anthem"; drummer uncertain [D: Stereogum, Complex via search]. Prominent in HJDB [D: Hockman & Davies]. | No transcription read. |
| *Impeach the President* (The Honey Drippers, 1973) | Opening break by an unnamed drummer; "heavily syncopated kick drum pattern" and an **open hi-hat on the "and" of beat 3** [D: Soundfly, summary via search]; reordered into a new beat in *Top Billin'* [D: Hein]. | Snare placement not found in the sources read. |
| *Synthetic Substitution* (Melvin Bliss, 1973; Bernard Purdie) | Opening break; widely sampled after Ultramagnetic MCs' *Ego Trippin'* [D: Wikipedia via search]. | No rhythmic analysis read. |
| *Ashley's Roachclip* (The Soul Searchers, 1974; Kenneth Scoggins) | Break around 3:30; **straight eighths**, "not typical of go-go", which usually swings [D: Hein]. | No transcription read. |
| *The Assembly Line* (Commodores, 1974) | Break used mainly in hip-hop, D&B and jungle [D: Wikipedia via search]. | No rhythmic analysis read. |
| *Hot Pants*, *Scorpio* | — | Not researched in enough depth to say anything reliable. |

[I] Recurring features across the breaks that *could* be read about: a stable backbeat anchor,
syncopated (often paired) kicks, a continuous timekeeper with accents and occasional open-hat
lifts, ghost notes much softer than accents, variation late in the phrase, and **subtle** feel.
[I] Why breaks lend themselves to sampling: they keep the groove (§1.1), they are (nearly) solo,
and their hits fall on a sixteenth grid, so they can be sliced and rearranged (Hein's "every slice
point on a sixteenth"; Hockman & Davies' resequencing).

### 2.2 Measured swing in the breakbeat canon

Frane (2017) analysed **30 classic breaks** from hip-hop's breakbeat canon [D: abstract and
summaries only; the full text was not accessible]:

* Sixteenth-note swing was common but **subtle: median swing ratio 1.2 : 1** (≈ 54.5 % in
  drum-machine terms) [D].
* Swing magnitude was **not correlated with tempo** (within constrained ranges) [D].
* **Backbeat delay** (a late snare) was frequently found **at beat 2 but not at beat 4** [D].
* "Swing density" (the proportion of swung positions that actually contain events) matters to how
  swing is perceived [D].

This is the most directly useful empirical finding for the generator: it sets the scale of swing
for breaks, and it says laid-back snares are not uniform across the bar.

---

## 3. Breakbeat musical theory

### 3.1 Rhythmic hierarchy and backbeat

* A 4/4 bar has a metrical hierarchy (downbeat strongest, then the half bar, beats 2 and 4, the
  "and"s, the sixteenth off-beats); syncopation can be measured as onsets on weak positions followed
  by silence on stronger ones (Longuet-Higgins & Lee) [D: described secondarily; original not read].
  Such measures correlate with perceived complexity, with outliers [D: Smith & Honing, abstract].
* EDM rhythm is commonly divided into "breakbeat-driven" and "four-on-the-floor" [D: chapter summary
  of Butler 2006; book not read].
* [H] The backbeat (2 and 4, or 3 in half-time) is the anchor; the kick is the syncopating voice.

### 3.2 Syncopation

* Funk breaks with **medium** syncopation produced the strongest wish to move and pleasure; low and
  high less: an inverted U [D: Witek et al. 2014, abstract; a 2015 correction not read].
* Syncopation can be created by transformations: displacing an onset, adding a pickup or faster
  notes (Sioros & Guedes) [D: abstracts].
* [H] SYNCOPATION is a *target* (generate-and-test scores candidates against it), not "more is better".

### 3.3 Groove, microtiming and swing

* Random "humanize" jitter is not how humans deviate: human fluctuations are long-range correlated,
  and listeners preferred correlated over uncorrelated fluctuations [D: Hennig et al. 2011, abstract].
* Porcaro's one-handed hi-hat: every second sixteenth accented; a repeating two-bar amplitude
  pattern; the loudest hits with the snare; 16th SD ≈ 8.7 ms; short-range anticorrelation [D:
  Räsänen et al. 2015, full text]. One drummer, one song.
* Up to **65 %** of drum-kit microtiming variability is systematic (recurring patterns) rather than
  residual [D: Hellmer et al. 2015, abstract].
* Quantised patterns were rated best for a simple rock pattern; ±15–25 ms shifts lowered ratings;
  early shifts worse than late; snare deviations worse than kick [D: Frühauf et al. 2013, abstract].
* Expert performances: quantised and original rated equally; exaggerated timing worse; preference
  peaked near 40 % of the original deviation [D: Senn et al. 2016, mostly read].
* Drummers instructed to play laid-back, on-beat or pushed changed **intensity and duration** as well
  as timing, and most played laid-back strokes louder [D: Danielsen et al. 2015; Câmara et al. 2020;
  abstracts]. A secondary summary puts such deliberate differences at about 10–40 ms [D, weak:
  summary via search, not verified in the paper].
* Linn: swing is the most important factor; randomising did not help [D: §1.3]. Classic breaks
  swing subtly and lay back on beat 2 more than beat 4 [D: Frane, §2.2].

[I] The research converges: feel should be **consistent tendencies** (per instrument, per beat,
per accent), **small**, with any fluctuation **correlated**; swing is the main, well-understood
control; random jitter is to be avoided.

### 3.4 Ghost notes

* Ghost notes surround the backbeat and are much softer than it [D: Funky Drummer and Amen sources, §2.1].
* [I] Since the timekeeping hand plays the hats, ghost strokes fall on the sixteenths between hat
  strokes and around the backbeat: anticipating it (the sixteenth before), rebounding from it (the
  sixteenth after), or leading into it in two strokes. [H] An anticipation is louder than a rebound;
  the second stroke of a pickup louder than the first; ghosts rarely coincide with kicks.
* [H] Funk vs jungle: in a funk performance ghosts are part of one drummer's continuous motion; in
  jungle many "ghosts" are soft snare slices moved by resequencing, so their placement follows the
  chop (§4), not the hands. Engine 1's JUNGLE ghost placement measured no better than chance; engine 2
  builds ghosts as figures around the *true* backbeats and leaves rearrangement to CHOP.

### 3.5 Phrase structure

* The Amen's four bars: groove, groove, variation (delayed snare), turnaround (empty beat 1,
  syncopated figure, early crash) [D]. DJs and labels extended breaks by repetition [D: §1.2].
* Collins found that **changing weights over a phrase** (large, intact cuts early; more repeats and
  displacements towards the end) is audible and "gives structure", while finer statistical control
  is hardly audible [D: Collins 2001, full text].
* [H] Phrases of two, four and eight bars built hierarchically: a motif, its answer, repetition,
  development, a short fill closing the first half, the main turnaround at the end; answers repeat
  (call and response) rather than every bar being new; the two fills relate.

### 3.6 Interlocking parts

* [D] Open hats in documented breaks fall on off-beats, sometimes with a kick (Funky Drummer) or on
  the "and" of 3 (Impeach). [H] Percussion should complement the composite rhythm (fill gaps, e.g. a
  Euclidean figure rotated away from kicks and snares) or reinforce the backbeat; hat accent cycles
  should relate to the snare (loudest with it, §3.3).

### 3.7 Breakbeat identity

* [I] Survives **tempo change**: the arrangement of hits and accents (pitching up changes timbre and
  tempo together, but the pattern and its proportions remain; jungle pitched breaks up, §1.4).
* [I] Survives **sample replacement**: the placement, dynamics hierarchy and feel; this is why
  The Breakery's rhythm never depends on the samples loaded. Lost with replacement: the room, bleed
  and tails of a recorded break; the sampler artefacts of time-stretch.
* [H] Essential: backbeat anchor, syncopated kick, ghost hierarchy, continuous timekeeper with
  accents, late-phrase variation, subtle consistent feel. Stylistic: tempo, swing amount, density,
  fill vocabulary, whether bars are chopped.

---

## 4. Jungle and breakbeat manipulation

### 4.1 Documented techniques

* **Resequencing**: a break is recorded into a sampler, cut into segments, and an arrangement is
  made by reordering MIDI notes that trigger the segments; a single new measure may combine segments
  from **two measures** of the source, some unused (their Figure 2: kick, hat, snare segments from
  bars 1 and 2 recombined) [D: Hockman & Davies 2015, full text].
* **Pitch-shifting, time-stretching, filtering, resampling** as further transformations [D: same].
* **Cut procedures** (Collins' BBCut, designed to automate early-90s jungle cutting): a *phrase* is
  made of *blocks*, each block takes audio from one *offset* in the source and consists of one or
  more *repeats*; very fast repeats are *rolls* or *stutters*; groupings such as **3+3+2** are
  rhythmically distinct from 2+3+3; his original algorithm favoured odd cut sizes and syncopation and
  put rolls at the **end of the phrase**; his "Warp" cutter allows rolls anywhere, even or
  **geometrically accelerating**; recursive cutting tends towards stuttering on small parts
  [D: Collins 2001, full text].

### 4.2 What the event-based generator can do, and what needs audio slicing

| Technique | In The Breakery now | Needs an audio slicing engine |
|---|---|---|
| Slice-based rearrangement | **Yes (engine 2 CHOP)**: development and turnaround bars are rebuilt from blocks of 2/3/4/8 sixteenths copied from the groove and its answer; salient slices (starting with a kick or snare) preferred; early blocks kept, later ones moved or repeated | Slices that include the room, tails and bleed of a recording |
| Snare displacement | Yes (chops move snares; DISPLACE fills; delayed backbeats) | — |
| Repeated fragments | Yes (a cut played twice inside a block) | — |
| Retriggers, rolls, rapid subdivisions | Yes: rolls of sixteenths → 32nds → (BREAKCORE) 48ths, crescendo; accelerating stutters | Retriggering a slice mid-sound (timbre of a truncated hit) |
| Half/double-time relationships | Partly: HALF-TIME recipe; hats keep the fast grid | Playing a slice at half speed |
| Pitching up/down | No (samples play at their pitch) | Yes (and it changes timbre with tempo) |
| Time-stretching | No | Yes |
| Resampling, filtering | No | Yes |
| Original groove vs chopped arrangement | Yes: the groove bar (A) is never chopped, so chops are heard *against* the groove | — |

### 4.3 The JUNGLE phrase (Phase 7)

JUNGLE recipes made since Phase 7 (`jungleCuts` in the recipe; saved JUNGLE breaks without it develop as before) build their phrase in `src/engine/jungle.ts` instead of varying each voice on its own.

* **Documented** (§4.1): slices repeated, moved and retriggered; displaced snares; rolls at the end of a phrase.
* **Design hypotheses** (not measured): which move goes in which bar, and how often. The motif plays in bar 1; bar 2 repeats it with one small change in the second half; the development bar (bar 3 of 4) displaces the second backbeat early or late with a short snare response and a secondary accent, repeats a beat or half bar of the groove (everything on those steps moves together), or goes half-time (one snare on beat 3, thin time); the turnaround adds a displaced backbeat or a repeated fragment and a snare retrigger burst of at most four sixteenths (sixteenths, then a 32nd pair). Ghost notes are re-placed from the groove's own ghost figure around every main snare, so a displaced snare keeps its ghosts, and ghosts that belong to no snare are dropped. Hit counts stay about where they were.
* **Not possible** with one-shot events: the tails, room and pitch of sliced audio, and retriggering a slice mid-sound. These need an audio slicing engine.
* **Needs listening**: whether the displaced snares, half-time bars and bursts sound like jungle, and how often each move should happen.

---

## 5. Computational approaches

| Approach | What it is | For The Breakery |
|---|---|---|
| **Probabilistic grammars** | Production rules with weights generate rhythmic "sentences"; Kippen & Bel's Bol Processor modelled tabla improvisation, tuning weights until generated variations were accepted by musicians; grammars express permutation, substitution and context [D: Bol Processor pages and abstracts]. | Used **in spirit**: the phrase plan (A A2 A F | A A2 B T) is a small fixed grammar; fills and chops are productions with weights. A full grammar formalism is not needed at this size. [H] |
| **Conditional generation** | Each voice depends on others already placed. | **Used** (ghosts on backbeats and kicks, hats on snares, percussion into gaps). |
| **Hierarchical models** | Cell → bar → phrase. | **Used** (engine 2 plans 1–8 bars hierarchically). |
| **Markov models** | Next event depends on previous ones. | **Not used**: a step-level chain does not know where the backbeat is and needs training data; metrical weights and figures capture it more directly. Collins' *memory of motifs* idea (reuse fragments) is closer to what we do with answers. [H] |
| **Constraint / generate-and-test** | Sample candidates, score, keep the best. | **Used** for kicks (syncopation target, pairs, constraints). |
| **Evolutionary** | Breed patterns; known risk of user fatigue [D: Kaliakatsos-Papakostas 2012]. | **MUTATE** is a one-step, user-driven mutation on the groove cell with a seed lineage; full breeding remains future work. |
| **Groove models** | Score vs groove separation (GrooVAE, Groove MIDI Dataset) [D: Gillick et al. 2019]; systematic vs residual microtiming [D: Hellmer 2015]. | Score and groove kept apart in events; systematic tendencies dominate the timing model. |
| **Syncopation metrics** | LHL-style weights [D]. | **Used** (generation target and analysis). |
| **Rhythmic similarity** | Edit distance correlates with human dissimilarity judgements (r = 0.87 for son variations) [D: Post & Toussaint, abstract]; polyphonic drum similarity depends on a set of perceptual descriptors [D: Gómez-Marín et al. 2020, abstract]. | Our analysis uses Jaccard similarity of onsets between bars; [H] an edit-distance measure would better test "related but different" for MUTATE (future). |
| **Human performance models** | Correlated fluctuations [D: Hennig; Räsänen]. | **Used** (correlated drift, small). |
| **Phrase-level variation** | Changing weights over a phrase [D: Collins]. | **Used** (chop keeps early blocks, moves later ones; rolls at the end). |
| **Neural models** | GrooVAE, Vogl & Knees [D: abstracts]. | Not used: weights, a runtime and opaque output for little gain at this size; the brief asks for explainable hits. |

---

## 6. Findings relevant to the generator, and what changed

| Finding | Level | Engine 2 change |
|---|---|---|
| Classic breaks swing subtly, median 1.2 : 1 | [D] Frane | FUNK default swing 0.18 (54.5 %); others set per recipe |
| Backbeat delay at beat 2, not at 4 | [D] Frane | Beat-2 snare carries the full lay-back; beat-4 snare 45 % of it (measured FUNK default: 5.9 vs 2.1 ms) |
| Randomising timing didn't help; systematic patterns dominate; correlated, small | [D] Linn, Hellmer, Hennig, Senn, Frühauf | Timing remains tendencies + small correlated drift; engine 1's ±10 ms cap and ~1 ms mean judged too subtle, so tendencies were enlarged (cap ±18 ms; mean 1–2.6 ms overall, 5–9 ms on the beat-2 snare in FUNK/HIP-HOP) |
| Laid-back strokes louder | [D] Danielsen, Câmara | Laid-back backbeats +3 velocity; louder hat accents land slightly later |
| Hat accents: every second 16th, loudest with the snare, repeating | [D] Räsänen | One accent cycle per break (beats, off-beats, alternate 16ths, with the backbeat, 3+3+2), repeated every bar |
| Ghosts surround the backbeat, much softer | [D] | Ghost figures around true backbeats with figure-dependent dynamics (jungle ghost proximity 0.69 → 0.75 vs random 0.42) |
| Double kicks (Amen), paired kicks (Funky Drummer) | [D] | Kick-pair preference in generate-and-test; "double kick" variation op |
| Variation late in the phrase; turnaround at the end | [D] Amen | Kept; extended hierarchically to 1–8 bars, answers repeated, half-way fill related to the final turnaround |
| Changing weights over a phrase gives audible structure | [D] Collins | Chops keep early blocks and move later ones; rolls at phrase end |
| Resequencing two source measures into a new one | [D] Hockman & Davies | CHOP draws from the groove and the answer |
| Hardcore: breaks over four-on-the-floor | [D] Reynolds via Wikipedia | HARDCORE floor-kick layer |
| Hip-hop: quantise + swing, exact loops | [D] Linn; [I] | BOOM BAP: programmed dynamics, low humanise, swing 59 %, exact loops below VARIATION 50 % |

---

## 7. Recipes: design rationale

All numbers are [H]. "Mechanism" means a structural difference in the generator, not only a
different probability.

| Recipe | Tempo | Mechanisms | Grounding |
|---|---|---|---|
| FUNK | 84–118 | Sixteenth hats, ghost figures, kick pairs, light swing, laid-back beat 2 | [D] §2, §3 |
| HIP-HOP | 76–100 | Space, strong accents, more swing and lay-back; drop-out fills | [I] looped-break practice §1.3 |
| JUNGLE | 150–180 | Groove + answer, then **chopped** development bar (A A2 B T in four bars) and chop/roll turnarounds; fewer extra snares in the groove; tight feel | [D] §4 Hockman, Collins; tempo [D] secondary |
| BROKEN | 110–140 | Displaced backbeats, odd groupings, 3+3+2 hat accents | Our own label [H] |
| BOOM BAP | 84–98 | Programmed: velocities from roles, exact loop repetition, 59 % swing, low humanise, doubled kicks, drop-out turnarounds | [D] Linn; [I] §1.3 |
| HARDCORE | 130–150 | Four-on-the-floor kick layered under a funk-like break; off-beat open hats; chop and roll turnarounds | [D] Reynolds via Wikipedia; tempo [H] (the article gives 145–155 for the 2000s revival) |
| D&B | 168–178 | Fixed two-step skeleton (kick on 1 and the "and" of 3, snare 2 and 4), tight, near-straight, sparse ghosts | Tempo [D] secondary; the two-step skeleton is widely taught practice we could not source reliably [H] |
| HALF-TIME | 140–176 | One backbeat, on 3; kicks answer it in the back half; hats keep the fast grid | [D] practical guides (Soundbrenner, Mixgraph), weak |
| GARAGE | 128–138 | Kicks skip beats 2 and 4; snares 2 and 4; heavy shuffle (64 %); off-beat accent cycle; off-beat percussion; programmed loop | [D] Wikipedia "2-step garage" citing Reynolds (*The Wire*); swing amount [H] |
| ELECTRO | 108–132 | A machine: no ghosts, no swing, no microtiming; straight sixteenths with an accent cycle; syncopated kicks; off-beat percussion | [D] *Planet Rock*'s 808 programmed to imitate Kraftwerk's *Numbers* (Red Bull Music Academy, SOS via search); patterns [H] |
| BREAKCORE | 160–220 | Chops in answer, development and turnaround bars; warp stutters (accelerating) anywhere | [D] Collins' Warp cutter; *Think* in breakcore (Wikipedia) |

Considered and not added: **DISCO** (a four-on-the-floor dance pattern rather than a breakbeat
tradition; may be added later), **TRIP-HOP** (no reliable rhythmic source found; close to HIP-HOP and
HALF-TIME), **OLD SCHOOL JUNGLE** (the documented distinction we could find is about breaks, samples
and production, not rhythm we can model; JUNGLE's chops cover the rhythmic side), **BIG BEAT /
BREAKS** (not researched, §1.5).

---

## 8. Proposed further improvements

1. **Listening test first** (EVALUATION.md §4): tune the hypotheses that fail.
2. **Audio slicing engine (OVERBAKE)**: slices with tails, pitch per slice, time-stretch, reverse,
   resampling (§4.2). The event model already knows every hit's time and role.
3. **Edit-distance similarity** (§5) to measure MUTATE's "relatedness" and to offer a "how far"
   control.
4. **Statistics from the Groove MIDI Dataset** (CC BY 4.0) to calibrate per-step hit, velocity and
   timing tendencies per style, kept as small tables (no neural network).
5. **Breeding** two favourites (layer seeds + recipe interpolation + bar-wise crossover).
6. **TOM category** to broaden fills.

---

## 9. Limitations and uncertainties

* No audio analysis and no listening by the author. Descriptions of breaks are second-hand.
* Most empirical papers read as abstracts or summaries (§10). Frane 2017, the most relevant, was
  read only through its abstract and summaries; its per-break values were not available.
* Several facts come only from search-engine summaries of pages (marked *via search*); these are
  the weakest sources here.
* Genre characteristics come mainly from Wikipedia (citing Reynolds and others) and production
  guides, not musicological analysis. D&B's two-step and ELECTRO's patterns are our hypotheses.
* Reliable transcriptions were not available for most of the named breaks (§2.1).
* All recipe numbers, figure weights, timing scales and the phrase plans are design hypotheses.

---

## 10. References

Links checked in October 2026. **Read** says how much was read.

**History and breaks**

* "DJ Kool Herc", Wikipedia; Rolling Stone, "Kool Herc and the History (and Mystery) of Hip-Hop's First Day". Read: summary via search. <https://en.wikipedia.org/wiki/DJ_Kool_Herc>, <https://www.rollingstone.com/music/music-features/kool-herc-hip-hop-50-august-11-1973-1234802035/>
* "Amen break", Wikipedia (citing *The Economist*, 17 Dec 2011). Read: article. <https://en.wikipedia.org/wiki/Amen_break>
* Max Sedgley, "The Winstons – Amen, Brother" lesson, MusicGurus. Read: partial transcript. <https://www.musicgurus.com/fr/courses/iconic-drum-breaks-vol-1/lessons/learn-drums-the-winstons-amen-brother>
* Roland Articles, "Behind the Beat: Funky Drummer". Read: article. <https://articles.roland.com/behind-the-beat-funky-drummer-by-james-brown/>
* Aeon, "What drum machines can teach us about artificial intelligence". Read: partly. <https://aeon.co/essays/what-drum-machines-can-teach-us-about-artificial-intelligence>
* The Current, "Pride and pain: The story of the Funky Drummer" (2020). Read: partly. <https://www.thecurrent.org/feature/2020/02/11/pride-and-pain-the-story-of-the-funky-drummer>
* Ethan Hein, "The natural history of the Funky Drummer break"; "Ashley's Roachclip"; "Impeach the President". Read: articles (via summary). <https://ethanhein.substack.com/p/the-natural-history-of-the-funky-drummer-break>, <https://ethanhein.substack.com/p/ashleys-roachclip>, <https://ethanhein.com/wp/2010/impeach-the-president>
* Soundfly, "A Compendium of History's Most Famous Hip-Hop Rhythms". Read: summary via search (page refused direct access). <https://flypaper.soundfly.com/produce/a-compendium-of-historys-most-famous-hip-hop-rhythms/>
* Stereogum, "Breaks With Tradition" columns on *Impeach the President* and *Apache*. Read: summary via search. <https://stereogum.com/2012848/impeach-the-president-samples/columns/breaks-with-tradition>, <https://stereogum.com/2025842/apache-the-samples/columns/breaks-with-tradition>
* "Think break", Wikipedia; Attack Magazine, "The 2nd most sampled track in history"; Splice, "Lyn Collins' Think (About It)". Read: summary via search. <https://en.wikipedia.org/wiki/Think_break>, <https://www.attackmagazine.com/features/long-read/the-2nd-most-sampled-track-in-history/>
* "Synthetic Substitution", "Ashley's Roachclip", "Machine Gun (Commodores album)", Wikipedia. Read: summary via search.
* "Breakbeat hardcore", Wikipedia (citing Reynolds, *Energy Flash*). Read: article. <https://en.wikipedia.org/wiki/Breakbeat_hardcore>
* "Jungle music", Wikipedia (citing Butler 2006; Reynolds 2008). Read: article. <https://en.wikipedia.org/wiki/Jungle_music>
* "2-step garage", Wikipedia (citing Reynolds, *The Wire* 182). Read: article. <https://en.wikipedia.org/wiki/2-step_garage>
* Red Bull Music Academy, "Key Tracks: Arthur Baker on Planet Rock"; Sound on Sound, "Classic Tracks: Planet Rock". Read: summary via search.
* Soundbrenner, "Half time feel"; Mixgraph, "Half-Time & Double-Time". Read: summary via search.
* Butler, M. J. (2006). *Unlocking the Groove*. Indiana UP. **Not read** (catalogue and a chapter summary only).

**Swing, groove and microtiming**

* Frane, A. V. (2017). Swing rhythm in classic drum breaks from hip-hop's breakbeat canon. *Music Perception* 34(3), 291–302. doi:10.1525/mp.2017.34.3.291. Read: abstract and summaries.
* Roger Linn interview, Attack Magazine, "Roger Linn on swing, groove and the magic of the MPC's timing". Read: page summary. <https://attackmagazine.com/features/interview/roger-linn-swing-groove-magic-mpc-timing/2>
* Attack Magazine, "Swing in DAWs and drum machines". Read: partly. <https://attackmagazine.com/technique/passing-notes/daw-drum-machine-swing/2>
* Räsänen, E., et al. (2015). Fluctuations of hi-hat timing and dynamics in a virtuoso drum track. *PLoS ONE* 10(6). Read: full text. <https://pmc.ncbi.nlm.nih.gov/articles/PMC4454559/>
* Hennig, H., et al. (2011). The nature and perception of fluctuations in human musical rhythms. *PLoS ONE* 6(10). Read: abstract. <https://pmc.ncbi.nlm.nih.gov/articles/PMC3202537>
* Hellmer, K., Kahl, Madison, G., & Guy (2015). Quantifying microtiming patterning and variability in drum kit recordings. *Music Perception*. Read: abstract. <https://labs.sonicfield.org/library/quantifying-microtiming-patterning-and-variability-in-drum-kit-recordings>
* Davies, M., et al. (2013). Microtiming deviations and groove. *Music Perception* 30(5). Read: abstract. <https://repositorio.inesctec.pt/handle/123456789/3901>
* Frühauf, J., Kopiez, R., & Platz, F. (2013). Music on the timing grid. *Musicae Scientiae* 17(2). Read: abstract. <https://doi.org/10.1177/1029864913486793>
* Senn, O., et al. (2016). Expert performance microtiming and groove. *Frontiers in Psychology* 7:1487. Read: most of full text. <https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2016.01487/full>
* Danielsen, A., Waadeland, C. H., Sundt, H. G., & Witek, M. A. G. (2015). Effects of instructed timing and tempo on snare drum sound. *JASA* 138(4). Read: abstract. <https://ntnuopen.ntnu.no/ntnu-xmlui/handle/11250/2461796>
* Câmara, G. S., Nymoen, K., Lartillot, O., & Danielsen, A. (2020). Effects of instructed timing on drum kit performance. *Music Perception* 38(1). Read: abstract. <https://duo.uio.no/handle/10852/79965>

**Syncopation, similarity and generation**

* Witek, M. A. G., et al. (2014). Syncopation, body-movement and pleasure in groove music. *PLoS ONE* 9(4). Read: abstract. <https://ideas.repec.org/a/plo/pone00/0094446.html>
* Smith, L. M., & Honing, H. (2006). Computational models of rhythmic syncopation. *ICMC*. Read: abstract.
* Longuet-Higgins, H. C., & Lee, C. S. (1984). **Not read** (described secondarily).
* Sioros, G., & Guedes, C. (2014). Syncopation as transformation. Read: abstracts.
* Toussaint, G. (2005). The Euclidean algorithm generates traditional musical rhythms. Read: summary.
* Post, O., & Toussaint, G. (2011/2012). The edit distance as a measure of perceived rhythmic similarity. *Empirical Musicology Review* 6(3). Read: abstract. <https://doaj.org/article/02173439e1c24e4cb83f2e9d3be90081>
* Gómez-Marín, D., Jordà, S., & Herrera, P. (2020). Drum rhythm spaces: from polyphonic similarity to generative maps. *JNMR* 49(5). Read: abstract. <https://repositori.upf.edu/handle/10230/46029>
* Kippen, J., & Bel, B. (1992). Bol Processor grammars. In *Understanding Music with AI*. Read: abstracts and project pages. <https://bolprocessor.org/bol-processor-grammars/>
* Gillick, J., et al. (2019). Learning to groove with inverse sequence transformations. *ICML*; Groove MIDI Dataset. Read: abstract, dataset page. <https://arxiv.org/abs/1905.06118>
* Vogl, R., & Knees, P. (2017). An intelligent drum machine for EDM. *NIME*. Read: abstract.
* Kaliakatsos-Papakostas, M., et al. (2012). Interactive evolution (user fatigue). Read: abstract.

**Breakbeat manipulation**

* Hockman, J. A., & Davies, M. E. P. (2015). Computational strategies for breakbeat classification and resequencing in hardcore, jungle and drum & bass. *DAFx-15*. Read: **full text**. <https://www.open-access.bcu.ac.uk/3270>
* Collins, N. (2001). Further automatic breakbeat cutting methods. *Generative Art 2001*. Read: **full text**. <https://www.generativeart.com/on/cic/ga2001_PDF/collins.pdf>
* Collins, N. (2001). Algorithmic composition methods for breakbeat science. *Music Without Walls*. **Not read** (cited by the above).
* eMastered, "How to make jungle music" (production guide). Read: partly.
