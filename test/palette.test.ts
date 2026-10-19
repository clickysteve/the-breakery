/**
 * Palettes: The Breakery uses Slop Factory Core's palette system (the same as the other
 * instruments) with its own roles; the default is the original look; every preset reads well
 * with The Breakery's roles; palettes from the other instruments import; nothing in the interface
 * draws in a colour of its own; and palettes never touch the music.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { completeColors, contrastWarnings, exportPalette, importPalette, PaletteLibrary, paletteCss, SHARED_PRESETS, type PaletteStore } from '@slopfactory/core/palette';
import { BREAKERY_PALETTES, BREAKERY_PRESETS } from '../src/ui/palette';
import { bake, seedsFrom } from '../src/engine/generate';
import { defaultRecipe } from '../src/engine/styles';

const memStore = (): PaletteStore & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
};
const css = readFileSync(new URL('../src/ui/style.css', import.meta.url), 'utf8');

describe('The Breakery’s palettes', () => {
  it('are Core’s shared presets then AMFAS, Atari (the original look) first and the default', () => {
    const lib = new PaletteLibrary(BREAKERY_PALETTES, memStore());
    expect(lib.all().map((p) => p.name)).toEqual(['Atari', 'Dark', 'Amber', 'Green Screen', 'C64', 'Phosphor', 'Pink Noise', 'Rave', 'Paper', 'AMFAS']);
    expect(lib.selected.name).toBe('Atari');
    expect(BREAKERY_PALETTES.builtIns).toEqual([...SHARED_PRESETS, ...BREAKERY_PRESETS]);
  });

  it('AMFAS is the palette file as given, every role its own colour, and reads well', () => {
    const file = JSON.parse(readFileSync(new URL('../src/palettes/amfas.json', import.meta.url), 'utf8'));
    expect(importPalette(BREAKERY_PALETTES, JSON.stringify(file)).colors).toEqual(file.colors);
    const store = memStore();
    const lib = new PaletteLibrary(BREAKERY_PALETTES, store);
    const amfas = lib.find('amfas')!;
    expect(amfas.builtIn).toBe(true);
    expect(amfas.colors).toEqual(file.colors);
    const c = completeColors(BREAKERY_PALETTES, amfas.colors);
    expect(c).toEqual(file.colors);
    expect(contrastWarnings(BREAKERY_PALETTES, c)).toEqual([]);
    lib.select('amfas');
    expect(new PaletteLibrary(BREAKERY_PALETTES, store).selected.name).toBe('AMFAS');
    const sheet = paletteCss(BREAKERY_PALETTES, c);
    expect(sheet).toContain('--hits:#ffc014');
    expect(sheet).toContain('--edits:#ff1a1a');
  });

  it('the default palette is exactly the style sheet’s own colours (existing users see no change)', () => {
    const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
    const atari = completeColors(BREAKERY_PALETTES, SHARED_PRESETS[0]!.colors);
    for (const r of BREAKERY_PALETTES.roles) {
      const m = root.match(new RegExp(`${r.css}:\\s*(#[0-9a-f]{3,6})`, 'i'));
      expect(m, r.css).toBeTruthy();
      const hex = m![1]!.length === 4 ? '#' + [...m![1]!.slice(1)].map((c) => c + c).join('') : m![1]!;
      expect(atari[r.id], r.id).toBe(hex.toLowerCase());
    }
  });

  it('every preset reads well with The Breakery’s roles (hits and hand edits included)', () => {
    for (const p of SHARED_PRESETS) {
      const c = completeColors(BREAKERY_PALETTES, p.colors);
      expect(contrastWarnings(BREAKERY_PALETTES, c), p.name).toEqual([]);
      expect(c.hits).toBe(p.colors.ink);
      expect(c.edits).toBe(p.colors.selection);
      const sheet = paletteCss(BREAKERY_PALETTES, c);
      for (const r of BREAKERY_PALETTES.roles) expect(sheet).toContain(`${r.css}:${c[r.id]}`);
    }
  });

  it('custom palettes are edited, kept and restored like in the other instruments', () => {
    const store = memStore();
    const lib = new PaletteLibrary(BREAKERY_PALETTES, store);
    lib.select('rave');
    const p = lib.setColor('hits', '#ff00ff');
    expect(p.name).toBe('Rave copy');
    expect(lib.find('rave')!.colors.hits).toBe('#3ff3ff');
    const again = new PaletteLibrary(BREAKERY_PALETTES, store);
    expect(again.selected.colors.hits).toBe('#ff00ff');
    expect(Object.keys(store.data).sort()).toEqual(['breakery.palette.custom', 'breakery.palette.selected']);
    expect(again.resetToDefault().name).toBe('Atari');
  });

  it('imports palette files from emmm and DOWNBEAT by the roles they share, and its own round-trip', () => {
    const emmm = JSON.stringify({ format: 'emmm-palette', version: 1, name: 'Studio', colors: { desktop: '#23303a', paper: '#fbf8ef', ink: '#202020', dim: '#8c8576', patterns: '#1d6a86', activity: '#d0372a', selection: '#2b78c9' } });
    const r = importPalette(BREAKERY_PALETTES, emmm);
    expect(r.colors.ink).toBe('#202020');
    expect(r.colors.hits).toBe('#202020');
    expect(r.ignored).toEqual(['patterns']);
    const down = importPalette(BREAKERY_PALETTES, JSON.stringify({ format: 'downbeat-palette', version: 1, name: 'D', colors: { paper: '#000000', ink: '#ffffff' } }));
    expect(down.colors.paper).toBe('#000000');
    const own = exportPalette(BREAKERY_PALETTES, { name: 'Mine', colors: r.colors });
    expect(importPalette(BREAKERY_PALETTES, own).colors).toEqual(r.colors);
  });

  it('nothing in the interface draws in a colour of its own (every colour comes from the palette)', () => {
    const dir = new URL('../src/ui/', import.meta.url);
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    for (const f of files) {
      const src = readFileSync(new URL(f, dir), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      // the only literal: the playhead's fallback for the default palette (white, difference-blended = inverts)
      const hex = (src.match(/#[0-9a-f]{3,8}\b/gi) ?? []).filter((h) => !(f === 'patternWindow.ts' && h === '#fff'));
      expect(hex, f).toEqual([]);
      expect(src, f).not.toMatch(/\b(rgb|rgba|hsl)\(/);
    }
    // the style sheet: colours only in the default palette's variables and the 1-bit fill images
    const outside = css.replace(/:root\s*\{[\s\S]*?\n\}/, '').replace(/url\("data:[^"]*"\)/g, '');
    expect(outside.match(/#[0-9a-f]{3,6}\b/gi) ?? []).toEqual([]);
  });

  it('are cosmetic only: a break is the same whatever the palette (palettes are not in the recipe or the saved state)', () => {
    const lib = new PaletteLibrary(BREAKERY_PALETTES, memStore());
    const a = bake(defaultRecipe('jungle', 4), seedsFrom(5));
    lib.select('amber');
    lib.setColor('ink', '#123456');
    const b = bake(defaultRecipe('jungle', 4), seedsFrom(5));
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(JSON.stringify(a)).not.toMatch(/palette|#123456/);
  });
});
