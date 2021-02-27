import { PreferenceSections } from '@services/preferences/interface';

export enum WindowNames {
  newWindow = 'newWindow',
  main = 'main',
  view = 'view',
  addWorkspace = 'addWorkspace',
  editWorkspace = 'editWorkspace',
  preferences = 'preferences',
  about = 'about',
  spellcheck = 'spellcheck',
  auth = 'auth',
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
  [WindowNames.preferences]: {
    width: 820,
    height: 640,
  },
  [WindowNames.notifications]: {
    width: 400,
    height: 565,
  },
  [WindowNames.spellcheck]: {
    width: 400,
    height: 590,
  },
};

export interface IPreferenceWindowMeta {
  gotoTab?: PreferenceSections;
  preventClosingWindow?: boolean;
}

/**
 * metadata that send to window when create them.
 * Please make all property partial (?:), so wo can always assign {} as default metadata without type warning
 */
export interface WindowMeta {
  [WindowNames.editWorkspace]: { workspaceID?: string };
  [WindowNames.main]: { forceClose?: boolean };
  [WindowNames.preferences]: IPreferenceWindowMeta;
  [WindowNames.about]: undefined;
  [WindowNames.auth]: undefined;
  [WindowNames.view]: undefined;
  [WindowNames.newWindow]: undefined;
  [WindowNames.addWorkspace]: undefined;
  [WindowNames.notifications]: undefined;
  [WindowNames.spellcheck]: undefined;
}
export type IPossibleWindowMeta<M extends WindowMeta[WindowNames] = WindowMeta[WindowNames.main]> = {
  windowName: WindowNames;
} & M;

/**
 * Similar to WindowMeta, but is for BrowserView (workspace web content) and popup window from the BrowserView
 */
export interface IBrowserViewMetaData {
  isPopup?: boolean;
  workspaceID?: string;
}
