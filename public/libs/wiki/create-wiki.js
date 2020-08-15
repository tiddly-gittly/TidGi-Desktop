/* eslint-disable sonarjs/no-duplicate-string */
const fs = require('fs-extra');
const path = require('path');

const { TIDDLYWIKI_TEMPLATE_FOLDER_PATH, TIDDLERS_PATH } = require('../../constants/paths');
const { clone } = require('../git');
const { logger } = require('../log');
const i18n = require('../i18n');

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
    try {
      await fs.remove(mainWikiTiddlersFolderPath);
    } catch {}
    await fs.createSymlink(subWikiPath, mainWikiTiddlersFolderPath);
    logProgress(i18n.t('AddWorkspace.CreateLinkFromSubWikiToMainWikiSucceed'));
  } catch {
    throw new Error(
      i18n.t('AddWorkspace.CreateLinkFromSubWikiToMainWikiFailed', { subWikiPath, mainWikiTiddlersFolderPath }),
    );
  }
}

async function createWiki(newFolderPath, folderName) {
  logProgress(i18n.t('AddWorkspace.StartUsingTemplateToCreateWiki'));
  const newWikiPath = path.join(newFolderPath, folderName);
  if (!(await fs.pathExists(newFolderPath))) {
    throw new Error(i18n.t('AddWorkspace.PathNotExist', { newFolderPath }));
  }
  if (!(await fs.pathExists(TIDDLYWIKI_TEMPLATE_FOLDER_PATH))) {
    throw new Error(i18n.t('AddWorkspace.WikiTemplateMissing', { TIDDLYWIKI_TEMPLATE_FOLDER_PATH }));
  }
  if (await fs.pathExists(newWikiPath)) {
    throw new Error(i18n.t('AddWorkspace.WikiExisted', { newWikiPath }));
  }
  try {
    await fs.copy(TIDDLYWIKI_TEMPLATE_FOLDER_PATH, newWikiPath);
  } catch {
    throw new Error(i18n.t('AddWorkspace.CantCreateFolderHere', { newWikiPath }));
  }
  logProgress(i18n.t('AddWorkspace.WikiTemplateCopyCompleted'));
}

/**
 *
 * @param {string} newFolderPath
 * @param {string} folderName
 * @param {string} mainWikiToLink
 * @param {boolean} onlyLink not creating new subwiki folder, just link existed subwiki folder to main wiki folder
 */
async function createSubWiki(newFolderPath, folderName, mainWikiToLink, onlyLink = false) {
  logProgress(i18n.t('AddWorkspace.StartCreatingSubWiki'));
  const newWikiPath = path.join(newFolderPath, folderName);
  if (!(await fs.pathExists(newFolderPath))) {
    throw new Error(i18n.t('AddWorkspace.PathNotExist', { newFolderPath }));
  }
  if (await fs.pathExists(newWikiPath)) {
    throw new Error(i18n.t('AddWorkspace.WikiExisted', { newWikiPath }));
  }
  if (!onlyLink) {
    try {
      await fs.mkdirs(newWikiPath);
    } catch {
      throw new Error(i18n.t('AddWorkspace.CantCreateFolderHere', { newWikiPath }));
    }
  }
  logProgress(i18n.t('AddWorkspace.StartLinkingSubWikiToMainWiki'));
  await linkWiki(mainWikiToLink, folderName, newWikiPath);

  logProgress(i18n.t('AddWorkspace.SubWikiCreationCompleted'));
}

async function removeWiki(wikiPath, mainWikiToUnLink) {
  if (mainWikiToUnLink) {
    const subWikiName = path.basename(wikiPath);
    await fs.remove(path.join(mainWikiToUnLink, TIDDLERS_PATH, subWikiName));
  }
  await fs.remove(wikiPath);
}

async function ensureWikiExist(wikiPath, shouldBeMainWiki) {
  if (!(await fs.pathExists(wikiPath))) {
    throw new Error(i18n.t('AddWorkspace.PathNotExist', { newFolderPath: wikiPath }));
  }
  if (shouldBeMainWiki && !(await fs.pathExists(path.join(wikiPath, TIDDLERS_PATH)))) {
    throw new Error(i18n.t('AddWorkspace.ThisPathIsNotAWikiFolder', { wikiPath }));
  }
}

async function cloneWiki(parentFolderLocation, wikiFolderName, githubWikiUrl, userInfo) {
  logProgress(i18n.t('AddWorkspace.StartCloningWiki'));
  const newWikiPath = path.join(parentFolderLocation, wikiFolderName);
  if (!(await fs.pathExists(parentFolderLocation))) {
    throw new Error(i18n.t('AddWorkspace.PathNotExist', { newFolderPath: parentFolderLocation }));
  }
  if (await fs.pathExists(newWikiPath)) {
    throw new Error(i18n.t('AddWorkspace.WikiExisted', { newWikiPath }));
  }
  try {
    await fs.mkdir(newWikiPath);
  } catch {
    throw new Error(i18n.t('AddWorkspace.CantCreateFolderHere', { newWikiPath }));
  }
  await clone(githubWikiUrl, path.join(parentFolderLocation, wikiFolderName), userInfo);
}

async function cloneSubWiki(parentFolderLocation, wikiFolderName, mainWikiPath, githubWikiUrl, userInfo) {
  logProgress(i18n.t('AddWorkspace.StartCloningSubWiki'));
  const newWikiPath = path.join(parentFolderLocation, wikiFolderName);
  if (!(await fs.pathExists(parentFolderLocation))) {
    throw new Error(i18n.t('AddWorkspace.PathNotExist', { newFolderPath: parentFolderLocation }));
  }
  if (await fs.pathExists(newWikiPath)) {
    throw new Error(i18n.t('AddWorkspace.WikiExisted', { newWikiPath }));
  }
  try {
    await fs.mkdir(newWikiPath);
  } catch {
    throw new Error(i18n.t('AddWorkspace.CantCreateFolderHere', { newWikiPath }));
  }
  await clone(githubWikiUrl, path.join(parentFolderLocation, wikiFolderName), userInfo);
  await linkWiki(mainWikiPath, wikiFolderName, path.join(parentFolderLocation, wikiFolderName));
}

module.exports = { createWiki, createSubWiki, removeWiki, ensureWikiExist, cloneWiki, cloneSubWiki };
