import { describe, expect, it } from 'vitest';

import { IMPORTER_VERSION } from './index.ts';

describe('IMPORTER_VERSION', () => {
  it('is a plain semantic version, so stored imports can be compared and re-read', () => {
    expect(IMPORTER_VERSION).toMatch(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  });
});
