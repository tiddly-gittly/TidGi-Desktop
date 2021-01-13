export enum PreferenceChannel {
  update = 'update',
  requestResetPreferences = 'request-reset-preferences',
  requestShowRequireRestartDialog = 'request-show-require-restart-dialog',
  getPreference = 'get-preference',
  getPreferences = 'get-preferences',
  requestSetPreference = 'request-set-preference',
  requestClearBrowsingData = 'request-clear-browsing-data',
}

export enum WindowChannel {
  requestShowRequireRestartDialog = 'request-show-require-restart-dialog',
  requestShowPreferencesWindow = 'request-show-preferences-window',
  requestShowAboutWindow = 'request-show-about-window',
  requestShowCustomUserAgentWindow = 'request-show-custom-user-agent-window',
  requestShowCodeInjectionWindow = 'request-show-code-injection-window',
  requestShowAddWorkspaceWindow = 'request-show-add-workspace-window',
  requestShowEditWorkspaceWindow = 'request-show-edit-workspace-window',
  requestShowNotificationsWindow = 'request-show-notifications-window',
  requestShowProxyWindow = 'request-show-proxy-window',
  requestShowSpellcheckLanguagesWindow = 'request-show-spellcheck-languages-window',
}

export enum ThemeChannel {
  nativeThemeUpdated = 'native-theme-updated',
}

export enum I18NChannels {
  readFileRequest = 'ReadFile-Request',
  writeFileRequest = 'WriteFile-Request',
  readFileResponse = 'ReadFile-Response',
  writeFileResponse = 'WriteFile-Response',
  changeLanguageRequest = 'ChangeLanguage-Request',
}

export enum MetaDataChannel {
  getViewMetaData = 'getViewMetaData',
}

export type Channels = PreferenceChannel | WindowChannel | ThemeChannel | I18NChannels | MetaDataChannel;
