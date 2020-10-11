/*\
Show local git state and sync to git on click.
Requires you are using TiddlyGit, and have install the "Inject JS" API with access to NodeJS and Electron API).

\*/
(function () {
  /*jslint node: true, browser: true */
  /*global $tw: true */
  'use strict';

  const Widget = require('$:/core/modules/widgets/widget.js').widget;

  class NodeJSGitSyncWidget extends Widget {
    /**
     * Lifecycle method: call this.initialise and super
     */
    constructor(parseTreeNode, options) {
      super(parseTreeNode, options);
      this.initialise(parseTreeNode, options);
      this.state = {
        needSetUp: false, // need to setup api, or just API missing
        interval: 3000, // check interval

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
          const fileNameElement = this.document.createElement('span');
          fileNameElement.className = 'file-name';

          fileChangedTypeElement.innerText = this.mapChangeTypeToText(changedFileInfo.type);
          fileNameElement.innerText = changedFileInfo.fileRelativePath;

          fileInfoContainer.appendChild(fileChangedTypeElement);
          fileInfoContainer.appendChild(fileNameElement);
          workspaceInfoContainer.appendChild(fileInfoContainer);
        }

        container.appendChild(workspaceInfoContainer);
      }

      parent.insertBefore(container, nextSibling);
      this.domNodes.push(container);
    }

    getFolderInfo() {
      return window.git.getWorkspacesAsList().map(({ name: wikiPath, gitUrl }) => ({ wikiPath, gitUrl }));
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
        !window.git ||
        typeof window.git.commitAndSync !== 'function' ||
        typeof window.git.getModifiedFileList !== 'function' ||
        typeof window.git.getWorkspacesAsList !== 'function'
      ) {
        this.state.needSetUp = true;
      } else {
        this.state.needSetUp = false;
        this.checkGitState();
      }
      setTimeout(() => {
        this.checkInLoop();
      }, this.state.interval);
    }

    /**
     *  Check repo git sync state and count of uncommit things
     */
    async checkGitState() {
      this.state.count = 0;
      this.state.unsync = false;
      this.state.repoInfo = {};

      const folderInfo = await this.getFolderInfo();
      const repoStatuses = await Promise.all(
        folderInfo.map(async ({ wikiPath }) => {
          this.state.repoInfo[wikiPath] = await window.git.getModifiedFileList(wikiPath);
          this.state.repoInfo[wikiPath].sort(
            (changedFileInfoA, changedFileInfoB) =>
              changedFileInfoA.fileRelativePath > changedFileInfoB.fileRelativePath
          );
        })
      );

      return this.refreshSelf(); // method from super class, this is like React forceUpdate, we use it because it is not fully reactive on this.state change
    }
  }

  exports['git-sync-scm-tab'] = NodeJSGitSyncWidget;
})();
