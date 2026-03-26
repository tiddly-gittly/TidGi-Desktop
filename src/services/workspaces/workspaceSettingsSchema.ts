import type { ISyncableWikiConfig } from './interface';

export type WorkspaceSettingsSection = 'appearance' | 'saveAndSync' | 'server' | 'misc';

/**
 * Metadata for a single editable workspace setting field.
 */
export interface IWorkspaceSettingPropertySchema {
  /** i18n description key (optional) */
  descriptionKey?: string;
  /** For enum fields: allowed values */
  enum?: string[];
  /** For enum fields: i18n label keys */
  enumNames?: string[];
  /** Whether the field can be edited inline in search results */
  inlineEditable: boolean;
  /** JSON Schema type */
  type: 'boolean' | 'number' | 'string';
  /** Side-effect flag: triggers restart when changed */
  needsRestart?: boolean;
  /** Section this field belongs to */
  section: WorkspaceSettingsSection;
  /** i18n title key (required for search) */
  titleKey: string;
}

/** Section title i18n keys for workspace settings */
export const workspaceSectionTitleKeys: Record<WorkspaceSettingsSection, string> = {
  appearance: 'EditWorkspace.AppearanceOptions',
  saveAndSync: 'EditWorkspace.SaveAndSyncOptions',
  server: 'EditWorkspace.ServerOptions',
  misc: 'EditWorkspace.MiscOptions',
};

/**
 * Flat schema for all user-editable IWikiWorkspace fields.
 * Drives both the grouped normal view and the flat search results view.
 *
 * Fields that require complex dedicated UI (file pickers, cert uploads, etc.)
 * have inlineEditable: false so the search view shows a "navigate to section" hint.
 */
export const workspaceSettingsSchema: Partial<Record<keyof ISyncableWikiConfig | 'port', IWorkspaceSettingPropertySchema>> = {
  // === Appearance ===
  name: {
    type: 'string',
    titleKey: 'EditWorkspace.Name',
    descriptionKey: 'EditWorkspace.NameDescription',
    section: 'appearance',
    inlineEditable: true,
  },

  // === Save & Sync ===
  backupOnInterval: {
    type: 'boolean',
    titleKey: 'EditWorkspace.BackupOnInterval',
    descriptionKey: 'EditWorkspace.BackupOnIntervalDescription',
    section: 'saveAndSync',
    inlineEditable: true,
  },
  syncOnInterval: {
    type: 'boolean',
    titleKey: 'EditWorkspace.SyncOnInterval',
    descriptionKey: 'EditWorkspace.SyncOnIntervalDescription',
    section: 'saveAndSync',
    inlineEditable: true,
  },
  syncOnStartup: {
    type: 'boolean',
    titleKey: 'EditWorkspace.SyncOnStartup',
    descriptionKey: 'EditWorkspace.SyncOnStartupDescription',
    section: 'saveAndSync',
    inlineEditable: true,
  },
  userName: {
    type: 'string',
    titleKey: 'AddWorkspace.WorkspaceUserName',
    descriptionKey: 'AddWorkspace.WorkspaceUserNameDetail',
    section: 'saveAndSync',
    inlineEditable: true,
  },
  readOnlyMode: {
    type: 'boolean',
    titleKey: 'EditWorkspace.ReadOnlyMode',
    descriptionKey: 'EditWorkspace.ReadOnlyModeDescription',
    section: 'server',
    inlineEditable: true,
  },

  // === Server ===
  port: {
    type: 'number',
    titleKey: 'EditWorkspace.Port',
    section: 'server',
    inlineEditable: true,
  },
  enableHTTPAPI: {
    type: 'boolean',
    titleKey: 'EditWorkspace.EnableHTTPAPI',
    descriptionKey: 'EditWorkspace.EnableHTTPAPIDescription',
    section: 'server',
    inlineEditable: true,
  },
  tokenAuth: {
    type: 'boolean',
    titleKey: 'EditWorkspace.TokenAuth',
    descriptionKey: 'EditWorkspace.TokenAuthDescription',
    section: 'server',
    inlineEditable: true,
  },

  // === Misc ===
  hibernateWhenUnused: {
    type: 'boolean',
    titleKey: 'EditWorkspace.HibernateTitle',
    descriptionKey: 'EditWorkspace.HibernateDescription',
    section: 'misc',
    inlineEditable: true,
  },
  disableNotifications: {
    type: 'boolean',
    titleKey: 'EditWorkspace.DisableNotificationTitle',
    descriptionKey: 'EditWorkspace.DisableNotification',
    section: 'misc',
    inlineEditable: true,
  },
  disableAudio: {
    type: 'boolean',
    titleKey: 'EditWorkspace.DisableAudioTitle',
    descriptionKey: 'EditWorkspace.DisableAudio',
    section: 'misc',
    inlineEditable: true,
  },
  enableFileSystemWatch: {
    type: 'boolean',
    titleKey: 'EditWorkspace.EnableFileSystemWatchTitle',
    descriptionKey: 'EditWorkspace.EnableFileSystemWatchDescription',
    section: 'misc',
    inlineEditable: true,
  },
  ignoreSymlinks: {
    type: 'boolean',
    titleKey: 'EditWorkspace.IgnoreSymlinks',
    descriptionKey: 'EditWorkspace.IgnoreSymlinksDescription',
    section: 'misc',
    inlineEditable: true,
  },
  tagNames: {
    type: 'string',
    titleKey: 'AddWorkspace.TagName',
    descriptionKey: 'AddWorkspace.TagNameHelp',
    section: 'misc',
    inlineEditable: false,
  },
  fileSystemPathFilterEnable: {
    type: 'boolean',
    titleKey: 'AddWorkspace.UseFilter',
    descriptionKey: 'AddWorkspace.UseFilterHelp',
    section: 'misc',
    inlineEditable: true,
  },
};
