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
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@services': path.resolve(__dirname, './src/services'),
    },
  },

  // Handle CSS and static assets
  assetsInclude: ['**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.svg'],
});
