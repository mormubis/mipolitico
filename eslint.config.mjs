/* eslint-disable @typescript-eslint/no-var-requires */

import typescript from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import importing from 'eslint-plugin-import';

/** @type { import("eslint").Linter.FlatConfig[] } */
const config = [
  {
    files: ['**/*.ts', '**/*.tsx'],
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
      // eslint-plugin-import does not support ESLint 9 yet
      // ...importing.configs.typescript,
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

export default config;
