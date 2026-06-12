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

    // features/ tests (HTTP/Node.js integration) run in node environment
    // @ts-ignore — environmentMatchGlobs is supported in vitest 4
    environmentMatchGlobs: [
      ['features/**', 'node'],
    ],

    // Setup files
    setupFiles: ['./src/__tests__/setup-vitest.ts'],

    server: {
      deps: {
        inline: [/@memeloop\/react-ui/, /node_modules\/@memeloop\/react-ui/],
      },
    },

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

    testTimeout: 30000,
    hookTimeout: 30000,
    reporters: ['default', 'hanging-process'],

  },

  // Vitest 4 requires pool options at the top level
  pool: 'forks',
  poolOptions: {
    forks: {
      maxForks: 6,
      minForks: 2,
    },
    isolate: true,
  },

  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: '@services', replacement: path.resolve(__dirname, './src/services') },
      { find: /^react$/, replacement: path.resolve(__dirname, './node_modules/react/index.js') },
      { find: /^react\/jsx-runtime$/, replacement: path.resolve(__dirname, './node_modules/react/jsx-runtime.js') },
      { find: /^react\/jsx-dev-runtime$/, replacement: path.resolve(__dirname, './node_modules/react/jsx-dev-runtime.js') },
      { find: /^react-dom$/, replacement: path.resolve(__dirname, './node_modules/react-dom/index.js') },
      { find: /^react-dom\/client$/, replacement: path.resolve(__dirname, './node_modules/react-dom/client.js') },
      { find: /^@mui\/icons-material\/HelpOutline$/, replacement: path.resolve(__dirname, './node_modules/@mui/icons-material/HelpOutlineOutlined.js') },
      // Resolve memeloop packages for vitest (SWC-transformed files need explicit paths)
      { find: /^@memeloop\/react-ui\/web$/, replacement: path.resolve(__dirname, './node_modules/@memeloop/react-ui/dist/web/index.js') },
      { find: /^@memeloop\/react-ui$/, replacement: path.resolve(__dirname, './node_modules/@memeloop/react-ui/dist/index.js') },
      // Stub optional MCP SDK so tests don't fail on import-resolution when SDK is not installed
      { find: /^@modelcontextprotocol\/sdk\/.*$/, replacement: path.resolve(__dirname, './src/__tests__/__stubs__/mcpSdkStub.ts') },
    ],
  },

  // Handle CSS and static assets
  assetsInclude: ['**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.gif', '**/*.svg'],
});
