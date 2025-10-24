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

  // Read file content atomically - re-read just before write to minimize race condition window
  const readFileContent = () => fs.existsSync(FileSystemPathsTiddlerPath) ? fs.readFileSync(FileSystemPathsTiddlerPath, 'utf8') : emptyFileSystemPathsTiddler;
  const FileSystemPathsFile = readFileContent();
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
  
  // Helper function to recalculate file content from fresh data
  const recalculateContent = (freshFileContent: string): string => {
    const lines = freshFileContent.split('\n');
    const freshHeader = lines.filter((line) => line.startsWith('\\'));
    const freshFileSystemPaths = lines.filter((line) => !line.startsWith('\\') && line.length > 0);
    
    if (newConfig === undefined) {
      // Delete operation
      if (oldConfig === undefined || typeof oldConfig.tagName !== 'string' || typeof oldConfig.subWikiFolderName !== 'string') {
        throw new Error('Invalid oldConfig in delete operation');
      }
      const { tagName: oldTagName, subWikiFolderName: oldSubWikiFolderName } = oldConfig;
      const newPaths = freshFileSystemPaths.filter((line) =>
        !(line.includes(getMatchPart(oldTagName)) && line.includes(getPathPart(oldSubWikiFolderName, subWikiPathDirectoryName)))
      );
      return `${freshHeader.join('\n')}\n\n${newPaths.join('\n')}`;
    } else {
      // Add or update operation
      const { tagName: newTagName, subWikiFolderName: newSubWikiFolderName } = newConfig;
      if (typeof newTagName !== 'string' || typeof newSubWikiFolderName !== 'string') {
        throw new Error('Invalid newConfig in add/update operation');
      }
      
      const newConfigLine = '[' + getMatchPart(newTagName) + andPart + getPathPart(newSubWikiFolderName, subWikiPathDirectoryName);
      
      if (oldConfig !== undefined && typeof oldConfig.tagName === 'string' && typeof oldConfig.subWikiFolderName === 'string') {
        // Update: replace old line with new line
        const { tagName: oldTagName, subWikiFolderName: oldSubWikiFolderName } = oldConfig;
        const newPaths = freshFileSystemPaths.map((line) => {
          if (line.includes(oldTagName) && line.includes(oldSubWikiFolderName)) {
            return newConfigLine;
          }
          return line;
        });
        return `${freshHeader.join('\n')}\n\n${newPaths.join('\n')}`;
      } else {
        // Add: append new line
        return `${freshFileContent}\n${newConfigLine}`;
      }
    }
  };

  // Retry mechanism to handle race conditions
  const MAX_RETRIES = 3;
  let retryCount = 0;
  let success = false;

  while (retryCount < MAX_RETRIES && !success) {
    try {
      const currentContent = readFileContent();
      
      // If file hasn't changed since initial read, write our calculated content
      if (currentContent === FileSystemPathsFile) {
        fs.writeFileSync(FileSystemPathsTiddlerPath, newFileSystemPathsFile);
        success = true;
      } else if (retryCount < MAX_RETRIES - 1) {
        // File was modified by another process, retry with fresh data to avoid data loss
        console.warn(`[subWikiPlugin] File was modified during update, retrying with fresh data (attempt ${retryCount + 1}/${MAX_RETRIES})`);
        
        // Recalculate content based on fresh file data
        newFileSystemPathsFile = recalculateContent(currentContent);
        
        retryCount++;
      } else {
        // Final attempt: recalculate one last time and write
        console.error('[subWikiPlugin] Max retries reached, forcing write with latest data. Concurrent modifications may be lost.');
        newFileSystemPathsFile = recalculateContent(currentContent);
        fs.writeFileSync(FileSystemPathsTiddlerPath, newFileSystemPathsFile);
        success = true;
      }
    } catch (error) {
      console.error('[subWikiPlugin] Error writing file:', error);
      throw error;
    }
  }
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
    logger.error((error as Error).message, { error, function: 'getSubWikiPluginContent' });
    return [];
  }
}
