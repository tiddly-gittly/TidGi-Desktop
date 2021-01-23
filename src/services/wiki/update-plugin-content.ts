import path from 'path';
import fs from 'fs-extra';
import { take, drop, compact } from 'lodash';
import { logger } from '@services/libs/log';
import { IWorkspace } from '@services/workspaces/interface';

const getMatchPart = (tagToMatch: string): string => `[!is[system]kin::to[${tagToMatch}]`;
const getPathPart = (folderToPlace: string): string => `addprefix[/]addprefix[${folderToPlace}]addprefix[/]addprefix[subwiki]]`;
const getTagNameFromMatchPart = (matchPart: string): string => matchPart.replace('[!is[system]kin::to[', '').replace(/].*/, '');
const getFolderNamePathPart = (pathPart: string): string => pathPart.replace(']addprefix[/]addprefix[subwiki]]', '').replace(/.+addprefix\[/, '');

function getFileSystemPathsTiddlerPath(mainWikiPath: string): string {
  const pluginPath = path.join(mainWikiPath, 'plugins', 'linonetwo', 'sub-wiki');
  return path.join(pluginPath, 'FileSystemPaths.tid');
}

/**
 * update $:/config/FileSystemPaths programmatically to make private tiddlers goto the sub-wiki
 * @param {string} mainWikiPath main wiki's location path
 * @param {Object} newConfig { "tagName": Tag to indicate that a tiddler belongs to a sub-wiki, "subWikiFolderName": folder name inside the subwiki/ folder }
 * @param {Object} oldConfig if you need to replace a line, you need to pass-in what old line looks like, so here we can find and replace it
 */
export function updateSubWikiPluginContent(
  mainWikiPath: string,
  newConfig?: Pick<IWorkspace, 'tagName' | 'subWikiFolderName'>,
  oldConfig?: Pick<IWorkspace, 'tagName' | 'subWikiFolderName'>,
): void {
  const FileSystemPathsTiddlerPath = getFileSystemPathsTiddlerPath(mainWikiPath);

  const FileSystemPathsFile = fs.readFileSync(FileSystemPathsTiddlerPath, 'utf-8');
  let newFileSystemPathsFile = '';
  // ignore the tags, title and type, 3 lines, and an empty line
  const header = take(FileSystemPathsFile.split('\n'), 3);
  const FileSystemPaths = compact(drop(FileSystemPathsFile.split('\n'), 3));
  // if newConfig is undefined, but oldConfig is provided, we delete the old config
  if (newConfig === undefined) {
    if (oldConfig === undefined) {
      // @ts-expect-error ts-migrate(2554) FIXME: Expected 0-1 arguments, but got 2.
      throw new Error('Both newConfig and oldConfig are not provided in the updateSubWikiPluginContent() for', JSON.stringify(mainWikiPath));
    }
    // find the old line, delete it
    const newFileSystemPaths = FileSystemPaths.filter(
      (line) => !(line.includes(getMatchPart(oldConfig.tagName)) && line.includes(getPathPart(oldConfig.subWikiFolderName))),
    );

    newFileSystemPathsFile = `${header.join('\n')}\n\n${newFileSystemPaths.join('\n')}`;
  } else {
    // if this config already exists, just return
    if (FileSystemPaths.some((line) => line.includes(getMatchPart(newConfig.tagName)) && line.includes(getPathPart(newConfig.subWikiFolderName)))) {
      return;
    }
    // prepare new line
    const { tagName, subWikiFolderName } = newConfig;
    const newConfigLine = getMatchPart(tagName) + getPathPart(subWikiFolderName);
    // if we are just to add a new config, just append it to the end of the file
    if (oldConfig !== undefined) {
      // find the old line, replace it with the new line
      const newFileSystemPaths = FileSystemPaths.map((line) => {
        if (line.includes(getMatchPart(oldConfig.tagName)) && line.includes(getPathPart(oldConfig.subWikiFolderName))) {
          return newConfigLine;
        }
        return line;
      });

      newFileSystemPathsFile = `${header.join('\n')}\n\n${newFileSystemPaths.join('\n')}`;
    } else {
      newFileSystemPathsFile = `${FileSystemPathsFile}\n${newConfigLine}`;
    }
  }
  fs.writeFileSync(FileSystemPathsTiddlerPath, newFileSystemPathsFile);
}

export async function getSubWikiPluginContent(mainWikiPath: string): Promise<Array<{ tagName: string; folderName: string }>> {
  if (mainWikiPath.length === 0) return [];
  const FileSystemPathsTiddlerPath = getFileSystemPathsTiddlerPath(mainWikiPath);
  try {
    const FileSystemPathsFile = await fs.readFile(FileSystemPathsTiddlerPath, 'utf-8');
    const FileSystemPaths = compact(drop(FileSystemPathsFile.split('\n'), 3));
    return FileSystemPaths.map((line) => ({
      tagName: getTagNameFromMatchPart(line),
      folderName: getFolderNamePathPart(line),
    })).filter((item) => item.folderName.length > 0 && item.tagName.length > 0);
  } catch (error) {
    logger.error(error, { function: 'getSubWikiPluginContent' });
    return [];
  }
}
