import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // core is pure: forbid wall-clock reads inside logic (now is always a parameter).
      'no-restricted-properties': ['error', { object: 'Date', property: 'now', message: 'Pass `now` as a parameter.' }],
      'no-restricted-imports': ['error', { patterns: ['node:*', 'fs', 'path', 'http', 'https'] }],
    },
  },
);
