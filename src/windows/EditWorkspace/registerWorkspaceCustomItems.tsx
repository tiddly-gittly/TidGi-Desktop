/**
 * Registers workspace custom item components with the shared preferences component registry.
 */
import { registerCustomComponent } from '../Preferences/customComponentRegistry';
import { WorkspaceAvatarItem } from './customItems/AppearanceItems';
import { WorkspaceEmbeddingItem } from './customItems/EmbeddingItem';
import { LastUrlItem } from './customItems/MiscItems';
import { GitRepoUrlItem, StorageServiceSwitchItem, TokenFormItem, WorkspacePathItem } from './customItems/SaveAndSyncItems';
import {
  ServerAuthHeaderItem,
  ServerAuthTokenItem,
  ServerExcludedPluginsItem,
  ServerHttpsCertItems,
  ServerHttpsToggleItem,
  ServerLastNodeJSArgvItem,
  ServerPortItem,
  ServerReadOnlyModeItem,
  ServerRootTiddlerItem,
  ServerTokenAuthItem,
} from './customItems/ServerItems';
import { SubWikiBoundWorkspacesItem, SubWikiFileSystemPathFilterItem, SubWikiMainWorkspaceItem, SubWikiTagDescriptionItem, SubWikiTagNamesItem } from './customItems/SubWikiItems';

let registered = false;

export function registerWorkspaceCustomItems(): void {
  if (registered) return;
  registered = true;

  registerCustomComponent('workspace.avatar', WorkspaceAvatarItem);
  registerCustomComponent('workspace.path', WorkspacePathItem);
  registerCustomComponent('workspace.storageServiceSwitch', StorageServiceSwitchItem);
  registerCustomComponent('workspace.tokenForm', TokenFormItem);
  registerCustomComponent('workspace.gitRepoUrl', GitRepoUrlItem);
  registerCustomComponent('workspace.lastUrl', LastUrlItem);
  registerCustomComponent('workspace.embedding', WorkspaceEmbeddingItem);

  registerCustomComponent('workspace.server.port', ServerPortItem);
  registerCustomComponent('workspace.server.tokenAuth', ServerTokenAuthItem);
  registerCustomComponent('workspace.server.authToken', ServerAuthTokenItem);
  registerCustomComponent('workspace.server.authHeader', ServerAuthHeaderItem);
  registerCustomComponent('workspace.server.lastNodeJSArgv', ServerLastNodeJSArgvItem);
  registerCustomComponent('workspace.server.readOnlyMode', ServerReadOnlyModeItem);
  registerCustomComponent('workspace.server.excludedPlugins', ServerExcludedPluginsItem);
  registerCustomComponent('workspace.server.httpsToggle', ServerHttpsToggleItem);
  registerCustomComponent('workspace.server.httpsCert', ServerHttpsCertItems);
  registerCustomComponent('workspace.server.rootTiddler', ServerRootTiddlerItem);

  registerCustomComponent('workspace.subWiki.boundWorkspaces', SubWikiBoundWorkspacesItem);
  registerCustomComponent('workspace.subWiki.mainWorkspace', SubWikiMainWorkspaceItem);
  registerCustomComponent('workspace.subWiki.tagDescription', SubWikiTagDescriptionItem);
  registerCustomComponent('workspace.subWiki.tagNames', SubWikiTagNamesItem);
  registerCustomComponent('workspace.subWiki.fileSystemPathFilter', SubWikiFileSystemPathFilterItem);
}
