# Diversity report (generated)

Written by `npm run evaluate` (scripts/evaluate-diversity.test.ts). 200 seeds per recipe, 4 bars, default controls, ROLL GENERATION off. Each cell is **revision 2 (before Phase 13) / revision 3 (now)**. Do not edit by hand.

Measures (engine/diversity.ts): "distinct" is the number of different onset patterns divided by the number of breaks (100% = every seed different). Similarities are mean Jaccard indices of onset sets (1 = identical). The nearest-neighbour similarity is, for each break, its cymbals' similarity to the most similar other break, averaged: 1.00 means every break has an identical twin. Timekeeping classes sort bar 1's cymbals into none, sparse (3 or fewer), quarters, off-beats, eighths, sixteenths, triplet (any triplet onset) and broken (anything else). Numbers describe event data; nothing here was listened to.

| Measure (before / after) | FUNK | HIP-HOP | JUNGLE | BROKEN | BOOM BAP | HARDCORE |
|---|---|---|---|---|---|---|
| Distinct whole patterns | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 71% / 100% | 100% / 100% |
| Distinct bar-1 hat patterns | 8% / 59% | 4% / 59% | 11% / 53% | 72% / 73% | 3% / 45% | 8% / 46% |
| Hat pattern entropy (0–1) | 0.46 / 0.82 | 0.21 / 0.81 | 0.36 / 0.73 | 0.84 / 0.88 | 0.16 / 0.71 | 0.49 / 0.78 |
| Distinct bar-1 ride patterns | 2% / 12% | 2% / 13% | 6% / 25% | 21% / 23% | 1% / 8% | 2% / 10% |
| Distinct bar-1 kick+snare | 53% / 75% | 11% / 38% | 62% / 74% | 81% / 91% | 13% / 27% | 49% / 72% |
| Distinct cymbal accent shapes | 28% / 33% | 9% / 30% | 19% / 37% | 40% / 52% | 2% / 17% | 21% / 21% |
| Cymbal similarity between seeds | 0.58 / 0.30 | 0.81 / 0.29 | 0.41 / 0.21 | 0.38 / 0.20 | 0.94 / 0.42 | 0.60 / 0.34 |
| Cymbal nearest-neighbour similarity | 0.99 / 0.74 | 1.00 / 0.75 | 0.98 / 0.71 | 0.88 / 0.63 | 1.00 / 0.86 | 0.98 / 0.80 |
| Kick+snare similarity between seeds | 0.49 / 0.42 | 0.66 / 0.48 | 0.41 / 0.38 | 0.33 / 0.29 | 0.69 / 0.58 | 0.51 / 0.45 |
| Whole-pattern similarity between seeds | 0.43 / 0.29 | 0.61 / 0.31 | 0.31 / 0.24 | 0.28 / 0.20 | 0.78 / 0.45 | 0.45 / 0.32 |
| Timekeeping classes used (of 8) | 1 / 7 | 2 / 8 | 2 / 8 | 3 / 8 | 2 / 7 | 1 / 5 |
| Commonest timekeeping class share | 100% / 42% | 83% / 46% | 73% / 47% | 80% / 68% | 83% / 49% | 100% / 35% |
| Bars changing timekeeping class | 0.29 / 0.76 | 0.07 / 0.63 | 0.89 / 1.00 | 0.87 / 0.74 | 0.10 / 0.43 | 0.61 / 0.92 |
| Phrase forms used (bar repetition shapes) | 3 / 5 | 7 / 8 | 3 / 5 | 4 / 5 | 3 / 8 | 3 / 5 |
| Phrase form entropy (bits) | 0.86 / 1.96 | 1.13 / 2.24 | 0.09 / 1.49 | 0.73 / 1.96 | 0.55 / 1.69 | 0.22 / 1.44 |
| Hits per bar (sd) | 27.4 (2.3) / 21.8 (4.2) | 15.8 (1.6) / 14.2 (3.1) | 19.2 (2.3) / 18.4 (3.2) | 23.7 (2.8) / 18.4 (3.2) | 14.4 (1.5) / 13.4 (2.7) | 27.6 (2.5) / 21.9 (4.1) |
| Cymbal hits per bar (sd) | 14.4 (0.8) / 8.8 (3.4) | 8.0 (0.5) / 6.8 (2.0) | 7.4 (0.5) / 6.8 (2.4) | 11.8 (1.4) / 6.7 (2.1) | 8.1 (0.5) / 7.4 (2.0) | 13.9 (0.8) / 9.0 (3.6) |
| Later bars vs bar 1 (sd) | 0.84 (0.05) / 0.72 (0.11) | 0.88 (0.05) / 0.77 (0.13) | 0.62 (0.06) / 0.61 (0.11) | 0.80 (0.06) / 0.68 (0.11) | 0.95 (0.04) / 0.88 (0.11) | 0.75 (0.06) / 0.70 (0.10) |
| Kick/snare syncopation (sd) | 4.0 (0.7) / 3.3 (1.1) | 2.9 (0.4) / 2.3 (1.1) | 3.9 (1.1) / 3.7 (1.2) | 5.1 (1.2) / 4.4 (1.3) | 3.3 (0.5) / 2.7 (0.9) | 1.4 (1.1) / 1.8 (1.4) |
| Onsets on 16ths / triplets / 32nds | 49% / 0% / 1% / 40% / 3% / 1% | 19% / 0% / 0% / 21% / 6% / 1% | 31% / 0% / 3% / 35% / 1% / 3% | 44% / 0% / 1% / 38% / 3% / 2% | 14% / 0% / 0% / 15% / 6% / 0% | 43% / 0% / 1% / 36% / 1% / 1% |
| Kicks under a cymbal | 88% / 48% | 63% / 48% | 44% / 42% | 68% / 35% | 58% / 55% | 89% / 60% |
| Breaks with no cymbals | 0% / 0% | 0% / 0% | 0% / 1% | 0% / 1% | 0% / 1% | 0% / 0% |
| Breaks with hats and ride layered | 0% / 11% | 0% / 14% | 0% / 18% | 0% / 21% | 0% / 7% | 0% / 12% |

