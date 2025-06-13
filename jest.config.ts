import type { Config } from 'jest';

const config: Config = {
  // Use ts-jest to transform TypeScript
  preset: 'ts-jest',
  
  // Test environment
  testEnvironment: 'jsdom',
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup-jest.ts'],
  
  // Test file patterns
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.(test|spec).(ts|tsx|js)',
    '<rootDir>/src/**/*.(test|spec).(ts|tsx|js)',
  ],
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // Module aliases - matches webpack config
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@services/(.*)$': '<rootDir>/src/services/$1',
    '@mui/styled-engine': '@mui/styled-engine-sc',
    // Static asset mocks
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$': '<rootDir>/src/__tests__/__mocks__/fileMock.js',
  },
  
  // Performance optimizations
  maxWorkers: '50%', // Use 50% of CPU cores for parallel testing
  cacheDirectory: '<rootDir>/node_modules/.cache/jest', // Enable Jest cache
  
  // Coverage settings
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/__tests__/**/*',
    '!src/main.ts',
    '!src/preload/**/*',
  ],
  
  // Coverage reporters
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Ignored paths
  modulePathIgnorePatterns: ['<rootDir>/out/', '<rootDir>/.webpack/'],
  
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: './tsconfig.test.json', // Use dedicated test configuration with reduced checks
    }],
  },
  
  // Environment variables
  setupFiles: ['<rootDir>/src/__tests__/environment.ts'],

  testTimeout: 5000,

  detectOpenHandles: false, // Disable open handle detection for better performance
  forceExit: true, // Force exit to avoid EPERM errors
};

export default config;
