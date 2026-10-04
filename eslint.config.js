import { builtinModules } from 'node:module';

import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const NODE_ONLY = 'packages/core runs in the browser. Read files in tests or apps, not here.';
const CORE_GLOBALS = 'packages/core is pure: no Node, DOM or network globals.';

export default defineConfig([
  // ESLint doesn't read .gitignore, so keep these in step with it.
  globalIgnores([
    '**/dist/',
    '**/coverage/',
    '**/.vercel/',
    '**/playwright-report/',
    '**/test-results/',
    'fixtures/',
    'docs/',
  ]),

  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Configuring the rule replaces strictTypeChecked's options, so restate them and allow numbers.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowAny: false,
          allowBoolean: false,
          allowNever: false,
          allowNullish: false,
          allowRegExp: false,
          allowNumber: true,
        },
      ],
    },
  },

  // Plain JavaScript config files aren't part of any tsconfig.
  {
    files: ['**/*.{js,mjs,cjs,jsx}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },

  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended, reactRefresh.configs.vite],
    languageOptions: { globals: globals.browser },
  },

  // packages/core imports no DOM, network or UI framework code (CLAUDE.md). Tests may use Node.
  {
    files: ['packages/core/src/**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}'],
    ignores: ['**/*.test.*'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          // Exact names, so local folders such as ./domain or ./events stay allowed.
          paths: builtinModules
            .filter((name) => !name.startsWith('node:'))
            .map((name) => ({ name, message: NODE_ONLY })),
          patterns: [
            { regex: '^node:', message: NODE_ONLY },
            {
              regex: '^react(-dom)?(/|$)',
              message: 'packages/core is UI-free. Keep React in apps/web.',
            },
            {
              regex: '^@supabase/',
              message: 'packages/core does no network or storage. Keep Supabase in apps/web.',
            },
          ],
        },
      ],
      // tsc can't be the only guard: a dependency whose types say
      // `/// <reference types="node" />` puts Node globals in scope.
      'no-restricted-globals': [
        'error',
        ...[
          'process',
          'Buffer',
          'require',
          'module',
          '__dirname',
          '__filename',
          'global',
          'globalThis',
          'self',
          'fetch',
          'Request',
          'Response',
          'Headers',
          'XMLHttpRequest',
          'WebSocket',
          'EventSource',
          'window',
          'document',
          'location',
          'navigator',
          'localStorage',
          'sessionStorage',
          'indexedDB',
        ].map((name) => ({ name, message: CORE_GLOBALS })),
      ],
      '@typescript-eslint/triple-slash-reference': ['error', { types: 'never' }],
      'no-restricted-syntax': [
        'error',
        { selector: 'ImportExpression', message: 'packages/core uses static imports only.' },
      ],
    },
  },

  prettier,
]);