| Measure (before / after) | D&B | HALF-TIME | GARAGE | ELECTRO | BREAKCORE |
|---|---|---|---|---|---|
| Distinct whole patterns | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% |
| Distinct bar-1 hat patterns | 5% / 44% | 2% / 53% | 7% / 57% | 4% / 46% | 6% / 67% |
| Hat pattern entropy (0–1) | 0.28 / 0.70 | 0.15 / 0.80 | 0.40 / 0.84 | 0.14 / 0.73 | 0.39 / 0.86 |
| Distinct bar-1 ride patterns | 4% / 23% | 2% / 17% | 1% / 3% | 1% / 3% | 2% / 19% |
| Distinct bar-1 kick+snare | 13% / 23% | 16% / 24% | 27% / 29% | 23% / 46% | 84% / 89% |
| Distinct cymbal accent shapes | 10% / 32% | 18% / 26% | 12% / 17% | 7% / 20% | 22% / 37% |
| Cymbal similarity between seeds | 0.41 / 0.20 | 0.75 / 0.28 | 0.78 / 0.35 | 0.93 / 0.41 | 0.41 / 0.22 |
| Cymbal nearest-neighbour similarity | 0.99 / 0.72 | 1.00 / 0.75 | 1.00 / 0.86 | 1.00 / 0.87 | 0.91 / 0.64 |
| Kick+snare similarity between seeds | 0.70 / 0.58 | 0.51 / 0.45 | 0.63 / 0.55 | 0.59 / 0.52 | 0.32 / 0.29 |
| Whole-pattern similarity between seeds | 0.39 / 0.28 | 0.53 / 0.26 | 0.61 / 0.34 | 0.69 / 0.39 | 0.29 / 0.21 |
| Timekeeping classes used (of 8) | 3 / 7 | 1 / 8 | 1 / 5 | 1 / 5 | 1 / 7 |
| Commonest timekeeping class share | 75% / 50% | 100% / 36% | 100% / 41% | 100% / 44% | 100% / 60% |
| Bars changing timekeeping class | 0.16 / 0.76 | 0.63 / 0.86 | 0.00 / 0.41 | 0.33 / 0.54 | 1.25 / 1.02 |
| Phrase forms used (bar repetition shapes) | 5 / 6 | 3 / 5 | 4 / 8 | 2 / 5 | 1 / 4 |
| Phrase form entropy (bits) | 1.11 / 2.03 | 0.79 / 1.98 | 0.73 / 1.90 | 0.31 / 1.48 | 0.00 / 0.79 |
| Hits per bar (sd) | 22.3 (3.6) / 15.7 (3.5) | 22.2 (2.0) / 15.2 (3.5) | 24.8 (2.3) / 19.5 (3.8) | 24.2 (2.3) / 18.6 (4.6) | 26.7 (2.3) / 20.9 (3.4) |
| Cymbal hits per bar (sd) | 13.3 (3.2) / 7.1 (2.7) | 14.4 (0.8) / 7.7 (2.8) | 15.1 (0.5) / 10.2 (3.0) | 14.9 (0.6) / 9.5 (3.8) | 12.6 (1.1) / 7.4 (2.8) |
| Later bars vs bar 1 (sd) | 0.86 (0.05) / 0.72 (0.13) | 0.78 (0.06) / 0.67 (0.12) | 0.96 (0.03) / 0.90 (0.10) | 0.89 (0.04) / 0.84 (0.09) | 0.53 (0.07) / 0.51 (0.11) |
| Kick/snare syncopation (sd) | 2.9 (0.6) / 2.1 (1.1) | 2.3 (0.9) / 2.0 (1.3) | 3.8 (0.6) / 2.5 (1.3) | 4.2 (0.5) / 3.5 (1.0) | 3.8 (1.0) / 3.6 (1.3) |
| Onsets on 16ths / triplets / 32nds | 41% / 0% / 1% / 28% / 0% / 2% | 48% / 0% / 1% / 30% / 6% / 1% | 44% / 0% / 1% / 29% / 11% / 1% | 45% / 0% / 1% / 34% / 0% / 1% | 48% / 0% / 3% / 39% / 1% / 5% |
| Kicks under a cymbal | 84% / 56% | 83% / 51% | 90% / 63% | 91% / 53% | 76% / 41% |
| Breaks with no cymbals | 0% / 1% | 0% / 0% | 0% / 0% | 0% / 0% | 0% / 1% |
| Breaks with hats and ride layered | 0% / 20% | 0% / 18% | 0% / 3% | 0% / 3% | 0% / 22% |


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

