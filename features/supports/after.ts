import { After, Before } from '@cucumber/cucumber';
import fs from 'fs-extra';

import { SETTINGS_FOLDER } from '../../src/constants/appPaths';
import { DEFAULT_WIKI_FOLDER } from '../../src/constants/paths';
import { TidGiWorld } from './world';

Before(async function() {
  // clear setting folder
  await fs.remove(SETTINGS_FOLDER);
  await fs.remove(DEFAULT_WIKI_FOLDER);
});

After(async function(this: TidGiWorld, testCase) {
  // print logs if test failed
  // if (this.app !== undefined && testCase.result?.status === Status.FAILED) {
  //   console.log('main:\n---\n');
  //   // FIXME: TypeError: this.app.client.getMainProcessLogs is not a function
  //   await this.app.client.getMainProcessLogs().then(function (logs) {
  //     logs.forEach(function (log) {
  //       console.log(log, '\n');
  //     });
  //   });
  //   console.log('renderer:\n---\n');
  //   await this.app.client.getRenderProcessLogs().then(function (logs) {
  //     logs.forEach(function (log) {
  //       console.log(JSON.stringify(log), '\n');
  //     });
  //   });
  //   console.log('\n');
  // }
  await this.close();
});
