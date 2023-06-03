/**
 * Copy from https://github.com/sindresorhus/app-path and modified.
 */
import { isDevelopmentOrTest } from '@/constants/environment';
import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';

const repoFolder = path.join(__dirname, '..', '..', '..', '..', '..');

const improveError = (error: Error): Error => {
  if ((error as Error & { exitCode: number }).exitCode === 2) {
    error.message = "Couldn't find the app";
  }

  return error;
};

export default async function appPath(appName: string): Promise<string | null> {
  try {
    const { stdout } = await promisify(execFile)(
      isDevelopmentOrTest ? path.join(repoFolder, 'node_modules', 'app-path', 'main') : path.join(process.resourcesPath, 'node_modules', 'app-path', 'main'),
      [appName],
    );
    return stdout.toString().replace('\n', '');
  } catch (error) {
    throw improveError(error as Error);
  }
}
