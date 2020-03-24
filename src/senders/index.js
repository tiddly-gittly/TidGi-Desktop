
const { ipcRenderer } = window.require('electron');

export const requestOpenInBrowser = (url) => ipcRenderer.send('request-open-in-browser', url);
export const requestShowMessageBox = (message, type) => ipcRenderer.send('request-show-message-box', message, type);
export const requestLoadUrl = (url, id) => ipcRenderer.send('request-load-url', url, id);

export const requestGoHome = () => ipcRenderer.send('request-go-home');
export const requestGoBack = () => ipcRenderer.send('request-go-back');
export const requestGoForward = () => ipcRenderer.send('request-go-forward');
export const requestReload = () => ipcRenderer.send('request-reload');

export const requestQuit = () => ipcRenderer.send('request-quit');
export const requestCheckForUpdates = (isSilent) => ipcRenderer.send('request-check-for-updates', isSilent);

export const requestShowAboutWindow = () => ipcRenderer.send('request-show-about-window');
export const requestShowAddWorkspaceWindow = () => ipcRenderer.send('request-show-add-workspace-window');
export const requestShowCodeInjectionWindow = (type) => ipcRenderer.send('request-show-code-injection-window', type);
export const requestShowCustomUserAgentWindow = () => ipcRenderer.send('request-show-custom-user-agent-window');
export const requestShowEditWorkspaceWindow = (id) => ipcRenderer.send('request-show-edit-workspace-window', id);
export const requestShowLicenseRegistrationWindow = () => ipcRenderer.send('request-show-license-registration-window');
export const requestShowNotificationsWindow = () => ipcRenderer.send('request-show-notifications-window');
export const requestShowPreferencesWindow = (scrollTo) => ipcRenderer.send('request-show-preferences-window', scrollTo);
export const requestShowProxyWindow = () => ipcRenderer.send('request-show-proxy-window');
export const requestShowSpellcheckLanguagesWindow = () => ipcRenderer.send('request-show-spellcheck-languages-window');

// Notifications
export const requestShowNotification = (opts) => ipcRenderer.send('request-show-notification', opts);
export const requestUpdatePauseNotificationsInfo = () => ipcRenderer.send('request-update-pause-notifications-info');
export const getPauseNotificationsInfo = () => ipcRenderer.sendSync('get-pause-notifications-info');

// Preferences
export const getPreference = (name) => ipcRenderer.sendSync('get-preference', name);
export const getPreferences = () => ipcRenderer.sendSync('get-preferences');
export const requestSetPreference = (name, value) => ipcRenderer.send('request-set-preference', name, value);
export const requestResetPreferences = () => ipcRenderer.send('request-reset-preferences');
export const requestShowRequireRestartDialog = () => ipcRenderer.send('request-show-require-restart-dialog');

// System Preferences
export const getSystemPreference = (name) => ipcRenderer.sendSync('get-system-preference', name);
export const getSystemPreferences = () => ipcRenderer.sendSync('get-system-preferences');
export const requestSetSystemPreference = (name, value) => ipcRenderer.send('request-set-system-preference', name, value);

// Workspace
export const getWorkspace = (id) => ipcRenderer.sendSync('get-workspace', id);
export const getWorkspaces = () => ipcRenderer.sendSync('get-workspaces');
export const requestClearBrowsingData = () => ipcRenderer.send('request-clear-browsing-data');
export const requestCreateWorkspace = (name, homeUrl, picture, transparentBackground) => ipcRenderer.send('request-create-workspace', name, homeUrl, picture, transparentBackground);
export const requestHibernateWorkspace = (id) => ipcRenderer.send('request-hibernate-workspace', id);
export const requestOpenUrlInWorkspace = (url, id) => ipcRenderer.send('request-open-url-in-workspace', url, id);
export const requestRealignActiveWorkspace = () => ipcRenderer.send('request-realign-active-workspace');
export const requestRemoveWorkspace = (id) => ipcRenderer.send('request-remove-workspace', id);
export const requestRemoveWorkspacePicture = (id) => ipcRenderer.send('request-remove-workspace-picture', id);
export const requestSetActiveWorkspace = (id) => ipcRenderer.send('request-set-active-workspace', id);
export const requestSetWorkspace = (id, opts) => ipcRenderer.send('request-set-workspace', id, opts);
export const requestSetWorkspacePicture = (id, picturePath) => ipcRenderer.send('request-set-workspace-picture', id, picturePath);
export const requestWakeUpWorkspace = (id) => ipcRenderer.send('request-wake-up-workspace', id);

// Find In Page
export const requestFindInPage = (text, forward) => ipcRenderer.send('request-find-in-page', text, forward);
export const requestStopFindInPage = (close) => ipcRenderer.send('request-stop-find-in-page', close);

// Auth
export const requestValidateAuthIdentity = (windowId, username, password) => ipcRenderer.send('request-validate-auth-identity', windowId, username, password);

// Native Theme
export const getShouldUseDarkColors = () => ipcRenderer.sendSync('get-should-use-dark-colors');
export const getThemeSource = () => ipcRenderer.sendSync('get-theme-source');
export const requestSetThemeSource = (val) => ipcRenderer.send('request-set-theme-source', val);
