/* eslint-disable unicorn/filename-case */
import { After, Before, Status } from '@cucumber/cucumber';
import fs from 'fs-extra';

import { temporarySettingPath, mockWikiPath } from './constants';
import { TiddlyGitWorld } from './world';

Before(async function () {
  // clear setting folder
  await fs.remove(temporarySettingPath);
  await fs.remove(mockWikiPath);
});

After(async function (this: TiddlyGitWorld, testCase) {
  // print logs if test failed
  if (this.app !== undefined && testCase.result?.status === Status.FAILED) {
    console.log('main:\n---\n');
    await this.app.client.getMainProcessLogs().then(function (logs) {
      logs.forEach(function (log) {
        console.log(log, '\n');
      });
    });
    console.log('renderer:\n---\n');
    await this.app.client.getRenderProcessLogs().then(function (logs) {
      logs.forEach(function (log) {
        console.log(JSON.stringify(log), '\n');
      });
    });
    console.log('\n');
  }
  await this.close();
});
