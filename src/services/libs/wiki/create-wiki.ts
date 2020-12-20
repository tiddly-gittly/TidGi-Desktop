/* eslint-disable sonarjs/no-duplicate-string */
import fs from 'fs-extra';
import path from 'path';

import { TIDDLYWIKI_TEMPLATE_FOLDER_PATH, TIDDLERS_PATH } from '../../constants/paths';
import { clone } from '../git';
import { logger } from '../log';
import { updateSubWikiPluginContent } from './update-plugin-content';
import index18n from '../i18n';

const logProgress = (message: any) =>
  logger.notice({
    type: 'progress',
    payload: { message, handler: 'createWikiProgress' },
  });

const folderToContainSymlinks = 'subwiki';
/**
 * Link a sub wiki to a main wiki, this will create a shortcut folder from main wiki to sub wiki, so when saving files to that shortcut folder, you will actually save file to the sub wiki
 * We place symbol-link (short-cuts) in the tiddlers/subwiki/ folder, and ignore this folder in the .gitignore, so this symlink won't be commit to the git, as it contains computer specific path.
 * @param {string} mainWikiPath folderPath of a wiki as link's destination
 * @param {string} folderName sub-wiki's folder name
 * @param {string} newWikiPath sub-wiki's folder path
 */
async function linkWiki(mainWikiPath: any, folderName: any, subWikiPath: any) {
  const mainWikiTiddlersFolderPath = path.join(mainWikiPath, TIDDLERS_PATH, folderToContainSymlinks, folderName);
  try {
    try {
      await fs.remove(mainWikiTiddlersFolderPath);
    } catch {}
    // @ts-expect-error ts-migrate(2769) FIXME: No overload matches this call.
    await fs.createSymlink(subWikiPath, mainWikiTiddlersFolderPath, 'junction');
    logProgress(index18n.t('AddWorkspace.CreateLinkFromSubWikiToMainWikiSucceed'));
  } catch (error) {
    throw new Error(index18n.t('AddWorkspace.CreateLinkFromSubWikiToMainWikiFailed', { subWikiPath, mainWikiTiddlersFolderPath, error }));
  }
}

async function createWiki(newFolderPath: any, folderName: any) {
  logProgress(index18n.t('AddWorkspace.StartUsingTemplateToCreateWiki'));
  const newWikiPath = path.join(newFolderPath, folderName);
  if (!(await fs.pathExists(newFolderPath))) {
    throw new Error(index18n.t('AddWorkspace.PathNotExist', { newFolderPath }));
  }
  if (!(await fs.pathExists(TIDDLYWIKI_TEMPLATE_FOLDER_PATH))) {
    throw new Error(index18n.t('AddWorkspace.WikiTemplateMissing', { TIDDLYWIKI_TEMPLATE_FOLDER_PATH }));
  }
  if (await fs.pathExists(newWikiPath)) {
    throw new Error(index18n.t('AddWorkspace.WikiExisted', { newWikiPath }));
  }
  try {
    await fs.copy(TIDDLYWIKI_TEMPLATE_FOLDER_PATH, newWikiPath);
  } catch {
    throw new Error(index18n.t('AddWorkspace.CantCreateFolderHere', { newWikiPath }));
  }
  logProgress(index18n.t('AddWorkspace.WikiTemplateCopyCompleted'));
}

/**
 *
 * @param {string} newFolderPath
 * @param {string} folderName
 * @param {string} mainWikiToLink
 * @param {boolean} onlyLink not creating new subwiki folder, just link existed subwiki folder to main wiki folder
 */
