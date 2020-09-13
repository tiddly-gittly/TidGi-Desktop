const path = require('path');
const fs = require('fs-extra');
const { take, drop, compact } = require('lodash');
const { logger } = require('../log');

const getMatchPart = tagToMatch => `[!is[system]kin::to[${tagToMatch}]`;
const getPathPart = folderToPlace => `addprefix[${folderToPlace}]addprefix[/]addprefix[subwiki]]`;
const getTagNameFromMatchPart = matchPart => matchPart.replace('[!is[system]kin::to[', '').replace(/].*/, '');
const getFolderNamePathPart = pathPart =>
  pathPart.replace(']addprefix[/]addprefix[subwiki]]', '').replace(/.+addprefix\[/, '');

function getFileSystemPathsTiddlerPath(mainWikiPath) {
  const pluginPath = path.join(mainWikiPath, 'plugins', 'linonetwo', 'sub-wiki');
  return path.join(pluginPath, 'FileSystemPaths.tid');
}

/**
 * update $:/config/FileSystemPaths programmatically to make private tiddlers goto the sub-wiki
 * @param {string} mainWikiPath main wiki's location path
 * @param {Object} newConfig { "tagName": Tag to indicate that a tiddler belongs to a sub-wiki, "subWikiFolderName": folder name inside the subwiki/ folder }
 * @param {Object} oldConfig if you need to replace a line, you need to pass-in what old line looks like, so here we can find and replace it
 */
function updateSubWikiPluginContent(mainWikiPath, newConfig, oldConfig) {
  const FileSystemPathsTiddlerPath = getFileSystemPathsTiddlerPath(mainWikiPath);

  const FileSystemPathsFile = fs.readFileSync(FileSystemPathsTiddlerPath, 'utf-8');
  let newFileSystemPathsFile = '';
  // ignore the tags, title and type, 3 lines, and an empty line
  const header = take(FileSystemPathsFile.split('\n'), 3);
  const FileSystemPaths = compact(drop(FileSystemPathsFile.split('\n'), 3));
  // if newConfig is undefined, but oldConfig is provided, we delete the old config
  if (!newConfig) {
    if (!oldConfig) {
      throw new Error(
        'Both newConfig and oldConfig are not provided in the updateSubWikiPluginContent() for',
        JSON.stringify(mainWikiPath),
      );
    }
    // find the old line, delete it
    const newFileSystemPaths = FileSystemPaths.filter(
      line =>
        !(line.includes(getMatchPart(oldConfig.tagName)) && line.includes(getPathPart(oldConfig.subWikiFolderName))),
    );

    newFileSystemPathsFile = `${header.join('\n')}\n\n${newFileSystemPaths.join('\n')}`;
  } else {
    // if this config already exists, just return
    if (
      FileSystemPaths.some(
        line =>
          line.includes(getMatchPart(newConfig.tagName)) && line.includes(getPathPart(newConfig.subWikiFolderName)),
      )
    ) {
      return;
    }
    // prepare new line
    const { tagName, subWikiFolderName } = newConfig;
    const newConfigLine = getMatchPart(tagName) + getPathPart(subWikiFolderName);
    // if we are just to add a new config, just append it to the end of the file
    if (oldConfig) {
      // find the old line, replace it with the new line
      const newFileSystemPaths = FileSystemPaths.map(line => {
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

async function getSubWikiPluginContent(mainWikiPath) {
  if (!mainWikiPath) return [];
  const FileSystemPathsTiddlerPath = getFileSystemPathsTiddlerPath(mainWikiPath);
  try {
    const FileSystemPathsFile = await fs.readFile(FileSystemPathsTiddlerPath, 'utf-8');
    const FileSystemPaths = compact(drop(FileSystemPathsFile.split('\n'), 3));
    return FileSystemPaths.map(line => ({
      tagName: getTagNameFromMatchPart(line),
      folderName: getFolderNamePathPart(line),
    })).filter(item => item.folderName && item.tagName);
  } catch (error) {
    logger.error(error, { function: 'getSubWikiPluginContent' });
    return [];
  }
}

module.exports = {
  updateSubWikiPluginContent,
  getSubWikiPluginContent,
};
