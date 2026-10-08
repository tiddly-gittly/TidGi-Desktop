import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { analyzer } from 'vite-bundle-analyzer';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';
import { rendererAliases, rendererDedupe } from './vite.renderer.aliases';

export default defineConfig({
  plugins: [
    ...(process.env.ANALYZE === 'true'
      ? [analyzer({ analyzerMode: 'static', openAnalyzer: false, fileName: 'bundle-analyzer-renderer' })]
      : []),
    react(),
    monacoEditorPlugin({}),
  ],
  resolve: {
    alias: rendererAliases,
    dedupe: rendererDedupe,
  },
  optimizeDeps: {
    include: ['monaco-editor'],
  },
  build: {
    // Output to .vite/renderer for consistency
    outDir: '.vite/renderer',
    // Specify the HTML entry point
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
      output: {
        manualChunks(id: string) {
          if (id.includes('monaco-editor')) {
            return 'monaco-editor';
          }
        },
      },
    },
    commonjsOptions: {
      include: [/monaco-editor/, /node_modules/],
    },
    // TypeORM's browser entry statically reaches optional platform drivers so
    // Expo/React Native bundlers can discover their storage providers. TidGi only
    // uses the better-sqlite3 driver, but Rolldown still tries to resolve those
    // optional driver packages while building the Desktop renderer bundle.
    rolldownOptions: {
      external: [
        'expo-sqlite',
        'react-native',
        'react-native-paper',
      ],
    },
  },
  server: {
    port: 3012, // Match the port from webpack config
  },
});
