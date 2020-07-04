const fs = require('fs-extra');
const path = require('path');

const { TIDDLYWIKI_TEMPLATE_FOLDER_PATH, TIDDLERS_PATH } = require('../constants/paths');

async function createWiki(newFolderPath, folderName) {
  const newWikiPath = path.join(newFolderPath, folderName);
  if (!(await fs.pathExists(newFolderPath))) {
    throw new Error(`该目录不存在 "${newFolderPath}"`);
  }
  if (!(await fs.pathExists(TIDDLYWIKI_TEMPLATE_FOLDER_PATH))) {
    throw new Error(`Wiki模板缺失 "${TIDDLYWIKI_TEMPLATE_FOLDER_PATH}"`);
  }
  if (await fs.pathExists(newWikiPath)) {
    throw new Error(`Wiki已经存在于该位置 "${newWikiPath}"`);
  }
  try {
    await fs.copy(TIDDLYWIKI_TEMPLATE_FOLDER_PATH, newWikiPath);
  } catch {
    throw new Error(`无法在该处创建文件夹 "${newWikiPath}"`);
  }
}

async function createSubWiki(newFolderPath, folderName, mainWikiToLink) {
  const newWikiPath = path.join(newFolderPath, folderName);
  const mainWikiTiddlersFolderPath = path.join(mainWikiToLink, TIDDLERS_PATH, folderName);
  if (!(await fs.pathExists(newFolderPath))) {
    throw new Error(`该目录不存在 "${newFolderPath}"`);
  }
  if (await fs.pathExists(newWikiPath)) {
    throw new Error(`Wiki已经存在于该位置 "${newWikiPath}"`);
  }
  try {
    await fs.mkdirs(newWikiPath);
  } catch {
    throw new Error(`无法在该处创建文件夹 "${newWikiPath}"`);
  }
  try {
    await fs.createSymlink(newWikiPath, mainWikiTiddlersFolderPath);
  } catch {
    throw new Error(`无法链接文件夹 "${newWikiPath}" 到 "${mainWikiTiddlersFolderPath}"`);
  }
}

async function removeWiki(wikiPath, mainWikiToUnLink) {
  if (mainWikiToUnLink) {
    const subWikiName = path.basename(wikiPath);
    await fs.remove(path.join(wikiPath, TIDDLERS_PATH, subWikiName));
  }
  await fs.remove(wikiPath);
}

module.exports = { createWiki, createSubWiki, removeWiki };
