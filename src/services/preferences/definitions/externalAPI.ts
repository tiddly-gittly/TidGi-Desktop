import ApiIcon from '@mui/icons-material/Api';
import type { ISectionDefinition } from './types';

export const externalAPISection: ISectionDefinition = {
  id: 'externalAPI',
  titleKey: 'Preference.ExternalAPI',
  ns: 'agent',
  Icon: ApiIcon,
  items: [
    {
      type: 'action',
      titleKey: 'Preference.ExternalAPIConfig',
      descriptionKey: 'Preference.ExternalAPIConfigDescription',
      ns: 'agent',
      handler: 'externalAPI.configure',
    },
  ],
};
