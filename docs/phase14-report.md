# Phase 14 report (generated)

Written by `npm run evaluate` (scripts/evaluate-phase14.test.ts). Do not edit by hand. Numbers describe event data only: nothing here was rendered to audio or listened to.

## Cymbals: revision 3 / revision 4, default controls

Each cell is **revision 3 (Phase 13) / revision 4 (now)**, 200 seeds, 4 bars, ROLL GENERATION off.

| Measure | FUNK | HIP-HOP | JUNGLE | BROKEN | BOOM BAP | HARDCORE |
|---|---|---|---|---|---|---|
| Distinct whole patterns | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 99% / 98% | 100% / 100% |
| Distinct bar-1 hat patterns | 57% / 60% | 59% / 51% | 55% / 50% | 74% / 68% | 45% / 31% | 50% / 68% |
| Distinct bar-1 kick+snare | 75% / 75% | 38% / 38% | 74% / 74% | 91% / 91% | 27% / 27% | 67% / 67% |
| Cymbal nearest-neighbour similarity | 0.76 / 0.85 | 0.75 / 0.88 | 0.72 / 0.80 | 0.63 / 0.73 | 0.88 / 0.94 | 0.80 / 0.75 |
| Cymbal hits per bar | 9.4 / 9.6 | 6.8 / 6.9 | 7.3 / 8.1 | 7.1 / 8.8 | 7.4 / 6.7 | 9.9 / 9.0 |
| Timekeeping classes used (of 8) | 7 / 4 | 8 / 3 | 8 / 3 | 8 / 5 | 7 / 3 | 5 / 4 |
| Breaks with no cymbals | 0% / 0% | 0% / 0% | 1% / 0% | 1% / 0% | 1% / 0% | 0% / 0% |

| Measure | D&B | HALF-TIME | GARAGE | ELECTRO | BREAKCORE |
|---|---|---|---|---|---|
| Distinct whole patterns | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% |
| Distinct bar-1 hat patterns | 42% / 46% | 49% / 59% | 59% / 81% | 38% / 60% | 64% / 73% |
| Distinct bar-1 kick+snare | 23% / 23% | 24% / 24% | 29% / 29% | 46% / 46% | 89% / 89% |
| Cymbal nearest-neighbour similarity | 0.77 / 0.85 | 0.79 / 0.81 | 0.87 / 0.83 | 0.90 / 0.90 | 0.67 / 0.68 |
| Cymbal hits per bar | 8.2 / 8.6 | 8.7 / 8.8 | 10.8 / 9.9 | 11.1 / 10.0 | 8.3 / 10.8 |
| Timekeeping classes used (of 8) | 7 / 3 | 7 / 4 | 5 / 4 | 4 / 2 | 7 / 3 |
| Breaks with no cymbals | 1% / 0% | 0% / 0% | 0% / 0% | 0% / 0% | 0% / 0% |

### CLOSED HAT 100%: coverage of the subdivision

The share of the subdivision's positions with a closed hat, over every bar of 20 seeds of every recipe (CLOSED HAT 100%, everything else 0, ACCENT). The same for RIDE 100%.

| Subdivision | Positions a bar | Closed hat coverage | Ride coverage |
|---|---|---|---|
| 1/4 | 4 | 100% | 100% |
| 1/8 | 8 | 100% | 100% |
| 1/16 | 16 | 100% | 100% |
| 1/32 | 32 | 100% | 100% |
| TRIPLET | 12 | 100% | 100% |

### Activity curve (FUNK, 1/16, ACCENT): closed hats per bar

| CLOSED HAT | 0% | 25% | 50% | 75% | 100% |
|---|---|---|---|---|---|
| hits a bar | 0.0 | 4.0 | 7.8 | 11.4 | 16.0 |

### HATS ↔ RIDE relationship (FUNK, both 100%, 1/8)

Hits a bar of each family, and how many land on the same position.

| Relationship | Closed hats | Ride | Together |
|---|---|---|---|
| ACCENT | 8.0 | 5.3 | 5.3 |
| INDEPENDENT | 8.0 | 8.0 | 8.0 |
| ALTERNATE | 4.8 | 3.2 | 0.0 |
| LAYER | 8.0 | 8.0 | 8.0 |
| EXCLUSIVE | 8.0 | 0.0 | 0.0 |
| CALL & RESP | 4.0 | 4.0 | 0.0 |

## BREAK DNA

