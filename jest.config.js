/** @type {import('jest').Config} */
module.exports = {
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
  
  // Modern ts-jest configuration
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        jsx: 'react-jsx',
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    }],
  },
  
  // Environment variables
  setupFiles: ['<rootDir>/src/__tests__/environment.ts'],
  
  // Timeout setting
  testTimeout: 10000,
};
