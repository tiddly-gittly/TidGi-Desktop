// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsEslintConfig = require('./tsconfig.eslint.json');

module.exports = {
  ignorePatterns: tsEslintConfig.exclude,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.eslint.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  settings: {
    react: {
      version: '17.0.2',
    },
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
      typescript: {
        alwaysTryTypes: true,
      },
      alias: {
        map: [
          ['@', './src'],
          ['@services', './src/services'],
        ],
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
    },
  },
  rules: {
    'unicorn/prevent-abbreviations': [
      'error',
      {
        allowList: {
          mod: true,
          Mod: true,
          props: true,
          Props: true,
          i18n: true,
          i18next: true,
          i18nMainBindings: true,
          'i18next-electron-fs-backend': true,
        },
      },
    ],
    '@typescript-eslint/no-misused-promises': [
      'error',
      {
        checksVoidReturn: false,
      },
    ],
    'react/react-in-jsx-scope': 'off',
    'security-node/detect-unhandled-async-errors': 'off',
    'unicorn/prefer-node-protocol': 'off',
    'unicorn/prefer-module': 'off',
    '@typescript-eslint/no-empty-function': 'off',
    'security-node/detect-insecure-randomness': 'off',
    '@typescript-eslint/method-signature-style': 'off',
    'unicorn/prefer-string-slice': 'off',
    'unicorn/no-array-reduce': 'off',
    '@typescript-eslint/member-delimiter-style': [
      'warn',
      {
        multiline: {
          delimiter: 'semi', // 'none' or 'semi' or 'comma'
          requireLast: true,
        },
        singleline: {
          delimiter: 'semi', // 'semi' or 'comma'
          requireLast: false,
        },
      },
    ],
    'comma-dangle': [2, 'always-multiline'],
    'no-undef': 'off',
    'unicorn/no-array-for-each': 'off',
    'unicorn/no-await-expression-member': 'off',
    'multiline-ternary': 'off',
    'security/detect-object-injection': 'off',
    'security/detect-non-literal-fs-filename': 'off',
    'unicorn/filename-case': [
      0,
      {
        case: 'camelCase',
        ignore: [/tsx$/],
      },
    ],
    'unicorn/consistent-function-scoping': [0],
    'no-void': [0],
    'unicorn/prefer-ternary': 'off',
    'no-use-before-define': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    semi: [0],
    'unused-imports/no-unused-imports': 'error',
    'unused-imports/no-unused-vars': ['warn', { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' }],
    'dprint-integration/dprint': [
      'warn',
      // Global Config (will pass to the dprint formatter directly): Available at https://dprint.dev/config/
      {
        useDprintJson: true,
      },
      // Plugin Specific Config (will pass to the dprint plugins): Available at https://dprint.dev/plugins/
      {
        useDprintJson: true,
      },
    ],
    // conflict with dprint-integration/dprint, will make some line disappear, and some line duplicated
    '@typescript-eslint/consistent-type-imports': 'off',
    'comma-dangle': 'off'
  },
  extends: [
    'eslint:recommended',
    'standard',
    'plugin:security/recommended',
    'plugin:react/recommended',
    'plugin:unicorn/recommended',
    'standard-with-typescript',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:import/errors',
    'plugin:import/warnings',
    'plugin:import/typescript',
    'plugin:react-hooks/recommended',
    'plugin:dprint-integration/recommended',
    'plugin:dprint-integration/disable-conflict',
    'plugin:security-node/recommended',
    'plugin:typescript-sort-keys/recommended',
  ],
  plugins: [
    '@typescript-eslint/eslint-plugin',
    'dprint-integration',
    'react',
    'html',
    'typescript-sort-keys',
    'unicorn',
    'import',
    'react-hooks',
    'security',
    'security-node',
    'autofix',
    'unused-imports',
  ],
  env: {
    browser: true,
    es6: true,
  },
};
