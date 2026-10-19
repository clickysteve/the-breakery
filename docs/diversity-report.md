# Diversity report (generated)

Written by `npm run evaluate` (scripts/evaluate-diversity.test.ts). 200 seeds per recipe, 4 bars, default controls, ROLL GENERATION off. Each cell is **revision 2 (before Phase 13) / revision 3 (now)**. Do not edit by hand.

Measures (engine/diversity.ts): "distinct" is the number of different onset patterns divided by the number of breaks (100% = every seed different). Similarities are mean Jaccard indices of onset sets (1 = identical). The nearest-neighbour similarity is, for each break, its cymbals' similarity to the most similar other break, averaged: 1.00 means every break has an identical twin. Timekeeping classes sort bar 1's cymbals into none, sparse (3 or fewer), quarters, off-beats, eighths, sixteenths, triplet (any triplet onset) and broken (anything else). Numbers describe event data; nothing here was listened to.

| Measure (before / after) | FUNK | HIP-HOP | JUNGLE | BROKEN | BOOM BAP | HARDCORE |
|---|---|---|---|---|---|---|
| Distinct whole patterns | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 71% / 99% | 100% / 100% |
| Distinct bar-1 hat patterns | 8% / 57% | 4% / 59% | 11% / 55% | 72% / 74% | 3% / 45% | 8% / 50% |
| Hat pattern entropy (0–1) | 0.46 / 0.82 | 0.21 / 0.81 | 0.36 / 0.74 | 0.84 / 0.88 | 0.16 / 0.71 | 0.49 / 0.79 |
| Distinct bar-1 ride patterns | 2% / 10% | 2% / 13% | 6% / 27% | 21% / 25% | 1% / 7% | 2% / 10% |
| Distinct bar-1 kick+snare | 53% / 75% | 11% / 38% | 62% / 74% | 81% / 91% | 13% / 27% | 49% / 67% |
| Distinct cymbal accent shapes | 28% / 33% | 9% / 34% | 19% / 35% | 40% / 47% | 2% / 17% | 21% / 24% |
| Cymbal similarity between seeds | 0.58 / 0.31 | 0.81 / 0.29 | 0.41 / 0.22 | 0.38 / 0.20 | 0.94 / 0.44 | 0.60 / 0.37 |
| Cymbal nearest-neighbour similarity | 0.99 / 0.76 | 1.00 / 0.75 | 0.98 / 0.72 | 0.88 / 0.63 | 1.00 / 0.88 | 0.98 / 0.80 |
| Kick+snare similarity between seeds | 0.49 / 0.42 | 0.66 / 0.48 | 0.41 / 0.38 | 0.33 / 0.29 | 0.69 / 0.59 | 0.51 / 0.50 |
| Whole-pattern similarity between seeds | 0.43 / 0.30 | 0.61 / 0.31 | 0.31 / 0.24 | 0.28 / 0.20 | 0.78 / 0.46 | 0.45 / 0.36 |
| Timekeeping classes used (of 8) | 1 / 7 | 2 / 8 | 2 / 8 | 3 / 8 | 2 / 7 | 1 / 5 |
| Commonest timekeeping class share | 100% / 39% | 83% / 46% | 73% / 47% | 80% / 62% | 83% / 50% | 100% / 47% |
| Bars changing timekeeping class | 0.29 / 0.71 | 0.07 / 0.60 | 0.89 / 1.01 | 0.87 / 0.81 | 0.10 / 0.34 | 0.61 / 0.87 |
| Phrase forms used (bar repetition shapes) | 3 / 5 | 7 / 7 | 3 / 5 | 4 / 5 | 3 / 6 | 3 / 5 |
| Phrase form entropy (bits) | 0.86 / 2.16 | 1.13 / 2.30 | 0.09 / 1.35 | 0.73 / 2.12 | 0.55 / 0.97 | 0.22 / 1.24 |
| Hits per bar (sd) | 27.4 (2.3) / 22.5 (4.2) | 15.8 (1.6) / 14.1 (3.1) | 19.2 (2.3) / 18.9 (3.2) | 23.7 (2.8) / 18.9 (3.1) | 14.4 (1.5) / 13.4 (2.7) | 27.6 (2.5) / 23.5 (4.2) |
| Cymbal hits per bar (sd) | 14.4 (0.8) / 9.4 (3.6) | 8.0 (0.5) / 6.8 (2.0) | 7.4 (0.5) / 7.3 (2.6) | 11.8 (1.4) / 7.1 (2.1) | 8.1 (0.5) / 7.4 (2.1) | 13.9 (0.8) / 9.9 (3.6) |
| Later bars vs bar 1 (sd) | 0.84 (0.05) / 0.73 (0.12) | 0.88 (0.05) / 0.78 (0.13) | 0.62 (0.06) / 0.60 (0.12) | 0.80 (0.06) / 0.69 (0.12) | 0.95 (0.04) / 0.90 (0.08) | 0.75 (0.06) / 0.70 (0.09) |
| Kick/snare syncopation (sd) | 4.0 (0.7) / 3.3 (1.1) | 2.9 (0.4) / 2.3 (1.1) | 3.9 (1.1) / 3.6 (1.1) | 5.1 (1.2) / 4.5 (1.4) | 3.3 (0.5) / 2.7 (0.9) | 1.4 (1.1) / 1.3 (1.2) |
| Onsets on 16ths / triplets / 32nds | 49% / 0% / 1% / 40% / 3% / 1% | 19% / 0% / 0% / 21% / 5% / 1% | 31% / 0% / 3% / 35% / 1% / 3% | 44% / 0% / 1% / 38% / 3% / 2% | 14% / 0% / 0% / 15% / 6% / 0% | 43% / 0% / 1% / 37% / 1% / 1% |
| Kicks under a cymbal | 88% / 51% | 63% / 49% | 44% / 44% | 68% / 35% | 58% / 54% | 89% / 67% |
| Breaks with no cymbals | 0% / 0% | 0% / 0% | 0% / 1% | 0% / 1% | 0% / 1% | 0% / 0% |
| Breaks with hats and ride layered | 0% / 10% | 0% / 14% | 0% / 23% | 0% / 20% | 0% / 7% | 0% / 12% |

