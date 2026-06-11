import StorageIcon from '@mui/icons-material/Storage';
import type { IGenericSectionDefinition } from '@services/preferences/definitions/types';

export const serverSection: IGenericSectionDefinition = {
  id: 'server',
  titleKey: 'EditWorkspace.ServerOptions',
  Icon: StorageIcon,
  items: [
    {
      type: 'preference-boolean',
      key: 'enableHTTPAPI',
      testId: 'enable-http-api-switch',
      titleKey: 'EditWorkspace.EnableHTTPAPI',
      descriptionKey: 'EditWorkspace.EnableHTTPAPIDescription',
      needsRestart: true,
    },
    {
      type: 'custom',
      componentId: 'workspace.server.port',
      titleKey: 'EditWorkspace.Port',
    },
    { type: 'divider' },
    {
      type: 'custom',
      componentId: 'workspace.server.tokenAuth',
      titleKey: 'EditWorkspace.TokenAuth',
      descriptionKey: 'EditWorkspace.TokenAuthDescription',
    },
    {
      type: 'custom',
      componentId: 'workspace.server.authToken',
      titleKey: 'EditWorkspace.TokenAuthCurrentToken',
      descriptionKey: 'EditWorkspace.TokenAuthCurrentTokenDescription',
    },
    {
      type: 'custom',
      componentId: 'workspace.server.authHeader',
      titleKey: 'EditWorkspace.TokenAuthCurrentHeader',
    },
    {
      type: 'custom',
      componentId: 'workspace.server.lastNodeJSArgv',
      titleKey: 'EditWorkspace.LastNodeJSArgv',
    },
    { type: 'divider' },
    {
      type: 'custom',
      componentId: 'workspace.server.readOnlyMode',
      titleKey: 'EditWorkspace.ReadOnlyMode',
      descriptionKey: 'EditWorkspace.ReadOnlyModeDescription',
    },
    {
      type: 'custom',
      componentId: 'workspace.server.excludedPlugins',
      titleKey: 'EditWorkspace.ExcludedPlugins',
      descriptionKey: 'EditWorkspace.ExcludedPluginsDescription',
    },
    {
      type: 'custom',
      componentId: 'workspace.server.httpsToggle',
      titleKey: 'EditWorkspace.EnableHTTPS',
      descriptionKey: 'EditWorkspace.EnableHTTPSDescription',
    },
    {
      type: 'custom',
      componentId: 'workspace.server.httpsCert',
      titleKey: 'EditWorkspace.HTTPSCertPath',
      descriptionKey: 'EditWorkspace.HTTPSCertPathDescription',
    },
    {
      type: 'custom',
      componentId: 'workspace.server.rootTiddler',
      titleKey: 'EditWorkspace.WikiRootTiddler',
      descriptionKey: 'EditWorkspace.WikiRootTiddlerDescription',
    },
  ],
};
