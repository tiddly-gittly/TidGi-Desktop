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
    'no-use-before-define': ['error', { ignoreTypeReferences: true, functions: false }],
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
    'unicorn/prefer-node-protocol': 'off',
    'unicorn/prefer-module': 'off',
    '@typescript-eslint/no-empty-function': 'off',
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
    '@typescript-eslint/no-non-null-assertion': 'off',
    semi: [0],
    'no-use-before-define': [0],
    '@typescript-eslint/no-use-before-define': [1],
  },
  extends: [
    'eslint:recommended',
    'standard',
    'plugin:security/recommended',
    'plugin:react/recommended',
    'plugin:unicorn/recommended',
    'plugin:prettier/recommended',
    'standard-with-typescript',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:import/errors',
    'plugin:import/warnings',
    'plugin:import/typescript',
    'plugin:react-hooks/recommended',
    'prettier',
    'plugin:security-node/recommended',
    'plugin:typescript-sort-keys/recommended',
  ],
  plugins: [
    '@typescript-eslint/eslint-plugin',
    'prettier',
    'react',
    'html',
    'typescript-sort-keys',
    'unicorn',
    'import',
    'react-hooks',
    'security',
    'security-node',
  ],
  env: {
    browser: true,
    es6: true,
  },
};
