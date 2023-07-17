import { LOG_FOLDER } from '@/constants/appPaths';
import serviceIdentifier from '@services/serviceIdentifier';
import { debugInfo, openNewGitHubIssue } from 'electron-util';
import { INativeService } from './interface';

export function reportErrorToGithubWithTemplates(error: Error): void {
  void import('@services/container')
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    .then(({ container }) => {
      const nativeService = container.get<INativeService>(serviceIdentifier.NativeService);
      return nativeService.open(LOG_FOLDER, true);
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
