import { afterEach, expect, it, vi } from 'vitest';
import { App } from '../src/app/app';
import { Player } from '../src/audio/player';
import { OUTPUT_ENGINES } from '../src/audio/output';
import { emptyKit } from '../src/engine/kit';

afterEach(() => vi.unstubAllGlobals());

function setup(data = new Map<string, string>()) {
  vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v) });
  const ingredients = { kit: emptyKit, loudness: () => ({}), name: (s: string) => s } as never;
  const player = new Player(ingredients);
  const sent: unknown[] = [];
  const setOutput = player.setOutput.bind(player);
  player.setOutput = (c) => (sent.push(c), setOutput(c));
  return { data, player, sent, app: new App(ingredients, player, '42') };
}

it('offers every built-in audio engine (The Breakery output is audio)', () => {
  expect(OUTPUT_ENGINES.list().map((e) => e.id)).toEqual(['goodbits.output-stage', 'goodbits.drive', 'goodbits.crunch', 'core.tone']);
  expect(OUTPUT_ENGINES.list({ kind: 'midi' })).toEqual([]);
});

it('starts empty, so existing settings sound exactly as before', () => {
  const { app } = setup();
  expect(app.output.config).toEqual({ version: 1, bypass: false, stages: [] });
});

it('every change reaches the player and is saved; it is not a pattern action (no undo)', () => {
  const { app, sent, data } = setup();
  const before = app.canUndo;
  const id = app.output.add('goodbits.drive')!;
  app.output.setParam(id, 'amountPct', 70);
  app.output.setBypass(true);
  expect(sent.at(-1)).toEqual(app.output.config);
  expect(app.canUndo).toBe(before);
  app.bake();
  app.undo();
  app.redo();
  expect(app.output.stages[0]!.params.amountPct).toBe(70);
  expect(JSON.parse(data.get('breakery.state.v1')!).output).toEqual(app.output.config);
});

it('restores the chain on reload, keeping stages of engines it does not have', () => {
  const data = new Map<string, string>();
  data.set('breakery.state.v1', JSON.stringify({ output: { version: 1, bypass: false, stages: [{ id: 's1', engine: 'goodbits.crunch', enabled: false, params: { bits: 40 } }, { id: 's2', engine: 'other.app-delay', enabled: true, params: { time: 0.25 } }] } }));
  const { app, sent } = setup(data);
  expect(app.output.stages).toEqual([
    { id: 's1', engine: 'goodbits.crunch', enabled: false, params: { bits: 16, rateDivide: 1 }, v: 1 },
    { id: 's2', engine: 'other.app-delay', enabled: true, params: { time: 0.25 } },
  ]);
  expect(sent[0]).toEqual(app.output.config);
  app.save();
  expect(JSON.parse(data.get('breakery.state.v1')!).output.stages[1].engine).toBe('other.app-delay');
});
