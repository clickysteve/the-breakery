/**
 * Break -> Slop Factory Core timeline. The single place where grid position, swing and
 * microtiming become time, used by live playback AND offline export, so what you hear is what
 * you take away.
 *
 * Core ticks are integers; at 96 000 per quarter note a position is rounded by at most
 * 1/192 000 of a quarter (about 3 µs at 100 BPM), well under a sample.
 */
import { constantTempo, sortEvents, type NoteEvent, type Timeline } from '@slopfactory/core/events';
import type { ResolveChoke } from '@slopfactory/core/audio';
import { CATEGORIES, CATEGORY_LABEL, STEPS, TPS, type Break, type BreakEvent, type Category } from '../engine/types';
import { fxSuffix, parseFx } from './shaped';

export const CORE_PPQ = 96000;
/** The pitch at which samples play at their own speed. */
export const ROOT_PITCH = 60;
/** The suffix of an instrument id that plays its sample backwards (Ingredients resolves it to a reversed copy). */
export const REVERSED = '~rev';

/**
 * EXPRESSION, the one place a hit's pitch and reverse become a note, used by live playback and by
 * the offline render alike: pitch is the note number (Core transposes by playback rate, as a
 * hardware sampler does), reverse is the reversed copy of the sample.
 */
export const notePitch = (e: Pick<BreakEvent, 'pitch'>): number => ROOT_PITCH + (e.pitch ?? 0);
/**
 * DESTROY (Phase 14) adds its shaping (a partial reverse, a gate, a detune, a tape stop, OPEN-HAT
 * CHOKE off) to the id, in seconds at `bpm`, so the same note is shaped the same live and offline
 * (shaped.ts). Without it the id is as before.
 */
export const noteInstrument = (sample: string, e: Pick<BreakEvent, 'reverse' | 'revFrac' | 'detune' | 'gate' | 'tape' | 'free'>, bpm = 120): string => (e.reverse ? sample + REVERSED : sample) + fxSuffix(e, bpm);

/** Quarter notes from the start of the break to the event, including swing and microtiming. */
export function eventQuarters(e: Pick<BreakEvent, 'bar' | 'step' | 'sub' | 'swing' | 'offsetMs'>, bpm: number): number {
  const sixteenths = e.bar * STEPS + e.step + e.sub / TPS + e.swing;
  return Math.max(0, sixteenths / 4 + (e.offsetMs / 1000) * (bpm / 60));
}

export function eventTick(e: BreakEvent, bpm: number): number {
  return Math.round(eventQuarters(e, bpm) * CORE_PPQ);
}

/** Seconds from the start of the break (the same rounding as the timeline, for consistency). */
export function eventSeconds(e: BreakEvent, bpm: number): number {
  return (eventTick(e, bpm) / CORE_PPQ) * (60 / bpm);
}

export function loopSeconds(b: Break): number {
  return b.recipe.bars * 4 * (60 / b.recipe.bpm);
}

/** Every playable event of the break as a Core timeline: one voice per drum category (optionally only some categories: AUDIBLE MIX). */
export function breakTimeline(b: Break, only?: readonly Category[]): Timeline {
  const bpm = b.recipe.bpm;
  const events: NoteEvent[] = b.events
    .filter((e) => e.sample && (!only || only.includes(e.cat)))
    .map((e) => ({ type: 'note', tick: eventTick(e, bpm), duration: CORE_PPQ / 4, voice: e.cat, pitch: notePitch(e), velocity: e.vel, instrument: noteInstrument(e.sample!, e, bpm) }));
  return {
    tempo: constantTempo(bpm, CORE_PPQ),
    length: b.recipe.bars * 4 * CORE_PPQ,
    voices: CATEGORIES.map((c) => ({ id: c, name: CATEGORY_LABEL[c] })),
    events: sortEvents(events),
    meta: { app: 'The Breakery' },
  };
}

/**
 * Hats: a closed hat cuts a ringing open hat; an open hat cuts the previous open hat. A closed hat
 * marked `free` (OPEN-HAT CHOKE off, revision 4) cuts nothing. Notes starting together are kept
 * (Core), so an open hat LAYERED on a closed one rings.
 */
export const hatChoke: ResolveChoke = (voice, note) => {
  if (voice === 'hat') return parseFx((note as { instrument?: string }).instrument ?? '')?.shape.free ? null : { group: 'hats', cuts: true, cutBy: false, fade: 0.012 };
  if (voice === 'open') return { group: 'hats', cuts: true, cutBy: true, fade: 0.012 };
  return null;
};
