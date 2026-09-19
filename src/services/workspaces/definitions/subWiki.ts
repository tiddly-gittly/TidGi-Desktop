import AccountTreeIcon from '@mui/icons-material/AccountTree';
import type { IGenericSectionDefinition } from '@services/preferences/definitions/types';

export const subWikiSection: IGenericSectionDefinition = {
  id: 'subWiki',
  titleKey: 'EditWorkspace.SubWikiSectionTitle',
  Icon: AccountTreeIcon,
  items: [
    {
      type: 'preference-boolean',
      key: 'isSubWiki',
      titleKey: 'EditWorkspace.IsSubWorkspace',
      descriptionKey: 'EditWorkspace.IsSubWorkspaceDescription',
      needsRestart: true,
    },
    {
      type: 'custom',
      componentId: 'workspace.subWiki.boundWorkspaces',
      titleKey: 'EditWorkspace.BoundSubWorkspacesTitle',
      descriptionKey: 'EditWorkspace.BoundSubWorkspacesDescription',
    },
    {
      type: 'custom',
      componentId: 'workspace.subWiki.mainWorkspace',
      titleKey: 'AddWorkspace.MainWorkspaceLocation',
    },
    {
      type: 'custom',
      componentId: 'workspace.subWiki.tagDescription',
      titleKey: 'AddWorkspace.SubWorkspaceOptions',
    },
    {
      type: 'custom',
      componentId: 'workspace.subWiki.tagNames',
      titleKey: 'AddWorkspace.TagName',
    },
    {
      type: 'preference-boolean',
      key: 'includeTagTree',
      titleKey: 'AddWorkspace.IncludeTagTree',
      descriptionKey: 'AddWorkspace.IncludeTagTreeHelp',
      needsRestart: true,
    },
    {
      type: 'preference-boolean',
      key: 'fileSystemPathFilterEnable',
      titleKey: 'AddWorkspace.UseFilter',
      descriptionKey: 'AddWorkspace.UseFilterHelp',
      needsRestart: true,
    },
    {
      type: 'custom',
      componentId: 'workspace.subWiki.fileSystemPathFilter',
      titleKey: 'AddWorkspace.FilterExpression',
      descriptionKey: 'AddWorkspace.FilterExpressionHelp',
    },
    {
      type: 'preference-boolean',
      key: 'ignoreSymlinks',
      titleKey: 'EditWorkspace.IgnoreSymlinks',
      descriptionKey: 'EditWorkspace.IgnoreSymlinksDescription',
      needsRestart: true,
    },
  ],
};
