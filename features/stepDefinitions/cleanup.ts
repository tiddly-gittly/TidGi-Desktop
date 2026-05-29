import { After, Before } from '@cucumber/cucumber';
import fs from 'fs-extra';
import path from 'path';
import type { MockAnalyticsServer } from '../supports/mockAnalytics';
import { makeSlugPath } from '../supports/paths';
import { clearAISettings } from './agent';
import { ApplicationWorld } from './application';
import { clearTidgiMiniWindowSettings } from './tidgiMiniWindow';
import { clearHibernationTestData, clearSubWikiRoutingTestData } from './wiki';

Before(async function(this: ApplicationWorld, { pickle }) {
  // Initialize scenario-specific paths
  this.scenarioName = pickle.name;
  this.scenarioSlug = makeSlugPath(pickle.name, 60);
  this.scenarioTags = pickle.tags.map((tag) => tag.name);

  const scenarioRoot = path.resolve(process.cwd(), 'test-artifacts', this.scenarioSlug);
  const logsDirectory = path.resolve(scenarioRoot, 'userData-test', 'logs');
  const screenshotsDirectory = path.resolve(logsDirectory, 'screenshots');
  const wikiTestRoot = path.resolve(scenarioRoot, 'wiki-test');

  // Clean previous runs with the same slug so that calibration/preflight
  // artifacts (userData, wiki-test, logs) never leak into the actual shard run.
  // On Windows, a recently-killed process may still hold file locks for a few
  // hundred milliseconds, so we retry removal a few times before giving up.
  if (await fs.pathExists(scenarioRoot)) {
    if (process.platform === 'win32') {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await fs.remove(scenarioRoot);
          break;
        } catch {
          if (attempt === 4) {
            console.warn(`[cleanup] Could not remove ${scenarioRoot} after 5 attempts — proceeding anyway`);
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
    } else {
      await fs.remove(scenarioRoot);
    }
  }

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
    if (process.platform === 'win32') {
      // Windows: hard-kill the process tree FIRST, before any graceful close.
      // window.close() -> windowAllClosed -> app.quit() enters before-quit,
      // which prevents default and runs async cleanup. Our 1s/0.5s test timeouts
      // inevitably interrupt that cleanup, leaving zombie child processes that
      // contaminate subsequent scenarios. taskkill /T /F while the parent is still
      // alive reliably terminates the whole tree.
      if (this.appPid !== undefined) {
        try {
          const { execSync } = await import('child_process');
          execSync(`taskkill /PID ${this.appPid} /T /F`, { stdio: 'ignore' });
        } catch {
          // Process already exited or kill failed — ignore
        }
        this.appPid = undefined;
      }
      // Give Windows a moment to fully terminate processes and release file locks
      // before the next scenario's Before hook tries to remove scenarioRoot.
      await new Promise((resolve) => setTimeout(resolve, 500));
      // Best-effort Playwright handle cleanup after the process is dead.
      try {
        await Promise.race([
          this.app.context().close({ reason: 'Force cleanup after test' }),
          new Promise((resolve) => setTimeout(resolve, 500)),
        ]);
      } catch {
        // ignore
      }
    } else {
      // Non-Windows: graceful close, then force close, then SIGKILL fallback.
      try {
        // Close all windows including tidgi mini window before closing the app, otherwise it might hang, and refused to exit until ctrl+C
        const allWindows = this.app.windows();

        await Promise.allSettled(
          allWindows.map(async (window) => {
            if (window.isClosed()) return;

            try {
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
            }
          }),
        );

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
      } finally {
        try {
          await Promise.race([
            this.app.context().close({ reason: 'Force cleanup after test' }),
            new Promise((resolve) => setTimeout(resolve, 500)),
          ]);
        } catch {
          // Even force close can fail, but we don't care - move on
        }

        if (this.appPid !== undefined) {
          try {
            process.kill(this.appPid, 'SIGKILL');
          } catch {
            // Process already exited or kill failed — ignore
          }
          this.appPid = undefined;
        }
      }
    }

    // Clear references immediately
    this.app = undefined;
    this.mainWindow = undefined;
    this.currentWindow = undefined;
  }

  // Aggressive scenario artifact cleanup: remove the entire scenario root directory
  // on Windows so that calibration runs cannot leak files into the real shard.
  // On non-Windows the Before hook handles this, but doing it here too adds safety.
  if (process.platform === 'win32') {
    const scenarioRoot = path.resolve(process.cwd(), 'test-artifacts', this.scenarioSlug);
    if (await fs.pathExists(scenarioRoot)) {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await fs.remove(scenarioRoot);
          break;
        } catch {
          if (attempt === 4) {
            console.warn(`[cleanup] After hook could not remove ${scenarioRoot} after 5 attempts`);
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
    }
  }

  // Stop mock analytics server if it was started for this scenario
  const mockAnalyticsServer = (this as unknown as Record<string, unknown>).mockAnalyticsServer as MockAnalyticsServer | undefined;
  if (mockAnalyticsServer) {
    try {
      await mockAnalyticsServer.stop();
    } catch {
      // Server may already be stopped — ignore
    }
    (this as unknown as Record<string, unknown>).mockAnalyticsServer = undefined;
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
