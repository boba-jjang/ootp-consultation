import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const SRC = new URL('../src/', import.meta.url);
const TOKENS = 'styles/tokens.css';

/** A color written out: hex, a color function with literal channels, or a named color as a CSS value. */
const RAW_COLOR = [
  /(?<![\w-])#[0-9a-f]{3,8}\b/gi,
  /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/gi,
  /:\s*(?:white|black|red|blue|green|yellow|orange|purple|pink|gray|grey|silver|gold|navy|teal|cyan|magenta|lime|maroon|olive|aqua|fuchsia|brown|beige|ivory|tan|khaki|coral|salmon|crimson|indigo|violet|turquoise|whitesmoke|gainsboro|lightgray|darkgray|dimgray|slategray)\b/gi,
];

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
        return RAW_COLOR.flatMap((pattern) =>
          [...text.matchAll(pattern)].map((match) => `${file}: ${match[0]}`),
        );
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
    const start = tokens.indexOf('---- Semantic');
    expect(start).toBeGreaterThan(0);
    const raw = [...tokens.slice(start).matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)]
      .filter(([, , value]) =>
        /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|hwb)\(\s*\d/i.test(value ?? ''),
      )
      .map(([, name]) => name);
    expect(raw).toEqual([]);
  });
});
