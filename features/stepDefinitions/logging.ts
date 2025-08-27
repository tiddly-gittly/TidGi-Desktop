import { DataTable, Then } from '@cucumber/cucumber';
import fs from 'fs';
import path from 'path';
import { logsDirectory } from '../supports/paths';
import { ApplicationWorld } from './application';

Then('I should find log entries containing', async function(this: ApplicationWorld, dataTable: DataTable | undefined) {
  const expectedRows = dataTable?.raw().map((r: string[]) => r[0]);

  // Only consider normal daily log files like TidGi-2025-08-27.log and exclude exception logs
  const files = fs.readdirSync(logsDirectory).filter((f) => /TidGi-\d{4}-\d{2}-\d{2}\.log$/.test(f));
  const latestLogFilePath = files.length > 0 ? files.sort().reverse()[0] : null;
  const content = latestLogFilePath ? fs.readFileSync(path.join(logsDirectory, latestLogFilePath), 'utf8') : '<no-log-found>';

  const missing = expectedRows?.filter((r: string) => !content.includes(r));
  if (missing?.length) {
    throw new Error(`Missing expected log messages "${missing.map(item => item.slice(0, 10)).join('...", "')}..." on latest log file: ${latestLogFilePath}`);
  }
});