FUNK, 4 bars, 100 seeds, ROLL GENERATION off. "Distinct" counts different kick and snare patterns (all four bars); "distance" is the mean number of kick and snare positions that differ from the same seed with no DNA. The kick profile counts, over the 100 seeds, a kick on each sixteenth of bar 1.

| DNA | Distinct (of 100) | Distance at 25 / 50 / 75 / 100% | Hits a bar at 100% | Bar 1 kick profile (16 steps) |
|---|---|---|---|---|
| AMEN | 99 | 7.6 / 15.2 / 22.2 / 28.6 | 19.8 | `100  1 75  9  0  1 15  4  9  2 95 63  0  2 10  1` |
| FUNKY DRUMMER | 99 | 4.8 / 10.2 / 15.3 / 19.6 | 23.4 | `100  2 89 23  0  2  1 32 12 15 75 18  0  2 19  0` |
| APACHE | 97 | 4.0 / 8.4 / 13.4 / 17.8 | 22.8 | `100  2 39 13  0  5 21 26 35  1 52  0  0  1 20  2` |
| THINK | 100 | 4.7 / 9.3 / 14.0 / 18.9 | 24.6 | `100  1 28 31  0  3 63 32 14  2 27 26  0  4 19  1` |
| IMPEACH | 99 | 4.2 / 9.1 / 13.0 / 17.9 | 17.4 | `100  1 27  1  0  1  4 52 77  0 46  1  0  2 17  1` |
| ROACHCLIP | 77 | 5.5 / 10.1 / 14.5 / 18.7 | 23.5 | `100  2 49  4  0  0 24  3 47  2 71  2  0  1 14  2` |
| BOOGIE | 95 | 6.0 / 12.7 / 19.7 / 25.9 | 22.5 | `100  2  7 19100  1  5 17 97  2  8 11 97  2  2 13` |
| MOTORIK | 86 | 5.8 / 11.3 / 17.5 / 23.7 | 18.7 | `100  1 85  0  0  2 65  2 92  0 87  0  0  0 70  1` |

### One break per DNA (FUNK, seed 5000, INFLUENCE 100%)

AMEN

```
KICK     |X X .   . Xx.   |X X .   . xX.   |X X .   . XX.   |. X .   . XX.   |
SNARE    |.   X   .x  X   |.   X   .x  X   |.   X   .x  .X  |.x  X   .x  Xx X|
GHOST    |.- -.-  .  -.   |.- -.-  .  -.   |.- -.-  .  -.   |.  -.   .  -.   |
LOW TOM  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   . X |
HAT      |.   X   x   X x |x   X   x   X x |x x X   x x x x |x x X x x x X   |
OPEN HAT |.   . x .   .   |.   . x .   .   |.   . x .   .   |.   .   .   .   |
CRASH    |X   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |
```

FUNKY DRUMMER

```
KICK     |X X .   .  X. x |X X .   . x . X |X X .   .  X. x |X X .   . X . X |
SNARE    |.   X   .   X   |.   X   .   X   |.   X   .   X   |.   X   .   Xx X|
GHOST    |.- -.   .  -.-  |.- -.   .  -.-  |.- -.  -.  -.-  |.- -.   .  -.   |
LOW TOM  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   . X |
HAT      |.o oXo oxox Xo o|xo oXoxoxo oXo o|xoxoXo oxoxoXo o|xoxoXoxoxo oX   |
OPEN HAT |.   . x .   . x |.   .   . x . x |.   . x .   . x |.   .   . x .   |
CRASH    |X   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |
```

APACHE

```
KICK     |X X . X .   . x |X X . x .   . X |X X . X .   . x |X X . X .   .  X|
SNARE    |.   X   .   X   |.   X   .   X   |.   X   .   X   |.   X   .   Xx  |
GHOST    |.   .   .   .  -|.   .   .   .  -|.   .   .   .  -|.-  .   .  -.   |
LOW TOM  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   . X |
HAT      |.o oXo oxoxo.o o|xo oXo oxoxo.o o|xoxoXo oxoxoXo o|xoxoXo oxoxoX   |
OPEN HAT |.   . x .   . x |.   . x .   . x |.   . x .   . x |.   . x .   .   |
CRASH    |X   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |
PERC     |xoxo. x . xo.   |xoxo. x . xo.   |xoxo. x . xo.   |xo o. x . xoo   |
```

THINK

