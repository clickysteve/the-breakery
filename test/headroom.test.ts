import { describe, expect, it } from 'vitest';
import { encodeWav16 } from '@slopfactory/core/export';
import { CLIP_THRESHOLD, EXPORT_CEILING, applyGain, headroomGain, reductionDb, samplePeak } from '../src/audio/headroom';
import { hasChrome, inChromium } from './chromium';

const ch = (...v: number[]) => [Float32Array.from(v), Float32Array.from(v)];

describe('headroom maths', () => {
  it('leaves peaks within headroom untouched', () => {
    expect(headroomGain(0.5)).toBe(1);
    expect(headroomGain(CLIP_THRESHOLD)).toBe(1);
    expect(headroomGain(0)).toBe(1);
    expect(reductionDb(1)).toBe(0);
  });
  it('brings a peak over full scale down to -1 dBFS', () => {
    const g = headroomGain(1.41);
    expect(1.41 * g).toBeCloseTo(EXPORT_CEILING, 6);
    expect(reductionDb(g)).toBeGreaterThan(0);
  });
  it('measures positive, negative and both stereo channels', () => {
    expect(samplePeak([Float32Array.from([0.1, -0.7]), Float32Array.from([0.2, 0.3])])).toBeCloseTo(0.7, 6);
    expect(samplePeak([Float32Array.from([0.1]), Float32Array.from([-1.5])])).toBeCloseTo(1.5, 6);
    expect(samplePeak([])).toBe(0);
    expect(samplePeak([new Float32Array(0)])).toBe(0);
    expect(samplePeak([new Float32Array(64)])).toBe(0);
  });
  it('rejects NaN and Infinity explicitly', () => {
    expect(() => samplePeak(ch(0, NaN), 'the kick stem')).toThrow(/kick stem.*non-finite/);
    expect(() => samplePeak(ch(0, Infinity))).toThrow(/non-finite/);
    expect(() => samplePeak(ch(-Infinity))).toThrow(/non-finite/);
  });
  it('one shared gain keeps relative levels and stereo balance exactly in ratio', () => {
    const stems = [
      [Float32Array.from([1.12, -0.4]), Float32Array.from([0.56, 0.1])],
      [Float32Array.from([1.41, 0.2]), Float32Array.from([0.14, -1.0])],
      [new Float32Array(2), new Float32Array(2)],
    ];
    const before = stems.map((s) => s.map((c) => Float32Array.from(c)));
    const g = headroomGain(Math.max(...stems.map((s) => samplePeak(s))));
    for (const s of stems) applyGain(s, g);
    stems.forEach((s, n) => s.forEach((c, k) => c.forEach((v, i) => expect(v).toBeCloseTo(before[n]![k]![i]! * g, 6))));
    expect(samplePeak(stems[2]!)).toBe(0);
    expect(Math.max(...stems.map((s) => samplePeak(s)))).toBeCloseTo(EXPORT_CEILING, 5);
    // L/R ratio of the first stem unchanged
    expect(stems[0]![0]![0]! / stems[0]![1]![0]!).toBeCloseTo(2, 5);
  });
  it('encodes an attenuated over-range signal without clipping', async () => {
    const c = ch(1.4, -1.9, 0.3);
    applyGain(c, headroomGain(samplePeak(c)));
    const bytes = await encodeWav16(c, 44100);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let max = 0;
    for (let o = 44; o + 1 < bytes.length; o += 2) max = Math.max(max, Math.abs(view.getInt16(o, true)));
    expect(max).toBeLessThan(32767);
    expect(max).toBeGreaterThan(0.88 * 32768);
  });
});

it.skipIf(!hasChrome)('exports a loud overlapping pattern as stems with one shared attenuation (real Web Audio)', async () => {
  const result = await inChromium('/test/mixer-test.html', `import('/test/headroomBrowser.ts').then(m => m.run())`);
  expect(result.exception, JSON.stringify(result.exception)).toBeUndefined();
  console.log(result.value);
  expect(result.value).toContain('passed');
}, 120000);
