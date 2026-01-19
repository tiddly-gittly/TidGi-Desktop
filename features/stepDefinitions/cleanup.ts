import { After, AfterAll, Before } from '@cucumber/cucumber';
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

      // Try to close windows gracefully with short timeout, then force close
      await Promise.allSettled(
        allWindows.map(async (window) => {
          if (window.isClosed()) return;

          try {
            // Very short timeout for window close - we'll force close anyway
            await Promise.race([
              window.close(),
              new Promise((_, reject) =>
                setTimeout(() => {
                  reject(new Error('Window close timeout'));
                }, 1000)
              ),
            ]);
          } catch {
            // Window close failed or timed out, ignore and continue
            // Force close will happen at app level
          }
        }),
      );

      // Try to close app gracefully with short timeout
      try {
        await Promise.race([
          this.app.close(),
          new Promise((_, reject) =>
            setTimeout(() => {
              reject(new Error('App close timeout'));
            }, 1000)
          ),
        ]);
      } catch {
        // App close failed or timed out, force close immediately
      }
    } catch {
      // Any error in the try block, continue to force close
    } finally {
      // ALWAYS force close, regardless of success/failure above
      // This ensures resources are freed even if graceful close hangs
      try {
        if (this.app) {
          // Force close browser context - this kills all processes
          await Promise.race([
            this.app.context().close({ reason: 'Force cleanup after test' }),
            new Promise((resolve) => setTimeout(resolve, 500)), // 500ms max for force close
          ]);
        }
      } catch {
        // Even force close can fail, but we don't care - move on
      }

      // Clear references immediately
      this.app = undefined;
      this.mainWindow = undefined;
      this.currentWindow = undefined;
    }
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

// Force exit after all tests complete to prevent hanging
AfterAll({ timeout: 5000 }, async function() {
  // Give a short grace period for any final cleanup
  await new Promise((resolve) => setTimeout(resolve, 1000));
  
  // Force exit the process
  // This is necessary because sometimes Electron/Playwright resources don't fully clean up
  process.exit(0);
});
