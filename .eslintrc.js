// eslint-disable-next-line @typescript-eslint/no-var-requires
const tsEslintConfig = require('./tsconfig.eslint.json');

module.exports = {
  root: true,
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
  rules: {},
  extends: [
    'eslint-config-tidgi',
  ],
  plugins: [],
  env: {
    browser: true,
    es6: true,
  },
};
