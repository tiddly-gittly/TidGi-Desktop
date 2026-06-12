import fs from 'fs-extra';
import path from 'path';
import { defineConfig } from 'vite';

// Dynamically read TypeORM's optional peer dependencies
const typeormPackageJson = fs.readJsonSync(path.resolve(__dirname, 'node_modules/typeorm/package.json')) as Record<string, unknown>;
const typeormOptionalDepNames = Object.keys(typeormPackageJson.peerDependenciesMeta || {}).filter(
  (dep) => dep !== 'better-sqlite3',
);
const typeormOptionalDepsRegex = typeormOptionalDepNames.map(
  (dep) => new RegExp(`^${dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/.*)?$`),
);

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@services': path.resolve(__dirname, './src/services'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'preload.js',
      },
      external: [
        'electron',
        'expo-sqlite',
        ...typeormOptionalDepsRegex,
      ],
    },
    rolldownOptions: {
      external: [
        'expo-sqlite',
        ...typeormOptionalDepsRegex,
      ],
    },
  },
});
