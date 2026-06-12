import BrushIcon from '@mui/icons-material/Brush';
import type { IGenericSectionDefinition } from '@services/preferences/definitions/types';

export const appearanceSection: IGenericSectionDefinition = {
  id: 'appearance',
  titleKey: 'EditWorkspace.AppearanceOptions',
  Icon: BrushIcon,
  items: [
    {
      type: 'preference-string',
      key: 'name',
      titleKey: 'EditWorkspace.Name',
      descriptionKey: 'EditWorkspace.NameDescription',
    },
    { type: 'divider' },
    {
      type: 'custom',
      componentId: 'workspace.avatar',
      titleKey: 'EditWorkspace.SelectLocal',
    },
  ],
};
