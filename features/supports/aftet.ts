/* eslint-disable unicorn/filename-case */
import { After, Before, Status } from '@cucumber/cucumber';
import jetpack from 'fs-extra';
import path from 'path';
import { TiddlyGitWorld } from './world';

Before(function () {
  // TODO: clear setting folder
});

After(async function (this: TiddlyGitWorld, testCase) {
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
  return this.close();
});
