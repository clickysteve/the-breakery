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
  Summed stems reconstruct the mix within 16-bit quantisation error.

Dry stem exports exceeding WAV headroom are rejected with an instruction to lower
channel levels, preserving the chosen gain rather than silently clipping them.
Live playback has no limiter: lower levels when PEAK lights. Offline export retains
its existing peak safety attenuation; no compression/limiting has been added.
Both tail and seamless-loop modes apply identically to all files. All events are
retained during rendering, including muted hat events needed for choke behaviour.

Focused tests: `npm test -- test/mixer.test.ts test/mixerAudio.test.ts test/audio.test.ts test/features.test.ts test/switching.test.ts test/kits.test.ts`.
The audio integration test uses installed headless Chrome and real Web Audio via a
local Vite server. Set `CHROME_BIN` outside macOS; this test skips if Chrome is absent.
