import path from 'path';
import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [swc.vite({
    jsc: {
      transform: {
        react: {
          runtime: 'automatic',
        },
      },
    },
  })],

  test: {
    // Test environment
    environment: 'jsdom',

    // features/ tests (HTTP/Node.js integration) run in node environment; src/ tests need jsdom
    environmentMatchGlobs: [
      ['features/**', 'node'],
    ],

    // Setup files
    setupFiles: ['./src/__tests__/setup-vitest.ts'],

    // Test file patterns
    include: [
      'src/**/__tests__/**/*.(test|spec).(ts|tsx|js)',
      'src/**/*.(test|spec).(ts|tsx|js)',
      'features/**/*.(test|spec).(ts|tsx|js)',
    ],

    // Global test settings - this makes vi, expect, etc. available globally
    globals: true,

    // Coverage settings
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'src/**/*.{ts,tsx}',
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/__tests__/**/*',
        'src/main.ts',
        'src/preload/**/*',
      ],
    },

    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: 6,
        minForks: 2,
      },
      isolate: true,
    },

    testTimeout: 30000,
    hookTimeout: 30000,
    reporters: ['default', 'hanging-process'],
  },

  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: '@services', replacement: path.resolve(__dirname, './src/services') },
      { find: 'memeloop', replacement: path.resolve(__dirname, '../memeloop/packages/memeloop/src') },
      { find: '@memeloop/protocol', replacement: path.resolve(__dirname, '../memeloop/packages/memeloop-protocol/src') },
      { find: /agentInstance\/memeloopWorkerFactory(\.ts)?$/, replacement: path.resolve(__dirname, './src/__tests__/__stubs__/memeloopWorkerFactoryStub.ts') },
      { find: /\?nodeWorker$/, replacement: path.resolve(__dirname, './src/__tests__/__stubs__/memeloopWorkerFactoryStub.ts') },
      // Stub optional MCP SDK so tests don't fail on import-resolution when SDK is not installed
      { find: /^@modelcontextprotocol\/sdk\/.*$/, replacement: path.resolve(__dirname, './src/__tests__/__stubs__/mcpSdkStub.ts') },
    ],
  },

  // Handle CSS and static assets
  assetsInclude: ['**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.svg'],
});