```
KICK     |X X .   .   .   |X X .   .   .   |X Xx.  x.   .   |X X .   .   .  X|
SNARE    |.   X   .   X   |.   X   .   X   |.   X   .x  X   |.   X   .   Xx  |
GHOST    |.-  .  -.-  .   |.-  .  -.-  .   |.   .  -.   .-  |.-  .  -.-  .   |
LOW TOM  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   . X |
HAT      |.o o.o oxoxo.o o|xo o.o oxoxo.o o|xoxoXo oxoxoXo o|xoxoXo oxoxoX   |
OPEN HAT |.   . x .   . x |.   . x .   . x |.   . x .   . x |.   . x .   .   |
CRASH    |X   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |
PERC     |x   x x . xo.   |x   x x . xo.   |x   x x . xo.ox |x   x x . xo.   |
```

IMPEACH

```
KICK     |X   .  xX   .   |X   . x X   .  x|X   .  xX   .   |X   . X X   .  X|
SNARE    |.   X   .   X   |.   X   .   X   |.   X   .   X   |.   X   .   Xx  |
GHOST    |.   .   .  -.- -|.   .   .  -.  -|.   .   .  -.- -|.   .   .  -.   |
LOW TOM  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   . X |
HAT      |. x .   . x X x |x x .   x x X   |x x X   x x X x |x x X x x x X   |
OPEN HAT |.   . x .   .   |.   .   .   . x |.   . x .   .   |.   .   .   .   |
CRASH    |X   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |
```

ROACHCLIP

```
KICK     |X X .   X   .   |X X .   X   .   |X X .   X   . x |X X .   X   . Xx|
SNARE    |.   X   .   X   |.   X   .   X   |.   X   .   X   |.   X   .   Xx  |
GHOST    |.- -.  -.- -.   |.- -.  -.- -.   |.- -.  -.- -.   |.  -.  -.-  .   |
LOW TOM  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   . X |
HAT      |.   .   x x X x |x   .   x x X x |x x X   x x X x |x x X x x x X   |
OPEN HAT |.   . x .   .   |.   . x .   .   |.   . x .   .   |.   .   .   .   |
CRASH    |X   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |
PERC     |.o ox  o.oxoxo o|.o ox  o.oxoxo o|.o ox  o.oxoxo o|.o ox  oxoxox   |
```

BOOGIE

```
KICK     |X   X   X   X   |X   X   X   X   |X   X   X   X   |X   X   X   X   |
SNARE    |.   X   .   X   |.   X   .   X   |.   X   .   X   |.   X   .   Xx X|
GHOST    |.   .   .   . - |.   .   .   . - |.   .  -.   . - |.  -.   .  -.   |
LOW TOM  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   . X |
HAT      |.oxoXo  x xoX  o|xoxoXo  x xoX  o|xoxoXo oxoxoXo o|xoxoXo oxoxoX   |
OPEN HAT |.   . x .   . x |.   . x .   . X |.   . X .   . X |.   . x .   .   |
CRASH    |X   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |
PERC     |. x x x . x .   |. x x x . x .   |. x x x . x .   |. x x x . x o   |
```

MOTORIK

```
KICK     |X X . XxX x .   |X X . XxX X .   |X X . xxX X . x |X X . X X X .   |
SNARE    |.   X   .   X   |.   X   .   X   |.   X   .   X   |.   X   .   Xx x|
GHOST    |.  -.   .  -.   |.  -.   .  -.   |.  -.  -.  -.   |.  -.   .   .   |
LOW TOM  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   . X |
HAT      |. x X   x   X   |x x X   x   X   |x x X   x x X x |x x X x x x X   |
OPEN HAT |.   . x .   .   |.   . x .   .   |.   . x .   .   |.   .   .   .   |
CRASH    |X   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |
```

## DESTROY

Default settings (the default matrix and probabilities) at MASTER AMOUNT 100%, and CHAOS takes, over 200 seeds of every recipe (4 bars). Per break: hits each effect took, hits added (stutter repeats) and dropped (tape stop).

| Settings | STUTTER | PITCH | REVERSE | GATE | TAPE STOP | Added (max) | Dropped |
|---|---|---|---|---|---|---|---|
| DEFAULT | 8.6 | 4.8 | 2.8 | 8.4 | 1.9 | 21.2 (50) | 0.4 |
| CHAOS | 14.0 | 9.9 | 5.7 | 14.7 | 3.3 | 47.0 (262) | 1.5 |
