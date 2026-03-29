import AccountTreeIcon from '@mui/icons-material/AccountTree';
import type { IGenericSectionDefinition } from '@services/preferences/definitions/types';

/**
 * SubWorkspace section is entirely custom-rendered (tag routing, filter, linked workspace list).
 * CustomSectionComponent is wired at UI layer via registerWorkspaceCustomSections().
 */
export const subWikiSection: IGenericSectionDefinition = {
  id: 'subWiki',
  titleKey: 'EditWorkspace.SubWikiSectionTitle',
  Icon: AccountTreeIcon,
  items: [],
};
