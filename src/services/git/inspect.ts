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

/**
 * Inspect git's remote url from folder's .git config
 * @param wikiFolderPath git folder to inspect
 * @returns remote url
 */
export async function getRemoteUrl(wikiFolderPath: string): Promise<string> {
  const { stdout: remoteStdout } = await GitProcess.exec(['remote'], wikiFolderPath);
  const remotes = compact(remoteStdout.split('\n'));
  const githubRemote = remotes.find((remote) => remote === 'origin') ?? remotes[0] ?? '';
  if (githubRemote.length > 0) {
    const { stdout: remoteUrlStdout } = await GitProcess.exec(['remote', 'get-url', githubRemote], wikiFolderPath);
    return remoteUrlStdout.replace('.git', '');
  }
  return '';
}
