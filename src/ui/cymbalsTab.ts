/**
 * CYMBALS (a tab of the RECIPE window), GROOVE revision 4 (cymbals4.ts):
 *   ACTIVITY      CLOSED HAT, OPEN HAT, RIDE and CRASH, each 0–100%. For the closed hats and the
 *                 ride, activity is coverage of the SUBDIVISION: 100% plays every position of it
 *                 (where the relationship gives the family the time), 0% none at all
 *   TIMEKEEPING   SUBDIVISION (AUTO, 1/4, 1/8, 1/16, 1/32, TRIPLET) and the PRIMARY RELATIONSHIP
 *                 between the hats and the ride
 *   HI-HAT        the OPEN/CLOSED relationship and OPEN-HAT CHOKE
 *   THIS BREAK    what the engine chose and what the break actually plays (from its events, after
 *                 every layer and hand edit), and REGEN for each cymbal track
 * A revision 3 break (Phase 13) shows its HI-HAT and RIDE ACTIVITY; any change moves it to
 * revision 4 with them carried over (App.fresh).
 */
import { CYMBAL_LABEL } from '../engine/approaches';
import { analyseCymbals, HAT_REL_LABEL, HAT_REL_TIP, HAT_RELS, PRIMARY_REL_LABEL, PRIMARY_REL_TIP, PRIMARY_RELS, SUB_LABEL, SUBDIVISIONS, type CymbalSettings } from '../engine/cymbals4';
import { CYMBAL_REVISION, type Category } from '../engine/types';
import { el, label, setTip } from './dom';
import { Button, RangeBar } from './widgets';
import type { UiContext } from './context';

const pct = (v: number) => `${Math.round(v * 100)}%`;

const SUB_TIP: Record<string, string> = {
  auto: 'AUTO: the recipe (and the BREAK DNA) choose the subdivision for each break, the hats and the ride separately.',
  4: '1/4: quarter notes, four positions a bar.',
  8: '1/8: eighth notes, eight positions a bar.',
  16: '1/16: sixteenth notes, sixteen positions a bar.',
  32: '1/32: thirty-second notes, thirty-two positions a bar.',
  t: 'TRIPLET: eighth-note triplets, twelve positions a bar (a shuffle).',
};

const REL_LINE: Record<string, string> = {
  accent: 'ACCENT: THE BUSIER FAMILY KEEPS TIME, THE OTHER MARKS KICKS, BACKBEATS AND PHRASE ENDS',
  independent: 'INDEPENDENT: EACH ON ITS OWN FIGURE AND ACTIVITY',
  alternate: 'ALTERNATE: THEY TRADE BARS (DEVELOPMENT, SECOND HALF, FILLS OR ANSWERS)',
  layer: 'LAYER: SAME RANKING, SO THEY DOUBLE WHERE BOTH PLAY (SECONDARY SOFTER)',
  exclusive: 'EXCLUSIVE: NEVER TOGETHER; THE SECONDARY TAKES ONLY FREE POSITIONS',
  call: 'CALL & RESPONSE: PRIMARY IN THE FIRST HALF OF THE BAR, SECONDARY ANSWERS',
};

