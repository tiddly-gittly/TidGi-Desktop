export enum PreferenceChannel {
  update = 'update',
  requestResetPreferences = 'request-reset-preferences',
  requestShowRequireRestartDialog = 'request-show-require-restart-dialog',
  getPreference = 'get-preference',
  getPreferences = 'get-preferences',
  requestSetPreference = 'request-set-preference',
}

export enum WindowChannel {
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

export type Channels = PreferenceChannel;
