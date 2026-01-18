// Flat ESLint config using FlatCompat to bridge legacy extends
const { FlatCompat } = require('@eslint/eslintrc');
const js = require('@eslint/js');
const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const pluginImport = require('eslint-plugin-import');
const prettier = require('eslint-config-prettier');

const compat = new FlatCompat({
  baseDirectory: __dirname
});

module.exports = [
  // Legacy style extends converted via compat if needed (we already recreate rules below)
  ...compat.config({}),
  js.configs.recommended,
  prettier,
  {
    files: ['**/*.ts','**/*.js'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly'
      }
    },
    plugins: {
      import: pluginImport,
      '@typescript-eslint': tsPlugin
    },
    settings: {
      'import/resolver': {
        node: { extensions: ['.js','.ts'] },
        typescript: {}
      }
    },
    rules: {
      'no-console': ['warn', { allow: ['warn','error','info','log'] }],
      'import/order': ['warn', {
        groups: ['builtin','external','internal','parent','sibling','index'],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true }
      }],
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports', fixStyle: 'separate-type-imports' }],
      'no-undef': 'off'
    },
    ignores: [
      'dist/',
      'node_modules/',
      '*.d.ts',
      'firmware/',
      'platforms/windows/',
      'platforms/macos/'
    ]
  }
];
