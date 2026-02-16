// @ts-check

import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import { defineConfig } from 'eslint/config';
import { importX } from 'eslint-plugin-import-x';
import prettier from 'eslint-plugin-prettier/recommended';
import * as ts from 'typescript-eslint';

const config = defineConfig(
  {
    files: [
      'src/**/*.ts',
      'src/**/*.tsx',
      'examples/**/*.ts',
      'examples/**/*.tsx',
      'build/**/*.ts',
      'eslint.config.js',
      'vite.config.ts',
    ],
    extends: [
      js.configs.recommended,
      ...ts.configs.recommendedTypeChecked,
      importX.flatConfigs.recommended,
      importX.flatConfigs.typescript,
      prettier,
    ],
    rules: {
      '@stylistic/lines-around-comment': [
        'error',
        {
          beforeBlockComment: false,
          afterBlockComment: false,
          beforeLineComment: false,
          afterLineComment: false,
        },
      ],
      '@stylistic/no-confusing-arrow': 'off',
      '@stylistic/no-multi-spaces': ['error', { ignoreEOLComments: true }],
      '@stylistic/no-tabs': 'error',
      '@stylistic/quotes': [
        'error',
        'single',
        { avoidEscape: true, allowTemplateLiterals: 'never' },
      ],
      '@stylistic/quote-props': ['error', 'consistent'],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-empty-interface': 'off',
      '@typescript-eslint/no-empty-object-type': [
        'error',
        { allowInterfaces: 'with-single-extends' },
      ],
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'import-x/first': 'error',
      'import-x/newline-after-import': 'error',
      'import-x/no-duplicates': 'error',
      'import-x/no-named-as-default-member': 'off',
      'import-x/order': [
        'error',
        {
          'groups': ['builtin', 'external', 'internal', 'parent', 'index', 'sibling', 'type'],
          'newlines-between': 'ignore',
          'alphabetize': { order: 'asc', caseInsensitive: false },
        },
      ],
      'import-x/prefer-default-export': 'off',
      'prettier/prettier': 'error',
      'arrow-body-style': ['error', 'as-needed'],
      'camelcase': ['error', { properties: 'never' }],
      'class-methods-use-this': 'off',
      'curly': ['error', 'all'],
      'max-len': 'off',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'prefer-const': 'off',
      'prefer-promise-reject-errors': 'off',
    },
    languageOptions: {
      parser: ts.parser,
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        projectService: true,
        ecmaVersion: 'latest',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      '@stylistic': stylistic,
    },
  },
  {
    files: ['src/**/*.d.ts'],
    rules: {
      'no-var': 'off',
    },
  }
);

export default config;
