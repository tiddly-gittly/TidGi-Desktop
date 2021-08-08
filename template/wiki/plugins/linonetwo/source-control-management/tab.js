/*\
Show local git state and sync to git on click.
Requires you are using TiddlyGit, and have install the "Inject JS" API with access to NodeJS and Electron API).

\*/
(function () {
  /*jslint node: true, browser: true */
  /*global $tw: true */
  'use strict';

  const Widget = require('$:/core/modules/widgets/widget.js').widget;

  class NodeJSGitSyncSCMTabWidget extends Widget {
    /**
     * Lifecycle method: call this.initialise and super
     */
    constructor(parseTreeNode, options) {
      super(parseTreeNode, options);
      this.initialise(parseTreeNode, options);
      this.state = {
        needSetUp: false, // need to setup api, or just API missing

        /**
         * {
         *   [folderName: string]: {
         *      type: string,
         *      fileRelativePath: string,
         *      filePath: string,
         *   }[]
         * }
         */
        repoInfo: {},
      };
      this.checkInLoop();
    }

    /**
     * Lifecycle method: Render this widget into the DOM
     */
    render(parent, nextSibling) {
      // boilerplate
      this.parentDomNode = parent;
      this.computeAttributes();

      // DOM
      const container = this.document.createElement('div');
      container.className = '';

      // workspaces
      for (const workspaceFullPath of Object.keys(this.state.repoInfo).sort((a, b) => a.length - b.length)) {
        const changedFileInfoList = this.state.repoInfo[workspaceFullPath];

        const workspaceInfoContainer = this.document.createElement('div');
        const workspaceTitle = this.document.createElement('h4');
        const workspaceTitleChangedCount = this.document.createElement('span');
        workspaceTitleChangedCount.className = 'tiddlygit-scm-count';
        workspaceTitleChangedCount.innerText = changedFileInfoList.length;

        const workspaceName = workspaceFullPath.split('/').pop();
        workspaceTitle.innerText = workspaceName;
        workspaceTitle.appendChild(workspaceTitleChangedCount);
        workspaceInfoContainer.appendChild(workspaceTitle);

        // changed files
        for (const changedFileInfo of changedFileInfoList) {
          const fileInfoContainer = this.document.createElement('div');
          fileInfoContainer.className = 'file-info';
          const fileChangedTypeElement = this.document.createElement('span');
          fileChangedTypeElement.className = 'file-changed-type';
          fileChangedTypeElement.innerText = this.mapChangeTypeToText(changedFileInfo.type);

          const fileNameElement = this.document.createElement('a');
          fileNameElement.className = 'file-name tc-tiddlylink tc-tiddlylink-resolves tc-popup-handle tc-popup-absolute';
          const correctPath = this.getPathByTitle(changedFileInfo.fileRelativePath);
          fileNameElement.innerText = correctPath;
          fileNameElement.href = `#${correctPath}`;

          fileInfoContainer.appendChild(fileChangedTypeElement);
          fileInfoContainer.appendChild(fileNameElement);
          workspaceInfoContainer.appendChild(fileInfoContainer);
        }

        container.appendChild(workspaceInfoContainer);
      }

      parent.insertBefore(container, nextSibling);
      this.domNodes.push(container);
    }

    getPathByTitle(fileRelativePath) {
      if (fileRelativePath.startsWith('plugins')) {
        return `$:/${fileRelativePath}`;
      } else if (fileRelativePath.startsWith('tiddlers/')) {
        return fileRelativePath.replace('tiddlers/', '').replace(/\.tid$/, '');
      }
      return fileRelativePath;
    }

    async getFolderInfo() {
      const list = await window.service.workspace.getWorkspacesAsList();
      return list.map(({ wikiFolderLocation: wikiPath, gitUrl }) => ({ wikiPath, gitUrl }));
    }

    mapChangeTypeToText(changedType) {
      switch (changedType) {
        case '??':
          return '+';

        default:
          return changedType;
      }
    }

    /**
     * Check state every a few time
     */
    async checkInLoop() {
      // check if API from TiddlyGit is available, first time it is Server Side Rendening so window.xxx from the electron ContextBridge will be missing
      if (
        !window.service.git ||
        typeof window.service.git.commitAndSync !== 'function' ||
        typeof window.service.git.getModifiedFileList !== 'function' ||
        typeof window.service.workspace.getWorkspacesAsList !== 'function'
      ) {
        this.state.needSetUp = true;
      } else {
        this.state.needSetUp = false;
        this.checkGitState();
      }
      // TODO: only check when tab is just opened, wait for https://github.com/Jermolene/TiddlyWiki5/discussions/5945
      // setTimeout(() => {
      //   this.checkInLoop();
      // }, this.state.interval);
    }

    /**
     *  Check repo git sync state and count of uncommit things
     */
    async checkGitState() {
      this.state.count = 0;
      this.state.unsync = false;
      this.state.repoInfo = {};

      const folderInfo = await this.getFolderInfo();
      await Promise.all(
        folderInfo.map(async ({ wikiPath }) => {
          const modifiedList = await window.service.git.getModifiedFileList(wikiPath);
          modifiedList.sort((changedFileInfoA, changedFileInfoB) => changedFileInfoA.fileRelativePath > changedFileInfoB.fileRelativePath);
          $tw.wiki.addTiddler({
            title: `$:/state/scm-modified-file-list/${wikiPath}`,
            text: JSON.stringify(modifiedList),
          });
          this.state.repoInfo[wikiPath] = modifiedList;
        }),
      );

      return this.refreshSelf(); // method from super class, this is like React forceUpdate, we use it because it is not fully reactive on this.state change
    }
  }

  exports['git-sync-scm-tab'] = NodeJSGitSyncSCMTabWidget;
})();
