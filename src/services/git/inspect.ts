import path from 'path';
import { compact } from 'lodash';
import { GitProcess } from 'dugite';

export interface ModifiedFileList {
  type: string;
  fileRelativePath: string;
  filePath: string;
}
/**
 * Get modified files and modify type in a folder
 * @param {string} wikiFolderPath location to scan git modify state
 */
export async function getModifiedFileList(wikiFolderPath: string): Promise<ModifiedFileList[]> {
  const { stdout } = await GitProcess.exec(['status', '--porcelain'], wikiFolderPath);
  const stdoutLines = stdout.split('\n');
  return compact(compact(stdoutLines).map((line) => /^\s?(\?\?|[ACMR]|[ACMR][DM])\s?(\S+)$/.exec(line))).map(([_, type, fileRelativePath]) => ({
    type,
    fileRelativePath,
    filePath: path.join(wikiFolderPath, fileRelativePath),
  }));
}
