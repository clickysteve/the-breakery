/**
 * How a press in the PATTERN grid is read (kept apart from the drawing so it can be tested):
 *
 *   click an empty place      add a hit (dragging on paints more along the row)
 *   click a hit               delete it (it toggles), unless the pointer moved: then it was a drag
 *   drag a hit                move it (past DRAG_THRESHOLD; a click never moves a hit)
 *   shift+click a hit         select it for the editor strip (velocity, timing, sample, move, copy)
 *   click a grouped roll      expand it (a one-bar view, where each of its hits is drawn and edited)
 *   right-click               delete the hit (or the whole grouped roll)
 */

/** Logical pixels the pointer must travel before a press on a hit becomes a move. */
export const DRAG_THRESHOLD = 4;

/** Below this many logical pixels between a roll's hits, the roll is drawn as one group. */
export const ROLL_GROUP_PX = 5;

export type PressAction = 'add' | 'toggle' | 'select' | 'expand' | 'delete' | 'deleteRoll' | 'none';

export interface Press {
  /** 0 = main button, 2 = right */
  button: number;
  shift: boolean;
  /** ctrl+click on a Mac is a right-click */
  macCtrl?: boolean;
  onHit: boolean;
  onRoll: boolean;
}

/** What a press does when it goes down (a 'toggle' is decided on release: delete, or a move if it was dragged). */
export function pressAction(p: Press): PressAction {
  const right = p.button === 2 || (p.button === 0 && !!p.macCtrl);
  if (right) return p.onRoll ? 'deleteRoll' : p.onHit ? 'delete' : 'none';
  if (p.button !== 0) return 'none';
  if (p.onRoll) return 'expand';
  if (p.onHit) return p.shift ? 'select' : 'toggle';
  return 'add';
}

/** Has the pointer moved far enough (logical pixels) for a press on a hit to be a drag? */
export const isDrag = (dx: number, dy: number): boolean => Math.hypot(dx, dy) >= DRAG_THRESHOLD;

/** On release of a press on a hit: a plain click deletes it; a drag (or a shift+click) keeps it. */
export const releaseDeletes = (action: PressAction, dragged: boolean): boolean => action === 'toggle' && !dragged;
