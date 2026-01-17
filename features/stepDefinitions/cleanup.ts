import { After, Before } from '@cucumber/cucumber';
import fs from 'fs-extra';
import path from 'path';
import { makeSlugPath } from '../supports/paths';
import { clearAISettings } from './agent';
import { ApplicationWorld } from './application';
import { clearTidgiMiniWindowSettings } from './tidgiMiniWindow';
import { clearGitTestData, clearHibernationTestData, clearSubWikiRoutingTestData } from './wiki';

Before(async function(this: ApplicationWorld, { pickle }) {
  // Initialize scenario-specific paths
  this.scenarioName = pickle.name;
  this.scenarioSlug = makeSlugPath(pickle.name, 60);

  const scenarioRoot = path.resolve(process.cwd(), 'test-artifacts', this.scenarioSlug);
  const logsDirectory = path.resolve(scenarioRoot, 'userData-test', 'logs');
  const screenshotsDirectory = path.resolve(logsDirectory, 'screenshots');
  const wikiTestRoot = path.resolve(scenarioRoot, 'wiki-test');

  // Create necessary directories for this scenario
  await fs.ensureDir(logsDirectory);
  await fs.ensureDir(screenshotsDirectory);
  await fs.ensureDir(wikiTestRoot); // Ensure wiki-test root exists for default wiki creation

  if (pickle.tags.some((tag) => tag.name === '@ai-setting')) {
    await clearAISettings(scenarioRoot);
  }
  if (pickle.tags.some((tag) => tag.name === '@tidgi-mini-window')) {
    await clearTidgiMiniWindowSettings(scenarioRoot);
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
              // CRITICAL WARNING: DO NOT INCREASE TIMEOUT VALUES!
              // Timeout = failure. If this times out, there is a real bug to fix.
              // Read docs/Testing.md before modifying any timeout.
              // Local: max 5s, CI: max 10s (2x local), internal steps should be faster than that
              const windowCloseTimeout = process.env.CI ? 5000 : 2500;
              await Promise.race([
                window.close(),
                new Promise((_, reject) =>
                  setTimeout(() => {
                    reject(new Error('Window close timeout'));
                  }, windowCloseTimeout)
                ),
              ]);
            }
          } catch (error) {
            console.error('Error closing window:', error);
          }
        }),
      );

      // CRITICAL WARNING: DO NOT INCREASE TIMEOUT VALUES!
      // Timeout = failure. If this times out, there is a real bug to fix.
      // Read docs/Testing.md before modifying any timeout.
      // Local: max 5s, CI: max 10s (2x local), internal steps should be faster than that
      const appCloseTimeout = process.env.CI ? 5000 : 2500;
      await Promise.race([
        this.app.close(),
        new Promise((_, reject) =>
          setTimeout(() => {
            reject(new Error('App close timeout'));
          }, appCloseTimeout)
        ),
      ]);
    } catch (error) {
      console.error('Error during cleanup:', error);
      // Force kill the app if it hangs
      try {
        if (this.app) {
          await this.app.context().close();
        }
      } catch (forceCloseError) {
        console.error('Error force closing app:', forceCloseError);
      }
    }
    this.app = undefined;
    this.mainWindow = undefined;
    this.currentWindow = undefined;
  }

  const scenarioRoot = path.resolve(process.cwd(), 'test-artifacts', this.scenarioSlug);

  // Clean up settings and test data AFTER app is closed
  if (pickle.tags.some((tag) => tag.name === '@tidgi-mini-window')) {
    await clearTidgiMiniWindowSettings(scenarioRoot);
  }
  if (pickle.tags.some((tag) => tag.name === '@ai-setting')) {
    await clearAISettings(scenarioRoot);
  }
  if (pickle.tags.some((tag) => tag.name === '@subwiki')) {
    await clearSubWikiRoutingTestData(scenarioRoot);
  }
  // Clean up git test data to prevent state pollution between git tests
  // Removes entire wiki folder - it will be recreated on next test start
  if (pickle.tags.some((tag) => tag.name === '@git')) {
    await clearGitTestData(scenarioRoot);
  }
  // Clean up hibernation test data - remove wiki2 folder created during tests
  if (pickle.tags.some((tag) => tag.name === '@hibernation')) {
    await clearHibernationTestData(scenarioRoot);
  }
  // Clean up move workspace test data - remove wiki-test-moved folder
  if (pickle.tags.some((tag) => tag.name === '@move-workspace')) {
    const wikiTestMovedPath = path.resolve(scenarioRoot, 'wiki-test-moved');
    if (await fs.pathExists(wikiTestMovedPath)) {
      await fs.remove(wikiTestMovedPath);
    }
  }

  // Scenario-specific logs are already in the right place, no need to move them
});
