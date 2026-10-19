# Diversity report (generated)

Written by `npm run evaluate` (scripts/evaluate-diversity.test.ts). 200 seeds per recipe, 4 bars, default controls, ROLL GENERATION off. Revision 2 only (the baseline). Do not edit by hand.

Measures (engine/diversity.ts): "distinct" is the number of different onset patterns divided by the number of breaks (100% = every seed different). Similarities are mean Jaccard indices of onset sets (1 = identical). The nearest-neighbour similarity is, for each break, its cymbals' similarity to the most similar other break, averaged: 1.00 means every break has an identical twin. Timekeeping classes sort bar 1's cymbals into none, sparse (3 or fewer), quarters, off-beats, eighths, sixteenths, triplet (any triplet onset) and broken (anything else). Numbers describe event data; nothing here was listened to.

| Measure (revision 2) | FUNK | HIP-HOP | JUNGLE | BROKEN | BOOM BAP | HARDCORE |
|---|---|---|---|---|---|---|
| Distinct whole patterns | 100% | 100% | 100% | 100% | 71% | 100% |
| Distinct bar-1 hat patterns | 8% | 4% | 11% | 72% | 3% | 8% |
| Hat pattern entropy (0–1) | 0.46 | 0.21 | 0.36 | 0.84 | 0.16 | 0.49 |
| Distinct bar-1 ride patterns | 2% | 2% | 6% | 21% | 1% | 2% |
| Distinct bar-1 kick+snare | 53% | 11% | 62% | 81% | 13% | 49% |
| Distinct cymbal accent shapes | 28% | 9% | 19% | 40% | 2% | 21% |
| Cymbal similarity between seeds | 0.58 | 0.81 | 0.41 | 0.38 | 0.94 | 0.60 |
| Cymbal nearest-neighbour similarity | 0.99 | 1.00 | 0.98 | 0.88 | 1.00 | 0.98 |
| Kick+snare similarity between seeds | 0.49 | 0.66 | 0.41 | 0.33 | 0.69 | 0.51 |
| Whole-pattern similarity between seeds | 0.43 | 0.61 | 0.31 | 0.28 | 0.78 | 0.45 |
| Timekeeping classes used (of 8) | 1 | 2 | 2 | 3 | 2 | 1 |
| Commonest timekeeping class share | 100% | 83% | 73% | 80% | 83% | 100% |
| Bars changing timekeeping class | 0.29 | 0.07 | 0.89 | 0.87 | 0.10 | 0.61 |
| Distinct phrase forms | 2% | 4% | 2% | 2% | 2% | 2% |
| Hits per bar (sd) | 27.4 (2.3) | 15.8 (1.6) | 19.2 (2.3) | 23.7 (2.8) | 14.4 (1.5) | 27.6 (2.5) |
| Cymbal hits per bar (sd) | 14.4 (0.8) | 8.0 (0.5) | 7.4 (0.5) | 11.8 (1.4) | 8.1 (0.5) | 13.9 (0.8) |
| Later bars vs bar 1 (sd) | 0.84 (0.05) | 0.88 (0.05) | 0.62 (0.06) | 0.80 (0.06) | 0.95 (0.04) | 0.75 (0.06) |
| Kick/snare syncopation (sd) | 4.0 (0.7) | 2.9 (0.4) | 3.9 (1.1) | 5.1 (1.2) | 3.3 (0.5) | 1.4 (1.1) |
| Onsets on 16ths / triplets / 32nds | 49% / 0% / 1% | 19% / 0% / 0% | 31% / 0% / 3% | 44% / 0% / 1% | 14% / 0% / 0% | 43% / 0% / 1% |
| Kicks under a cymbal | 88% | 63% | 44% | 68% | 58% | 89% |
| Breaks with no cymbals | 0% | 0% | 0% | 0% | 0% | 0% |
| Breaks with hats and ride layered | 0% | 0% | 0% | 0% | 0% | 0% |

| Measure (revision 2) | D&B | HALF-TIME | GARAGE | ELECTRO | BREAKCORE |
|---|---|---|---|---|---|
| Distinct whole patterns | 100% | 100% | 100% | 100% | 100% |
| Distinct bar-1 hat patterns | 5% | 2% | 7% | 4% | 6% |
| Hat pattern entropy (0–1) | 0.28 | 0.15 | 0.40 | 0.14 | 0.39 |
| Distinct bar-1 ride patterns | 4% | 2% | 1% | 1% | 2% |
| Distinct bar-1 kick+snare | 13% | 16% | 27% | 23% | 84% |
| Distinct cymbal accent shapes | 10% | 18% | 12% | 7% | 22% |
| Cymbal similarity between seeds | 0.41 | 0.75 | 0.78 | 0.93 | 0.41 |
| Cymbal nearest-neighbour similarity | 0.99 | 1.00 | 1.00 | 1.00 | 0.91 |
| Kick+snare similarity between seeds | 0.70 | 0.51 | 0.63 | 0.59 | 0.32 |
| Whole-pattern similarity between seeds | 0.39 | 0.53 | 0.61 | 0.69 | 0.29 |
| Timekeeping classes used (of 8) | 3 | 1 | 1 | 1 | 1 |
| Commonest timekeeping class share | 75% | 100% | 100% | 100% | 100% |
| Bars changing timekeeping class | 0.16 | 0.63 | 0.00 | 0.33 | 1.25 |
| Distinct phrase forms | 3% | 2% | 2% | 1% | 1% |
| Hits per bar (sd) | 22.3 (3.6) | 22.2 (2.0) | 24.8 (2.3) | 24.2 (2.3) | 26.7 (2.3) |
| Cymbal hits per bar (sd) | 13.3 (3.2) | 14.4 (0.8) | 15.1 (0.5) | 14.9 (0.6) | 12.6 (1.1) |
| Later bars vs bar 1 (sd) | 0.86 (0.05) | 0.78 (0.06) | 0.96 (0.03) | 0.89 (0.04) | 0.53 (0.07) |
| Kick/snare syncopation (sd) | 2.9 (0.6) | 2.3 (0.9) | 3.8 (0.6) | 4.2 (0.5) | 3.8 (1.0) |
| Onsets on 16ths / triplets / 32nds | 41% / 0% / 1% | 48% / 0% / 1% | 44% / 0% / 1% | 45% / 0% / 1% | 48% / 0% / 3% |
| Kicks under a cymbal | 84% | 83% | 90% | 91% | 76% |
| Breaks with no cymbals | 0% | 0% | 0% | 0% | 0% |
| Breaks with hats and ride layered | 0% | 0% | 0% | 0% | 0% |


