import FolderIcon from '@mui/icons-material/Folder';
import type { ISectionDefinition } from './types';

export const workspaceGroupsSection: ISectionDefinition = {
  id: 'workspaceGroups',
  titleKey: 'WorkspaceGroup.ManageGroups',
  Icon: FolderIcon,
  items: [
    {
      type: 'fragment-list',
      itemComponentId: 'workspaceGroups.management',
      titleKey: 'WorkspaceGroup.ManageGroups',
      descriptionKey: 'WorkspaceGroup.ManageGroupsDescription',
    },
  ],
};