Timekeeping class of bar 1, revision 3:

| Recipe | none | sparse | quarters | offbeats | eighths | sixteenths | triplet | broken |
|---|---|---|---|---|---|---|---|---|
| FUNK | 0% | 3% | 1% | 1% | 16% | 31% | 8% | 42% |
| HIP-HOP | 1% | 2% | 3% | 3% | 34% | 2% | 11% | 46% |
| JUNGLE | 1% | 5% | 2% | 8% | 28% | 10% | 2% | 47% |
| BROKEN | 1% | 1% | 1% | 2% | 15% | 5% | 8% | 68% |
| BOOM BAP | 1% | 1% | 0% | 4% | 49% | 3% | 13% | 32% |
| HARDCORE | 0% | 2% | 0% | 10% | 22% | 35% | 0% | 32% |
| D&B | 1% | 4% | 2% | 10% | 24% | 11% | 0% | 50% |
| HALF-TIME | 1% | 1% | 1% | 4% | 25% | 18% | 16% | 36% |
| GARAGE | 0% | 0% | 0% | 3% | 3% | 41% | 22% | 31% |
| ELECTRO | 0% | 1% | 0% | 4% | 14% | 44% | 0% | 38% |
| BREAKCORE | 1% | 2% | 0% | 5% | 11% | 16% | 7% | 60% |

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

## HIP-HOP hats, first 24 seeds, revision 3

Bar 1 and bar 2 of the cymbals (x hat, O open hat, r ride, ~ off the sixteenth grid), then bar 1's kick.

```
   5000 broken     |x x x   x x x xr|x x x   x x x rr|  kick |x x .  x. x .   |
  12919 eighths    |x x x O x   . x |x x x O x   . x |  kick |x x .  x.   .   |
  20838 broken     |x x x x x x x xr|x x x x x O x xr|  kick |x   .x x.   .   |
  28757 broken     |x x x x x xxx x |x x x x x xxx x |  kick |x   .   .   .   |
  36676 broken     |x xxx   x x x x |x xxx   x x x x |  kick |x   . x .  x.   |
  44595 broken     |x  x. O .x  x x |x  x. O .x  x x |  kick |x   .   .   .   |
  52514 eighths    |. x x x x x . x |x x x x x x . x |  kick |x   .   .  x.   |
  60433 broken     |x  x.   x  x.   |x  x.   x  x.   |  kick |x   . ~ .   . ~ |
  68352 eighths    |x x x x x x x x |x x x x x x x x |  kick |x   .  x.   .   |
  76271 broken     |x x . xxx   x   |x x . xxx   x  x|  kick |x   . ~ .   . ~ |
  84190 eighths    |x   x x x   x O |x   x x x   x O |  kick |x x .  x.   .   |
  92109 eighths    |r r r r r r r r |r r r r r r r r |  kick |x x .  x. x .   |
 100028 broken     |x   x x x   x   |x   x x x   x   |  kick |x   .x  . x .   |
 107947 broken     |r   r   r   r r |r   r   r   r r |  kick |x   .  x.   .   |
 115866 sparse     |r   . r . r .   |r   . r . r .   |  kick |x   .   . x .x  |
 123785 eighths    |x x x x x x x x |x x x x x x x x |  kick |x   .~~ .   .   |
 131704 broken     |x O x x x x x Or|x O x xxx x x Or|  kick |xx  .   .x  .   |
 139623 broken     |. x . r r x . rx|. x . r r x . rx|  kick |x   .x  . x .   |
 147542 broken     |x  x. x .x  x x |x  x. O .x  x x |  kick |x   .  x. x .   |
 155461 broken     |. x .   x   x x |. x .   x   x x |  kick |x x .   . x .x  |
 163380 triplet    |x ~ x ~ x ~ x ~ |x ~ x ~ x ~ x ~ |  kick |x   . ~ . ~ .   |
 171299 broken     |x x x xxx x x O |x x x xxx x x O |  kick |x   .   .x  . xx|
 179218 quarters   |r   r   r   r   |r   r   r   r   |  kick |x   . x . x .   |
 187137 broken     |r   r x r O r  x|r   r x r O r  x|  kick |x   .x  . x .   |
```
