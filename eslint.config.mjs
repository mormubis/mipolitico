import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import * as importing from 'eslint-plugin-import-x';
import * as typescript from 'typescript-eslint';

export default defineConfig(
  eslint.configs.recommended,
  typescript.configs.recommendedTypeChecked,
  typescript.configs.stylisticTypeChecked,
  typescript.configs.strictTypeChecked,
  importing.flatConfigs.recommended,
  importing.flatConfigs.typescript,
  prettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports' },
      ],
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-misused-promises': 'warn',
      'curly': ['error', 'multi-line'],
      'import-x/consistent-type-specifier-style': ['error', 'prefer-top-level'],
      'import-x/exports-last': 'error',
      'import-x/first': 'error',
      'import-x/order': [
        'error',
        {
          'alphabetize': {
            order: 'asc',
            caseInsensitive: true,
          },
          'groups': [
            ['builtin', 'external'],
            'internal',
            ['parent', 'sibling'],
            'type',
          ],
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
      'no-async-promise-executor': 'off',
      'sort-imports': [
        'error',
        {
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          allowSeparatedGroups: true,
        },
      ],
    },
  },
  {
    files: ['**/src/**/*.{ts,mts}'],
    rules: {
      'import-x/extensions': ['error', 'always', { fix: true }],
      'import-x/no-default-export': 'error',
    },
  },
);
