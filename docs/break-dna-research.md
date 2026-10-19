# BREAK DNA, cymbals and DESTROY: research and design (Phase 14)

This document records what informed the eight BREAK DNA grammars (`src/engine/dnaGrammar.ts`),
the per-recipe cymbal defaults (`src/engine/cymbals4.ts` `CYM_DEFAULTS`) and DESTROY
(`src/engine/destroy2.ts`). Measured event data: [phase14-report.md](phase14-report.md).

## How the research was done, and its limits

* **Sources were seen only as WebSearch summaries.** Fetching pages directly (WebFetch) failed
  in this environment, so every source below was read as a search engine's summary of the page,
  not the page itself. Notated transcriptions on those pages (often images) were not seen.
* **No recording was listened to.** None of the recordings named here was accessible, and no
  drum-break audio was downloaded, bundled or redistributed. Nothing in this document claims a
  listening impression.
* Each section separates **what the sources said** (as summarised) from **existing knowledge**
  (general, widely repeated knowledge of these breaks and styles that was not verified against a
  source here) and from **design choices** (what The Breakery does, which is an interpretation).
* A DNA is a generative **grammar**: per-beat kick cells, a backbeat, ghost and percussion
  figures, a phrase unit and its development operations, and leans for the cymbals and CHOP. It
  never reproduces a recording's pattern note for note; a seed picks one of many combinations.
* The weights, thresholds and probabilities are hand-set design choices, not fitted to data.

## AMEN

Informed by The Winstons, "Amen, Brother" (1969), drums Gregory C. Coleman.

