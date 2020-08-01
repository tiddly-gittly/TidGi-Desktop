const fs = require('fs-extra');
const path = require('path');

const { TIDDLYWIKI_TEMPLATE_FOLDER_PATH, TIDDLERS_PATH } = require('../../constants/paths');
const { clone } = require('../git');
const { logger } = require('../log');

const logProgress = message =>
  logger.notice({
    type: 'progress',
    payload: { message, handler: 'createWikiProgress' },
  });

/**
 * Link a sub wiki to a main wiki, this will create a shortcut folder from main wiki to sub wiki, so when saving files to that shortcut folder, you will actually save file to the sub wiki
 * @param {string} mainWikiPath folderPath of a wiki as link's destination
 * @param {string} folderName sub-wiki's folder name
 * @param {string} newWikiPath sub-wiki's folder path
 */
async function linkWiki(mainWikiPath, folderName, subWikiPath) {
  const mainWikiTiddlersFolderPath = path.join(mainWikiPath, TIDDLERS_PATH, folderName);
  try {
    await fs.createSymlink(subWikiPath, mainWikiTiddlersFolderPath);
    logProgress(`从${subWikiPath}到${mainWikiTiddlersFolderPath}的链接创建成功，将文件存入后者相当于将文件存入前者。`);
  } catch {
    throw new Error(`无法链接文件夹 "${subWikiPath}" 到 "${mainWikiTiddlersFolderPath}"`);
  }
}

async function createWiki(newFolderPath, folderName) {
  logProgress('开始用模板创建Wiki');
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
  logProgress('模板Wiki复制完毕');
}

/**
 *
 * @param {string} newFolderPath
 * @param {string} folderName
 * @param {string} mainWikiToLink
 * @param {boolean} onlyLink not creating new subwiki folder, just link existed subwiki folder to main wiki folder
 */
async function createSubWiki(newFolderPath, folderName, mainWikiToLink, onlyLink = false) {
  logProgress('开始创建子Wiki');
  const newWikiPath = path.join(newFolderPath, folderName);
  if (!(await fs.pathExists(newFolderPath))) {
    throw new Error(`该目录不存在 "${newFolderPath}"`);
  }
  if (await fs.pathExists(newWikiPath)) {
    throw new Error(`Wiki已经存在于该位置 "${newWikiPath}"`);
  }
  logProgress('开始链接子Wiki到父Wiki');
  await linkWiki(mainWikiToLink, folderName, newWikiPath);
  if (!onlyLink) {
    try {
      await fs.mkdirs(newWikiPath);
    } catch {
      throw new Error(`无法在该处创建文件夹 "${newWikiPath}"`);
    }
  }

  logProgress('子Wiki创建完毕');
}

async function removeWiki(wikiPath, mainWikiToUnLink) {
  if (mainWikiToUnLink) {
    const subWikiName = path.basename(wikiPath);
    await fs.remove(path.join(wikiPath, TIDDLERS_PATH, subWikiName));
  }
  await fs.remove(wikiPath);
}

async function ensureWikiExist(wikiPath, shouldBeMainWiki) {
  if (!(await fs.pathExists(wikiPath))) {
    throw new Error(`该目录不存在 "${wikiPath}"`);
  }
  if (shouldBeMainWiki && !(await fs.pathExists(path.join(wikiPath, TIDDLERS_PATH)))) {
    throw new Error(`该目录不是一个Wiki文件夹 "${wikiPath}"`);
  }
}

async function cloneWiki(parentFolderLocation, wikiFolderName, githubWikiUrl, userInfo) {
  logProgress('开始克隆Wiki');
  const newWikiPath = path.join(parentFolderLocation, wikiFolderName);
  if (!(await fs.pathExists(parentFolderLocation))) {
    throw new Error(`该目录不存在 "${parentFolderLocation}"`);
  }
  if (await fs.pathExists(newWikiPath)) {
    throw new Error(`Wiki已经存在于该位置 "${newWikiPath}"`);
  }
  try {
    await fs.mkdir(newWikiPath);
  } catch {
    throw new Error(`无法在该处创建文件夹 "${newWikiPath}"`);
  }
  await clone(githubWikiUrl, path.join(parentFolderLocation, wikiFolderName), userInfo);
}

async function cloneSubWiki(parentFolderLocation, wikiFolderName, mainWikiPath, githubWikiUrl, userInfo) {
  logProgress('开始克隆子Wiki');
  const newWikiPath = path.join(parentFolderLocation, wikiFolderName);
  if (!(await fs.pathExists(parentFolderLocation))) {
    throw new Error(`该目录不存在 "${parentFolderLocation}"`);
  }
  if (await fs.pathExists(newWikiPath)) {
    throw new Error(`Wiki已经存在于该位置 "${newWikiPath}"`);
  }
  await clone(githubWikiUrl, path.join(parentFolderLocation, wikiFolderName), userInfo);
  await linkWiki(mainWikiPath, wikiFolderName, path.join(parentFolderLocation, wikiFolderName));
}

module.exports = { createWiki, createSubWiki, removeWiki, ensureWikiExist, cloneWiki, cloneSubWiki };
