import 'reflect-metadata';

// Optimize Jest environment variables
process.env.NODE_OPTIONS = '--max-old-space-size=4096';
process.env.TS_NODE_COMPILER_OPTIONS = '{"skipLibCheck":true,"isolatedModules":true}';

// Disable some development mode warnings
process.env.SKIP_PREFLIGHT_CHECK = 'true';