Timekeeping class of bar 1, revision 2:

| Recipe | none | sparse | quarters | offbeats | eighths | sixteenths | triplet | broken |
|---|---|---|---|---|---|---|---|---|
| FUNK | 0% | 0% | 0% | 0% | 0% | 100% | 0% | 0% |
| HIP-HOP | 0% | 0% | 0% | 0% | 83% | 0% | 0% | 17% |
| JUNGLE | 0% | 0% | 0% | 0% | 73% | 0% | 0% | 27% |
| BROKEN | 0% | 0% | 0% | 0% | 1% | 80% | 0% | 20% |
| BOOM BAP | 0% | 0% | 0% | 0% | 83% | 0% | 0% | 18% |
| HARDCORE | 0% | 0% | 0% | 0% | 0% | 100% | 0% | 0% |
| D&B | 0% | 0% | 0% | 0% | 20% | 75% | 0% | 5% |
| HALF-TIME | 0% | 0% | 0% | 0% | 0% | 100% | 0% | 0% |
| GARAGE | 0% | 0% | 0% | 0% | 0% | 100% | 0% | 0% |
| ELECTRO | 0% | 0% | 0% | 0% | 0% | 100% | 0% | 0% |
| BREAKCORE | 0% | 0% | 0% | 0% | 0% | 100% | 0% | 0% |

## HIP-HOP hats, first 24 seeds, revision 2

Bar 1 and bar 2 of the cymbals (x hat, O open hat, r ride, ~ off the sixteenth grid), then bar 1's kick.

```
   5000 eighths    |x x x x x x x x |x x x x x x x x |  kick |x x .  x.   . x |
  12919 broken     |x x x x x xxx x |x x x x x xxx x |  kick |x x .  x.   .   |
  20838 eighths    |r r r r r r r r |r r r r r r r r |  kick |x x .  x.   .   |
  28757 eighths    |x x x x x x x x |x x x x x x x O |  kick |x x .  x.   .   |
  36676 eighths    |x x x x x x x x |x x x x x x x O |  kick |x   .  x. x .   |
  44595 broken     |r r r r r rrr r |r r r r r rrr r |  kick |x   . xx. x .   |
  52514 eighths    |. x x x x x x x |x x x x x x x x |  kick |x   .x  . x .   |
  60433 eighths    |x x x x x x x x |x x x x x x x x |  kick |x x .  x.   .   |
  68352 eighths    |x x x x x x x x |x x x x x x x x |  kick |x x .  x.   .   |
  76271 eighths    |x x x x x x x x |x x x x x x x x |  kick |x   . xx.   .   |
  84190 eighths    |x x x x x x x x |x x x x x x x x |  kick |x x .  x.   . x |
  92109 eighths    |x x x x x x x x |x x x x x x x x |  kick |x   . xx. x .   |
 100028 eighths    |x x x x x x x x |x x x x x x x x |  kick |x   .  x.   . x |
 107947 eighths    |r r r r r r r r |r r r r r r r r |  kick |x x .  x. x .   |
 115866 eighths    |x x x x x x x x |x x x x x x x x |  kick |x x .  x.   .   |
 123785 eighths    |x x x x x x x x |x x x x x x x x |  kick |x   .  x. x .   |
 131704 eighths    |x x x x x x x x |x x x x x x x x |  kick |x   . xx. x .   |
 139623 eighths    |x x x x x x x x |x x x x x x x x |  kick |x x .   . x . x |
 147542 eighths    |x x x x x x x x |x x x x x x x x |  kick |x x .  x.   .   |
 155461 eighths    |x x x x x x x x |x x x x x x x x |  kick |x   .  x. x .   |
 163380 eighths    |x x x x x x x x |x x x x x x x x |  kick |x   . xx.   . x |
 171299 eighths    |x x x x x x x x |x x x x x x x x |  kick |x x .  x.   .   |
 179218 eighths    |x x x x x x x x |x x x x x x x x |  kick |x x .  x.   .   |
 187137 eighths    |x x x x x x x x |x x x x x x x x |  kick |x x .  x. x .   |
```
