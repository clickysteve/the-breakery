# Evaluation report (generated)

Written by `npm run evaluate` (scripts/evaluate.test.ts). 20 breaks per recipe and engine, default recipes, seeds 1000–1019. Do not edit by hand.

Numbers describe structure only. They cannot say whether a break grooves: see the listening test in [EVALUATION.md](EVALUATION.md).

## 1. The original four recipes, two bars: engine 1 / engine 2 / random

Each cell: **engine 1 / engine 2 / random baseline** (the engine-2 break's hits placed uniformly at random on the sixteenth grid; – where a random placement says nothing).

| Metric | FUNK | HIP-HOP | JUNGLE | BROKEN | What it shows |
|---|---|---|---|---|---|
| Bars with snare accents on 2 and 4 | 0.82 / 0.93 / 0.03 | 0.95 / 1.00 / 0.03 | 0.70 / 0.38 / 0.05 | 0.50 / 0.50 / 0.00 | the backbeat anchor (BROKEN displaces it, HALF-TIME has one on 3) |
| Ghosts within a 16th of any snare accent | 0.66 / 0.62 / 0.44 | 0.78 / 0.72 / 0.47 | 0.52 / 0.61 / 0.55 | 0.60 / 0.68 / 0.53 | engine 1’s metric |
| Ghosts within two 16ths of a true backbeat | 0.78 / 0.80 / 0.48 | 0.83 / 0.79 / 0.50 | 0.69 / 0.87 / 0.43 | 0.74 / 0.87 / 0.55 | ghosts relate to the backbeat, not just to any snare |
| Kicks on a snare accent (per bar) | 0.05 / 0.05 / 0.88 | 0.00 / 0.00 / 0.57 | 0.03 / 0.13 / 1.05 | 0.05 / 0.05 / 0.93 | kick and snare interlock (HARDCORE layers a floor kick on purpose) |
| Later-bar similarity to bar 1 (Jaccard) | 0.81 / 0.58 / 0.23 | 0.82 / 0.61 / 0.11 | 0.68 / 0.32 / 0.16 | 0.77 / 0.49 / 0.13 | bars are related, with variation |
| Kick/snare syncopation per bar | 4.25 / 3.60 / 5.60 | 3.08 / 2.65 / 5.13 | 4.53 / 3.63 / 5.40 | 5.15 / 4.25 / 5.92 | a controlled amount, not noise |
| Hat velocity drift between bars | 3.04 / 3.56 / 14.80 | 3.70 / 6.82 / 9.56 | 2.80 / 7.04 / 10.60 | 2.65 / 6.54 / 9.63 | lower = a repeating accent cycle |
| Mean |microtiming| (ms) | 1.13 / 1.88 / – | 1.40 / 2.61 / – | 0.42 / 0.77 / – | 0.79 / 1.28 / – | engine 1 was judged too subtle |
| Beat-2 backbeat timing (ms) | 1.88 / 5.11 / – | 2.83 / 8.25 / – | 0.40 / 1.39 / – | 0.79 / 2.24 / – | laid back |
| Beat-4 backbeat timing (ms) | 1.61 / 1.79 / – | 2.58 / 3.69 / – | 0.32 / 0.28 / – | 0.51 / 0.29 / – | nearer the grid than beat 2 in engine 2 |
| Chopped / rolled hits per bar | 0.00 / 0.10 / – | 0.00 / 0.07 / – | 0.00 / 2.92 / – | 0.00 / 0.33 / – | event-level resequencing |
| Hits per bar | 27.00 / 23.23 / – | 16.20 / 14.60 / – | 21.35 / 20.20 / – | 24.23 / 20.35 / – |  |

## 2. Every engine-2 recipe, four bars: generated / random

| Metric | FUNK | HIP-HOP | JUNGLE | BROKEN | BOOM BAP | HARDCORE | D&B | HALF-TIME | GARAGE | ELECTRO | BREAKCORE |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Bars with snare accents on 2 and 4 | 0.9 / 0.0 | 1.0 / 0.0 | 0.5 / 0.0 | 0.5 / 0.0 | 1.0 / 0.0 | 0.7 / 0.0 | 0.9 / 0.0 | 0.0 / 0.0 | 1.0 / 0.0 | 1.0 / 0.0 | 0.3 / 0.1 |
| Ghosts within a 16th of any snare accent | 0.6 / 0.4 | 0.7 / 0.4 | 0.6 / 0.5 | 0.7 / 0.4 | 0.1 / 0.0 | 0.6 / 0.4 | 0.6 / 0.4 | 0.5 / 0.2 | 0.6 / 0.3 | 0.0 / 0.0 | 0.5 / 0.6 |
| Ghosts within two 16ths of a true backbeat | 0.8 / 0.4 | 0.8 / 0.5 | 0.9 / 0.4 | 0.8 / 0.5 | 0.1 / 0.0 | 0.8 / 0.5 | 0.8 / 0.3 | 0.7 / 0.3 | 0.8 / 0.4 | 0.0 / 0.0 | 0.5 / 0.3 |
| Kicks on a snare accent (per bar) | 0.0 / 0.6 | 0.0 / 0.4 | 0.1 / 0.8 | 0.0 / 0.9 | 0.0 / 0.4 | 1.6 / 1.1 | 0.0 / 0.5 | 0.0 / 0.3 | 0.0 / 0.4 | 0.4 / 0.5 | 0.0 / 1.4 |
| Later-bar similarity to bar 1 (Jaccard) | 0.7 / 0.3 | 0.8 / 0.1 | 0.5 / 0.1 | 0.7 / 0.1 | 0.9 / 0.2 | 0.7 / 0.3 | 0.7 / 0.2 | 0.7 / 0.2 | 0.9 / 0.2 | 0.9 / 0.3 | 0.5 / 0.2 |
| Kick/snare syncopation per bar | 3.6 / 5.8 | 2.6 / 5.3 | 3.6 / 5.8 | 4.4 / 5.8 | 2.8 / 5.5 | 1.1 / 5.5 | 2.1 / 5.8 | 1.7 / 4.9 | 2.2 / 5.6 | 3.2 / 5.9 | 3.7 / 5.6 |
| Hat velocity drift between bars | 3.2 / 14.9 | 4.2 / 11.4 | 4.7 / 12.6 | 4.1 / 11.6 | 1.3 / 11.8 | 3.1 / 15.9 | 3.0 / 12.2 | 2.7 / 14.0 | 1.4 / 15.6 | 0.5 / 15.3 | 3.9 / 14.8 |
| Mean |microtiming| (ms) | 2.2 | 2.6 | 0.9 | 1.4 | 0.2 | 0.7 | 0.4 | 0.7 | 0.3 | 0.0 | 0.2 |
| Beat-2 backbeat timing (ms) | 6.0 | 8.7 | 1.4 | 2.2 | 0.3 | 1.1 | 0.4 | 0.0 | 0.2 | 0.0 | 0.2 |
| Beat-4 backbeat timing (ms) | 2.7 | 4.1 | 0.5 | 0.7 | 0.1 | 0.5 | 0.2 | 0.0 | 0.1 | 0.0 | 0.1 |
| Chopped / rolled hits per bar | 0.3 | 0.3 | 2.4 | 0.6 | 0.1 | 1.5 | 1.0 | 0.6 | 0.5 | 0.0 | 8.7 |
| Hits per bar | 23.4 | 14.6 | 20.0 | 20.1 | 13.4 | 25.6 | 16.9 | 17.3 | 21.1 | 21.1 | 27.7 |

Default tempo: FUNK 100, HIP-HOP 90, JUNGLE 165, BROKEN 126, BOOM BAP 92, HARDCORE 140, D&B 174, HALF-TIME 170, GARAGE 132, ELECTRO 120, BREAKCORE 190 BPM.

## 3. Pattern lengths (engine 2, FUNK and JUNGLE): later-bar similarity to bar 1

| Bars | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| FUNK | 1.00 | 0.58 | 0.71 | 0.75 | 0.73 | 0.78 | 0.78 | 0.79 |
| JUNGLE | 1.00 | 0.32 | 0.43 | 0.53 | 0.59 | 0.62 | 0.62 | 0.63 |
| Phrase plan | A | A T | A B T | A B A T | A B A B T | A B A F A T | A B A F A A T | A B A F A A2 B T |

## 4. The 20 FUNK breaks, engine 2 (listening test A)

Legend: X ≥ 100 velocity, x ≥ 70, o ≥ 45, - softer (ghosts), ~ a hit between sixteenths (32nd, roll), . beat with no hit. Load each with RECIPE ▸ FUNK, 2 bars, ENGINE 2 and its SEED; switch to ENGINE 1 for the same seed to compare.

### 1. Seed 1000 (A T, ride, beats)

```
KICK     |X X .  x.   .x  |X X .  x.   .X  |
SNARE    |.   X   .   X   |.   X   .   X xX|
GHOST    |.  -. - -  -.   |.  -. - -  -.   |
RIDE     |x   . x x   .   |x   . x x   .   |
```

### 2. Seed 1001 (A T, hats, backbeat)

```
KICK     |X   .x x.   . X |X   .x x.   .  x|
SNARE    |.   X   .   X  X|.   X   .   X   |
GHOST    |.- -.   -  -.   |.- -.   .- -.   |
HAT      |.oxoXoxoxoxoXoxo|xoxoXoxoxoxoXo  |
CRASH    |X   .   .   .   |.   .   .   .   |
PERC     |o  o. o . o .o  |o  o. o .  o.   |
```

### 3. Seed 1002 (A T, hats, alternate)

```
KICK     |X  x.  x.   .   |X  x.  x.   . X |
SNARE    |.   X   .   X   |.   X   .   X  ~|
GHOST    |.   .-  .  -.   |.   .-  .  -.   |
HAT      |xoxoxoxoxoxoXoxo|xoxoXoxoxoxoxo  |
```

### 4. Seed 1003 (A T, hats, alternate)

```
KICK     |X   .x  . X .   |X   .x  . X .  X|
SNARE    |.   X   .X  X   |.   X   .X  X   |
GHOST    |. --. --.  -.-  |. --. --.  -.   |
HIGH TOM |.   .   .   .   |.   .   .   .  X|
MID TOM  |.   .   .   .   |.   .   .   . X |
LOW TOM  |.   .   .   .   |.   .   .   .X  |
HAT      |xo oxo oxo  xo o|xo oxo oxo  x   |
OPEN HAT |.   .   . x .   |.   .   . x .   |
```

### 5. Seed 1004 (A T, hats, beats)

```
KICK     |Xx  .  x. X .   |Xx  .  x.  X.  X|
SNARE    |.   X   .   X   |.   X   .   X  X|
GHOST    |.  -.- --  -.-  |.  -.- -.- -. - |
HAT      |xoxoxo  xoxoXoxo|xoxoXo  XoxoXoxo|
OPEN HAT |.   . x .   .   |.   . x .   .   |
CRASH    |.   .   .   .   |.   .   .   .  X|
```

### 6. Seed 1005 (A T, hats, tresillo)

```
KICK     |X   . Xx.   .   |X   . Xx.x  . X |
SNARE    |.   X   .   X   |.   X   .   X   |
GHOST    |.- -.- -.  -.-  |.- -.- -.  -.   |
HIGH TOM |.   .   .   .   |.   .   .   .  ~|
MID TOM  |.   .   .   .   |.   .   .   . XX|
LOW TOM  |.   .   .   .   |.   .   .   .X  |
HAT      |x  ox xox xox xo|x  ox xox xox   |
PERC     |. o .o  o  o.  o|. o .o  o  o.   |
```

### 7. Seed 1006 (A T, hats, alternate)

```
KICK     |X   . Xx.x  .   |X   . XX. X .  X|
SNARE    |.   X   .   X   |.   X   . ~~Xx  |
GHOST    |.  -.-  .  -. - |.  -.-  .   .   |
HIGH TOM |.   .   .   .   |.   .   .   . X |
LOW TOM  |.   .   .   .   |.   .   .   .  X|
HAT      |xoxoxoxoxoxoxoxo|xox xox xo  x   |
CRASH    |.   .   .   .   |.   .   .   .  X|
```

### 8. Seed 1007 (A T, hats, alternate)

```
KICK     |X   . Xx.  x. X |X   . Xx. xx. XX|
SNARE    |.   X   .   X   |.   X   .   X   |
GHOST    |. --.   .-- .   |. --.   .-- .   |
HIGH TOM |.   .   .   .   |.   .   .  X.   |
MID TOM  |.   .   .   .   |.   .   .   .Xx |
LOW TOM  |.   .   .   .   |.   .   .   .  X|
HAT      |x ~ x ~ x ~ x~~ |x ~ x ~ x ~ x~  |
RIDE     |.   . x .   . xx|.   . x .   .   |
```

### 9. Seed 1008 (A T, hats, beats)

```
KICK     |X X .  x.   .xX |X X .  x.   . XX|
SNARE    |.   X   .  X.   |.   X   .  Xx   |
GHOST    |.  -.-  . - .  -|.  -.-  . - .   |
HIGH TOM |.   .   .   .   |.   .   .   .X  |
LOW TOM  |.   .   .   .   |.   .   .   .  X|
HAT      |x  ox  ox xox  o|x  ox  ox xo.   |
RIDE     |. x . x .   .   |. x . x .   .   |
CRASH    |.   .   .   .   |.   .   .   .  X|
```

### 10. Seed 1009 (A T, hats, beats)

```
KICK     |Xx  .x  . X . X |Xx  .x  .X  .X  |
SNARE    |.   X   .   X   |.   X   .   X   |
GHOST    |.  -.   -  -.   |.  -.  -. - .   |
HIGH TOM |.   .   .   .   |.   .   .   .X  |
MID TOM  |.   .   .   .   |.   .   .   . X |
LOW TOM  |.   .   .   .   |.   .   .   .  X|
HAT      |xoxoXoxoxoxoxo  |x xox xox xox   |
OPEN HAT |.   .   .   . x |.   .   .   .   |
PERC     |.   o   .   o   |.   o   .  o.   |
```

### 11. Seed 1010 (A T, hats, beats)

```
KICK     |X  x.x x.   .   |X  x.x x.   . x |
SNARE    |.   X   .   X   |.   X   .   X xX|
GHOST    |. --.   .  -.   |. --.   .   .   |
HAT      |xo  xoxoxoxoXoxo|xo  xoxoxoxoXo  |
OPEN HAT |. x .   .   .   |. x .   .   .   |
```

### 12. Seed 1011 (A T, hats, backbeat)

```
KICK     |X   .  x. Xx.   |X   .  x. Xx.x  |
SNARE    |.   X   .X  X   |.   X   xX  X   |
GHOST    |.  -.- -. - .-- |.  -.- -.   .   |
HIGH TOM |.   .   .   .   |.   .   . X .   |
LOW TOM  |.   .   .   .   |.   .   .   . X |
HAT      |xoxoXoxoxoxoXoxo|xoxoXoxo.   .   |
PERC     |. o .o  o   o  o|. o .o  .   .   |
```

### 13. Seed 1012 (A T, hats, beats)

```
KICK     |Xx  .  x. X .   |Xx  .  x.X  .   |
SNARE    |.   X   .   X   |.   X x . X X  x|
GHOST    |. --.   .   .-- |. --.   .   .   |
HIGH TOM |.   .   .   .   |.   .   X   .   |
LOW TOM  |.   .   .   .   |.   .   .   . X |
HAT      |x   X x x x x x |.   .o  .   .   |
OPEN HAT |. x .   .   .   |. x .   .   .   |
```

### 14. Seed 1013 (A T, ride, offbeats)

```
KICK     |Xx  .  x.   .  x|Xx  .  x.   .  x|
SNARE    |.   X   .   X   |.   X   .   Xx  |
GHOST    |.  -.~- .  -.-  |.  -.~- .   .   |
HIGH TOM |.   .   .   .   |.   .   .   . X |
LOW TOM  |.   .   .   .   |.   .   .   .  X|
HAT      |.   .   .   .   |x~~ x~~ x~~ X   |
RIDE     |.  x. x .x  x x |.   .   .   .   |
CRASH    |X   .   .   .   |.   .   .   .   |
```

### 15. Seed 1014 (A T, hats, backbeat)

```
KICK     |X   .x  . x .x  |X   .x  . X .   |
SNARE    |.   X   .   X   |.   X   .   X   |
GHOST    |.-  .   .  -.  -|.-  .   .  -.   |
HIGH TOM |.   .   .   .   |.   .   .   .X  |
MID TOM  |.   .   .   .   |.   .   .   . X |
LOW TOM  |.   .   .   .   |.   .   .   .  X|
HAT      |x x X x x xoX x |.ox . x x   .   |
```

### 16. Seed 1015 (A T, hats, alternate)

```
KICK     |X   .x x.   . X |X   .x x.   .   |
SNARE    |.   X   .   X   |.   X   .   X xX|
GHOST    |.- ~.   .  -.- -|.- ~.   .  -.   |
HAT      |. x . x x x .   |.   .   .   .   |
RIDE     |.   .   .   .   |.   .   x x x   |
PERC     |.   o   .   o o |.   o   .   .o  |
```

### 17. Seed 1016 (A T, hats, backbeat)

```
KICK     |X   . Xx. X .   |X   . XX. X . X |
SNARE    |.   X   .  X.  x|.   X   .  X.   |
GHOST    |.  -.   . - -   |.  -.   . - .   |
HIGH TOM |.   .   .   .   |.   .   .X  .   |
MID TOM  |.   .   .   .   |.   .   .   .X X|
LOW TOM  |.   .   .   .   |.   .   .   .  ~|
HAT      |.o  .   x   xox |x~  x ~ x~  x   |
OPEN HAT |. x .   . x .   |. x .   . x .   |
CRASH    |X   .   .   .   |.   .   .   .   |
PERC     |.o  .o  o  o. o |.o  .o  o  o.   |
```

### 18. Seed 1017 (A T, hats, beats)

```
KICK     |X X .  x.x  .   |X X .  x.x  . X~|
SNARE    |.   X   .   X   |.   X   .   X   |
GHOST    |.  -.- -.  -.   |.  -.- -.   .   |
HIGH TOM |.   .   .   .   |.   .   .   .X  |
MID TOM  |.   .   .   .   |.   .   .   . XX|
LOW TOM  |.   .   .   .   |.   .   .   .  ~|
HAT      |x x X x x x X xo|.   . x x x .   |
```

### 19. Seed 1018 (A T, hats, beats)

```
KICK     |X   .  x.x  . X |X   .  x. x . X~|
SNARE    |.   X   .   X   |.   X   .  xX   |
GHOST    |.  -.   . ~-.  -|.  -.   . ~-.   |
HIGH TOM |.   .   .   .   |.   .   .   .X  |
MID TOM  |.   .   .   .   |.   .   .   . XX|
LOW TOM  |.   .   .   .   |.   .   .   .  ~|
HAT      |.oxoxoxoxoxoxo  |xoxoxoxoxoxoXo  |
OPEN HAT |.   .   .   . x |.   .   .   .   |
RIDE     |.   .   .   .  x|.   .   .   .   |
CRASH    |X   .   .   .   |.   .   .   .   |
PERC     |. o .o  o  o.  o|. o .o  .o o.   |
```

### 20. Seed 1019 (A T, ride, backbeat)

```
KICK     |X ~ . ~ . ~ .~  |X ~ . ~ X ~ . x |
SNARE    |.   X   .   X   |.   X   .   X   |
GHOST    |. ~ .   . ~ .~  |. ~ .   . ~ .   |
HIGH TOM |.   .   .   .   |.   .   .   .X  |
MID TOM  |.   .   .   .   |.   .   .   . XX|
LOW TOM  |.   .   .   .   |.   .   .   .  ~|
RIDE     |x   x   x   x o |. x . x . x .   |
PERC     |.~  .~  o ~ . ~ |.~  .~  .~  .~  |
```


## 5. Five JUNGLE breaks, 8 bars, engine 2 (listening test C)

Legend: X ≥ 100 velocity, x ≥ 70, o ≥ 45, - softer (ghosts), ~ a hit between sixteenths (32nd, roll), . beat with no hit. RECIPE ▸ JUNGLE, 8 bars.

### 1. Seed 1000 (A A2 B F A A2 A2 T, ride, alternate)

```
KICK     |X   .   .  x.   |X   .   .  x.   |X   .   .   .   |X   .   .  x.   |X   .   .  x.   |X   .   .  x.   |X   .   .  x.   |X   X   .  x.   |
SNARE    |.   .   X   .   |.   .   X   .   |.   .~~~X X .   |.   .   X   .  X|.   .   X   .   |.   .   X   .   |.   .   X   .   |.  ~~~  X   . x~|
GHOST    |.   . --.   .   |.   . --.   .   |.   .   .   .   |.   . --.   .   |.   . --.   .   |.   . --.   .   |.   . --.   .   |.   .   .   .   |
HIGH TOM |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   . X |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   . X .   .   |
MID TOM  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .X  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .X  X   |
LOW TOM  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   X   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .X  |
HAT      |. x x   .   . x |. x x   .   .   |. x .   .   .   |. x x   .   .   |. x x   .   . x |. x x   .   .   |. x x   .   .   |. x .   .   .   |
RIDE     |x  x. x x   .   |x  x. x x   .~~~|x   x   x   x o |x  x. x x   .   |x  x. x x   .   |x  x. x x   .~~~|x  x. x x   .~~~|x   .   .   . o |
```

### 2. Seed 1001 (A A2 B F A B A T, hats, tresillo)

```
KICK     |X   .x x.   .   |X   .x x.   .   |X   .x x.   .x x|X   .x x.   .   |X   .x x.   .   |X   .x x.   .   |X   .x x.   .   |X   .x x.   .   |
SNARE    |.   X   .   X  X|.~~~X   .   X  X|.   X   .   X   |.   X   .   X  X|.   X   .   X  X|.   .~~~X   .   |.   X   .   X  X|.   X   .   X x~|
GHOST    |.~--.   ~-  .   |.   .   .---.   |.~--.   .---.   |.~--.   .---.   |.~--.   ~-  .   |.   .   .   .   |.~--.   ~-  .   |.~--.   .   .   |
HIGH TOM |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   . X .   .   |
MID TOM  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .X  .   |
LOW TOM  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   . X |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .X  |
HAT      |. xox xox xox xo|x   x xox xox xo|x xox xox xox xo|x xox xox xox x |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .~~~.   |
RIDE     |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.  ox   x  ox   |x  ox   x  ox   |x  ox   x  ox   |x  ox   .   .   |
CRASH    |X   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |X   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |
```

### 3. Seed 1002 (A A2 B F A A2 B T, hats, backbeat)

```
KICK     |X   .x  . Xx.   |X   .x  . Xx.   |X   .x  . Xx.   |X   .x  . Xx.   |X   .x  . xx.   |X   .x  . xx.   |X   .x  . Xx.x  |X   .x  . XxX   |
SNARE    |.   X  X.   X   |.   X  X.   X   |.   .   X   .   |.   X  X.   X  X|.   X  X.   X   |.   X  X.   X   |.   X  X.~~~X  X|.   X  X.   .XX~|
GHOST    |.  -.-  .  -.   |.  -.-  .  -.-  |.   .  -.-  .   |.  -.-  .  -.   |.  -.-  .  -.   |.  -.-  .  -.-  |.  -.-  .   .-  |.  -.-  .   .   |
HIGH TOM |.   .   .   .   |.   .   .   .   |.   .   .   .~  |.   .   .   .X  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |
MID TOM  |.   .   .   .   |.   .   .   .   |.   .   .   . ~ |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |
LOW TOM  |.   .   .   .   |.   .   .   .   |.   .   .   .  ~|.   .   .   . X |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   X   |
HAT      |x  ox xox xox   |x  ox xox xox   |xoxoxoxoXoxox   |x  ox xox xox   |x  ox xox xox   |x  ox xox xox   |xoxoXoxox   Xo  |xoxoXoxoxox .   |
OPEN HAT |.   .   .   . x |.   .   .   . x |.   .   .   .   |.   .   .   .   |.   .   .   . x |.   .   .   . x |.   .   .   . x |.   .   .   .   |
```

### 4. Seed 1003 (A A2 B F A A A2 T, ride, backbeat)

```
KICK     |X   .   . X .   |X   .   . X .   |X   .   . X .   |X   .   . X . X |X   .   . X .   |X   .   . X .   |X   .   . X .   |X   .   . X X   |
SNARE    |.   X   .X  X   |.~~~X   .X  X   |.   .   X   .   |.   X   .X  X  X|.   X   .X  X   |.   X   .X  X   |.~~~X   .X  X   |.   X   .X  . X~|
GHOST    |. ~-.   .  -.-  |.   .-  .  -.-  |.   .  -.-  .   |. ~-.-  .  -.   |. ~-.   .  -.-  |. ~-.   .  -.-  |.   .-  .  -.-  |. ~-.-  .   .   |
HIGH TOM |.   .   .   .   |.   .   .   .   |.   .   .  X.   |.   .   .   .X  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .  X.   |
MID TOM  |.   .   .   .   |.   .   .   .   |.   .   .   X   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |
LOW TOM  |.   .   .   .   |.   .   .   .   |.   .   .   .X  |.   .   .   . X |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .X  |
HAT      |.   .   .   .   |.   .   .   .   |.   .   .   .   |xo oxo  xo ox   |.   .   .   .   |.   .   .   .   |.   .   .   .   |xo oxo  xo  .   |
OPEN HAT |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   . x .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   . x .   .   |
RIDE     |. x . x . x . x |.   . x . x . x |. x . x . x . x |.   .   .   .   |. x . x . x . x |. x . x . x . x |.   . x . x . x |.   .   .   .   |
PERC     |.   o   .   o   |.   o   .   o   |.   o   .   .   |.   o   .   o   |.   o   .   o   |.   o   .   o   |.   o   .   o   |.   o   .   .   |
```

### 5. Seed 1004 (A A2 B F A A2 A T, ride, beats)

```
KICK     |X   .x  . X .   |X   .x  .   .   |X   .x  .   X   |X   .x  .   .   |X   .x  . X .   |X   .x  .   .   |X   .x  . X .   |X   .x  .   X   |
SNARE    |.   X   .   X   |.   X   .   X   |.   X  x.  X.   |.   X   .   X  X|.   X   .   X   |.   X   .   X   |.   X   .   X   |.   X   .   . X~|
GHOST    |.  -. - ~- -.   |.- -. - .- -.   |.- -. - --- .   |.- -. - .- -.   |.  -. - ~- -.   |.- -. - .- -.   |.  -. - ~- -.   |.- -. - .   .   |
HIGH TOM |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   . X |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .  X.   |
LOW TOM  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .X  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .X  |
RIDE     |. x x x x x x x |x~~~x x x x x x |x xox x x x x x |x~~~x x x x x   |. x x x x x x x |x~~~x x x x x x |x x x x x x x x |x x x x x x .   |
CRASH    |X   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |X   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |
PERC     |. o .o  o  o. o |. o .o  o  o. o |. o .o  o  o. o |. o .o  o  o.   |. o .o  o  o. o |. o .o  o  o. o |. o .o  o  o. o |. o .o  o   .   |
```

