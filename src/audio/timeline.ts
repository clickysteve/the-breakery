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

export const CORE_PPQ = 96000;
/** The pitch at which samples play at their own speed. */
export const ROOT_PITCH = 60;

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
    .map((e) => ({ type: 'note', tick: eventTick(e, bpm), duration: CORE_PPQ / 4, voice: e.cat, pitch: ROOT_PITCH, velocity: e.vel, instrument: e.sample! }));
  return {
    tempo: constantTempo(bpm, CORE_PPQ),
    length: b.recipe.bars * 4 * CORE_PPQ,
    voices: CATEGORIES.map((c) => ({ id: c, name: CATEGORY_LABEL[c] })),
    events: sortEvents(events),
    meta: { app: 'The Breakery' },
  };
}

/** Hats: a closed hat cuts a ringing open hat; an open hat cuts the previous open hat. */
export const hatChoke: ResolveChoke = (voice) => {
  if (voice === 'hat') return { group: 'hats', cuts: true, cutBy: false, fade: 0.012 };
  if (voice === 'open') return { group: 'hats', cuts: true, cutBy: true, fade: 0.012 };
  return null;
};
