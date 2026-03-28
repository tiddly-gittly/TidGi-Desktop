import LanguageIcon from '@mui/icons-material/Language';
import { z } from 'zod';
import type { ISectionDefinition } from './types';

export const languagesSection: ISectionDefinition = {
  id: 'languages',
  titleKey: 'Preference.Languages',
  Icon: LanguageIcon,
  items: [
    {
      type: 'custom',
      titleKey: 'Preference.ChooseLanguage',
      componentId: 'languages.selector',
    },
    { type: 'divider' },
    {
      type: 'preference-boolean',
      key: 'spellcheck',
      titleKey: 'Preference.SpellCheck',
      needsRestart: true,
      zod: z.boolean(),
    },
    { type: 'divider' },
    {
      type: 'custom',
      titleKey: 'Preference.SpellCheckLanguages',
      platform: '!darwin',
      componentId: 'languages.spellcheckLanguages',
    },
  ],
};
