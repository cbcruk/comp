import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['**/dist/**', 'django-main/**', '**/.wrangler/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Build-time node scripts, not shipped code — they get node globals.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly' },
    },
  },
  {
    // Type-aware, and deliberately just this one rule: `await` on a value that
    // is not a thenable is a no-op the compiler accepts, and an Effect is not
    // a thenable. During the Effect migration that silently turns a write into
    // a value nobody ran — the typechecker only notices if the result is used.
    files: ['packages/*/src/**/*.ts', 'packages/*/src/**/*.tsx'],
    // Tests are outside the packages' tsconfigs, so the project service
    // cannot type them; the hazard is in shipped code anyway.
    ignores: ['**/*.test.ts', '**/*.test.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/await-thenable': 'error',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
)
