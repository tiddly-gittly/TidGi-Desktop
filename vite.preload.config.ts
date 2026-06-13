import path from 'path';
import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    // Force Node.js resolution — Rolldown picks the "browser" export
    // condition by default which pulls TypeORM's ExpoDriver + expo-sqlite.
    conditions: ['node'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@services': path.resolve(__dirname, './src/services'),
    },
  },
  build: {
    rolldownOptions: {
      external: ['expo-sqlite'],
    },
  },
});
