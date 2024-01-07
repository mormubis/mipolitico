/* eslint-disable @typescript-eslint/no-var-requires */

const typescript = require('@typescript-eslint/eslint-plugin');
const parser = require('@typescript-eslint/parser');
const prettier = require('eslint-config-prettier');
const importing = require('eslint-plugin-import');

/** @type { import("eslint").Linter.FlatConfig[] } */
const config = [
  {
    languageOptions: {
      parser,
      parserOptions: {
        project: ['./tsconfig.json'],
      },
      sourceType: 'module',
    },
    plugins: { '@typescript-eslint': typescript, 'import': importing },
    settings: {
      'import/parsers': {
        '@typescript-eslint/parser': ['.ts', '.tsx'],
      },
    },
    rules: {
      ...typescript.configs.recommended.rules,
      ...typescript.configs['eslint-recommended'].rules,
      ...typescript.configs['stylistic-type-checked'].rules,
      ...prettier.rules,
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-empty-function': 'off',
      'import/order': [
        'error',
        {
          'alphabetize': {
            order: 'asc',
            caseInsensitive: true,
          },
          'groups': [['builtin', 'external'], 'internal', ['parent', 'sibling'], 'type'],
          'newlines-between': 'always',
          'pathGroups': [
            {
              group: 'internal',
              pattern: '~/**',
              position: 'before',
            },
          ],
          'pathGroupsExcludedImportTypes': ['~/**'],
        },
      ],
    },
  },
];

module.exports = config;