export function cymbalsTab(b: HTMLElement, ui: UiContext, W: number) {
  const { app } = ui;
  const colW = Math.floor((W - 12) / 2);
  const bar = (i: number, key: 'closed' | 'open' | 'ride' | 'crash', text: string, aria: string, tip: string) => {
    const x = 4 + (i % 2) * (colW + 4);
    const y = 3 + Math.floor(i / 2) * 16;
    label(b, x + 1, y + 3, text);
    return new RangeBar(b, [x + 62, y, colW - 62, 14], { get: () => app.cym[key], set: (v) => app.setCym({ [key]: v }), format: pct, label: aria, tip });
  };
  const closed = bar(0, 'closed', 'CLOSED HAT', 'Closed hat activity', 'CLOSED HAT ACTIVITY: how much of the SUBDIVISION the closed hats cover. 100% = every position (sixteen a bar on 1/16), 0% = no closed hats at all, whatever the personality, the BREAK DNA or the rolls. In between the strongest positions come first (beats, then “and”s, then the rest, leaned by the cymbal figure), so more activity plays the same strokes and more.');
  const ride = bar(1, 'ride', 'RIDE', 'Ride activity', 'RIDE ACTIVITY: how much of its subdivision the ride covers. 100% = every position where the relationship gives it the time, 0% = no ride at all.');
  const open = bar(2, 'open', 'OPEN HAT', 'Open hat activity', 'OPEN HAT ACTIVITY: how many of the open-hat positions (the “and”s; with 1/16 and 1/32 the “a”s too) play an open hat. 0% = none, 100% = every one. The recipe and the BREAK DNA decide which come first.');
  const crash = bar(3, 'crash', 'CRASH', 'Crash activity', 'CRASH ACTIVITY: crashes mark the phrase, not the grid: the top of the phrase first, then a new section, the development bar, the DNA’s crash places, other downbeats and pushed kicks. At most two a bar. 0% = no crashes at all.');
  el('div', 'rule', b, [4, 36, W - 8]);

  // ---- timekeeping
  label(b, 5, 42, 'SUBDIVISION', 'head');
  const x0 = 76;
  const sw = Math.floor((W - 4 - x0 - 5 * 2) / 6);
  const subs = SUBDIVISIONS.map((s, i) => new Button(b, [x0 + i * (sw + 2), 39, sw, 13], SUB_LABEL[s], { cls: 'small', tip: `${SUB_TIP[s]} The closed hats’ and the ride’s ACTIVITY are coverage of it.`, onPress: () => app.setCym({ sub: s }) }));
  label(b, 5, 57, 'HATS ↔ RIDE', 'head');
  const rw = Math.floor((W - 4 - x0 - 5 * 2) / 6);
  const rels = PRIMARY_RELS.map((r, i) => new Button(b, [x0 + i * (rw + 2), 54, rw, 13], PRIMARY_REL_LABEL[r], { cls: 'small', tip: `${PRIMARY_REL_TIP[r]} The family with the higher activity is primary (the hats on a tie).`, onPress: () => app.setCym({ rel: r }) }));
  const relLine = el('div', 'label tiny', b, [5, 70, W - 10]);
  el('div', 'rule', b, [4, 80, W - 8]);

  // ---- hi-hat articulation
  label(b, 5, 86, 'OPEN / CLOSED', 'head');
  const hw = 62;
  const hatRels = HAT_RELS.map((r, i) => new Button(b, [x0 + i * (hw + 2), 83, hw, 13], HAT_REL_LABEL[r], { cls: 'small', tip: HAT_REL_TIP[r], onPress: () => app.setCym({ hatRel: r }) }));
  const choke = new Button(b, [W - 4 - 92, 83, 92, 13], 'CHOKE ON', {
    cls: 'small',
    tip: 'OPEN-HAT CHOKE: on (default), the next closed hat cuts a ringing open hat, as a real hi-hat closing does; off, the open hat rings out under the closed ones. The same live, in exports and in stems.',
    onPress: () => app.setCym({ choke: !app.cym.choke }),
  });
  el('div', 'rule', b, [4, 99, W - 8]);

  // ---- this break
  label(b, 5, 104, 'THIS BREAK', 'head');
  const regen: [string, Category[]][] = [['HAT', ['hat']], ['OPEN', ['open']], ['RIDE', ['ride']], ['CRASH', ['crash']]];
  label(b, W - 4 - 4 * 38 - 40, 104, 'REGEN');
  const regenBtns = regen.map(([t, cats], i) => new Button(b, [W - 4 - (4 - i) * 38, 101, 36, 12], t, { cls: 'small', tip: `REGEN TRACK: the ${t.toLowerCase()} track generated again, fitted to the rest of the pattern, everything else exactly as it is. ⌘Z undoes.`, onPress: () => app.regenTracks(cats) }));
  const lines = [0, 1, 2].map((i) => el('div', 'label tiny', b, [5, 115 + i * 9, W - 10]));
  setTip(lines[0]!, 'What the cymbal engine chose for this break: each family’s subdivision and figure, and how the timekeeping develops through the phrase.');
  setTip(lines[1]!, 'What this break actually plays, counted from its events after every layer, CHOP, DESTROY and hand edit: hits and hits a bar per family, and the finest grid they sit on.');
  setTip(lines[2]!, 'Anything a setting asked for that the break could not give (EXCLUSIVE with both families busy, more crashes than places for them).');
  const settings = [closed, ride, open, crash];

  function update(): void {
    const c: CymbalSettings = app.cym;
    const legacy = app.legacy;
    const rev4 = (app.recipe.revision ?? 0) >= CYMBAL_REVISION && app.recipe.engine === 2;
    for (const s of settings) s.update();
    subs.forEach((x, i) => (x.on = SUBDIVISIONS[i] === c.sub));
    rels.forEach((x, i) => (x.on = PRIMARY_RELS[i] === c.rel));
    hatRels.forEach((x, i) => (x.on = HAT_RELS[i] === c.hatRel));
    choke.on = c.choke;
    choke.text = c.choke ? 'CHOKE ON' : 'CHOKE OFF';
    relLine.textContent = REL_LINE[c.rel]!;
    setTip(relLine, PRIMARY_REL_TIP[c.rel]);
    for (const x of regenBtns) x.disabled = legacy;
    const ev = app.current.events;
    const n = app.current.recipe.bars;
    const report = app.current.cymReport;
    if (legacy || !rev4) {
      lines[0]!.textContent = legacy ? 'LEGACY BREAK: THE FIRST RELEASE’S GENERATOR' : 'BAKED BEFORE THE CYMBAL ENGINE (REVISION 3 OR EARLIER): ANY CHANGE HERE RE-BAKES IT WITH IT';
    } else if (report) {
      const g = report.grid;
      lines[0]!.textContent = `HATS ${CYMBAL_LABEL[report.figure.hat]} ON ${SUB_LABEL[g.hat]} · RIDE ${CYMBAL_LABEL[report.figure.ride]} ON ${SUB_LABEL[g.ride]}${report.auto ? ' (AUTO)' : ''} · ${report.primary ? `${report.primary === 'hat' ? 'HATS' : 'RIDE'} PRIMARY` : 'NO TIMEKEEPER'} · ${app.current.approach?.development ?? ''}`.toUpperCase();
    }
    const a = analyseCymbals(ev, n);
    lines[1]!.textContent = a.map((x) => `${x.cat === 'hat' ? 'CLOSED' : x.cat.toUpperCase()} ${x.count}${x.count ? ` (${x.perBar.toFixed(1)}/BAR${x.grids && x.cat !== 'crash' ? ` ON ${x.grids}` : ''})` : ''}`).join(' · ');
    lines[2]!.textContent = (report?.notes.length ? report.notes.join(' · ') : c.choke ? 'OPEN HATS ARE CHOKED BY THE NEXT CLOSED HAT' : 'OPEN HATS RING UNDER THE CLOSED HATS (CHOKE OFF)').toUpperCase();
  }
  update();
  return { update };
}
