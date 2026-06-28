import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { analyzer } from 'vite-bundle-analyzer';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';

export default defineConfig({
  plugins: [
    ...(process.env.ANALYZE === 'true'
      ? [analyzer({ analyzerMode: 'static', openAnalyzer: false, fileName: 'bundle-analyzer-renderer' })]
      : []),
    react(),
    monacoEditorPlugin({}),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@services': path.resolve(__dirname, './src/services'),
      '@memeloop/react-ui/chat': path.resolve(__dirname, './node_modules/@memeloop/react-ui/dist/chat/index.js'),
      '@memeloop/react-ui/web': path.resolve(__dirname, './node_modules/@memeloop/react-ui/dist/web/index.js'),
      '@memeloop/react-ui/native': path.resolve(__dirname, './node_modules/@memeloop/react-ui/dist/native/index.js'),
      '@memeloop/react-ui/theme': path.resolve(__dirname, './node_modules/@memeloop/react-ui/dist/theme/index.js'),
      '@memeloop/react-ui/agent': path.resolve(__dirname, './node_modules/@memeloop/react-ui/dist/agent/index.js'),
      '@memeloop/react-ui': path.resolve(__dirname, './node_modules/@memeloop/react-ui/dist/index.js'),
      'react-transition-group/cjs/TransitionGroupContext.js': path.resolve(__dirname, './node_modules/react-transition-group/cjs/TransitionGroupContext.js'),
      'react-transition-group/esm/TransitionGroupContext.js': path.resolve(__dirname, './node_modules/react-transition-group/esm/TransitionGroupContext.js'),
    },
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
