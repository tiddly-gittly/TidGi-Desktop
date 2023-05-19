import { TIDDLERS_PATH } from '@/constants/paths';
import { logger } from '@services/libs/log';
import { IWorkspace } from '@services/workspaces/interface';
import fs from 'fs-extra';
import { compact, drop, take } from 'lodash';
import path from 'path';

const REPLACE_SYSTEM_TIDDLER_SYMBOL = 'search-replace:g[/],[_]search-replace:g[:],[_]';
const getMatchPart = (tagToMatch: string): string => `kin::to[${tagToMatch}]`;
const getPathPart = (folderToPlace: string): string => `${REPLACE_SYSTEM_TIDDLER_SYMBOL}addprefix[/]addprefix[${folderToPlace}]addprefix[/]addprefix[subwiki]]`;
const getTagNameFromMatchPart = (matchPart: string): string =>
  matchPart.replace(/\[(!is\[system]\s*)?kin::to\[/, '').replace(/](search-replace:g\[\/],\[_]search-replace:g\[:],\[_])?.*/, '');
const getFolderNamePathPart = (pathPart: string): string => pathPart.replace(']addprefix[/]addprefix[subwiki]]', '').replace(/.+addprefix\[/, '');

/**
 * We have a tiddler in the sub-wiki plugin that overwrite the system tiddler $:/config/FileSystemPaths
 * @param mainWikiPath subwiki's main wiki's absolute path.
 * @returns
 */
function getFileSystemPathsTiddlerPath(mainWikiPath: string): string {
  return path.join(mainWikiPath, TIDDLERS_PATH, 'FileSystemPaths.tid');
}

const emptyFileSystemPathsTiddler = `tags: $:/plugins/linonetwo/sub-wiki/readme
title: $:/config/FileSystemPaths
type: text/vnd.tiddlywiki
`;

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

  const FileSystemPathsFile = fs.existsSync(FileSystemPathsTiddlerPath) ? fs.readFileSync(FileSystemPathsTiddlerPath, 'utf8') : emptyFileSystemPathsTiddler;
  let newFileSystemPathsFile = '';
  // ignore the tags, title and type, 3 lines, and an empty line
  const header = take(FileSystemPathsFile.split('\n'), 3);
  const FileSystemPaths = compact(drop(FileSystemPathsFile.split('\n'), 3));
  // if newConfig is undefined, but oldConfig is provided, we delete the old config
  if (newConfig === undefined) {
    if (oldConfig === undefined) {
      throw new Error('Both newConfig and oldConfig are not provided in the updateSubWikiPluginContent() for\n' + JSON.stringify(mainWikiPath));
    }
    const { tagName, subWikiFolderName } = oldConfig;
    if (typeof tagName !== 'string' || subWikiFolderName === undefined) {
      throw new Error('tagName or subWikiFolderName is not string for in the updateSubWikiPluginContent() for\n' + JSON.stringify(mainWikiPath));
    }
    // find the old line, delete it
    const newFileSystemPaths = FileSystemPaths.filter((line) => !(line.includes(getMatchPart(tagName)) && line.includes(getPathPart(subWikiFolderName))));

    newFileSystemPathsFile = `${header.join('\n')}\n\n${newFileSystemPaths.join('\n')}`;
  } else {
    // if this config already exists, just return
    const { tagName, subWikiFolderName } = newConfig;
    if (typeof tagName !== 'string' || subWikiFolderName === undefined) {
      throw new Error('tagName or subWikiFolderName is not string for in the updateSubWikiPluginContent() for\n' + JSON.stringify(mainWikiPath));
    }
    if (FileSystemPaths.some((line) => line.includes(getMatchPart(tagName)) && line.includes(getPathPart(subWikiFolderName)))) {
      return;
    }
    // prepare new line
    const newConfigLine = '[' + getMatchPart(tagName) + getPathPart(subWikiFolderName);
    // if we are just to add a new config, just append it to the end of the file
    const oldConfigTagName = oldConfig?.tagName;
    if (oldConfig !== undefined && typeof oldConfigTagName === 'string') {
      // find the old line, replace it with the new line
      const newFileSystemPaths = FileSystemPaths.map((line) => {
        if (line.includes(getMatchPart(oldConfigTagName)) && line.includes(getPathPart(oldConfig.subWikiFolderName))) {
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

/**
 * "Sub-Wiki Plugin"'s content. Not about plugin content of a sub-wiki, sorry.
 * This is about tag-subwiki pair, we put tiddler with certain tag into a subwiki according to these pairs.
 */
export interface ISubWikiPluginContent {
  folderName: string;
  tagName: string;
}
/**
 * Get "Sub-Wiki Plugin"'s content
 * @param mainWikiPath subwiki's main wiki's absolute path.
 * @returns ISubWikiPluginContent
 */
export async function getSubWikiPluginContent(mainWikiPath: string): Promise<ISubWikiPluginContent[]> {
  if (mainWikiPath.length === 0) return [];
  const FileSystemPathsTiddlerPath = getFileSystemPathsTiddlerPath(mainWikiPath);
  try {
    const FileSystemPathsFile = await fs.readFile(FileSystemPathsTiddlerPath, 'utf8');
    const FileSystemPaths = compact(drop(FileSystemPathsFile.split('\n'), 3));
    return FileSystemPaths.map((line) => ({
      tagName: getTagNameFromMatchPart(line),
      folderName: getFolderNamePathPart(line),
    })).filter((item) => item.folderName.length > 0 && item.tagName.length > 0);
  } catch (error) {
    logger.error((error as Error)?.message, { function: 'getSubWikiPluginContent' });
    return [];
  }
}