**Sources (summaries):**
* [Ethan Hein, "Amen break listening guide"](https://www.ethanhein.com/wp/2025/amen-break-listening-guide/):
  the second backbeat is delayed in bars three and four, the first kick of bar four is omitted, a
  snare lands on a weak sixteenth, a crash on a weak eighth.
* [MusicRadar, "How to program an Amen-style break"](https://musicradar.com/tuition/tech/how-to-program-an-amen-style-break-637374):
  about 137 BPM, bars one and two a fairly standard funk pattern, the ride on steady eighths.
* [Wikipedia, "Amen break"](https://en.wikipedia.org/wiki/Amen_break): a four-bar break about
  seven seconds long. Sources disagree on who directed it, and transcriptions differ on exactly
  where the displaced snare falls.

**Existing knowledge:** the four-bar A A A′ B construction, the kick pair around beat 3.

**Design:** unit A A V B. V delays or pushes the backbeat; B drops the downbeat, adds a run or
syncopated snares; a crash lean on the B bar's weak eighth (step 10). Ride-leaning eighths.
Revision 3 and earlier keep the Phase 12 AMEN (`dna.ts dnaBars`) exactly.

## FUNKY DRUMMER

Informed by James Brown, "Funky Drummer" (recorded 1969, released 1970), drums Clyde
Stubblefield.

**Sources (summaries):**
* [Aeon, "What drum machines can teach us about artificial intelligence"](https://aeon.co/essays/what-drum-machines-can-teach-us-about-artificial-intelligence):
  sixteenths on the hi-hat throughout, the left foot opening it for an occasional offbeat
  accent, the kick and snare "in a conversation", backbeats decorated with ghost notes.
* [Ethan Hein, "The natural history of the Funky Drummer break"](https://ethanhein.substack.com/p/the-natural-history-of-the-funky-drummer-break):
  the bass drum emphasises the first two eighth notes of the bar.
* [Roland Articles, "Behind the beat: Funky Drummer"](https://articles.roland.com/behind-the-beat-funky-drummer-by-james-brown/):
  the commonly sampled two-bar break comes from the reprise on *In the Jungle Groove* (1986).
* [Funkydrummer.com lesson 3](https://www.funkydrummer.com/school-of-funk/lesson-3): a pull-out
  on the "a of 3" and on 4.
* [Modern Drummer, Marc Atkinson transcription](https://www.moderndrummer.com/article/james-brown-the-funky-drummer-clyde-stubblefield-transcription-by-marc-atkinson/):
  exists, but the notation itself was not seen.

**Design:** kick cells favour 1 and the "and" of 1; many ghost candidates (up to five a bar);
unit A V A V (the two-bar feel); development by kick shifts, ghost shifts and pull-outs; the
cymbals lean to sixteenths with open hats on the last "and" (and the "and" of 3 in V bars).

## APACHE

Informed by the Incredible Bongo Band, "Apache" (1973).

**Sources (summaries):**
* [AudioLabs Erlangen, drum separation of "Apache"](https://audiolabs-erlangen.com/resources/MIR/2016-IEEE-TASLP-DrumSeparation/BongoBand):
  the break decomposed into six components, snare with conga and bongos.
* [Stereogum, "Breaks with Tradition: Apache"](https://stereogum.com/?p=2025842): percussionist
  King Errison credited with much of the sound; who played what is disputed.
* No note-level transcription was found.

**Existing knowledge:** a percussion-led break over a plain kick and snare.

**Design:** the DNA's own percussion part ("bongo", the perc track) on the sixteenths, 4 to 8
strokes a bar, bursting in V and turnaround bars; a plain, heavy kick and snare.

## THINK

Informed by Lyn Collins, "Think (About It)" (1972).

**Sources (summaries):**
* [Wikipedia, "Think break"](https://en.wikipedia.org/wiki/Think_break): written and produced by
  James Brown; drums credited to Jabo Starks; a raw drumbeat with tambourine; two distinct
  breaks, the "Yeah! Woo!" one and the drum pattern later used in jungle and drum and bass.
* [Attack Magazine, "The 2nd most sampled track in history"](https://www.attackmagazine.com/features/long-read/the-2nd-most-sampled-track-in-history/):
  the variety of pitch and tone in the drum hits.
* No bar-level transcription was found.

**Design:** kicks pushing into the backbeats, a busy tambourine layer on the "and"s, a
syncopated turnaround (unit A A V T), crash lean at the top.

## IMPEACH

Informed by The Honey Drippers, "Impeach the President" (1973).

**Sources (summaries):**
* [Stereogum, "Breaks with Tradition: Impeach The President"](https://stereogum.com/?p=2012848):
  a tight opening pattern; the hi-hat lift near the end of the pattern is its defining element.
* [Ethan Hein, "Impeach the President"](https://ethanhein.com/wp/2010/impeach-the-president):
  citing WhoSampled, among the most sampled breaks.
* No written transcription was found.

**Design:** a spare two-bar backbone (unit A V A V): kick on 1 and around 3, plain backbeats,
eighth hats, and an open-hat lift on the last "and" of the V bars.

## ROACHCLIP

Informed by The Soul Searchers, "Ashley's Roachclip" (1974).

**Sources (summaries):**
* [Wikipedia, "Ashley's Roachclip"](https://en.wikipedia.org/wiki/Ashley%27s_Roachclip): the
  break at about 3:30 to 3:50, drums Kenneth Scoggins.
* [MusicGurus, Max Sedgley lesson](https://www.musicgurus.com/de/courses/iconic-drum-breaks-vol-1/lessons/learn-drums-chuck-brown-the-soul-searchers-ashley-s-roachclip):
  single strokes on the hi-hat, the tambourine filling the double feel; fills with offbeat hat
  strokes and a round-the-world tom fill ending in a double kick.
* [Ethan Hein, "Ashley's Roachclip"](https://ethanhein.com/wp/2010/ashleys-roachclip): straight
  eighths (the sources disagree on whether it swings).

**Design:** single-stroke eighth hats, a tambourine on the in-between sixteenths, even kick and
snare, a turnaround ending in a double kick (unit A A A T). The DNA never adds toms, so the tom
fill is left to TOM ACTIVITY. Swing is left to the recipe (the sources disagree).

## BOOGIE (a tradition)

Informed by disco and boogie-funk drumming, not one recording.

**Sources (summaries):**
* [Spin, Earl Young interview](https://www.spin.com/2024/05/earl-young-disco-beat-interview/):
  four kicks a bar, the snare on 2 and 4, eighth-note hats; Young is commonly credited with it
  (treated here as a repeated credit, not settled history).
* [Soundbrenner, "Disco beat"](https://www.soundbrenner.com/blogs/articles/disco-beat): the open
  hat on the "and" of each beat.

**Design:** four on the floor under the backbeat, sixteenth pickups into the beats, open hats on
every "and", claps and shaker (the perc track) on 2 and 4.

## MOTORIK (a tradition)

Informed by motorik (Can, Neu!), not one recording.

**Sources (summaries):**
* [Wikipedia, "Motorik"](https://en.wikipedia.org/wiki/Motorik): 4/4 at a moderate tempo,
  repeated every bar; pioneered by Jaki Liebezeit; Klaus Dinger called it the "Apache beat" and
  preferred *endlose gerade* ("the endless straight").
* [bonedo.de](https://www.bonedo.de/?p=1838999) and
  [Counsel Magazine](https://www.counselmagazine.co.uk/articles/in-praise-of-motorik) disagree
  on the pattern (kick on every eighth but 2 and 4, against snare off the beat with insistent kick).

**Design:** kick on the eighths around the snares, straight eighth hats, no ghosts, almost no
development (unit A A A A), a crash lean at the top.

## Investigated, not implemented

* **"Hot Pants"** (James Brown): no source described its drum part; the results were about
  Jabo Starks's style generally ("Soul Power", "Sex Machine").
* **"Soul Pride"** (James Brown): the search returned only "Funky Drummer" material; nothing
  confirmed its drummer or pattern.
* **Bobby Byrd, "I Know You Got Soul"** (1971): the sampling history was confirmed (Eric B. &
  Rakim, 1987), but no source named the drummer or described the pattern.

Without a description of the pattern, a grammar would have been invented, so these were left out.

## Cymbal defaults (revision 4)

`CYM_DEFAULTS` gives each recipe its CLOSED HAT, OPEN HAT, RIDE and CRASH ACTIVITY and the
subdivisions AUTO leans to. These are design choices carried over from Phase 13's per-recipe
vocabulary ([rhythmic-research.md](rhythmic-research.md)), retuned so the default cymbal density
stays close to Phase 13's (phase14-report.md compares the two). The relationship names (ACCENT,
ALTERNATE, LAYER, EXCLUSIVE, CALL & RESPONSE) describe common drumming practice; they are not
taken from a source here. OPEN-HAT CHOKE follows how a hi-hat works (closing the hat stops an
open one ringing).

## DESTROY

The effects (stutter, pitch, reverse, gate, tape stop) are common sampler and DJ techniques. No
source was consulted for them: their behaviour is a design, documented in `destroy2.ts`. TAPE
STOP models one track's playback rate falling linearly (as a tape or platter slowing), not the
whole mix.
