import fs from 'fs-extra';
import path from 'path';

export async function getExistingParentDirectory(pathToCheck: string): Promise<string> {
  const parentDirectory = path.dirname(pathToCheck);
  if (await fs.exists(parentDirectory)) {
    return parentDirectory;
  }
  return await getExistingParentDirectory(parentDirectory);
}
