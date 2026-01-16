import { After, DataTable, Then, When } from '@cucumber/cucumber';
import fs from 'fs';
import path from 'path';
import { MockOAuthServer } from '../supports/mockOAuthServer';
import { ApplicationWorld } from './application';

Then('I should find log entries containing', async function(this: ApplicationWorld, dataTable: DataTable | undefined) {
  const expectedRows = dataTable?.raw().map((r: string[]) => r[0]);

  // Use scenario-specific logs directory
  const scenarioRoot = path.resolve(process.cwd(), 'test-artifacts', this.scenarioSlug);
  const logsDirectory = path.resolve(scenarioRoot, 'userData-test', 'logs');

  // Consider all log files in logs directory (including wiki logs like wiki-2025-10-25.log)
  const files = fs.readdirSync(logsDirectory).filter((f) => f.endsWith('.log'));

  const missing = expectedRows?.filter((expectedRow: string) => {
    // Check if any log file contains this expected content
    return !files.some((file) => {
      try {
        const content = fs.readFileSync(path.join(logsDirectory, file), 'utf8');
        return content.includes(expectedRow);
      } catch {
        return false;
      }
    });
  });

  if (missing?.length) {
    throw new Error(`Missing expected log messages in ${files.length} log file(s)`);
  }
});

// OAuth Server Steps
When('I start Mock OAuth Server on port {int}', async function(this: ApplicationWorld, port: number) {
  this.mockOAuthServer = new MockOAuthServer(
    { clientId: 'test-client-id' },
    port,
  );
  await this.mockOAuthServer.start();
});

When('I stop Mock OAuth Server', async function(this: ApplicationWorld) {
  if (this.mockOAuthServer) {
    await this.mockOAuthServer.stop();
    this.mockOAuthServer = undefined;
  }
});

// Clean up Mock OAuth Server after @oauth tests
After({ tags: '@oauth' }, async function(this: ApplicationWorld) {
  if (this.mockOAuthServer) {
    try {
      await Promise.race([
        this.mockOAuthServer.stop(),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);
    } catch {
      // Ignore errors during cleanup
    } finally {
      this.mockOAuthServer = undefined;
    }
  }
});
