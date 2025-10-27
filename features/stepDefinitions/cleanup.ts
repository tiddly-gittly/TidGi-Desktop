import { After, Before } from '@cucumber/cucumber';
import fs from 'fs-extra';
import { logsDirectory, screenshotsDirectory } from '../supports/paths';
import { clearAISettings } from './agent';
import { ApplicationWorld } from './application';
import { clearTidgiMiniWindowSettings } from './tidgiMiniWindow';
import { clearSubWikiRoutingTestData } from './wiki';

Before(function(this: ApplicationWorld, { pickle }) {
  // Create necessary directories under userData-test/logs to match appPaths in dev/test
  if (!fs.existsSync(logsDirectory)) {
    fs.mkdirSync(logsDirectory, { recursive: true });
  }

  // Create screenshots subdirectory in logs
  if (!fs.existsSync(screenshotsDirectory)) {
    fs.mkdirSync(screenshotsDirectory, { recursive: true });
  }

  if (pickle.tags.some((tag) => tag.name === '@ai-setting')) {
    clearAISettings();
  }
  if (pickle.tags.some((tag) => tag.name === '@tidgi-mini-window')) {
    clearTidgiMiniWindowSettings();
  }
});

After(async function(this: ApplicationWorld, { pickle }) {
  if (this.app) {
    try {
      // Close all windows including tidgi mini window before closing the app, otherwise it might hang, and refused to exit until ctrl+C
      const allWindows = this.app.windows();
      for (const window of allWindows) {
        try {
          if (!window.isClosed()) {
            await window.close();
          }
        } catch (error) {
          console.error('Error closing window:', error);
        }
      }
      await this.app.close();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
    this.app = undefined;
    this.mainWindow = undefined;
    this.currentWindow = undefined;
  }
  if (pickle.tags.some((tag) => tag.name === '@tidgi-mini-window')) {
    clearTidgiMiniWindowSettings();
  }
  if (pickle.tags.some((tag) => tag.name === '@ai-setting')) {
    clearAISettings();
  }
  if (pickle.tags.some((tag) => tag.name === '@subwiki')) {
    clearSubWikiRoutingTestData();
  }
});
