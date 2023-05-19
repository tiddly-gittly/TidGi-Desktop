import { logger } from '@services/libs/log';
import fs from 'fs-extra';
import path from 'path';

interface IGhOptions {
  branch?: string;
}
export async function updateGhConfig(wikiPath: string, options: IGhOptions): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  if (options.branch && options.branch !== 'master') {
    const ghPagesConfigPath = path.join(wikiPath, '.github', 'workflows', 'gh-pages.yml');
    try {
      const content = await fs.readFile(ghPagesConfigPath, 'utf8');
      const newContent = content.replace(/(branches:\n\s+- )(master)$/m, `$1${options.branch}`);
      await fs.writeFile(ghPagesConfigPath, newContent, 'utf8');
    } catch (error) {
      logger.error(`updateGhConfig Error: ${(error as Error).message}`);
    }
  }
}