async function createSubWiki(newFolderPath: any, folderName: any, mainWikiPath: any, tagName = '', onlyLink = false) {
  logProgress(index18n.t('AddWorkspace.StartCreatingSubWiki'));
  const newWikiPath = path.join(newFolderPath, folderName);
  if (!(await fs.pathExists(newFolderPath))) {
    throw new Error(index18n.t('AddWorkspace.PathNotExist', { newFolderPath }));
  }
  if (!onlyLink) {
    if (await fs.pathExists(newWikiPath)) {
      throw new Error(index18n.t('AddWorkspace.WikiExisted', { newWikiPath }));
    }
    try {
      await fs.mkdirs(newWikiPath);
    } catch {
      throw new Error(index18n.t('AddWorkspace.CantCreateFolderHere', { newWikiPath }));
    }
  }
  logProgress(index18n.t('AddWorkspace.StartLinkingSubWikiToMainWiki'));
  await linkWiki(mainWikiPath, folderName, newWikiPath);
  if (tagName && typeof tagName === 'string') {
    logProgress(index18n.t('AddWorkspace.AddFileSystemPath'));
    // @ts-expect-error ts-migrate(2554) FIXME: Expected 3 arguments, but got 2.
    updateSubWikiPluginContent(mainWikiPath, { tagName, subWikiFolderName: folderName });
  }

  logProgress(index18n.t('AddWorkspace.SubWikiCreationCompleted'));
}

async function removeWiki(wikiPath: any, mainWikiToUnLink: any, onlyRemoveLink = false) {
  if (mainWikiToUnLink) {
    const subWikiName = path.basename(wikiPath);
    await fs.remove(path.join(mainWikiToUnLink, TIDDLERS_PATH, folderToContainSymlinks, subWikiName));
  }
  if (!onlyRemoveLink) {
    await fs.remove(wikiPath);
  }
}

async function ensureWikiExist(wikiPath: any, shouldBeMainWiki: any) {
  if (!(await fs.pathExists(wikiPath))) {
    throw new Error(index18n.t('AddWorkspace.PathNotExist', { newFolderPath: wikiPath }));
  }
  if (shouldBeMainWiki && !(await fs.pathExists(path.join(wikiPath, TIDDLERS_PATH)))) {
    throw new Error(index18n.t('AddWorkspace.ThisPathIsNotAWikiFolder', { wikiPath }));
  }
}

async function cloneWiki(parentFolderLocation: any, wikiFolderName: any, githubWikiUrl: any, userInfo: any) {
  logProgress(index18n.t('AddWorkspace.StartCloningWiki'));
  const newWikiPath = path.join(parentFolderLocation, wikiFolderName);
  if (!(await fs.pathExists(parentFolderLocation))) {
    throw new Error(index18n.t('AddWorkspace.PathNotExist', { newFolderPath: parentFolderLocation }));
  }
  if (await fs.pathExists(newWikiPath)) {
    throw new Error(index18n.t('AddWorkspace.WikiExisted', { newWikiPath }));
  }
  try {
    await fs.mkdir(newWikiPath);
  } catch {
    throw new Error(index18n.t('AddWorkspace.CantCreateFolderHere', { newWikiPath }));
  }
  await clone(githubWikiUrl, path.join(parentFolderLocation, wikiFolderName), userInfo);
}

async function cloneSubWiki(parentFolderLocation: any, wikiFolderName: any, mainWikiPath: any, githubWikiUrl: any, userInfo: any, tagName = '') {
  logProgress(index18n.t('AddWorkspace.StartCloningSubWiki'));
  const newWikiPath = path.join(parentFolderLocation, wikiFolderName);
  if (!(await fs.pathExists(parentFolderLocation))) {
    throw new Error(index18n.t('AddWorkspace.PathNotExist', { newFolderPath: parentFolderLocation }));
  }
  if (await fs.pathExists(newWikiPath)) {
    throw new Error(index18n.t('AddWorkspace.WikiExisted', { newWikiPath }));
  }
  try {
    await fs.mkdir(newWikiPath);
  } catch {
    throw new Error(index18n.t('AddWorkspace.CantCreateFolderHere', { newWikiPath }));
  }
  await clone(githubWikiUrl, path.join(parentFolderLocation, wikiFolderName), userInfo);
  logProgress(index18n.t('AddWorkspace.StartLinkingSubWikiToMainWiki'));
  await linkWiki(mainWikiPath, wikiFolderName, path.join(parentFolderLocation, wikiFolderName));
  if (tagName && typeof tagName === 'string') {
    logProgress(index18n.t('AddWorkspace.AddFileSystemPath'));
    // @ts-expect-error ts-migrate(2554) FIXME: Expected 3 arguments, but got 2.
    updateSubWikiPluginContent(mainWikiPath, { tagName, subWikiFolderName: wikiFolderName });
  }
}

export { createWiki, createSubWiki, removeWiki, ensureWikiExist, cloneWiki, cloneSubWiki };
