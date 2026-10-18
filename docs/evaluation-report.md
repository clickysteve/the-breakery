# Evaluation report (generated)

Written by `npm run evaluate` (scripts/evaluate.test.ts). 20 two-bar breaks per style, default recipes, seeds 1000–1019. Each cell: **generated / random baseline** (same hits per category placed uniformly at random on the sixteenth grid). Do not edit by hand.

| Metric | FUNK | HIP-HOP | JUNGLE | BROKEN | What it shows |
|---|---|---|---|---|---|
| Bars with snare accents on 2 and 4 | 0.82 / 0.05 | 0.95 / 0.03 | 0.70 / 0.00 | 0.50 / 0.05 | the backbeat anchor (BROKEN displaces it on purpose) |
| Ghosts within a 16th of a snare accent | 0.66 / 0.39 | 0.78 / 0.50 | 0.52 / 0.53 | 0.60 / 0.44 | ghosts relate to the backbeat |
| Kicks on a snare accent (per bar) | 0.05 / 0.78 | 0.00 / 0.55 | 0.03 / 0.85 | 0.05 / 0.93 | kick and snare interlock rather than collide |
| Bar 2 similarity to bar 1 (Jaccard) | 0.81 / 0.37 | 0.82 / 0.18 | 0.68 / 0.20 | 0.77 / 0.28 | bars are related, with variation |
| Kick/snare syncopation per bar | 4.25 / 5.28 | 3.08 / 5.85 | 4.53 / 5.53 | 5.15 / 5.75 | syncopation is a controlled amount, not noise |
| Hits per bar | 27.00 / 27.00 | 16.20 / 16.20 | 21.35 / 21.35 | 24.23 / 24.23 | same by construction |

Mean absolute microtiming (generated): FUNK 1.1 ms, HIP-HOP 1.4 ms, JUNGLE 0.4 ms, BROKEN 0.8 ms.

## The 20 FUNK breaks for the listening test

Legend: X ≥ 100 velocity, x ≥ 70, o ≥ 45, - softer (ghosts), ~ a 32nd-note hit, . beat with no hit. Load each in The Breakery with RECIPE ▸ FUNK, 2 bars, and its SEED.

### 1. Seed 1000 (A T, hats)

```
KICK     |X   .x x.   .x  |X   .x x.   .x  |
SNARE    |.   X   .   X   |.   X   .   X  X|
GHOST    |.  -. - .- -.   |.  -. - .-  .   |
HAT      |xoxoxoxoxoxoXo  |xoxoXoxoxoxoXo  |
OPEN HAT |.   .   .   . x |.   .   .   . x |
```

### 2. Seed 1001 (A T, hats)

```
KICK     |Xx  .  x. X . X |Xx  .  x. x .  x|
SNARE    |.   X   .   X  X|.   X   .   .X  |
GHOST    |. - .-- .   .   |. - .-- .   .   |
HAT      |.oxoXoxoxo  Xoxo|xoxoxoxoxo  xx  |
OPEN HAT |.   .   . x .   |.   .   . x .   |
CRASH    |X   .   .   .   |.   .   .   .   |
PERC     |. o .o  o  o. o |. o .o  o  o.   |
```

### 3. Seed 1002 (A T, hats)

```
KICK     |X   .x x. X .   |X   .x x. X .   |
SNARE    |.   X   .   X   |.   X   .   . X |
GHOST    |.   .-- .  -.-  |.   .-- .  -.   |
HAT      |xoxoxo  XoxoXoxo|xoxoXo  xo  xoxo|
OPEN HAT |.   . x .   .   |.   . x . x .   |
```

### 4. Seed 1003 (A T, hats)

```
KICK     |X   .x x. X .x  |X   .x x. X .   |
SNARE    |.   X   .X  X   |.   X   .X  X xX|
GHOST    |.  -.   -  -.-  |.  -.   -  -.-  |
HAT      |xoxoxo  xoxoXoxo|XoxoXo  xoxoXo  |
OPEN HAT |.   . x .   .   |.   . x .   .   |
```

### 5. Seed 1004 (A T, hats)

```
KICK     |X X .x x. X .   |X X .x x.   .  X|
SNARE    |.   X   .   X   |.   X   .   X  X|
GHOST    |.  -.-  .  -.-  |.  -.-  .   .-  |
HAT      |xoxoXo  xoxoXoxo|xoxoXo  xoxoXox |
OPEN HAT |.   . x .   .   |.   . x .   .   |
CRASH    |.   .   .   .   |.   .   .   .  X|
```

### 6. Seed 1005 (A T, hats)

```
KICK     |X   .  x. X .x  |X   .  x.x  .xX |
SNARE    |.   X   .   X   |.   X   .   X  ~|
GHOST    |.  -.-~-.  -.   |.  -.-~-.- -.   |
HAT      |xoxoXoxoxo  Xoxo|xoxoxoxoxo  Xo  |
OPEN HAT |.   .   . x .   |.   .   . x .   |
```

### 7. Seed 1006 (A T, hats)

```
KICK     |X X .x x. X .   |X X .x x.   . X |
SNARE    |.   X   .   X   |.   X   .   X  ~|
GHOST    |.- -.   .- -.   |.- -.   .  -.   |
HAT      |xoxoXox xoxoXoxo|xoxoXox xoxoXo  |
OPEN HAT |.   .  x.   .   |.   .  x.   .   |
```

### 8. Seed 1007 (A T, hats)

```
KICK     |X X .  x.   .x  |X X .  x.   .x  |
SNARE    |.   X   .   X   |.   X   .   X xX|
GHOST    |.  -.-  .  -.  -|.  -.-  .- -.   |
HAT      |xoxoxoxoxoxoXo  |xoxoXoxoxoxoXo  |
OPEN HAT |.   .   .   . x |.   .   .   .   |
PERC     |.o  .o  o  o. o |.o  .o  o  o.   |
```

