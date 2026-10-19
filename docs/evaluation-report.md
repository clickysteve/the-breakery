# Evaluation report (generated)

Written by `npm run evaluate` (scripts/evaluate.test.ts). 20 breaks per recipe and engine, default recipes, seeds 1000–1019. Do not edit by hand.

Numbers describe structure only. They cannot say whether a break grooves: see the listening test in [EVALUATION.md](EVALUATION.md).

## 1. The original four recipes, two bars: engine 1 / engine 2 / random

Each cell: **engine 1 / engine 2 / random baseline** (the engine-2 break's hits placed uniformly at random on the sixteenth grid; – where a random placement says nothing).

| Metric | FUNK | HIP-HOP | JUNGLE | BROKEN | What it shows |
|---|---|---|---|---|---|
| Bars with snare accents on 2 and 4 | 0.82 / 0.90 / 0.03 | 0.95 / 1.00 / 0.05 | 0.70 / 0.47 / 0.05 | 0.50 / 0.63 / 0.03 | the backbeat anchor (BROKEN displaces it, HALF-TIME has one on 3) |
| Ghosts within a 16th of any snare accent | 0.66 / 0.62 / 0.34 | 0.78 / 0.84 / 0.40 | 0.52 / 0.54 / 0.58 | 0.60 / 0.61 / 0.47 | engine 1’s metric |
| Ghosts within two 16ths of a true backbeat | 0.78 / 0.81 / 0.46 | 0.83 / 0.84 / 0.57 | 0.69 / 0.86 / 0.50 | 0.74 / 0.77 / 0.53 | ghosts relate to the backbeat, not just to any snare |
| Kicks on a snare accent (per bar) | 0.05 / 0.03 / 0.88 | 0.00 / 0.00 / 0.60 | 0.03 / 0.15 / 1.00 | 0.05 / 0.07 / 0.72 | kick and snare interlock (HARDCORE layers a floor kick on purpose) |
| Later-bar similarity to bar 1 (Jaccard) | 0.81 / 0.72 / 0.35 | 0.82 / 0.76 / 0.19 | 0.68 / 0.48 / 0.18 | 0.77 / 0.64 / 0.27 | bars are related, with variation |
| Kick/snare syncopation per bar | 4.25 / 4.00 / 5.63 | 3.08 / 3.02 / 5.85 | 4.53 / 3.92 / 5.45 | 5.15 / 4.95 / 6.35 | a controlled amount, not noise |
| Hat velocity drift between bars | 3.04 / 3.30 / 19.28 | 3.70 / 4.10 / 10.91 | 2.80 / 2.90 / 11.42 | 2.65 / 2.98 / 19.60 | lower = a repeating accent cycle |
| Mean |microtiming| (ms) | 1.13 / 2.00 / – | 1.40 / 2.43 / – | 0.42 / 0.79 / – | 0.79 / 1.17 / – | engine 1 was judged too subtle |
| Beat-2 backbeat timing (ms) | 1.88 / 5.90 / – | 2.83 / 8.19 / – | 0.40 / 1.29 / – | 0.79 / 2.06 / – | laid back |
| Beat-4 backbeat timing (ms) | 1.61 / 2.10 / – | 2.58 / 3.33 / – | 0.32 / 0.44 / – | 0.51 / 0.48 / – | nearer the grid than beat 2 in engine 2 |
| Chopped / rolled hits per bar | 0.00 / 0.10 / – | 0.00 / 0.07 / – | 0.00 / 3.15 / – | 0.00 / 0.47 / – | event-level resequencing |
| Hits per bar | 27.00 / 27.40 / – | 16.20 / 16.40 / – | 21.35 / 20.35 / – | 24.23 / 24.30 / – |  |

## 2. Every engine-2 recipe, four bars: generated / random

| Metric | FUNK | HIP-HOP | JUNGLE | BROKEN | BOOM BAP | HARDCORE | D&B | HALF-TIME | GARAGE | ELECTRO | BREAKCORE |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Bars with snare accents on 2 and 4 | 0.9 / 0.0 | 1.0 / 0.0 | 0.6 / 0.0 | 0.6 / 0.0 | 1.0 / 0.0 | 0.7 / 0.0 | 1.0 / 0.0 | 0.0 / 0.0 | 1.0 / 0.0 | 1.0 / 0.0 | 0.4 / 0.1 |
| Ghosts within a 16th of any snare accent | 0.6 / 0.4 | 0.8 / 0.4 | 0.6 / 0.5 | 0.6 / 0.4 | 0.0 / 0.0 | 0.6 / 0.5 | 0.6 / 0.4 | 0.5 / 0.2 | 0.5 / 0.3 | 0.0 / 0.0 | 0.5 / 0.5 |
| Ghosts within two 16ths of a true backbeat | 0.8 / 0.5 | 0.8 / 0.4 | 0.9 / 0.4 | 0.8 / 0.5 | 0.0 / 0.0 | 0.8 / 0.5 | 0.7 / 0.4 | 0.7 / 0.3 | 0.7 / 0.3 | 0.0 / 0.0 | 0.6 / 0.3 |
| Kicks on a snare accent (per bar) | 0.0 / 0.7 | 0.0 / 0.5 | 0.1 / 0.9 | 0.1 / 0.7 | 0.0 / 0.5 | 1.7 / 1.2 | 0.0 / 0.6 | 0.0 / 0.1 | 0.0 / 0.5 | 0.0 / 0.5 | 0.1 / 1.4 |
| Later-bar similarity to bar 1 (Jaccard) | 0.8 / 0.4 | 0.9 / 0.2 | 0.6 / 0.2 | 0.8 / 0.3 | 1.0 / 0.2 | 0.7 / 0.3 | 0.8 / 0.4 | 0.7 / 0.4 | 0.9 / 0.4 | 0.9 / 0.5 | 0.5 / 0.4 |
| Kick/snare syncopation per bar | 4.2 / 5.8 | 3.0 / 5.6 | 3.7 / 5.9 | 5.2 / 5.7 | 3.0 / 5.5 | 1.1 / 5.1 | 2.9 / 5.1 | 2.0 / 5.7 | 3.6 / 5.5 | 4.2 / 5.0 | 3.7 / 4.9 |
| Hat velocity drift between bars | 3.0 / 20.2 | 3.7 / 11.5 | 2.8 / 11.3 | 2.8 / 18.9 | 0.7 / 11.1 | 2.1 / 19.5 | 1.8 / 16.6 | 1.9 / 18.1 | 0.7 / 18.7 | 0.5 / 17.7 | 1.4 / 19.4 |
| Mean |microtiming| (ms) | 2.1 | 2.5 | 0.9 | 1.4 | 0.2 | 0.7 | 0.4 | 0.9 | 0.3 | 0.0 | 0.2 |
| Beat-2 backbeat timing (ms) | 5.8 | 8.6 | 1.5 | 2.6 | 0.4 | 1.0 | 0.5 | 0.0 | 0.3 | 0.0 | 0.2 |
| Beat-4 backbeat timing (ms) | 2.4 | 3.9 | 0.7 | 0.8 | 0.1 | 0.4 | 0.2 | 0.0 | 0.1 | 0.0 | 0.1 |
| Chopped / rolled hits per bar | 0.3 | 0.2 | 2.8 | 0.5 | 0.1 | 1.9 | 1.2 | 0.7 | 0.5 | 0.0 | 10.6 |
| Hits per bar | 27.1 | 16.3 | 20.2 | 24.4 | 14.3 | 28.6 | 22.3 | 22.8 | 25.9 | 24.8 | 30.3 |

Default tempo: FUNK 100, HIP-HOP 90, JUNGLE 165, BROKEN 126, BOOM BAP 92, HARDCORE 140, D&B 174, HALF-TIME 170, GARAGE 132, ELECTRO 120, BREAKCORE 190 BPM.

## 3. Pattern lengths (engine 2, FUNK and JUNGLE): later-bar similarity to bar 1

| Bars | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| FUNK | 1.00 | 0.72 | 0.78 | 0.82 | 0.82 | 0.85 | 0.84 | 0.83 |
| JUNGLE | 1.00 | 0.48 | 0.61 | 0.60 | 0.67 | 0.76 | 0.73 | 0.72 |
| Phrase plan | A | A T | A A2 T | A A2 A T | A A2 A B T | A A2 A F A T | A A2 A F A B T | A A2 A F A A2 B T |

## 4. The 20 FUNK breaks, engine 2 (listening test A)

Legend: X ≥ 100 velocity, x ≥ 70, o ≥ 45, - softer (ghosts), ~ a hit between sixteenths (32nd, roll), . beat with no hit. Load each with RECIPE ▸ FUNK, 2 bars, ENGINE 2 and its SEED; switch to ENGINE 1 for the same seed to compare.

### 1. Seed 1000 (A T, hats, beats)

```
KICK     |X   .x x.   .x  |X   .x x.   .X  |
SNARE    |.   X   .   X   |.   X   .   X  X|
GHOST    |. --.   . --.   |. --.   . - .   |
HAT      |xoxoxoxoxoxoxo  |xoxoXoxoxoxoXo  |
OPEN HAT |.   .   .   . x |.   .   .   . x |
```

### 2. Seed 1001 (A T, hats, backbeat)

```
KICK     |Xx  .  x. X . X |Xx  .  x. Xx.   |
SNARE    |.   X   .   X  X|.   X   .   X  x|
GHOST    |. --.   . - .   |. --.   . - .   |
HAT      |.oxoXoxoxo  Xoxo|xoxoXoxoxo  Xo  |
OPEN HAT |.   .   . x .   |.   .   . x .   |
CRASH    |X   .   .   .   |.   .   .   .   |
PERC     |. o .o  o  o.  o|. o .o  o  o.   |
```

### 3. Seed 1002 (A T, hats, alternate)

```
KICK     |X   .x x. X .   |X   .x x. Xx. X |
SNARE    |.   X   .   X   |.   X   .   X  ~|
GHOST    |.  -.   .- -.-  |.  -.   .- -.-  |
HAT      |xoxoxo  xoxoxoxo|xoxoxo  xo  xo  |
OPEN HAT |.   . x .   .   |.   . x . x .   |
```

### 4. Seed 1003 (A T, hats, alternate)

```
KICK     |X   .x x. X .x  |X   .x x. X .   |
SNARE    |.   X   .X  X   |.   X   .X  X   |
GHOST    |.  -.   -  -.-  |.  -.   -   .   |
HIGH TOM |.   .   .   .   |.   .   .   .  X|
MID TOM  |.   .   .   .   |.   .   .   .Xx |
LOW TOM  |.   .   .   .   |.   .   .  X.   |
HAT      |xoxoxo  xoxoxoxo|xoxoXo  xoxoXo  |
OPEN HAT |.   . x .   .   |.   . x .   .   |
```

### 5. Seed 1004 (A T, hats, beats)

```
KICK     |X X .x x. X .   |X X .x x.   .  X|
SNARE    |.   X   .   X   |.   X   .   X  X|
GHOST    |. --.   .  -.-  |. --.   .   .-  |
HAT      |xoxoXo  xoxoXoxo|xoxoXo  XoxoXox |
OPEN HAT |.   . x .   .   |.   . x .   .   |
CRASH    |.   .   .   .   |.   .   .   .  X|
```

### 6. Seed 1005 (A T, hats, tresillo)

```
KICK     |X   .  x. X .x  |X   .  x.x  .xX |
SNARE    |.   X   .   X   |.   X   .   X   |
GHOST    |.  -.-  . --.   |.  -.-  . --.   |
HIGH TOM |.   .   .   .   |.   .   .   .  ~|
MID TOM  |.   .   .   .   |.   .   .   . XX|
LOW TOM  |.   .   .   .   |.   .   .   .X  |
HAT      |xoxxxoxoxo  xoxo|xoxxxoxoxo  xo  |
OPEN HAT |.   .   . x .   |.   .   . x .   |
```

### 7. Seed 1006 (A T, hats, alternate)

```
KICK     |X X .x x. X .   |X X .x x.   . X |
SNARE    |.   X   .   X   |.   X   . ~~Xx  |
GHOST    |.- -.  -.  -.   |.- -.  -.   .   |
HIGH TOM |.   .   .   .   |.   .   .   . X |
MID TOM  |.   .   .   .   |.   .   .   .  X|
LOW TOM  |.   .   .   .   |.   .   .   .  ~|
HAT      |xoxoxox xoxoXoxo|xoxoXox xo  xo  |
OPEN HAT |.   .  x.   .   |.   .  x.   .   |
```

### 8. Seed 1007 (A T, hats, alternate)

```
KICK     |X X .  x.   .x  |X X .  x.   .X X|
SNARE    |.   X   .   X   |.   X   .   X   |
GHOST    |. --.   .  -.  -|. --.   .-  .   |
HIGH TOM |.   .   .   .   |.   .   .  X.   |
MID TOM  |.   .   .   .   |.   .   .   .Xx |
LOW TOM  |.   .   .   .   |.   .   .   .  X|
HAT      |xoxoxoxoxoxoxo  |xoxoxoxoxoxoXo  |
OPEN HAT |.   .   .   . x |.   .   .   .   |
PERC     |.o  .o  o  o. o |.o  .o  o   .   |
```

### 9. Seed 1008 (A T, hats, beats)

```
KICK     |X X .  x. X .   |X x .  x. X x   |
SNARE    |.   X   .  X.   |.   X   .  X. x |
GHOST    |.  -.   .-  . - |.  -.   .-  .   |
HIGH TOM |.   .   .   .   |.   .   .   .X  |
LOW TOM  |.   .   .   .   |.   .   .   .  X|
HAT      |xoxoXo  xoxoxoxo|xoxoxo  xoxoXo  |
OPEN HAT |.   . x .   .   |.   . x .   .   |
```

### 10. Seed 1009 (A T, ride, beats)

```
KICK     |X X . Xx.   .x  |X X . Xx.   .xx |
SNARE    |.   X   .   X   |.   X   .   X   |
GHOST    |.- -.-  .  -.   |.- -.-  .   .   |
HIGH TOM |.   .   .   .   |.   .   .   .X  |
MID TOM  |.   .   .   .   |.   .   .   . XX|
LOW TOM  |.   .   .   .   |.   .   .   .  ~|
RIDE     |xoxoXoxoxoxoxoxo|xoxoXoxoxoxoXoxo|
```

### 11. Seed 1010 (A T, hats, beats)

```
KICK     |X X .x x.   .   |X X .x x.   .xx |
SNARE    |.   X   .   X   |.   X   .   X  ~|
GHOST    |.  -.   .  -.-  |.  -.   .  -.   |
HAT      |xoxoXoxoxoxoxoxo|xoxoxoxoxoxoXo  |
```

### 12. Seed 1011 (A T, hats, backbeat)

```
KICK     |X   .x x. X .   |X   .x x.   .  X|
SNARE    |.   X   .X  X   |.   X   xX  X   |
GHOST    |.  -.- -.  -.   |.  -.- -.   .   |
HIGH TOM |.   .   .   .   |.   .   . X .   |
LOW TOM  |.   .   .   .   |.   .   .   . X |
HAT      |xoxoXoxoxo  Xoxo|xoxoXoxo.   .   |
OPEN HAT |.   .   . x .   |.   .   .   .   |
CRASH    |.   .   .   .   |.   .   .   .  X|
```

### 13. Seed 1012 (A T, hats, beats)

```
KICK     |X   .x x. X .   |X   .x x.x  .   |
SNARE    |.   X   .   X   |.   X   x   X x~|
GHOST    |. --. - .   .-  |. --. - .  -.-  |
HIGH TOM |.   .   .   .   |.   .   . X .   |
LOW TOM  |.   .   .   .   |.   .   .   .  X|
HAT      |xoxoXoxoxoxoxo  |xoxoxoxoxoxoxo  |
OPEN HAT |.   .   .   . x |.   .   .   .   |
```

### 14. Seed 1013 (A T, ride, offbeats)

```
KICK     |X X .x x.   .x  |X X .x x.   .  X|
SNARE    |.   X   .   X   |.   X   .   Xx  |
GHOST    |.  ~.-  . ~-. - |.  ~.-  .  -.   |
HIGH TOM |.   .   .   .   |.   .   .   . X |
LOW TOM  |.   .   .   .   |.   .   .   .  X|
RIDE     |.oXoxoxoxoxoxoxo|xoXoxoxoxoXox   |
CRASH    |X   .   .   .   |.   .   .   .   |
PERC     |.   o   .   o o |.   o   .   o   |
```

### 15. Seed 1014 (A T, hats, backbeat)

```
KICK     |Xx  .  x.   . x |Xx  .  x.   .xX |
SNARE    |.   X   .   X   |.   X   .   X   |
GHOST    |.   .   .  -.- -|.   .   .- -.   |
HIGH TOM |.   .   .   .   |.   .   .   .X  |
MID TOM  |.   .   .   .   |.   .   .   . X |
LOW TOM  |.   .   .   .   |.   .   .   .  X|
HAT      |xoxoXoxoxoxoXox |xoxoXoxoxoxoX   |
OPEN HAT |.   .   .   .  x|.   .   .   .   |
```

### 16. Seed 1015 (A T, hats, alternate)

```
KICK     |X X .x  .x  .x  |X X .x x.   .x  |
SNARE    |.   X   .   X   |.   X   .   X   |
GHOST    |.-- .   .  -. - |.-- .   .- -. - |
HAT      |xoxoxoxoxoxoxo  |xoxoXoxoxoxoxo  |
OPEN HAT |.   .   .   . x |.   .   .   . x |
PERC     |.o  .o  o  o. o |.o  .o  o  o. o |
```

### 17. Seed 1016 (A T, hats, backbeat)

```
KICK     |X X . X .x  .   |X X . X X   . X |
SNARE    |.   X   .  X.  x|.   X   .  X.   |
GHOST    |.  -.   . - -   |.  -.   . - -   |
HIGH TOM |.   .   .   .   |.   .   .X  .   |
MID TOM  |.   .   .   .   |.   .   .   .X X|
LOW TOM  |.   .   .   .   |.   .   .   .  ~|
HAT      |.oxoXoxoxoxXxoxo|xoxoXoxoxoxXxo  |
CRASH    |X   .   .   .   |.   .   .   .   |
PERC     |.o  o  o. o . o |.o  o  o. o .   |
```

### 18. Seed 1017 (A T, hats, beats)

```
KICK     |X   . Xx.   .x  |X   . Xx.   . X~|
SNARE    |.   X   .   X   |.   X   .   X   |
GHOST    |.  -.   . --. - |.  -.   . --.   |
HIGH TOM |.   .   .   .   |.   .   .   .X  |
MID TOM  |.   .   .   .   |.   .   .   . XX|
LOW TOM  |.   .   .   .   |.   .   .   .  ~|
HAT      |xoxoXo  xoxoXoxo|xoxoxo  XoxoXo  |
OPEN HAT |.   . x .   .   |.   . x .   .   |
```

### 19. Seed 1018 (A T, hats, beats)

```
KICK     |X X .  x.   .x  |X X .  x.x  .xx~|
SNARE    |.   X   .   X   |.   X   .  xX   |
GHOST    |.   .   .~--.  -|.   .   .~ -.   |
HIGH TOM |.   .   .   .   |.   .   .   .X  |
MID TOM  |.   .   .   .   |.   .   .   . XX|
LOW TOM  |.   .   .   .   |.   .   .   .  ~|
HAT      |.oxoxoxoxoxoxoxo|xoxoxoxoxoxoXo  |
CRASH    |X   .   .   .   |.   .   .   .   |
PERC     |.   o   .   o o |.   o   .   o   |
```

### 20. Seed 1019 (A T, hats, backbeat)

```
KICK     |X X .x x.   .   |X X .x x.  x. X |
SNARE    |.   X   .   X   |.   X   .   X   |
GHOST    |.- -.   .  -.   |.- -.   .   .   |
HIGH TOM |.   .   .   .   |.   .   .   .X  |
MID TOM  |.   .   .   .   |.   .   .   . X |
LOW TOM  |.   .   .   .   |.   .   .   .  X|
HAT      |xoxoXoxoxoxoXo  |xoxoXoxoxoxoX   |
OPEN HAT |.   .   .   . x |.   .   .   .   |
CRASH    |.   .   .   .   |.   .   .   . X |
```


## 5. Five JUNGLE breaks, 8 bars, engine 2 (listening test C)

Legend: X ≥ 100 velocity, x ≥ 70, o ≥ 45, - softer (ghosts), ~ a hit between sixteenths (32nd, roll), . beat with no hit. RECIPE ▸ JUNGLE, 8 bars.

### 1. Seed 1000 (A A2 A F A A2 B T, ride, alternate)

```
KICK     |X   .x x.   .x  |X   .x x.   .   |X   .x x.   .x  |X   .x x.   .   |X   .x x.   .x  |X   .x x.   .   |X   .x x.   .   |X   .x x.   .   |
SNARE    |.   X   .   X   |.~~~X   .   X   |.   X   .   X   |.   X   .   X  X|.   X   .   X   |.~~~X   .   X   |.~~~X  x.   X   |.   ~~  .   X x~|
GHOST    |.  -. - .  ~.   |.   . - .  -. - |.  -. - .  ~.   |.  -. - .  -.   |.  -. - .  ~.   |.   . - .  -. - |.   . - .  -. - |.  -.   .   .   |
HIGH TOM |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   . X |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   . X .   .   |
MID TOM  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .X  .   |
LOW TOM  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .X  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .X  |
RIDE     |x x X x x x x x |x   x x x x X x |x x x x x x x x |x x x x x x x   |x x x x x x x x |x   x x x x x x |x   X x x x x x |x x x   .   .   |
```

### 2. Seed 1001 (A A2 A F A A2 B T, hats, tresillo)

```
KICK     |X X .x  .x  .   |X X .x  .xx .   |X x .x  .x  .   |X X .x  .xx .   |X X .x  .x  .   |X X .x  .xx .   |X X .x  .xx .X  |X X X X .xx .   |
SNARE    |.   X   .   X  X|.~~~X   .   X  X|.   X   .   X  X|.   X   .   X  X|.   X   .   X  X|.~~~X   .   X  X|.~~~X   . x X   |.   .   .   X x~|
GHOST    |. ~-. - .   .   |.   . - .  -. - |. ~-. - .   .   |. ~-. - .  -.   |. ~-. - .   .   |.   . - .  -. - |.   . - .  -. - |. ~ .   .   .   |
HIGH TOM |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   . X .   .   |
MID TOM  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .X  .   |
LOW TOM  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   . X |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .X  |
HAT      |. x x x x x x x |x   x x x x x   |x x x x x x x x |x x x x x o x   |. x x x x x x x |x   x x x x x   |x   x x x x x x |x x x   .~~~.   |
OPEN HAT |.   .   .   .   |.   .   .   . x |.   .   .   .   |.   .   .   . x |.   .   .   .   |.   .   .   . x |.   .   .   .   |.   .   .   .   |
CRASH    |X   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |X   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |
```

### 3. Seed 1002 (A A2 A F A A2 B T, hats, backbeat)

```
KICK     |X   .x x.   .   |X   .x x.   .   |X   .x x.   .   |X   .x x.   .   |X   .x x.   .   |X   .x x.   .   |X   .x x.   .   |X   .x x.   .   |
SNARE    |.   X   .   X   |.   X   .   X   |.   X   .   X   |.   X   .   X xX|.   X   .   X   |.   X   .   X   |.   .   X   .   |.~~~X   .x XXxx~|
GHOST    |.   .   . --.   |. --.   .  -.   |.   .   . --.   |. --.   .   .   |.   .   . --.   |. --.   .  -.   |.   . --.   .   |.   .   .   .   |
HIGH TOM |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .  X.   |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |
LOW TOM  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .X  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   . X .   |
HAT      |x x X x x   X x |x x X x x~~~X x |x x X x x   X x |x x X~~~x   .   |x x X x x   X x |x x X x x~~~X x |x x X x x   X x |x   X x x   .   |
OPEN HAT |.   .   . x .   |.   .   .   .   |.   .   . x .   |.   .   . x .   |.   .   . x .   |.   .   .   .   |.   .   . x .   |.   .   .   .   |
```

### 4. Seed 1003 (A A2 A F A A2 B T, hats, backbeat)

```
KICK     |X   . Xx.   .x  |X   . Xx.   .xx |X   . Xx.   .x  |X   . Xx.   .xx |X   . Xx.   .x  |X   . Xx.   .xx |X   . Xx.   .xx |X   . Xx.   Xxx |
SNARE    |.   X   .X  X   |.~~~X   .X  X   |.   X   .X  X   |.   X   .X  X  X|.   X   .X  X   |.~~~X   .X  X   |.   X   .X XX   |.   X   .X  .Xx~|
GHOST    |.~--.   .  -.   |.   .   . --.   |.~--.   .  -.   |.~--.   . --.   |.~--.   .  -.   |.   .   . --.   |.~--.   . - .   |.~--.   .   .   |
HIGH TOM |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .X  |.   .   .   .   |.   .   .   .   |.   .   .   . X |.   .   . X .   |
LOW TOM  |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   . X |.   .   .   .   |.   .   .   .   |.   .   .   .  X|.   .   .  X.   |
HAT      |x x X x x x X   |x   X x x x X   |x x X x x x X   |x x X x x x X   |x x X x x x X   |x   X x x x X   |x x X x x~~~X   |x x X x x   .   |
OPEN HAT |.   .   .   . x |.   .   .   . x |.   .   .   . x |.   .   .   .   |.   .   .   . x |.   .   .   . x |.   .   .   .   |.   .   .   .   |
```

### 5. Seed 1004 (A A2 A F A A2 B T, hats, beats)

```
KICK     |X   .x  . X .x  |X   .x  .   .x  |X   .x  . X .x  |X   .x  .   .x  |X   .x  . X .x  |X   .x  .   .x  |X   .x  .   Xx  |X   .x  .   Xx  |
SNARE    |.   X   .   X   |.   X   .   X   |.   X   .   X   |.   X   .   X  X|.   X   .   X   |.   X   .   X   |.   X  x.  X.   |.   X   .   . X~|
GHOST    |. --.   .   .   |. --.   .  -.   |. --.   .   .   |. --.   .  -.   |. --.   .   .   |. --.   .  -.   |. --.   . - .   |. --.   .   .   |
HIGH TOM |.   .   .   .   |.   .   .   .~  |.   .   .   .   |.   .   .   . X |.   .   .   .   |.   .   .   .~  |.   .   .   .   |.   .   .  X.   |
MID TOM  |.   .   .   .   |.   .   .   . ~ |.   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   . ~ |.   .   .   .   |.   .   .   .   |
LOW TOM  |.   .   .   .   |.   .   .   .  ~|.   .   .   .   |.   .   .   .X  |.   .   .   .   |.   .   .   .  ~|.   .   .   .   |.   .   .   .X  |
HAT      |. x x x x x X x |x x X x x x X   |x x x x x x X x |x x x x x x x   |. x X x x x X x |x x X x x x X   |x~~~X x x x x x |x x X x x x .   |
CRASH    |X   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |X   .   .   .   |.   .   .   .   |.   .   .   .   |.   .   .   .   |
```

