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
      '@memeloop/react-ui': path.resolve(__dirname, '../memeloop/packages/memeloop-react-ui/dist/index.js'),
      '@memeloop/react-ui/web': path.resolve(__dirname, '../memeloop/packages/memeloop-react-ui/dist/web/index.js'),
      '@memeloop/react-ui/native': path.resolve(__dirname, '../memeloop/packages/memeloop-react-ui/dist/native/index.js'),
      '@memeloop/react-ui/theme': path.resolve(__dirname, '../memeloop/packages/memeloop-react-ui/dist/theme/index.js'),
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
  },
  server: {
    port: 3012, // Match the port from webpack config
  },
});
