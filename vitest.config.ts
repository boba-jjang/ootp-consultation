import { readdirSync } from 'node:fs';

import { defineConfig } from 'vitest/config';

// Every directory under packages/ and apps/ is a test project. A bare 'packages/*' glob
// also matches plain files such as a README, and Vitest refuses any that isn't a config.
const projectDirs = (root: string) =>
  readdirSync(new URL(`./${root}/`, import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `${root}/${entry.name}`);

export default defineConfig({
  test: {
    projects: [...projectDirs('packages'), ...projectDirs('apps')],
    coverage: {
      provider: 'v8',
      // Every calculation lives in packages/core, so that is where the floor applies.
      // Listing the sources also counts files that no test imports yet.
      // `pnpm test:core` runs it with --project @ootp/core, so app tests can't cover core
      // code. Under --project, Vitest matches this glob against the project root rather
      // than the workspace root, so it accepts both forms. A glob that matches nothing
      // passes at 0/0, so keep it matching the core sources.
      include: ['{packages/core/,}src/**/*.{ts,mts,cts,tsx,js,mjs,cjs,jsx}'],
      exclude: ['**/*.test.*'],
      reporter: ['text', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
