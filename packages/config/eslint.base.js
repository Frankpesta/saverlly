// @ts-check
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '.next/**', '.turbo/**'],
  },
);
