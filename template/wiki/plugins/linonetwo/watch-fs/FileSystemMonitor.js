/* eslint-disable global-require */
/* eslint-disable unicorn/filename-case */
/* \
  title: $:/plugins/linonetwo/watch-fs/FileSystemMonitor.js
  type: application/javascript
  module-type: startup

  This file is modified based on $:/plugins/OokTech/Bob/FileSystemMonitor.js
\ */

const isNotNonTiddlerFiles = filePath =>
  !filePath.includes('$__StoryList') &&
  // sometimes sync logic bug will resulted in file ends with _1, which will cause lots of trouble
  !filePath.includes('_1.') &&
  !filePath.includes('/subwiki/') &&
  !filePath.endsWith('.DS_Store') &&
  // TODO: deal with field change in meta file
  !filePath.endsWith('.meta') &&
  !filePath.includes('.git');

function FileSystemMonitor() {
  const isDebug = true;
  const debugLog = isDebug ? console.log : () => {};

  exports.name = 'watch-fs_FileSystemMonitor';
  exports.after = ['load-modules', 'watch-fs_watch'];
  exports.platforms = ['node'];
  exports.synchronous = true;

  // this allow us to test this module in nodejs directly without "ReferenceError: $tw is not defined"
  const $tw = this.$tw || { node: true };
  // init our namespace for communication
  $tw.wiki.watchFs = {};
  // folder to watch
  // non-tiddler files that needs to be ignored

  if (typeof $tw === 'undefined' || !$tw?.node) return;
  const deepEqual = require('./deep-equal');
  const fs = require('fs');
  const path = require('path');

  const watchPathBase = path.resolve(
    $tw.boot.wikiInfo?.config?.watchFolder || $tw.boot.wikiTiddlersPath || './tiddlers',
  );
  debugLog(`watchPathBase`, JSON.stringify(watchPathBase, undefined, '  '));

  /**
   * $tw.boot.files: {
   *   [tiddlerTitle: string]: {
   *     filepath: '/Users/linonetwo/xxxx/wiki/Meme-of-LinOnetwo/tiddlers/tiddlerTitle.tid',
   *     type: 'application/x-tiddler',
   *     hasMetaFile: false
   *   }
   * }
   */
  const initialLoadedFiles = $tw.boot.files;

  /**
   * we can use this for getTitleByPath
   * {
   *   [filepath: string]: {
   *     filepath: '/Users/linonetwo/xxxx/wiki/Meme-of-LinOnetwo/tiddlers/tiddlerTitle.tid',
   *     tiddlerTitle: string,
   *     type: 'application/x-tiddler',
   *     hasMetaFile: false
   *   }
   * }
   */
  const inverseFilesIndex = {};
  $tw.wiki.watchFs.inverseFilesIndex = inverseFilesIndex;
  // initialize the inverse index
  for (const tiddlerTitle in initialLoadedFiles) {
    if ({}.hasOwnProperty.call(initialLoadedFiles, tiddlerTitle)) {
      const fileDescriptor = initialLoadedFiles[tiddlerTitle];
      const fileRelativePath = path.relative(watchPathBase, fileDescriptor.filepath);
      inverseFilesIndex[fileRelativePath] = { ...fileDescriptor, filepath: fileRelativePath, tiddlerTitle };
    }
  }

  // Helpers to maintain our cached index for file path and tiddler title
  const updateInverseIndex = (filePath, fileDescriptor) => {
    if (fileDescriptor) {
      inverseFilesIndex[filePath] = fileDescriptor;
    } else {
      delete inverseFilesIndex[filePath];
    }
  };
  const filePathExistsInIndex = filePath => !!inverseFilesIndex[filePath];
  const getTitleByPath = filePath => {
    try {
      return inverseFilesIndex[filePath].tiddlerTitle;
    } catch {
      // fatal error, shutting down.
      watcher.close();
      throw new Error(`${filePath}\n↑ not existed in watch-fs plugin's FileSystemMonitor's inverseFilesIndex`);
    }
  };
  /**
   * This is a rarely used function maybe only when user rename a tiddler on the disk,
   * we need to get old tiddler path by its name
   * @param {string} title
   */
  const getPathByTitle = title => {
    try {
      for (const filePath in inverseFilesIndex) {
        if (inverseFilesIndex[filePath].title === title || inverseFilesIndex[filePath].title === `${title}.tid`) {
          return filePath;
        }
      }
      throw new Error('getPathByTitle');
    } catch {
      // fatal error, shutting down.
      watcher.close();
      throw new Error(`${title}\n↑ not existed in watch-fs plugin's FileSystemMonitor's inverseFilesIndex`);
    }
  };

  /**
   * A mutex to ignore temporary file created or deleted by this plugin.
   *
   * Set<filePath: string>
   */
  const lockedFiles = new Set();

  // every time a file changed, refresh the count down timer, so only when disk get stable after a while, will we sync to the browser
  $tw.wiki.watchFs.canSync = false;
  const debounceInterval = 4 * 1000;
  let syncTimeoutHandler = undefined;
  const refreshCanSyncState = () => {
    $tw.wiki.watchFs.canSync = false;
    debugLog(`canSync is now ${$tw.wiki.watchFs.canSync}`);
    clearTimeout(syncTimeoutHandler);
    syncTimeoutHandler = setTimeout(() => {
      $tw.wiki.watchFs.canSync = true;
      debugLog(`canSync is now ${$tw.wiki.watchFs.canSync}`);
    }, debounceInterval);
  };

  /**
   * This watches for changes to a folder and updates the wiki when anything changes in the folder.
   *
   * The filePath reported by listener is not the actual tiddler name, and all tiddlywiki operations requires that we have the name of tiddler,
   * So we have get tiddler name by path from `$tw.boot.files`.
   *
   * Then we can perform following logic:
   * File update -> update or create tiddler using `$tw.syncadaptor.wiki.addTiddler`
   * File remove & tiddler exist in wiki -> then remove tiddler using `$tw.syncadaptor.wiki.deleteTiddler`
   * File remove & tiddler not exist in wiki -> This change is caused by tiddlywiki itself, do noting here
   *
   * @param {"update" | "remove"} changeType
   * @param {*} filePath changed file's relative path to the folder executing this watcher
   */
  const listener = (changeType, filePath) => {
    const fileRelativePath = path.relative(watchPathBase, filePath);
    const fileAbsolutePath = path.join(watchPathBase, fileRelativePath);
    debugLog(`${fileRelativePath} ${changeType}`);
    if (lockedFiles.has(fileRelativePath)) {
      debugLog(`${fileRelativePath} ignored due to mutex lock`);
      // release lock as we have already finished our job
      lockedFiles.delete(fileRelativePath);
      return;
    }
    // on create or modify
    if (changeType === 'update') {
      // get tiddler from the disk
      /**
       * tiddlersDescriptor:
       * {
       *    "filepath": "Meme-of-LinOnetwo/tiddlers/$__StoryList.tid",
       *    "type": "application/x-tiddler",
       *    "tiddlers": [
       *      {
       *        "title": "$:/StoryList",
       *        "list": "Index"
       *      }
       *    ],
       *    "hasMetaFile": false
       *  }
       */
      let tiddlersDescriptor;
      // sometimes this file get removed by wiki before we can get it, for example, Draft tiddler done editing, it get removed, and we got ENOENT here
      try {
        tiddlersDescriptor = $tw.loadTiddlersFromFile(fileAbsolutePath, { title: fileAbsolutePath });
      } catch (error) {
        debugLog(error);
        return;
      }
      debugLog(`tiddlersDescriptor`, JSON.stringify(tiddlersDescriptor, undefined, '  '));
      const { tiddlers, ...fileDescriptor } = tiddlersDescriptor;
      // if user is using git or VSCode to create new file in the disk, that is not yet exist in the wiki
      // but maybe our index is not updated, or maybe user is modify a system tiddler, we need to check each case
      if (!filePathExistsInIndex(fileRelativePath)) {
        tiddlers.forEach(tiddler => {
          // check whether we are rename an existed tiddler
          debugLog('getting new tiddler.title', tiddler.title);
          const existedWikiRecord = $tw.wiki.getTiddler(tiddler.title);
          if (existedWikiRecord && deepEqual(tiddler, existedWikiRecord.fields)) {
            // because disk file and wiki tiddler is identical, so this file creation is triggered by wiki.
            // We just update the index.
            // But it might also be user changing the name of the file, so filename to be different with the actual tiddler title, while tiddler content is still same as old one
            // We allow filename to be different with the tiddler title, but we need to handle this in the inverse index to prevent the error that we can't get tiddler from index by its path
            debugLog('fileDescriptor.tiddlerTitle', fileDescriptor.tiddlerTitle);
            if (
              fileDescriptor.tiddlerTitle &&
              fileDescriptor.tiddlerTitle !== `${tiddler.title}.tid` &&
              fileDescriptor.tiddlerTitle !== tiddler.title
            ) {
              // We have no API in tw to inform $tw about we have a file changed its name, but remain its tiddler title
              // because to do that now we have to use `$tw.syncadaptor.wiki.addTiddler(tiddler);`, which will create a new file with the title we pass to it, it can't assign a disk file name while create a new tiddler
              throw new Error('Rename filename is not supported, please submit your idea to improve this logic');
              // updateInverseIndex(fileRelativePath, { ...fileDescriptor, tiddlerTitle: tiddler.title });
            } else {
              updateInverseIndex(fileRelativePath, { ...fileDescriptor, tiddlerTitle: tiddler.title });
            }
          } else {
            updateInverseIndex(fileRelativePath, { ...fileDescriptor, tiddlerTitle: tiddler.title });
            $tw.syncadaptor.wiki.addTiddler(tiddler);
          }
        });
      } else {
        // if it already existed in the wiki, this change might 1. due to our last call to `$tw.syncadaptor.wiki.addTiddler`; 2. due to user change in git or VSCode
        // so we have to check whether tiddler in the disk is identical to the one in the wiki, if so, we ignore it in the case 1.
        tiddlers
          .filter(tiddler => {
            debugLog('updating existed tiddler', tiddler.title);
            const { fields: tiddlerInWiki } = $tw.wiki.getTiddler(tiddler.title);
            if (deepEqual(tiddler, tiddlerInWiki)) {
              debugLog('Ignore update due to detect this is a change from the Browser', tiddler.title);
              return false;
            }
            // if user is continuously editing, after last trigger of listener, we have waste too many time in fs, and now $tw.wiki.getTiddler get a new tiddler that is just updated by user from the wiki
            // then our $tw.loadTiddlersFromFile's tiddler will have an old timestamp than it, ignore this case, since it means we are editing from the wiki
            // if both are created before, and just modified now
            if (tiddler.modified && tiddlerInWiki.modified && tiddlerInWiki.modified > tiddler.modified) {
              debugLog('Ignore update due to there is latest change from the Browser', tiddler.title);
              return false;
            }

            debugLog('Saving updated', tiddler.title);
            return true;
          })
          // then we update wiki with each newly created tiddler
          .forEach(tiddler => {
            $tw.syncadaptor.wiki.addTiddler(tiddler);
          });
      }
    }

    // on delete
    if (changeType === 'remove') {
      debugLog('handle remove', fileRelativePath);
      const tiddlerTitle = getTitleByPath(fileRelativePath);

      // if this tiddler is not existed in the wiki, this means this deletion is triggered by wiki
      // we only react on event that triggered by the git or VSCode
      const existedTiddlerResult = $tw.wiki.getTiddler(tiddlerTitle);
      debugLog('existedTiddlerResult', existedTiddlerResult);
      if (!existedTiddlerResult) {
        debugLog('file already deleted by wiki', fileAbsolutePath);
        updateInverseIndex(fileRelativePath);
      } else {
        // now event is triggered by the git or VSCode
        // ask tiddlywiki to delete the file, we first need to create a fake file for it to delete
        // can't directly use $tw.wiki.syncadaptor.deleteTiddler(tiddlerTitle);  because it will try to modify fs, and will failed:
        /* Sync error while processing delete of 'blabla': Error: ENOENT: no such file or directory, unlink '/Users//Desktop/repo/wiki/Meme-of-LinOnetwo/tiddlers/blabla.tid'
          syncer-server-filesystem: Dispatching 'delete' task: blabla 
          Sync error while processing delete of 'blabla': Error: ENOENT: no such file or directory, unlink '/Users//Desktop/repo/wiki/Meme-of-LinOnetwo/tiddlers/blabla.tid' */
        lockedFiles.add(fileRelativePath);
        debugLog('trying to delete', fileAbsolutePath);
        fs.writeFile(fileAbsolutePath, '', {}, () => {
          // we may also need to provide a .meta file for wiki to delete
          const metaFileAbsolutePath = `${fileAbsolutePath}.meta`;
          if (!fileAbsolutePath.endsWith('.tid')) {
            fs.writeFileSync(metaFileAbsolutePath, '');
          }
          $tw.syncadaptor.wiki.deleteTiddler(tiddlerTitle);
          // sometime deleting system tiddler will result in an empty file, we need to try delete that empty file
          try {
            if (
              fileAbsolutePath.startsWith('$') &&
              fs.existsSync(fileAbsolutePath) &&
              fs.readFileSync(fileAbsolutePath, 'utf-8').length === 0
            ) {
              fs.unlinkSync(fileAbsolutePath);
            }
          } catch (error) {
            console.error(error);
          }
          updateInverseIndex(fileRelativePath);
        });
      }
    }

    refreshCanSyncState();
  };

  // use node-watch
  const watch = require('./watch');
  const watcher = watch(watchPathBase, { recursive: true, delay: 200, filter: isNotNonTiddlerFiles }, listener);
}
FileSystemMonitor();
