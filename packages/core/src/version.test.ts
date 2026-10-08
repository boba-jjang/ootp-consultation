import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { IMPORTER_VERSION } from './index.ts';

describe('IMPORTER_VERSION', () => {
  it('is a plain semantic version, so stored imports can be compared and re-read', () => {
    expect(IMPORTER_VERSION).toMatch(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  });

  it('has a history line saying which import rules changed', () => {
    const source = readFileSync(new URL('./version.ts', import.meta.url), 'utf8');
    expect(source).toContain(`// ${IMPORTER_VERSION}: `);
  });
});
