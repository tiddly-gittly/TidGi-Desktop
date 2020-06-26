const fs = require('fs-extra');
const path = require('path');

const { TIDDLYWIKI_FOLDER_PATH } = require('../constants/paths');

async function createWiki(newFolderPath, folderName) {
  const newWikiPath = path.join(newFolderPath, folderName);
  if (!(await fs.pathExists(newFolderPath))) {
    throw new Error(`该目录不存在 "${newFolderPath}"`);
  }
  if (!(await fs.pathExists(TIDDLYWIKI_FOLDER_PATH))) {
    throw new Error(`Wiki模板缺失 "${TIDDLYWIKI_FOLDER_PATH}"`);
  }
  if (await fs.pathExists(newWikiPath)) {
    throw new Error(`Wiki已经存在于该位置 "${newWikiPath}"`);
  }
  // Start copying wiki template to destination
  await fs.copy(TIDDLYWIKI_FOLDER_PATH, newWikiPath);
  return newWikiPath;
}

async function createSubWiki(newFolderPath, folderName) {
  const newWikiPath = path.join(newFolderPath, folderName);
  if (!(await fs.pathExists(newFolderPath))) {
    throw new Error(`该目录不存在 "${newFolderPath}"`);
  }
  if (await fs.pathExists(newWikiPath)) {
    throw new Error(`Wiki已经存在于该位置 "${newWikiPath}"`);
  }
  await fs.mkdirs(path.join(newFolderPath, folderName));
  return newWikiPath;
}

module.exports = { createWiki, createSubWiki };
