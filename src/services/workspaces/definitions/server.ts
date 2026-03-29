import StorageIcon from '@mui/icons-material/Storage';
import type { IGenericSectionDefinition } from '@services/preferences/definitions/types';

/**
 * Server section is entirely custom-rendered (HTTPS cert upload, port with URL preview, etc.).
 * CustomSectionComponent is wired at UI layer via registerWorkspaceCustomSections().
 */
export const serverSection: IGenericSectionDefinition = {
  id: 'server',
  titleKey: 'EditWorkspace.ServerOptions',
  Icon: StorageIcon,
  items: [],
};
