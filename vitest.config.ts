/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    // Test environment
    environment: 'jsdom',
    
    // Setup files
    setupFiles: ['./src/__tests__/setup-vitest.ts'],
    
    // Test file patterns
    include: [
      'src/**/__tests__/**/*.(test|spec).(ts|tsx|js)',
      'src/**/*.(test|spec).(ts|tsx|js)',
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
    
    // Performance settings
    testTimeout: 5000,
    hookTimeout: 5000,
  },
  
  define: {
    // Tell Material-UI to use styled-components as the styled engine
    'process.env.STYLED_ENGINE': '"styled-components"',
  },
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@services': path.resolve(__dirname, './src/services'),
      '@mui/styled-engine': path.resolve(__dirname, './node_modules/@mui/styled-engine-sc'),
      '@mui/styled-engine/esm': path.resolve(__dirname, './node_modules/@mui/styled-engine-sc/esm'),
    },
  },
  
  // Handle CSS and static assets
  assetsInclude: ['**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.svg'],
});
