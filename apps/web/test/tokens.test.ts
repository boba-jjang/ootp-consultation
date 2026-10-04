import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const SRC = new URL('../src/', import.meta.url);
const TOKENS = 'styles/tokens.css';

/** A color written out: hex, rgb(), rgba(), hsl() or hsla(). */
const RAW_COLOR = /(?<![\w-])#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(/gi;

const sourceFiles = () =>
  readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => /\.(css|tsx?)$/.test(file));

describe('design tokens', () => {
  it('keeps every raw color in styles/tokens.css', () => {
    const offenders = sourceFiles()
      .filter((file) => file !== TOKENS)
      .flatMap((file) => {
        const text = readFileSync(new URL(file, SRC), 'utf8');
        return [...text.matchAll(RAW_COLOR)].map((match) => `${file}: ${match[0]}`);
      });
    expect(offenders).toEqual([]);
  });

  it('defines the handoff palette as primitives', () => {
    const tokens = readFileSync(new URL(TOKENS, SRC), 'utf8');
    const palette: [string, string][] = [
      ['--navy', '#0a1118'],
      ['--slate', '#121d24'],
      ['--chalk', '#f5f7fa'],
      ['--gold', '#e5a93c'],
      ['--crimson', '#d9534f'],
      ['--emerald', '#2ecc71'],
    ];
    for (const [name, value] of palette) {
      expect(tokens).toContain(`${name}: ${value};`);
    }
  });

  it('builds every semantic and component token from other tokens, not raw values', () => {
    const tokens = readFileSync(new URL(TOKENS, SRC), 'utf8');
    const semantic = tokens.slice(tokens.indexOf('---- Semantic'));
    const raw = [...semantic.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)]
      .filter(([, , value]) => /#[0-9a-f]{3,8}\b/i.test(value ?? ''))
      .map(([, name]) => name);
    expect(raw).toEqual([]);
  });
});
