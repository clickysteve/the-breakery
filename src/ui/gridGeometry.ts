/**
 * The PATTERN grid's one coordinate system (Phase 17): drawing, hit testing, the hover cell,
 * placing a hit and dragging one all go through these functions, so what is drawn is where a
 * click lands.
 *
 * x is in the grid svg's logical pixels (dom.ts localPoint: the screen's scale already divided
 * out); the grid starts at X0 (the 1px left border) with the first bar of the view. A click
 * anywhere inside a SNAP cell targets THAT cell (floor, never round): the right half of a
 * sixteenth is still that sixteenth. Every SNAP (1/16, 1/32, 1/64, 1/16T, 1/32T: 12, 6, 3, 8, 4
 * ticks) divides a bar (192 ticks) exactly, so cells never straddle a bar line and triplet grids
 * restart on every bar. A press on a boundary belongs to the cell on its right; a press past the
 * last cell belongs to the last cell (never outside the pattern).
 */
import { TPB, TPS } from '../engine/types';

export interface GridGeom {
  /** svg x of the view's first tick (the grid's left edge) */
  x0: number;
  /** pixels per sixteenth */
  cw: number;
  /** first bar of the view */
  view0: number;
}

/** Ticks of float error a pixel position may carry (far below a pixel, which is never less than 0.1 tick). */
const EPS = 1e-6;

/** Grid ticks (from the break's start) at an svg x. */
export const tickAtX = (g: GridGeom, x: number): number => g.view0 * TPB + ((x - g.x0) / g.cw) * TPS;

/** The svg x of a grid tick. */
export const xAtTick = (g: GridGeom, t: number): number => g.x0 + ((t - g.view0 * TPB) / TPS) * g.cw;

/** The first tick of the SNAP cell that contains `tick`, inside the pattern. */
export function cellOf(tick: number, snap: number, bars: number): number {
  const last = Math.floor((bars * TPB - 1) / snap) * snap;
  return Math.max(0, Math.min(last, Math.floor((tick + EPS) / snap) * snap));
}

/** The SNAP cell under an svg x: where a click there places a hit. */
export const cellAtX = (g: GridGeom, x: number, snap: number, bars: number): number => cellOf(tickAtX(g, x), snap, bars);

/**
 * Where a dragged hit goes: it moves by the whole cells the pointer crossed since the press (so it
 * keeps its offset from the grid, as a roll stroke does), never past the pattern.
 */
export function dragTo(g: GridGeom, t0: number, pressX: number, x: number, snap: number, bars: number): number {
  const d = (Math.floor((tickAtX(g, x) + EPS) / snap) - Math.floor((tickAtX(g, pressX) + EPS) / snap)) * snap;
  return Math.max(0, Math.min(bars * TPB - 1, t0 + d));
}

/** A crisp 1px line on a tick: the pixel column that holds the boundary. */
export const lineX = (g: GridGeom, t: number): number => Math.floor(xAtTick(g, t) + EPS) + 0.5;
