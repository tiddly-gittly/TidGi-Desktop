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
    template: 'bug.md',
    title: `bug: ${(error.message ?? '').substring(0, 100)}`,
    body: `## Environment

${debugInfo()}

## Description:

<!-- Upload log file, Describe how the bug manifests and what the behavior would be without the bug. 上传 log 文件，描述该错误是如何表现出来的，以及在正常情况下应该有什么样的行为 -->

## Steps to Reproduce:

<!--  Please explain the steps required to duplicate the issue, especially if you are able to provide a sample or a screen recording. 请解释复现该问题所需的步骤，有录屏最好。 -->

## Additional Context

\`\`\`typescript\n${error.stack ?? 'No error.stack'}\n\`\`\`

---

<!-- List any other information that is relevant to your issue. Stack traces, related issues, suggestions on how to add, use case, forum links, screenshots, OS if applicable, etc. 列出与你的问题有关的任何其他信息。报错堆栈、相关问题（issue）、关于如何添加的建议、使用案例、论坛链接、屏幕截图、操作系统（如果适用）等等。 -->

`,
  });
}
