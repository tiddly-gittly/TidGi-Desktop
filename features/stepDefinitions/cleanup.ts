import { After, Before } from '@cucumber/cucumber';
import fs from 'fs-extra';
import { logsDirectory, screenshotsDirectory } from '../supports/paths';
import { clearAISettings } from './agent';
import { ApplicationWorld } from './application';
import { clearTidgiMiniWindowSettings } from './tidgiMiniWindow';
import { clearSubWikiRoutingTestData } from './wiki';

Before(async function(this: ApplicationWorld, { pickle }) {
  // Create necessary directories under userData-test/logs to match appPaths in dev/test
  if (!(await fs.pathExists(logsDirectory))) {
    await fs.ensureDir(logsDirectory);
  }

  // Create screenshots subdirectory in logs
  if (!(await fs.pathExists(screenshotsDirectory))) {
    await fs.ensureDir(screenshotsDirectory);
  }

  if (pickle.tags.some((tag) => tag.name === '@ai-setting')) {
    await clearAISettings();
  }
  if (pickle.tags.some((tag) => tag.name === '@tidgi-mini-window')) {
    await clearTidgiMiniWindowSettings();
  }
});

After(async function(this: ApplicationWorld, { pickle }) {
  // IMPORTANT: Close app FIRST before cleaning up files
  // This releases file locks so wiki folders can be deleted
  if (this.app) {
    try {
      // Close all windows including tidgi mini window before closing the app, otherwise it might hang, and refused to exit until ctrl+C
      const allWindows = this.app.windows();
      await Promise.all(
        allWindows.map(async (window) => {
          try {
            if (!window.isClosed()) {
              await window.close();
            }
          } catch (error) {
            console.error('Error closing window:', error);
          }
        }),
      );
      await this.app.close();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
    this.app = undefined;
    this.mainWindow = undefined;
    this.currentWindow = undefined;
  }

  // Clean up settings and test data AFTER app is closed
  if (pickle.tags.some((tag) => tag.name === '@tidgi-mini-window')) {
    await clearTidgiMiniWindowSettings();
  }
  if (pickle.tags.some((tag) => tag.name === '@ai-setting')) {
    await clearAISettings();
  }
  if (pickle.tags.some((tag) => tag.name === '@subwiki')) {
    await clearSubWikiRoutingTestData();
  }
  // Clean up git state after git tests to prevent state pollution
  // Git tests create commits that can affect subsequent tests
  // MUST happen AFTER app.close() to release file locks
  if (pickle.tags.some((tag) => tag.name === '@git')) {
    const { default: path } = await import('node:path');
    const wikiTestWikiPath = path.join(process.cwd(), 'wiki-test', 'wiki');
    if (await fs.pathExists(wikiTestWikiPath)) {
      try {
        await fs.remove(wikiTestWikiPath);
      } catch (error) {
        console.warn('Failed to remove wiki folder in git cleanup:', error);
        // Don't fail the test if cleanup fails
      }
    }
  }

  // Separate logs by test scenario for easier debugging
  try {
    const today = new Date().toISOString().split('T')[0];
    const wikiLogFile = `${logsDirectory}/wiki-${today}.log`;
    const tidgiLogFile = `${logsDirectory}/TidGi-${today}.log`;

    // Create a sanitized scenario name for the log files
    const scenarioName = pickle.name.replace(/[^a-z0-9]/gi, '_').substring(0, 50);

    if (await fs.pathExists(wikiLogFile)) {
      const targetWikiLog = `${logsDirectory}/${scenarioName}_wiki.log`;
      await fs.move(wikiLogFile, targetWikiLog, { overwrite: true });
    }

    if (await fs.pathExists(tidgiLogFile)) {
      const targetTidgiLog = `${logsDirectory}/${scenarioName}_TidGi.log`;
      await fs.move(tidgiLogFile, targetTidgiLog, { overwrite: true });
    }
  } catch (error) {
    console.error('Error moving log files:', error);
  }
});
