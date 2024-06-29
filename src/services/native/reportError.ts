import { LOG_FOLDER } from '@/constants/appPaths';
import serviceIdentifier from '@services/serviceIdentifier';
import { app, shell } from 'electron';
import newGithubIssueUrl, { type Options as OpenNewGitHubIssueOptions } from 'new-github-issue-url';
import os from 'os';
import { INativeService } from './interface';

/**
Opens the new issue view on the given GitHub repo in the browser.
Optionally, with some fields like title and body prefilled.

@param options - The options are passed to the [`new-github-issue-url`](https://github.com/sindresorhus/new-github-issue-url#options) package.

@example
```
import {openNewGitHubIssue} from 'electron-util';

openNewGitHubIssue({
	user: 'sindresorhus',
	repo: 'playground',
	body: 'Hello'
});
*/
export const openNewGitHubIssue = (options: OpenNewGitHubIssueOptions) => {
  const url = newGithubIssueUrl(options);
  void shell.openExternal(url);
};

/**
Electron version.

@example
```
'1.7.9'
```
*/
export const electronVersion = process.versions.electron ?? '0.0.0';

/**
For example, use this in the `body` option of the `.openNewGitHubIssue()` method.

@returns A string with debug info suitable for inclusion in bug reports.

@example
```
import {debugInfo} from 'electron-util';

console.log(debugInfo());
//=> 'AppName 2.21.0\nElectron 3.0.6\ndarwin 18.2.0\nLocale: en-US'
```
*/
export const debugInfo = () =>
  `
${app.name} ${app.getVersion()}
Electron ${electronVersion}
${process.platform} ${os.release()}
Locale: ${app.getLocale()}
`.trim();

export function reportErrorToGithubWithTemplates(error: Error): void {
  void import('@services/container')
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    .then(({ container }) => {
      const nativeService = container.get<INativeService>(serviceIdentifier.NativeService);
      return nativeService.openPath(LOG_FOLDER, true);
    })
    .catch(async (error) => {
      await import('@services/libs/log').then(({ logger }) => {
        logger.error(`Failed to open LOG_FOLDER in reportErrorToGithubWithTemplates`, error);
      });
    });
  openNewGitHubIssue({
    user: 'tiddly-gittly',
    repo: 'TidGi-Desktop',
    template: 'bug.yml',
    title: `bug: ${(error.message ?? '').substring(0, 100)}`,
    body: `### Environment 环境信息

${debugInfo()}

### Description 描述

${(error.message ?? '')}

${(error.stack ?? '')}

### Steps to Reproduce 复现方式



### Additional Context 额外上下文


`,
  });
}
