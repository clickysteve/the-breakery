# Phase 13 research notes: rhythmic intelligence

What the rhythmic vocabulary (GROOVE revision 3), HI-HAT and RIDE ACTIVITY, the TEMPO PROFILES
and WILDCARD are based on. Each section separates three things:

* **Verified research**: what a cited source reports, as far as its abstract or a published
  summary of it says.
* **Musical interpretation**: what we take from it for a drum generator. This is our reading,
  not the source's claim.
* **Implementation design**: what the code does. These are decisions, most of them hand-set,
  and none of them has been validated by listening.

## How these sources were consulted

Read this before relying on anything below.

* Web searches were made on 19 October 2026, during this phase. Each one returned a list of
  links and a short summary of what they said. That summary is everything this document
  reports from them.
* Opening the pages themselves (WebFetch) failed with DNS errors for every host tried:
  repository.uwl.ac.uk, ethanhein.substack.com, ableton.com and en.wikipedia.org. **No full
  text was read** for this phase, so no source here was checked beyond its search summary.
* Where a search found nothing, or only practitioner tutorials, this document says so. A claim
  backed only by a tutorial or a fan wiki is marked as a practitioner convention, not research.
* Nothing was auditioned. The numbers in [diversity-report.md](diversity-report.md) and
  [evaluation-report.md](evaluation-report.md) are measured from generated events. They show
  variety and structure, not whether anything grooves.
* The sources from Phases 1 to 12 ([BREAKBEAT_RESEARCH.md](BREAKBEAT_RESEARCH.md),
  [EXPRESSIVE_RESEARCH.md](EXPRESSIVE_RESEARCH.md)) still apply. Their notes on how much of each
  source was read still hold.

## 0. Why the breaks repeated (the audit)

**Measured** (scripts/evaluate-diversity.test.ts, [diversity-baseline.md](diversity-baseline.md),
200 seeds per recipe, revision 2):

* Only 2% to 11% of seeds had a distinct bar-1 hat pattern in every recipe except BROKEN, which
  had 72%. For HIP-HOP the figure was 4%.
* Cymbal nearest-neighbour similarity was 0.98 to 1.00 in every recipe except BROKEN, so almost
  every break had an identical twin in its cymbals.
* Each recipe used only one to three of the eight timekeeping classes. FUNK, HARDCORE,
  HALF-TIME, GARAGE, ELECTRO and BREAKCORE used one class in 100% of seeds.

**Causes found in the code** (revision 2):

1. **Fixed timekeeper.** support.ts played every eighth on the timekeeper, switching to
   sixteenths only above a DENSITY threshold. HIP-HOP's default density sat below it, so a new
   seed could only change velocities and open-hat lifts.
2. **One strategy per recipe.** Every seed used the same kick weight table, snares on 2 and 4
   and the same phrase plan. A new seed moved a few kicks and nothing else (HIP-HOP: 11% distinct
   kick and snare in bar 1).
3. **One phrase plan.** A recipe always got the same bar roles (for example A A2 A T), so every
   phrase had the same shape. Phrase form entropy was under 1.2 bits for every recipe, and 0.00
   for BREAKCORE.
4. **Generate-and-test always kept the best candidate.** foundation.ts drew candidates and
   kept the one nearest the target syncopation, which collapsed the seeds onto a few winners.
5. **Ride as a second hat.** The ride replaced the hats with the same eighths, so it added
   timbre but no new rhythm.

## 1. Groove, syncopation and repetition (all recipes)

**Verified research**

* Witek et al. (2014), "Syncopation, Body-Movement and Pleasure in Groove Music", *PLoS ONE*
  ([PMC3989225](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3989225/)). Participants rated
  funk drum breaks with different amounts of syncopation. Moderate syncopation gave the
  strongest wish to move and the most pleasure: an inverted U. A correction was issued in 2015
  (doi 10.1371/journal.pone.0139409), and it was not checked.
