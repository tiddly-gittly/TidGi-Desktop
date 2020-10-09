// @flow
/**
 * Provide API from electron to tiddlywiki
 * This file should be required by BrowserView's preload script to work
 */
const { contextBridge } = require('electron');
const { getModifiedFileList } = require('./inspect');

contextBridge.exposeInMainWorld('git', { getModifiedFileList });