| Measure (before / after) | D&B | HALF-TIME | GARAGE | ELECTRO | BREAKCORE |
|---|---|---|---|---|---|
| Distinct whole patterns | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% |
| Distinct bar-1 hat patterns | 5% / 42% | 2% / 49% | 7% / 59% | 4% / 38% | 6% / 64% |
| Hat pattern entropy (0–1) | 0.28 / 0.69 | 0.15 / 0.78 | 0.40 / 0.84 | 0.14 / 0.64 | 0.39 / 0.84 |
| Distinct bar-1 ride patterns | 4% / 20% | 2% / 12% | 1% / 2% | 1% / 2% | 2% / 18% |
| Distinct bar-1 kick+snare | 13% / 23% | 16% / 24% | 27% / 29% | 23% / 46% | 84% / 89% |
| Distinct cymbal accent shapes | 10% / 24% | 18% / 25% | 12% / 16% | 7% / 17% | 22% / 31% |
| Cymbal similarity between seeds | 0.41 / 0.24 | 0.75 / 0.31 | 0.78 / 0.40 | 0.93 / 0.50 | 0.41 / 0.27 |
| Cymbal nearest-neighbour similarity | 0.99 / 0.77 | 1.00 / 0.79 | 1.00 / 0.87 | 1.00 / 0.90 | 0.91 / 0.67 |
| Kick+snare similarity between seeds | 0.70 / 0.59 | 0.51 / 0.45 | 0.63 / 0.56 | 0.59 / 0.53 | 0.32 / 0.29 |
| Whole-pattern similarity between seeds | 0.39 / 0.29 | 0.53 / 0.28 | 0.61 / 0.36 | 0.69 / 0.45 | 0.29 / 0.23 |
| Timekeeping classes used (of 8) | 3 / 7 | 1 / 7 | 1 / 5 | 1 / 4 | 1 / 7 |
| Commonest timekeeping class share | 75% / 37% | 100% / 33% | 100% / 47% | 100% / 63% | 100% / 54% |
| Bars changing timekeeping class | 0.16 / 0.94 | 0.63 / 0.89 | 0.00 / 0.39 | 0.33 / 0.48 | 1.25 / 1.17 |
| Phrase forms used (bar repetition shapes) | 5 / 8 | 3 / 5 | 4 / 6 | 2 / 5 | 1 / 5 |
| Phrase form entropy (bits) | 1.11 / 2.30 | 0.79 / 2.22 | 0.73 / 1.33 | 0.31 / 0.87 | 0.00 / 0.78 |
| Hits per bar (sd) | 22.3 (3.6) / 16.7 (3.7) | 22.2 (2.0) / 16.2 (3.6) | 24.8 (2.3) / 20.1 (3.6) | 24.2 (2.3) / 20.2 (4.4) | 26.7 (2.3) / 22.0 (3.7) |
| Cymbal hits per bar (sd) | 13.3 (3.2) / 8.2 (3.1) | 14.4 (0.8) / 8.7 (3.1) | 15.1 (0.5) / 10.8 (2.9) | 14.9 (0.6) / 11.1 (3.5) | 12.6 (1.1) / 8.3 (3.1) |
| Later bars vs bar 1 (sd) | 0.86 (0.05) / 0.72 (0.14) | 0.78 (0.06) / 0.69 (0.13) | 0.96 (0.03) / 0.91 (0.08) | 0.89 (0.04) / 0.86 (0.06) | 0.53 (0.07) / 0.51 (0.11) |
| Kick/snare syncopation (sd) | 2.9 (0.6) / 2.1 (1.1) | 2.3 (0.9) / 2.0 (1.3) | 3.8 (0.6) / 2.5 (1.3) | 4.2 (0.5) / 3.5 (1.0) | 3.8 (1.0) / 3.6 (1.3) |
| Onsets on 16ths / triplets / 32nds | 41% / 0% / 1% / 29% / 0% / 2% | 48% / 0% / 1% / 33% / 6% / 1% | 44% / 0% / 1% / 30% / 10% / 1% | 45% / 0% / 1% / 38% / 0% / 1% | 48% / 0% / 3% / 40% / 1% / 4% |
| Kicks under a cymbal | 84% / 60% | 83% / 53% | 90% / 66% | 91% / 62% | 76% / 47% |
| Breaks with no cymbals | 0% / 1% | 0% / 0% | 0% / 0% | 0% / 0% | 0% / 0% |
| Breaks with hats and ride layered | 0% / 16% | 0% / 12% | 0% / 2% | 0% / 2% | 0% / 18% |


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
| FUNK | 0% | 2% | 1% | 1% | 13% | 38% | 8% | 39% |
| HIP-HOP | 1% | 2% | 3% | 3% | 34% | 2% | 11% | 46% |
| JUNGLE | 1% | 4% | 1% | 5% | 26% | 12% | 4% | 47% |
| BROKEN | 1% | 1% | 2% | 2% | 15% | 11% | 6% | 62% |
| BOOM BAP | 1% | 1% | 0% | 4% | 50% | 3% | 13% | 30% |
| HARDCORE | 0% | 2% | 0% | 5% | 15% | 47% | 0% | 33% |
| D&B | 1% | 4% | 2% | 8% | 30% | 20% | 0% | 37% |
| HALF-TIME | 0% | 2% | 1% | 2% | 15% | 30% | 18% | 33% |
| GARAGE | 0% | 0% | 0% | 3% | 5% | 47% | 19% | 28% |
| ELECTRO | 0% | 0% | 0% | 3% | 8% | 63% | 0% | 27% |
| BREAKCORE | 0% | 2% | 1% | 3% | 7% | 30% | 5% | 54% |

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
   5000 broken     |x x x   x x x xr|x x x   x x x xr|  kick |x x .  x. x .   |
  12919 eighths    |x x x O x   . x |x x x O x   . x |  kick |x x .  x.   .   |
  20838 eighths    |x x x x x x x x |x x x x x x x x |  kick |x   .x x.   .   |
  28757 broken     |x x x x x xxx x |x x x x x xxx x |  kick |x   .   .   .   |
  36676 broken     |x xxx   x x x x |x xxx   x x x x |  kick |x   . x .  x.   |
  44595 broken     |x  x. O .x  x x |x  x. O .x  x x |  kick |x   .   .   .   |
  52514 eighths    |. x x x x x . x |x x x   x x . x |  kick |x   .   .  x.   |
  60433 broken     |x  x.   x  x.   |x x x x x x x O |  kick |x   . ~ .   . ~ |
  68352 eighths    |x x x x x x x x |x x x x x x x x |  kick |x   .  x.   .   |
  76271 broken     |x x . xxx   x   |x x . xxx   x   |  kick |x   . ~ .   . ~ |
  84190 eighths    |x   x x x   x O |x   x x x   x O |  kick |x x .  x.   .   |
  92109 eighths    |r r r r r r r r |x ~ x ~ x ~ x ~ |  kick |x x .  x. x .   |
 100028 broken     |x   x x x   x   |x   x x x   x   |  kick |x   .x  . x .   |
 107947 broken     |r   r   r   r r |r   r   r   r r |  kick |x   .  x.   .   |
 115866 sparse     |r   . r . r .   |r   . r . r .   |  kick |x   .   . x .x  |
 123785 eighths    |x x x x x x x x |x x x x x x x x |  kick |x   .~~ .   .   |
 131704 broken     |x O x x x x x Or|x O x xxx x x Or|  kick |xx  .   .x  .   |
 139623 broken     |. x . r r x . rx|. x . r r x . rx|  kick |x   .x  . x .   |
 147542 broken     |x  x. x .x  x x |x  x. x .x  x x |  kick |x   .  x. x .   |
 155461 broken     |. x .   x   x x |. x .   x   x x |  kick |x x .   . x .x  |
 163380 triplet    |x ~ x ~ x ~ x ~ |r   r r r   r   |  kick |x   . ~ . ~ .   |
 171299 broken     |x x x xxx x x O |x x x xxx x x O |  kick |x   .   .x  . xx|
 179218 quarters   |r   r   r   r   |r   r   r   r   |  kick |x   . x . x .   |
 187137 broken     |r   r x r O r  x|r   r x r O r  x|  kick |x   .x  . x .   |
```