* Senn, Kilchenmann, Bechtold and Hoesl (2018), "Groove in drum patterns as a function of both
  rhythmic properties and listeners' attitudes", *PLoS ONE*, doi 10.1371/journal.pone.0199604
  ([PMC6025871](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6025871/)). The patterns were
  eight-bar drum parts from 248 popular tracks, rebuilt from samples and rated 8,329 times by
  665 participants.
  * Syncopation and event density were positively associated with groove ratings, with small
    effects (R² about 0.01 each).
  * Beat salience, residual microtiming and rhythmic variability showed no effect.
  * Listeners' style bias had the largest effect (R² 0.123).
  * The search summary adds that a 2024 *PLoS ONE* study from the same group found no
    significant effect of complexity on the urge to move.
* Pressing (2002), "Black Atlantic Rhythm: Its Computational and Transcultural Foundations",
  *Music Perception* 19(3). The summary says devices such as syncopation, polyrhythm and
  hocketing rest on "perceptual multiplicity or rivalry", which shapes expectation. It also
  says this music overwhelmingly favours equal pulses.
* Garcia (2005), "On and On: Repetition as Process and Pleasure in Electronic Dance Music",
  *Music Theory Online* 11(4)
  ([mtosmt.org](https://mtosmt.org/issues/mto.05.11.4/mto.05.11.4.garcia.php)). It argues that
  repetition in dance music gives pleasure as a process ("process pleasure"), rather than being
  a defect.
* Butler (2006), *Unlocking the Groove: Rhythm, Meter, and Musical Design in Electronic Dance
  Music*, Indiana University Press ([WorldCat](https://search.worldcat.org/title/61162077)).
  The contents list chapters on ambiguity, metrical dissonance and multimeasure patterning.
  Butler's *MTO* essay on dance-music rhythm
  ([mto.01.7.6](https://www.mtosmt.org/issues/mto.01.7.6/mto.01.7.6.butler_essay.html)) says
  its second half covers asymmetrical patterns. The search did **not** confirm that either one
  discusses 3+3+2 or breakbeats in particular.

**Musical interpretation**

* Variety for its own sake is not the goal. Moderate syncopation, a related phrase and some
  repetition are what the studies associate with groove, and the effects are small.
* Style bias matters more than any one rhythmic property. So each recipe should keep its own
  vocabulary, and a new seed should give a different groove within the recipe, not a random
  one.
* Repetition is a feature: a loop recipe at low VARIATION should repeat exactly.
* "Rivalry" between layers (Pressing) suggests that the hats should relate to the kick and
  snare, not run as an independent grid.

**Implementation design**

* Every break chooses a **groove approach** from its recipe's weighted list (approaches.ts,
  styles.ts `VOCAB[style].grooves`). The approaches are kick and snare strategies such as
  backbeat, sparse, pushed, lopsided, half-time, break-derived, two-step, rolling, linear,
  ghost-led, syncopated, four-to-the-floor, skip, fragments and shuffle.
  * The approach changes the recipe's foundation strategy, and the existing generate-and-test
    rules still apply on top of it.
  * The controls lean the weights but never decide alone.
* foundation.ts now keeps a random candidate from those within 0.8 of the best syncopation
  score, with a jittered target, instead of always the single best. This keeps the
  syncopation near its target (moderate, per Witek) without collapsing every seed onto it.
* A **phrase form** is chosen per break (A A2 A T, A A A2 T, A A2 B T, A A A T, A B A T,
  A A2 A2 T and longer forms). Every form ends in the turnaround T.
  * Contrasting forms (B bars) need VARIATION, and are favoured more by the chop recipes.
  * At VARIATION 0 the answer bars repeat the groove bar exactly.
* A **motif development** is chosen per break for the answer bars: echo, displace (by a
  sixteenth), truncate, extend or vary. Like the forms, it is gated by VARIATION.

## 2. Hi-hats and ride: a vocabulary, not a density (all recipes)

**Verified research**

* **Boom bap / hip-hop hats.** No musicological study of boom bap hi-hats was found.
  * Practitioner tutorials say hats are commonly eighths, often swung, filling the gaps between
    kick and snare ([Wikipedia: Boom bap](https://en.wikipedia.org/wiki/Boom_bap);
    [Native Instruments](https://blog.native-instruments.com/what-is-boom-bap/)). These are
    conventions, not studies.
  * Exarchos's chapter "Boom Bap ex Machina: hip-hop aesthetics and the Akai MPC"
    ([UWL repository](https://repository.uwl.ac.uk/id/eprint/5150/)) links boom bap's traits
    to the MPC's sampling and sequencing. Its text could not be opened.
* **Dilla.** Summaries of Charnas, *Dilla Time* (2022), via
  [Ethan Hein](https://ethanhein.substack.com/p/dilla-time) and
  [DJ Mag](https://djmag.com/features/d-dilla-life-and-legacy-of-hip-hop-phenomenon), describe
  straight and swung feels coexisting, with hats suggesting straight time while kicks lean
  late. DJ Mag attributes this to the MPC's per-element swing. That is a commentator's account,
  not Charnas's own wording.
* **Linear funk.** Linear drumming is described as no two limbs playing together
  ([MasterClass](https://www.masterclass.com/articles/linear-drumming-basics)), and David
  Garibaldi used linear beats on "Oakland Stroke" and "Soul Vaccination". A Rockschool lesson
  on "What Is Hip?"
  ([musicgurus](https://www.musicgurus.com/courses/rockschool-drums-online-tutorial-grade-7/lessons/learn-tower-power-what-is-hip-rockschool-drums-grade-7))
  describes a broken sixteenth hi-hat over a combined kick and snare part. So "never together"
  is the textbook definition, not a strict rule of Garibaldi's playing.
* **Purdie shuffle.** Teaching sources describe a ghost-note half-time shuffle, counted in
  eighth-note triplets, with the hat or ride carrying the shuffle
  ([Soundbrenner](https://www.soundbrenner.com/blogs/articles/purdie-shuffle);
  [Tom Tom Magazine](https://tomtommag.com/2011/10/the-purdie-shuffle-part-one)). The search did
  not confirm anything about particular recordings.
* **Trap hats.** Shawty Redd is credited with adding busy hi-hats "to make it bounce" in the
  early 2000s
  ([Complex](https://www.complex.com/music/a/shawn-setaro/heres-who-really-invented-trap-music);
  [Berklee Online](https://online.berklee.edu/takenote/trap-music-where-it-came-from-and-where-its-going/)).
  Sound on Sound describes trap hats as double- or triple-time
  ([Zaytoven](https://www.soundonsound.com/people/zaytoven)). No source described how rolls
  are programmed.
* **Garage hats.** Tutorials describe sixteenth hats played late for the shuffle
  ([Native Instruments](https://blog.native-instruments.com/uk-garage-music/)). This is a
  practitioner convention.

**Musical interpretation**

* Timekeeping is a choice among distinct figures: quarters, off-beats, broken eighths, 3+3+2
  groupings, eighths, a jazz ride, linear fills, triplets, skipping sixteenths, sixteenths and
  rapid bursts. Each recipe favours some of them.
* Activity should select which figure is played, and a figure should then be placed against
  the kick and snare. Linear placement and pickups into the snare are relationships, not
  densities.
* Two cymbal families sharing the time is a common texture: one keeps time while the other
  punctuates or takes over.

**Implementation design** (cymbals.ts)

* There are thirteen **cymbal approaches**, from NONE to RAPID. Each has an activity it suits,
  from 0.03 for NONE to 0.95 for RAPID. A family's activity weighs them by a Gaussian of width
  0.24 around that point, multiplied by the recipe's vocabulary weight. So 0.2 favours sparse
  accents and quarters, 0.6 eighths and broken eighths, and 0.9 sixteenths and bursts, and
  every value still reaches several approaches.
* **HI-HAT ACTIVITY** covers the closed and open hats, and **RIDE ACTIVITY** the ride.
  * Each recipe has its own defaults (styles.ts `VOCAB`), and `rideLean` sets how readily the
    ride keeps the time.
  * 0 removes that family entirely, after every later layer (personality, BREAK DNA, rolls,
    CHOP) has had its turn.
  * Personality additions to the cymbals scale with the activity.
* **RELATIONSHIP** (CYMBAL_MODES):
  * ALTERNATE (default): the second family rests, punctuates the gaps, or takes over for some
    bars. How often it takes over is weighted by VARIATION. Loop recipes hand over only in the
    turnaround or fill.
  * LAYER: both families play, the second one sparser.
  * INDEPENDENT: each family plays its own approach.
* **Development** through the phrase: hold, answer, build, thin or switch, weighted by
  VARIATION. Loop recipes never answer or switch.
* A fill that takes the hands (a run, stutter, roll or drop) silences the cymbals for its
  length.
* RAPID only appears with ROLL GENERATION on.
* Shuffle grooves move the kick, ghosts, percussion and extra snares onto the triplet grid
  (generate.ts `onTriplets`) and are not swung a second time (performance.ts).

## 3. The recipes

### FUNK

* **Verified:** the Garibaldi and linear sources (section 2). Witek's study used funk drum
  breaks (section 1).
* **Interpretation:** a wide vocabulary of sixteenths, eighths, linear and broken hats, with
  ghost-led and break-derived grooves.
* **Design:**
  * Grooves: backbeat, break-derived, ghost-led and syncopated, with linear, pushed and shuffle
    less often.
  * Hats: mostly sixteenths and eighths, with linear and broken figures. Default activity is
    0.75 for the hats and 0.2 for the ride.
  * Tempo 86–124 BPM, centred on 100.

### HIP-HOP and BOOM BAP

* **Verified:**
  * The boom bap, Exarchos and Dilla summaries (section 2).
  * Berklee's excerpt from Prince Charles Alexander's *Hip-Hop Production: Inside the Beats*
    ([Berklee](https://college.berklee.edu/node/2512271)): old-school East Coast at 100–120 BPM,
    early West Coast starting at 90–100 BPM and widening to 90–120, and Southern double time
    readable as 80 or 160.
  * Boom bap's peak was the late 1980s and early 1990s on the East Coast
    ([Wikipedia](https://en.wikipedia.org/wiki/Boom_bap)). A production blog puts most boom bap
    at 85–95 BPM, which is a practitioner figure.
* **Interpretation:** HIP-HOP should range from sparse quarter-note hats to swung eighths,
  triplet shuffles and (with rolls on) trap-style bursts. BOOM BAP is narrower: mostly eighths,
  with a hard backbeat.
* **Design:**
  * HIP-HOP grooves: backbeat, sparse, pushed, lopsided, break-derived and shuffle, with minimal,
    half-time and fragments less often. Its hat vocabulary includes eighths, broken, quarters,
    triplets, sparse accents and rapid bursts. Default activity is 0.5 for the hats and 0.25 for
    the ride.
  * BOOM BAP: backbeat-led, with eighth hats at weight 3.5.
  * Tempos: HIP-HOP 74–110 BPM (centre 90), BOOM BAP 80–104 BPM (centre 92). These are design
    choices that fit the sources above, which give ranges, not distributions.

### JUNGLE

* **Verified:**
  * Jungle took breakbeats and sped them to 160–170 BPM, with a half-speed bassline often from
    reggae ([Wikipedia: Jungle music](https://en.wikipedia.org/wiki/Jungle_music)).
  * Ragga and atmospheric jungle differed mainly in vocals and mood
    ([A Bass Chronicle](https://abasschronicle.co.uk/history-sessions-a-mutual-separation/)).
  * Drumfunk (Paradox, Seba) is described as "elaborate breakbeat chopping" with "constantly
    shifting patterns"
    ([The Vinyl Factory](https://thevinylfactory.com/features/dnb-drumfunk-mix-late-90s-00s-laurence-guy)).
    The Paradox interview at Ableton could not be opened.
* **Interpretation:** break-derived grooves with chopping, and the ride as a frequent
  timekeeper.
* **Design:**
  * Grooves: break-derived (weight 2.5), rolling and two-step.
  * `rideLean` is 0.9, with ride quarters and off-beats in the vocabulary.
  * Tempo 155–176 BPM, centred on 165.

### D&B and HALF-TIME

* **Verified:**
  * A history credits Alex Reece's "Pulp Fiction" (1995) with the steady two-kick pattern
    ([12edit](https://12edit.com/techstep)).
  * Techstep uses two-step kicks and snares with quantised drum-machine sounds
    ([Wikipedia: Techstep](https://EN.wikipedia.com/wiki/Techstep)).
  * Tempo sources give roughly 160–180 BPM, with tempos drifting up to about 170 by the
    mid-1990s ([EDMProd](https://www.edmprod.com/what-is-drum-and-bass/)). No year-by-year data
    was found.
  * Liquid keeps D&B's bar layouts with smoother breaks at 160–180 BPM
    ([Wikipedia: Liquid funk](https://Www.wikipedia.org/wiki/Liquid_DnB)).
  * Purdie's half-time shuffle puts the backbeat on 3 (section 2).
* **Interpretation:** D&B centres on the two-step, with rolling breaks as the main alternative.
  The ride and off-beat hats are common. HALF-TIME is the same tempo with a backbeat on 3.
* **Design:**
  * D&B grooves: two-step (2.5), rolling (1.5), break-derived and skip. The two-step appears in
    86.5% of D&B breaks, measured over seeds in test/features.test.ts.
  * D&B `rideLean` is 1. HALF-TIME's hats include triplets and rapid bursts.
  * Tempos: D&B 160–182 BPM (centre 174), HALF-TIME 140–176 BPM (centre 170).

### HARDCORE

* **Verified:** breakbeat hardcore typically ran at about 145–155 BPM, with sources ranging from
  130 to past 150, and the reggae-influenced strand at 150–170
  ([Wikipedia: Breakbeat hardcore](https://en.wikipedia.org/wiki/Breakbeat_hardcore)). The
  scene fragmented in late 1992.
* **Interpretation:** break-derived grooves over a floor kick, with off-beat hats from rave.
* **Design:**
  * Grooves: break-derived and four-to-the-floor. Hats: off-beats and sixteenths.
  * Tempo 132–168 BPM, centred on 145.

### GARAGE

* **Verified:** practitioner sources describe syncopated kicks that skip a beat, the snare on 2
  and 4, sixteenth hats played late, and tempos around 130–132
  ([Wikipedia: 2-step garage](https://en.wikipedia.org/wiki/2-step_garage);
  [Native Instruments](https://blog.native-instruments.com/uk-garage-music/)). Butler's book was
  not found to discuss garage.
* **Interpretation:** skipping sixteenths and triplet shuffles on the hats, with the ride rare.
* **Design:**
  * Grooves: skip (2.5), two-step and shuffle. Hats: skipping sixteenths (3), off-beats,
    sixteenths and triplets.
  * `rideLean` is 0.1.
  * Tempo 126–140 BPM, centred on 132.

### ELECTRO

* **Verified:**
  * Classic electro patterns are described as electronic emulations of breakbeats with a
    syncopated kick and a snare or clap on the backbeat (Wikipedia, via search summary).
  * Arthur Baker says "Planet Rock" chose the TR-808 to emulate Kraftwerk
    ([Red Bull Music Academy](https://daily.redbullmusicacademy.com/2013/04/key-tracks-arthur-baker-on-planet-rock);
    [Sound on Sound](https://www.soundonsound.com/techniques/classic-tracks-afrika-bambaataa-soulsonic-force-planet-rock)).
  * The only tempo data found was a third-party catalogue of Egyptian Lover tracks: 123–138 BPM,
    median 128 ([Mixgraph](https://www.mixgraph.io/artists/the-egyptian-lover)). No source
    for a general electro range was found.
* **Interpretation:** machine-tight, syncopated kicks, sixteenth hats and almost no ride.
* **Design:**
  * Grooves: backbeat and syncopated, with linear and fragments. Hats: sixteenths (3), eighths,
    off-beats and 3+3+2.
  * No jazz ride, and `rideLean` is 0.1.
  * Tempo 108–135 BPM, centred on 120. This range is a design choice: the sources found do not
    establish it.

### BROKEN

* **Verified:** broken beat emerged in late-1990s West London (Bugz in the Attic, IG Culture,
  4hero) ([Wikipedia: Broken beat](https://en.wikipedia.org/wiki/Broken_beat)). Sources describe
  syncopated 4/4 with staggered snares and claps, and a snare just before the fourth beat
  ([Linenoise](https://linenoise.substack.com/p/broken-beat-bugz-out-the-long-trail)). These
  are music press and a fan wiki. No kick-pattern breakdown was found.
* **Interpretation:** fragmented, displaced backbeats, with 3+3+2 and broken hats.
* **Design:**
  * Grooves: fragments (2), syncopated, lopsided and pushed. Hats: broken (2), 3+3+2 (2) and
    linear.
  * Tempo 110–138 BPM, centred on 126. This is a design choice: no tempo source was found.

### BREAKCORE

* **Verified:** breakcore is often built on manipulating the Amen and other breaks at high BPM,
  by cutting and rearranging them, or by distorting and looping them
  ([Wikipedia: Breakcore](https://en.wikipedia.org/wiki/Breakcore)). Venetian Snares is cited
  for complex, polyrhythmic programming and unusual meters such as 7/4. Alec Empire's *The
  Destroyer* (1996) is often credited as the first breakcore album.
* **Interpretation:** the widest vocabulary, with rapid bursts and frequent changes.
* **Design:**
  * Grooves: break-derived, fragments, syncopated and rolling. Hats: sixteenths, rapid bursts
    and broken figures.
  * Tempo 150–220 BPM, centred on 190.
  * Unusual meters are not implemented, because the sequencer is 4/4 (see Limitations).

## 4. Tempo profiles

**Verified research:** the ranges cited per recipe in section 3. The sources give ranges and
typical tempos only, not distributions, and several rest on practitioner sources or a single
catalogue.

**Implementation design** (tempo.ts):

* Each recipe has a minimum, maximum and centre (`TEMPO_PROFILES`). A tempo is drawn from a
  triangular distribution between the limits, peaked at the centre, in whole BPM. The shape is
  a design choice.
* Choosing a recipe, RANDOM RECIPE and WILDCARD draw a tempo from the profile, seeded by the
  break's BEAT seed, so the same recipe and seed give the same tempo.
* The tempo DICE draws a new tempo for the same break. BAKE never changes the tempo.
* TEMPO LOCK keeps the tempo through all of these. The BPM box always sets the tempo, locked
  or not.
* With the internal clock, a new tempo takes effect at the switch point (player.ts), keeping
  the position in beats. An external MIDI clock sets the playing tempo, so the lock never
  fights it.

## 5. WILDCARD

No research source covers this. It is a design built on the sections above (wildcard.ts):

* The generation controls scatter around the **new recipe's** defaults (standard deviation
  0.15, or 0.08 for swing and humanise), so a WILDCARD HIP-HOP is still a HIP-HOP.
* The tempo comes from the recipe's profile.
* Treatments are only chosen sometimes:
  * a personality 55% of the time, at 35–90% intensity
  * BREAK DNA 40% of the time
  * CHOP 60% of the time on the chop recipes, 30% on the others
  * DESTROY 20% of the time, at 15–45%
* FREEZE, TEMPO LOCK and ROLL GENERATION are respected.
* SAMPLE ASSIGNMENTS only draws a new KIT seed: nothing is downloaded or deleted.
* The mixer category moves levels within 60–100% and gives gentle pans to the high voices only.
  Solo and mute are never touched.
* Output effects choose one of the output chain's existing presets, through its public API.

## What is not yet known

* **Whether any of it grooves.** Nothing was auditioned, and the research effects are small
  (Senn 2018).
* **Whether the vocabularies are right.** The per-recipe weights and activity peaks are
  hand-set from the sources above. Several recipes (electro, broken beat, garage) rest mainly on
  practitioner or press sources.
* **The full texts.** Exarchos, Charnas, Butler and the Paradox interview were known only from
  summaries. Their exact claims should be checked before anyone relies on the details.
* **Unusual meters and tempo changes within a pattern** (breakcore's 7/4, for example) are
  outside the 4/4 sequencer.
