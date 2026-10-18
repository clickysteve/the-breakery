# Mixer and stems

Select MIXER beside PATTERN. All eleven drum categories have level, pan, MUTE,
SOLO and post-channel stereo peak meters. Level ranges from silence through unity
(0 dB) to +3.5 dB. Pan runs from L100 through CENTRE to R100 using Core's Web Audio
StereoPanner: stereo channels move across the field without phase inversion.
Core's stereo bus upmixes mono samples before panning; correlated stereo/mono
material can become louder at extreme pan positions. Watch the output meters.

MASTER controls output independently. Its two meters show left/right output;
PEAK holds overload until clicked or playback stops. Meters sample actual audio
at 30 Hz and decay between hits. Previews bypass the channel mixer, as before.

Multiple solos are allowed. A muted channel is always silent, including when
soloed. Pattern row buttons and mixer buttons share the same state. Mixer changes
use Core's 5 ms ramps and affect ringing voices without touching the scheduler,
queued pattern changes or pattern velocities. Browser persistence restores mixer
settings independently of kits, recipes and pattern undo/history.

TAKEAWAY always follows mixer gain, pan, mute, solo and master level. This replaces
the old FULL/AUDIBLE audio choice. Existing filenames, loop/tail settings and MIDI
file infrastructure are retained. No MIDI integration branch is involved.

Enable STEMS to download a ZIP containing the stereo mix and eleven category WAVs.
Every stem starts at frame zero, has exactly the same frame count, and uses stereo
44.1 kHz, 16-bit PCM. Silent categories remain present. Names reuse the mix's
existing filename base with `_kick`, `_snare`, `_ghost`, `_htom`, `_mtom`, `_ltom`,
`_hat`, `_open`, `_ride`, `_crash` or `_perc`. No timestamps are added.

- DRY STEMS enabled (default): retain channel level/pan and mute/solo, bypass master
  gain and master safety attenuation. Reapply master gain in the DAW if desired.
- DRY STEMS disabled: apply master gain to each stem. If headroom is insufficient,
  apply one shared attenuation to mix and stems; the export status reports it.
  Summed stems reconstruct the mix within 16-bit quantisation error (with OUTPUT empty
  or bypassed: see OUTPUT below).

Dry stem exports exceeding WAV headroom are rejected with an instruction to lower
channel levels, preserving the chosen gain rather than silently clipping them.
Live playback has no limiter: lower levels when PEAK lights. Offline export retains
its existing peak safety attenuation; no compression/limiting has been added.
Both tail and seamless-loop modes apply identically to all files. All events are
retained during rendering, including muted hat events needed for choke behaviour.

Focused tests: `npm test -- test/mixer.test.ts test/mixerAudio.test.ts test/audio.test.ts test/features.test.ts test/switching.test.ts test/kits.test.ts`.
The audio integration test uses installed headless Chrome and real Web Audio via a
local Vite server. Set `CHROME_BIN` outside macOS; this test skips if Chrome is absent.

## OUTPUT

Select OUTPUT beside BATCH. It is a master output chain: what the mixer sends to the master
passes through it before MASTER LEVEL and the output meters.

    tracks -> level, pan, mute/solo -> OUTPUT chain -> MASTER LEVEL -> meters, speakers

The engines come from Slop Factory Core's output engines, so they are the same code The Good
Bits uses for its exports and DOWNBEAT and emmm use live: **OUTPUT STAGE** (ten characters:
Cassette, Reel-to-Reel, Damaged, Vinyl, Boombox, AM Radio, VHS Hi-Fi, Bus Comp, Lathe, Phone
Bus; mix and intensity), **DRIVE** (tape, tube, diode, fuzz; amount), **CRUNCH** (bit depth,
rate divide) and **TONE** (a one-pole low-pass). Every control on the tab comes from the
engines' own parameter descriptions.

- **+ ADD ENGINE** adds one at the end (up to eight). Click a stage's name to edit it on the
  right; its title (▾) swaps it for another engine in the same place; **DEFAULTS** resets it.
- **ON** bypasses one stage, **BYPASS ALL** the whole chain (settings kept). **▲ ▼** reorder,
  **REMOVE** deletes. **PRESETS** (CLEAN, 12-BIT, BITCRUSH, RATE REDUCE, DRIVE, CASSETTE, VINYL,
  AM RADIO) replace the chain.
- Changes are heard at once and never click: smooth parameters ramp, other changes, bypass and
  reordering crossfade. The engines run in an AudioWorklet (https or localhost); where the
  browser cannot run it the tab says so and audio plays unprocessed.
- **TAKEAWAY** renders the chain into the mix file exactly where it plays live, by the same
  code, after the mixer and before master level, with the same noise seed (the chain restarts
  where playback starts, as the render does). Then the existing peak safety attenuation applies.
- **Stems are never processed by OUTPUT**, dry or not: they are the tracks; the mix file is the
  processed master. With OUTPUT active, summed stems no longer reconstruct the mix (a non-linear
  master stage cannot be reproduced from its parts).
- Previews (INGREDIENTS, a clicked hit) and MIDI out and the MIDI file are not processed.
- OUTPUT is an application setting, saved in the browser with the mixer, not part of the break,
  favourites or undo. A stage saved by another Slop Factory application with an engine The
  Breakery does not have is kept, shown as UNAVAILABLE (it passes audio through), and can be
  removed.
