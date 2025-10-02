import { TIDDLERS_PATH } from '@/constants/paths';
import { logger } from '@services/libs/log';
import { IWikiWorkspace } from '@services/workspaces/interface';
import fs from 'fs-extra';
import { compact, drop, take } from 'lodash';
import path from 'path';

/**
 * [in-tagtree-of[APrivateContent]]:and[search-replace:g[/],[_]search-replace:g[:],[_]addprefix[/]addprefix[private-wiki]addprefix[/]addprefix[subwiki]]
 */
const REPLACE_SYSTEM_TIDDLER_SYMBOL = 'search-replace:g[/],[_]search-replace:g[:],[_]';
const getMatchPart = (tagToMatch: string): string => `in-tagtree-of[${tagToMatch}]`;
const andPart = ']:and[';
const getPathPart = (subWikiFolderName: string, subWikiPathDirectoryName: string): string =>
  `${REPLACE_SYSTEM_TIDDLER_SYMBOL}addprefix[/]addprefix[${subWikiPathDirectoryName}]addprefix[/]addprefix[${subWikiFolderName}]]`;
const getTagNameFromMatchPart = (matchPart: string): string =>
  matchPart.replace(/\[(!is\[system]\s*)?in-tagtree-of\[/, '').replace(/](search-replace:g\[\/],\[_]search-replace:g\[:],\[_])?.*/, '');
const getFolderNamePathPart = (pathPart: string): string => pathPart.replace(']addprefix[/]addprefix[subwiki]]', '').replace(/.+addprefix\[/, '');

/**
 * We have a tiddler in the sub-wiki plugin that overwrite the system tiddler $:/config/FileSystemPaths
 * @param mainWikiPath subwiki's main wiki's absolute path.
 * @returns
 */
function getFileSystemPathsTiddlerPath(mainWikiPath: string): string {
  return path.join(mainWikiPath, TIDDLERS_PATH, 'FileSystemPaths.tid');
}

const emptyFileSystemPathsTiddler = `title: $:/config/FileSystemPaths
`;

/**
 * update $:/config/FileSystemPaths programmatically to make private tiddlers goto the sub-wiki
 * @param {string} mainWikiPath main wiki's location path
 * @param {string} subWikiPath sub wiki's location path
 * @param {Object} newConfig { "tagName": Tag to indicate that a tiddler belongs to a sub-wiki, "subWikiFolderName": folder name containing all subwiki, default to `/subwiki` }
 * @param {Object} oldConfig if you need to replace a line, you need to pass-in what old line looks like, so here we can find and replace it
 */
export function updateSubWikiPluginContent(
  mainWikiPath: string,
  subWikiPath: string,
  newConfig?: Pick<IWikiWorkspace, 'tagName' | 'subWikiFolderName'>,
  oldConfig?: Pick<IWikiWorkspace, 'tagName' | 'subWikiFolderName'>,
): void {
  const FileSystemPathsTiddlerPath = getFileSystemPathsTiddlerPath(mainWikiPath);

  const FileSystemPathsFile = fs.existsSync(FileSystemPathsTiddlerPath) ? fs.readFileSync(FileSystemPathsTiddlerPath, 'utf8') : emptyFileSystemPathsTiddler;
  let newFileSystemPathsFile = '';
  // ignore the tags, title and type, 3 lines, and an empty line
  const header = take(FileSystemPathsFile.split('\n\n'), 1);
  const FileSystemPaths = compact(drop(FileSystemPathsFile.split('\n\n'), 1));
  const subWikiPathDirectoryName = path.basename(subWikiPath);
  // if newConfig is undefined, but oldConfig is provided, we delete the old config
  if (newConfig === undefined) {
    if (oldConfig === undefined) {
      throw new Error('Both newConfig and oldConfig are not provided in the updateSubWikiPluginContent() for\n' + JSON.stringify(mainWikiPath));
    }
    const { tagName, subWikiFolderName } = oldConfig;
    if (typeof tagName !== 'string' || typeof subWikiFolderName !== 'string') {
      throw new Error('tagName or subWikiFolderName is not string for in the updateSubWikiPluginContent() for\n' + JSON.stringify(mainWikiPath));
    }
    // find the old line, delete it
    const newFileSystemPaths = FileSystemPaths.filter((line) => !(line.includes(getMatchPart(tagName)) && line.includes(getPathPart(subWikiFolderName, subWikiPathDirectoryName))));

    newFileSystemPathsFile = `${header.join('\n')}\n\n${newFileSystemPaths.join('\n')}`;
  } else {
    // if this config already exists, just return
    const { tagName, subWikiFolderName } = newConfig;
    if (typeof tagName !== 'string' || typeof subWikiFolderName !== 'string') {
      throw new Error('tagName or subWikiFolderName is not string for in the updateSubWikiPluginContent() for\n' + JSON.stringify(mainWikiPath));
    }
    if (FileSystemPaths.some((line) => line.includes(tagName) && line.includes(subWikiFolderName))) {
      return;
    }
    // prepare new line
    const newConfigLine = '[' + getMatchPart(tagName) + andPart + getPathPart(subWikiFolderName, subWikiPathDirectoryName);
    // if we are just to add a new config, just append it to the end of the file
    const oldConfigTagName = oldConfig?.tagName;
    if (oldConfig !== undefined && typeof oldConfigTagName === 'string' && typeof oldConfig.subWikiFolderName === 'string') {
      // find the old line, replace it with the new line
      const newFileSystemPaths = FileSystemPaths.map((line) => {
        if (line.includes(oldConfigTagName) && line.includes(oldConfig.subWikiFolderName)) {
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
    const FileSystemPaths = compact(drop(FileSystemPathsFile.split('\n\n'), 1));
    return FileSystemPaths.map((line) => ({
      tagName: getTagNameFromMatchPart(line),
      folderName: getFolderNamePathPart(line),
    })).filter((item) => item.folderName.length > 0 && item.tagName.length > 0);
  } catch (error) {
    logger.error((error as Error).message, { function: 'getSubWikiPluginContent' });
    return [];
  }
}
