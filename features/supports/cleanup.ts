// Test cleanup hooks for TidGi E2E tests
import { After, Before } from '@cucumber/cucumber';
import { promises as fs } from 'fs';
import path from 'path';

// Set up logs directory before tests
Before(async function () {
  const logsDir = path.join(__dirname, '..', '..', 'logs');
  try {
    await fs.mkdir(logsDir, { recursive: true });
  } catch (error) {
    // Directory already exists, ignore
  }
});

// Clean up after each scenario
After(async function () {
  // Basic cleanup if needed
  console.log('Test scenario completed');
});