### 9. Seed 1008 (A T, hats)

```
KICK     |X   .  x. X . X |X   .  x. X . XX|
SNARE    |.   X   .  X.   |.   X   .  X.  X|
GHOST    |.  -.   . - . - |.  -.   . - . - |
HAT      |xoxoXo  xoxoxoxo|xoxoxo  xoxoxo  |
OPEN HAT |.   . x .   .   |.   . x .   . x |
CRASH    |.   .   .   .   |.   .   .   .  X|
```

### 10. Seed 1009 (A T, ride)

```
KICK     |X X . Xx.x  .   |X X . Xx.x  .   |
SNARE    |.   X   .   X   |.   X   .   . X |
GHOST    |.- -.-  .  -.   |.- -.-  .   .   |
RIDE     |xoxoXoxoxoxoXoxo|xoxoXoxoxoxoxoxo|
```

### 11. Seed 1010 (A T, hats)

```
KICK     |X X .x x.   .   |X X .x x.   .xx |
SNARE    |.   X   .   X   |.   X   .   X  ~|
GHOST    |.   .-  . --.   |.   .-  . - .   |
HAT      |xoxoXoxoxoxoXoxo|xoxoxoxoxoxoxo  |
```

### 12. Seed 1011 (A T, hats)

```
KICK     |X   .x x. X .   |X   .x x.   .  X|
SNARE    |.   X   .X  X   |.   X   .X  X   |
GHOST    |.  -.-  .  -.-  |.  -.-  .  -.-  |
HAT      |xoxoxoxoxo  xoxo|xoxoXoxoxo  Xox |
OPEN HAT |.   .   . x .   |.   .   . x .   |
CRASH    |.   .   .   .   |.   .   .   .  X|
```

### 13. Seed 1012 (A T, hats)

```
KICK     |X   .x x. X .   |X   .x x.x  .   |
SNARE    |.   X   .   X   |.   X   .   X x~|
GHOST    |.- -.-  .   .-  |.- -.-  .   .-  |
HAT      |xoxoXoxoxoxoXo  |xoxoxoxoxoxoxo  |
OPEN HAT |.   .   .   . x |.   .   .   .   |
PERC     |.   o   .   o   |.   o   .   o   |
```

### 14. Seed 1013 (A T, ride)

```
KICK     |X X .x x.   .x  |X X .x x.   .   |
SNARE    |.   X   .   X   |.   X   .   X  x|
GHOST    |.  ~.-  . ~-. - |.  ~.-  .  -.   |
RIDE     |.oxoXoxoxoxoXoxo|xoxoXoxoxoxoXo  |
CRASH    |X   .   .   .   |.   .   .   .   |
PERC     |.   o   .   o o |.   o   .   o   |
```

### 15. Seed 1014 (A T, hats)

```
KICK     |Xx  .  x.   . x |Xx  .  x.   .xX |
SNARE    |.   X   .   X   |.   X   .   X   |
GHOST    |.   .   .  -.- -|.   .   .- -.- -|
HAT      |xoxoXoxoxoxoXox |xoxoXoxoxoxoXox |
OPEN HAT |.   .   .   .  x|.   .   .   .  x|
```

### 16. Seed 1015 (A T, hats)

```
KICK     |X X .x  .x  .x  |X X .x x.   .x  |
SNARE    |.   X   .   X   |.   X   .   X   |
GHOST    |.-- .   .  -. - |.-- .   .- -. - |
HAT      |xoxoXoxoxoxoXo  |xoxoXoxoxoxoXo  |
OPEN HAT |.   .   .   . x |.   .   .   . x |
PERC     |.o  .o  o  o. o |.o  .o  o  o. o |
```

### 17. Seed 1016 (A T, hats)

```
KICK     |X X . X .x  .   |X X . X X   . X |
SNARE    |.   X   .  X.  x|.   X   .  X.  ~|
GHOST    |.   .-  . - -   |.   .-  . - -   |
HAT      |.oxoXoxoxoxoxoxo|Xoxoxoxoxoxoxo  |
CRASH    |X   .   .   .   |.   .   .   .   |
PERC     |.o  o  o. o . o |.o  o  o. o .   |
```

### 18. Seed 1017 (A T, hats)

```
KICK     |X   . Xx.   .x  |X   . Xx.   . X |
SNARE    |.   X   .   X   |.   X   .   X  ~|
GHOST    |.   .- -.  -.-  |.   .- -.- -.-  |
HAT      |xoxoXo  xoxoXoxo|xoxoxo  Xoxoxo  |
OPEN HAT |.   . x .   .   |.   . x .   .   |
```

### 19. Seed 1018 (A T, hats)

```
KICK     |X   .  x. X .x  |X   .  x. Xx.xX |
SNARE    |.   X   .   X   |.   X   .   X  ~|
GHOST    |.   .   .~--.  -|.   .   .~ -.   |
HAT      |.oxoXoxoxoxoXoxo|xoxoxoxoxoxoXo  |
CRASH    |X   .   .   .   |.   .   .   .   |
PERC     |.   o   .   o o |.   o   .   o   |
```

### 20. Seed 1019 (A T, hats)

```
KICK     |X X .x x.   .   |X X .x x.  x. X |
SNARE    |.   X   .   X   |.   X   .   X   |
GHOST    |.- -.   .  -.   |.- -.   .   .   |
HAT      |xoxoxoxoxoxoXo  |xoxoXoxoxoxoXo  |
OPEN HAT |.   .   .   . x |.   .   .   .   |
CRASH    |.   .   .   .   |.   .   .   . X |
```

