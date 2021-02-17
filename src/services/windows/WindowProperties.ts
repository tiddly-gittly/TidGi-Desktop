export enum WindowNames {
  newWindow = 'newWindow',
  main = 'main',
  view = 'view',
  addWorkspace = 'addWorkspace',
  editWorkspace = 'editWorkspace',
  preferences = 'preferences',
  about = 'about',
  userAgent = 'userAgent',
  proxy = 'proxy',
  spellcheck = 'spellcheck',
  auth = 'auth',
  displayMedia = 'displayMedia',
  goToUrl = 'goToUrl',
  openUrlWith = 'openUrlWith',
  notifications = 'notifications',
}

/**
 * Width height of windows
 */
export const windowDimension: Record<WindowNames, { width?: number; height?: number }> = {
  [WindowNames.main]: {
    width: 1200,
    height: 768,
  },
  [WindowNames.about]: {
    width: 400,
    height: 420,
  },
  [WindowNames.auth]: {
    width: 400,
    height: 220,
  },
  [WindowNames.view]: {
    width: undefined,
    height: undefined,
  },
  [WindowNames.newWindow]: {
    width: undefined,
    height: undefined,
  },
  [WindowNames.addWorkspace]: {
    width: 600,
    height: 800,
  },
  [WindowNames.editWorkspace]: {
    width: 420,
    height: 700,
  },
  [WindowNames.displayMedia]: {
    width: 400,
    height: 600,
  },
  [WindowNames.preferences]: {
    width: 820,
    height: 640,
  },
  [WindowNames.userAgent]: {
    width: 400,
    height: 180,
  },
  [WindowNames.userAgent]: {
    width: 400,
    height: 180,
  },
  [WindowNames.goToUrl]: {
    width: 400,
    height: 170,
  },
  [WindowNames.openUrlWith]: {
    width: 400,
    height: 530,
  },
  [WindowNames.notifications]: {
    width: 400,
    height: 565,
  },
  [WindowNames.spellcheck]: {
    width: 400,
    height: 590,
  },
  [WindowNames.proxy]: {
    width: 500,
    height: 590,
  },
};

/**
 * metadata that send to window when create them.
 * Please make all property partial (?:), so wo can always assign {} as default metadata without type warning
 */
export interface WindowMeta extends Record<WindowNames, Record<string, unknown> | undefined> {
  [WindowNames.displayMedia]: { displayMediaRequestedViewID?: number };
  [WindowNames.editWorkspace]: { workspaceID?: string };
  [WindowNames.openUrlWith]: { incomingUrl?: string };
  [WindowNames.main]: { forceClose?: boolean };
  [WindowNames.preferences]: { gotoTab?: string };
}
export type IPossibleWindowMeta = {
  windowName: WindowNames;
} & WindowMeta[WindowNames];

/**
 * Similar to WindowMeta, but is for BrowserView (workspace web content) and popup window from the BrowserView
 */
export interface IBrowserViewMetaData {
  isPopup?: boolean;
  workspaceID?: string;
}
