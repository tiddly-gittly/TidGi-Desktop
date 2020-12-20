// @ts-expect-error ts-migrate(6200) FIXME: Definitions of the following identifiers conflict ... Remove this comment to see the full error message
const { Menu, clipboard, ipcMain, shell } = require('electron');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getLanguag... Remove this comment to see the full error message
const { getLanguageMenu } = require('./i18next-electron-fs-backend');
const aboutWindow = require('../windows/about');
const addWorkspaceWindow = require('../windows/add-workspace');
const editWorkspaceWindow = require('../windows/edit-workspace');
const goToUrlWindow = require('../windows/go-to-url');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'mainWindow... Remove this comment to see the full error message
const mainWindow = require('../windows/main');
const notificationsWindow = require('../windows/notifications');
const preferencesWindow = require('../windows/preferences');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'index18nex... Remove this comment to see the full error message
const index18next = require('./i18n');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'formatByte... Remove this comment to see the full error message
const formatBytes = require('./format-bytes');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getViewBou... Remove this comment to see the full error message
const getViewBounds = require('./get-view-bounds');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getWorkspa... Remove this comment to see the full error message
const { getWorkspaces, getActiveWorkspace, getNextWorkspace, getPreviousWorkspace } = require('./workspaces');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'setActiveW... Remove this comment to see the full error message
const { setActiveWorkspaceView } = require('./workspaces-views');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'getView'.
const { getView, getActiveBrowserView } = require('./views');
// @ts-expect-error ts-migrate(2451) FIXME: Cannot redeclare block-scoped variable 'createMenu... Remove this comment to see the full error message
function createMenu() {
  const updaterEnabled = process.env.SNAP == undefined && !process.mas && !process.windowsStore;
  const workspaces = getWorkspaces();
  const hasWorkspaces = Object.keys(workspaces).length > 0;
  const template = [
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteandmatchstyle' },
        { role: 'delete' },
        { role: 'selectall' },
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          click: () => {
            const win = mainWindow.get();
            if (win !== null && win.getBrowserView() !== null) {
              win.webContents.focus();
              win.send('open-find-in-page');
              const contentSize = win.getContentSize();
              const view = win.getBrowserView();
              view.setBounds(getViewBounds(contentSize, true));
            }
          },
          enabled: hasWorkspaces,
        },
        {
          label: 'Find Next',
          accelerator: 'CmdOrCtrl+G',
          click: () => {
            const win = mainWindow.get();
            win.send('request-back-find-in-page', true);
          },
          enabled: hasWorkspaces,
        },
        {
          label: 'Find Previous',
          accelerator: 'Shift+CmdOrCtrl+G',
          click: () => {
            const win = mainWindow.get();
            win.send('request-back-find-in-page', false);
          },
          enabled: hasWorkspaces,
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: global.sidebar ? 'Hide Sidebar' : 'Show Sidebar',
          accelerator: 'CmdOrCtrl+Alt+S',
          click: () => {
            ipcMain.emit('request-set-preference', null, 'sidebar', !global.sidebar);
            ipcMain.emit('request-realign-active-workspace');
          },
        },
        {
          label: global.navigationBar ? 'Hide Navigation Bar' : 'Show Navigation Bar',
          accelerator: 'CmdOrCtrl+Alt+N',
          click: () => {
            ipcMain.emit('request-set-preference', null, 'navigationBar', !global.navigationBar);
            ipcMain.emit('request-realign-active-workspace');
          },
        },
        {
          label: global.titleBar ? 'Hide Title Bar' : 'Show Title Bar',
          accelerator: 'CmdOrCtrl+Alt+T',
          enabled: process.platform === 'darwin',
          visible: process.platform === 'darwin',
          click: () => {
            ipcMain.emit('request-set-preference', null, 'titleBar', !global.titleBar);
            ipcMain.emit('request-realign-active-workspace');
          },
        },
        // same behavior as BrowserWindow with autoHideMenuBar: true
        // but with addition to readjust BrowserView so it won't cover the menu bar
        {
          label: 'Toggle Menu Bar',
          visible: false,
          accelerator: 'Alt+M',
          enabled: process.platform === 'win32',
          click: (menuItem: any, browserWindow: any) => {
            // if back is called in popup window
            // open menu bar in the popup window instead
            if (browserWindow && browserWindow.isPopup) {
              browserWindow.setMenuBarVisibility(!browserWindow.isMenuBarVisible());
              return;
            }
            const win = mainWindow.get();
            win.setMenuBarVisibility(!win.isMenuBarVisible());
            ipcMain.emit('request-realign-active-workspace');
          },
        },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+0',
          click: (menuItem: any, browserWindow: any) => {
            // if item is called in popup window
            // open menu bar in the popup window instead
            if (browserWindow && browserWindow.isPopup) {
              const contents = browserWindow.webContents;
              contents.zoomFactor = 1;
              return;
            }
            const win = mainWindow.get();
            if (win !== null && win.getBrowserView() !== null) {
              const contents = win.getBrowserView().webContents;
              contents.zoomFactor = 1;
            }
          },
          enabled: hasWorkspaces,
        },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: (menuItem: any, browserWindow: any) => {
            // if item is called in popup window
            // open menu bar in the popup window instead
            if (browserWindow && browserWindow.isPopup) {
              const contents = browserWindow.webContents;
              contents.zoomFactor += 0.1;
              return;
            }
            const win = mainWindow.get();
            if (win !== null && win.getBrowserView() !== null) {
              const contents = win.getBrowserView().webContents;
              contents.zoomFactor += 0.1;
            }
          },
          enabled: hasWorkspaces,
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: (menuItem: any, browserWindow: any) => {
            // if item is called in popup window
            // open menu bar in the popup window instead
            if (browserWindow && browserWindow.isPopup) {
              const contents = browserWindow.webContents;
              contents.zoomFactor -= 0.1;
              return;
            }
            const win = mainWindow.get();
            if (win !== null && win.getBrowserView() !== null) {
              const contents = win.getBrowserView().webContents;
              contents.zoomFactor -= 0.1;
            }
          },
          enabled: hasWorkspaces,
        },
        { type: 'separator' },
        {
          label: 'Reload This Page',
          accelerator: 'CmdOrCtrl+R',
          click: (menuItem: any, browserWindow: any) => {
            // if item is called in popup window
            // open menu bar in the popup window instead
            if (browserWindow && browserWindow.isPopup) {
              browserWindow.webContents.reload();
              return;
            }
            const win = mainWindow.get();
            if (win !== null && win.getBrowserView() !== null) {
              win.getBrowserView().webContents.reload();
            }
          },
          enabled: hasWorkspaces,
        },
        { type: 'separator' },
        {
          label: 'Developer Tools',
          submenu: [
            {
              label: 'Open Developer Tools of Active Workspace',
              accelerator: 'CmdOrCtrl+Option+I',
              click: () => getActiveBrowserView().webContents.openDevTools(),
              enabled: hasWorkspaces,
            },
          ],
        },
      ],
    },
    // language menu
    {
      label: 'Language',
      submenu: getLanguageMenu(),
    },
    {
      label: 'History',
      submenu: [
        {
          label: 'Home',
          accelerator: 'Shift+CmdOrCtrl+H',
          click: () => ipcMain.emit('request-go-home'),
          enabled: hasWorkspaces,
        },
        {
          label: 'Back',
          accelerator: 'CmdOrCtrl+[',
          click: (menuItem: any, browserWindow: any) => {
            // if back is called in popup window
            // navigate in the popup window instead
            if (browserWindow && browserWindow.isPopup) {
              browserWindow.webContents.goBack();
              return;
            }
            ipcMain.emit('request-go-back');
          },
          enabled: hasWorkspaces,
        },
        {
          label: 'Forward',
          accelerator: 'CmdOrCtrl+]',
          click: (menuItem: any, browserWindow: any) => {
            // if back is called in popup window
            // navigate in the popup window instead
            if (browserWindow && browserWindow.isPopup) {
              browserWindow.webContents.goBack();
              return;
            }
            ipcMain.emit('request-go-forward');
          },
          enabled: hasWorkspaces,
        },
        { type: 'separator' },
        {
          label: 'Copy URL',
          accelerator: 'CmdOrCtrl+L',
          click: (menuItem: any, browserWindow: any) => {
            // if back is called in popup window
            // copy the popup window URL instead
            if (browserWindow && browserWindow.isPopup) {
              const url = browserWindow.webContents.getURL();
              clipboard.writeText(url);
              return;
            }
            const win = mainWindow.get();
            if (win !== null && win.getBrowserView() !== null) {
              const url = win.getBrowserView().webContents.getURL();
              clipboard.writeText(url);
            }
          },
          enabled: hasWorkspaces,
        },
        { type: 'separator' },
        {
          label: 'Go to URL...',
          accelerator: 'CmdOrCtrl+Shift+G',
          click: () => {
            goToUrlWindow.show();
          },
          enabled: hasWorkspaces,
        },
      ],
    },
    {
      label: 'Workspaces',
      submenu: [],
    },
    {
      role: 'window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
        // role: 'zoom' is only supported on macOS
        process.platform === 'darwin'
          ? {
              role: 'zoom',
            }
          : {
              label: 'Zoom',
              click: () => {
                const win = mainWindow.get();
                if (win !== null) {
                  win.maximize();
                }
              },
            },
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
      ],
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'TiddlyGit Support',
          click: () => shell.openExternal('https://github.com/tiddly-gittly/tiddlygit-desktop/issues'),
        },
        {
          label: 'Report a Bug via GitHub...',
          click: () => shell.openExternal('https://github.com/tiddly-gittly/tiddlygit-desktop/issues'),
        },
        {
          label: 'Request a New Feature via GitHub...',
          click: () => shell.openExternal('https://github.com/tiddly-gittly/tiddlygit-desktop/issues/new?template=feature.md&title=feature%3A+'),
        },
        {
          label: 'Learn More...',
          click: () => shell.openExternal('https://github.com/tiddly-gittly/tiddlygit-desktop/'),
        },
      ],
    },
  ];
  const updaterMenuItem = {
    label: 'Check for Updates...',
    click: () => ipcMain.emit('request-check-for-updates'),
    visible: updaterEnabled,
  };
  if (global.updaterObj && global.updaterObj.status === 'update-downloaded') {
    updaterMenuItem.label = 'Restart to Apply Updates...';
  } else if (global.updaterObj && global.updaterObj.status === 'update-available') {
    updaterMenuItem.label = 'Downloading Updates...';
    (updaterMenuItem as any).enabled = false;
  } else if (global.updaterObj && global.updaterObj.status === 'download-progress') {
    const { transferred, total, bytesPerSecond } = global.updaterObj.info;
    updaterMenuItem.label = `Downloading Updates (${formatBytes(transferred)}/${formatBytes(total)} at ${formatBytes(bytesPerSecond)}/s)...`;
    (updaterMenuItem as any).enabled = false;
  } else if (global.updaterObj && global.updaterObj.status === 'checking-for-update') {
    updaterMenuItem.label = 'Checking for Updates...';
    (updaterMenuItem as any).enabled = false;
  }
  if (process.platform === 'darwin') {
    template.unshift({
      label: 'TiddlyGit',
      submenu: [
        {
          label: index18next.t('ContextMenu.About'),
          click: () => aboutWindow.show(),
        },
        { type: 'separator' },
        updaterMenuItem,
        { type: 'separator' },
        {
          label: index18next.t('ContextMenu.Preferences'),
          click: () => preferencesWindow.show(),
          accelerator: 'CmdOrCtrl+,',
        },
        { type: 'separator' },
        {
          label: index18next.t('ContextMenu.Notifications'),
          click: () => notificationsWindow.show(),
          accelerator: 'CmdOrCtrl+Shift+N',
        },
        { type: 'separator' },
        {
          label: index18next.t('Preference.ClearBrowsingData'),
          click: () => ipcMain.emit('request-clear-browsing-data'),
        },
        { type: 'separator' },
        { role: 'services', submenu: [] },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideothers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  } else {
    template.unshift({
      label: 'File',
      submenu: [
        {
          label: index18next.t('ContextMenu.About'),
          click: () => aboutWindow.show(),
        },
        { type: 'separator' },
        updaterMenuItem,
        { type: 'separator' },
        {
          label: index18next.t('ContextMenu.Preferences'),
          accelerator: 'CmdOrCtrl+,',
          click: () => preferencesWindow.show(),
        },
        { type: 'separator' },
        {
          label: index18next.t('ContextMenu.Notifications'),
          click: () => notificationsWindow.show(),
          accelerator: 'CmdOrCtrl+Shift+N',
        },
        { type: 'separator' },
        {
          label: index18next.t('Preference.ClearBrowsingData'),
          accelerator: 'CmdOrCtrl+Shift+Delete',
          click: () => ipcMain.emit('request-clear-browsing-data'),
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ],
    });
  }
  Object.values(workspaces)
    // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
    .sort((a, b) => a.order - b.order)
    .forEach((workspace, index) => {
      template[4].submenu.push({
        // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
        label: workspace.name || `Workspace ${index + 1}`,
        type: 'checkbox',
        // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
        checked: workspace.active,
        click: () => {
          // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
          setActiveWorkspaceView(workspace.id);
          createMenu();
        },
        accelerator: `CmdOrCtrl+${index + 1}`,
      });
      template[2].submenu[template[2].submenu.length - 1].submenu.push({
        // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
        label: workspace.name || `Workspace ${index + 1}`,
        click: () => {
          // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
          const v = getView(workspace.id);
          v.webContents.toggleDevTools();
        },
      });
    });
  template[4].submenu.push(
    { type: 'separator' },
    {
      label: 'Select Next Workspace',
      click: () => {
        const currentActiveWorkspace = getActiveWorkspace();
        const nextWorkspace = getNextWorkspace(currentActiveWorkspace.id);
        setActiveWorkspaceView(nextWorkspace.id);
        createMenu();
      },
      accelerator: 'CmdOrCtrl+Shift+]',
      enabled: hasWorkspaces,
    },
    {
      label: 'Select Previous Workspace',
      click: () => {
        const currentActiveWorkspace = getActiveWorkspace();
        const previousWorkspace = getPreviousWorkspace(currentActiveWorkspace.id);
        setActiveWorkspaceView(previousWorkspace.id);
        createMenu();
      },
      accelerator: 'CmdOrCtrl+Shift+[',
      enabled: hasWorkspaces,
    },
    { type: 'separator' },
    {
      label: 'Edit Current Workspace',
      click: () => {
        const activeWorkspace = getActiveWorkspace();
        editWorkspaceWindow.show(activeWorkspace.id);
      },
      enabled: hasWorkspaces,
    },
    {
      label: 'Remove Current Workspace',
      click: () => {
        const activeWorkspace = getActiveWorkspace();
        ipcMain.emit('request-remove-workspace', null, activeWorkspace.id);
      },
      enabled: hasWorkspaces,
    },
    { type: 'separator' },
    {
      label: 'Add Workspace',
      click: () => {
        addWorkspaceWindow.show();
      },
    },
  );
  // @ts-expect-error ts-migrate(2345) FIXME: Argument of type '({ label: string; submenu: any; ... Remove this comment to see the full error message
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
module.exports = createMenu;
