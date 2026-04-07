import SmartToyIcon from '@mui/icons-material/SmartToy';
import type { ISectionDefinition } from './types';

export const aiModelsSection: ISectionDefinition = {
  id: 'aiModels',
  titleKey: 'Preference.AIModels',
  ns: 'agent',
  Icon: SmartToyIcon,
  items: [
    {
      type: 'custom',
      titleKey: 'Preference.DefaultAIModelSelection',
      descriptionKey: 'Preference.DefaultAIModelSelectionDescription',
      componentId: 'aiModels.selectors',
    },
    {
      type: 'custom',
      titleKey: 'Preference.DefaultEmbeddingModelSelection',
      descriptionKey: 'Preference.DefaultEmbeddingModelSelectionDescription',
      componentId: 'aiModels.selectors',
    },
    {
      type: 'custom',
      titleKey: 'Preference.DefaultFreeModelSelection',
      descriptionKey: 'Preference.DefaultFreeModelSelectionDescription',
      componentId: 'aiModels.selectors',
    },
    {
      type: 'custom',
      titleKey: 'Preference.DefaultImageGenerationModelSelection',
      descriptionKey: 'Preference.DefaultImageGenerationModelSelectionDescription',
      componentId: 'aiModels.selectors',
    },
    {
      type: 'custom',
      titleKey: 'Preference.DefaultSpeechModelSelection',
      descriptionKey: 'Preference.DefaultSpeechModelSelectionDescription',
      componentId: 'aiModels.selectors',
    },
    {
      type: 'custom',
      titleKey: 'Preference.DefaultTranscriptionsModelSelection',
      descriptionKey: 'Preference.DefaultTranscriptionsModelSelectionDescription',
      componentId: 'aiModels.selectors',
    },
  ],
};
