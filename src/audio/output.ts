/**
 * OUTPUT: the master output chain, built from Slop Factory Core's output engines (The Good Bits'
 * OUTPUT STAGE, DRIVE and CRUNCH, and Core's TONE). It sits after the track mixer (level, pan,
 * mute, solo) and before MASTER LEVEL, live and in TAKEAWAY's master file alike; stems never
 * pass through it. Settings are app settings (like the mixer), not part of the break or undo.
 */
import { coreEngines, type ChainConfig } from '@slopfactory/core/engines';
import chainWorkletUrl from '@slopfactory/core/chain-worklet.js?url';

/** Every built-in audio engine: The Breakery's output is audio. */
export const OUTPUT_ENGINES = coreEngines();

/** The chain worklet, loaded by URL (live and offline). */
export const CHAIN_WORKLET_URL = chainWorkletUrl;

/** Seed of the output engines' noise, the same live and in TAKEAWAY. */
export const OUTPUT_SEED = 1;

export type { ChainConfig };
