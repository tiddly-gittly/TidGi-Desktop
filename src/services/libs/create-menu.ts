import { Menu, clipboard, ipcMain, shell } from 'electron';
import { getLanguageMenu } from './i18n/i18next-electron-fs-backend';
// @ts-expect-error ts-migrate(1192) FIXME: Module '"/Users/linonetwo/Desktop/repo/TiddlyGit-D... Remove this comment to see the full error message
import aboutWindow from '../windows/about';
// @ts-expect-error ts-migrate(1192) FIXME: Module '"/Users/linonetwo/Desktop/repo/TiddlyGit-D... Remove this comment to see the full error message
import addWorkspaceWindow from '../windows/add-workspace';
// @ts-expect-error ts-migrate(1192) FIXME: Module '"/Users/linonetwo/Desktop/repo/TiddlyGit-D... Remove this comment to see the full error message
import editWorkspaceWindow from '../windows/edit-workspace';
// @ts-expect-error ts-migrate(1192) FIXME: Module '"/Users/linonetwo/Desktop/repo/TiddlyGit-D... Remove this comment to see the full error message
import goToUrlWindow from '../windows/go-to-url';
import * as mainWindow from '../windows/main';
// @ts-expect-error ts-migrate(1192) FIXME: Module '"/Users/linonetwo/Desktop/repo/TiddlyGit-D... Remove this comment to see the full error message
import notificationsWindow from '../windows/notifications';
// @ts-expect-error ts-migrate(1192) FIXME: Module '"/Users/linonetwo/Desktop/repo/TiddlyGit-D... Remove this comment to see the full error message
import preferencesWindow from '../windows/preferences';
import i18next from './i18n';
import formatBytes from './format-bytes';
import getViewBounds from './get-view-bounds';
import { getWorkspaces, getActiveWorkspace, getNextWorkspace, getPreviousWorkspace } from './workspaces';
import { setActiveWorkspaceView } from '../workspacesView';
import { getView, getActiveBrowserView } from '../view';
function createMenu() {
  const updaterEnabled = process.env.SNAP == undefined && !process.mas && !process.windowsStore;
  const workspaces = getWorkspaces();
  const hasWorkspaces = Object.keys(workspaces).length > 0;

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
          label: i18next.t('ContextMenu.About'),
          click: () => aboutWindow.show(),
        },
        { type: 'separator' },
        updaterMenuItem,
        { type: 'separator' },
        {
          label: i18next.t('ContextMenu.Preferences'),
          click: () => preferencesWindow.show(),
          // @ts-expect-error ts-migrate(2322) FIXME: Type '{ label: any; click: () => any; accelerator:... Remove this comment to see the full error message
          accelerator: 'CmdOrCtrl+,',
        },
        { type: 'separator' },
        {
          label: i18next.t('ContextMenu.Notifications'),
          click: () => notificationsWindow.show(),
          // @ts-expect-error ts-migrate(2322) FIXME: Type '{ label: any; click: () => any; accelerator:... Remove this comment to see the full error message
          accelerator: 'CmdOrCtrl+Shift+N',
        },
        { type: 'separator' },
        {
          label: i18next.t('Preference.ClearBrowsingData'),
          click: () => ipcMain.emit('request-clear-browsing-data'),
        },
        { type: 'separator' },
        // @ts-expect-error ts-migrate(2322) FIXME: Type 'string' is not assignable to type 'undefined... Remove this comment to see the full error message
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
          label: i18next.t('ContextMenu.About'),
          click: () => aboutWindow.show(),
        },
        { type: 'separator' },
        updaterMenuItem,
        { type: 'separator' },
        {
          label: i18next.t('ContextMenu.Preferences'),
          // @ts-expect-error ts-migrate(2322) FIXME: Type '{ label: any; accelerator: string; click: ()... Remove this comment to see the full error message
          accelerator: 'CmdOrCtrl+,',
          click: () => preferencesWindow.show(),
        },
        { type: 'separator' },
        {
          label: i18next.t('ContextMenu.Notifications'),
          click: () => notificationsWindow.show(),
          // @ts-expect-error ts-migrate(2322) FIXME: Type '{ label: any; click: () => any; accelerator:... Remove this comment to see the full error message
          accelerator: 'CmdOrCtrl+Shift+N',
        },
        { type: 'separator' },
        {
          label: i18next.t('Preference.ClearBrowsingData'),
          // @ts-expect-error ts-migrate(2322) FIXME: Type '{ label: any; accelerator: string; click: ()... Remove this comment to see the full error message
          accelerator: 'CmdOrCtrl+Shift+Delete',
          click: () => ipcMain.emit('request-clear-browsing-data'),
        },
        { type: 'separator' },
        // @ts-expect-error ts-migrate(2322) FIXME: Type 'string' is not assignable to type 'undefined... Remove this comment to see the full error message
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
        // @ts-expect-error ts-migrate(2322) FIXME: Type 'string' is not assignable to type 'undefined... Remove this comment to see the full error message
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
      (template[2].submenu[template[2].submenu.length - 1] as any).submenu.push({
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
    // @ts-expect-error ts-migrate(2322) FIXME: Type 'string' is not assignable to type 'undefined... Remove this comment to see the full error message
    { type: 'separator' },
    {
      label: 'Select Next Workspace',
      click: () => {
        const currentActiveWorkspace = getActiveWorkspace();
        // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
        const nextWorkspace = getNextWorkspace(currentActiveWorkspace.id);
        // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
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
        // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
        const previousWorkspace = getPreviousWorkspace(currentActiveWorkspace.id);
        // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
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
        // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
        editWorkspaceWindow.show(activeWorkspace.id);
      },
      enabled: hasWorkspaces,
    },
    {
      label: 'Remove Current Workspace',
      click: () => {
        const activeWorkspace = getActiveWorkspace();
        // @ts-expect-error ts-migrate(2571) FIXME: Object is of type 'unknown'.
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
  // @ts-expect-error ts-migrate(2345) FIXME: Argument of type '({ label: string; submenu: ({ la... Remove this comment to see the full error message
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
export default createMenu;
