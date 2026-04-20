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
    { type: 'divider' },
    // Model selection items (complex dropdowns rendered by CustomSectionComponent)
    {
      type: 'custom',
      componentId: 'externalAPI.defaultAIModel',
      titleKey: 'Preference.DefaultAIModelSelection',
      descriptionKey: 'Preference.DefaultAIModelSelectionDescription',
    },
    {
      type: 'custom',
      componentId: 'externalAPI.defaultEmbeddingModel',
      titleKey: 'Preference.DefaultEmbeddingModelSelection',
      descriptionKey: 'Preference.DefaultEmbeddingModelSelectionDescription',
    },
    {
      type: 'custom',
      componentId: 'externalAPI.defaultSpeechModel',
      titleKey: 'Preference.DefaultSpeechModelSelection',
      descriptionKey: 'Preference.DefaultSpeechModelSelectionDescription',
    },
    {
      type: 'custom',
      componentId: 'externalAPI.defaultImageModel',
      titleKey: 'Preference.DefaultImageGenerationModelSelection',
      descriptionKey: 'Preference.DefaultImageGenerationModelSelectionDescription',
    },
    {
      type: 'custom',
      componentId: 'externalAPI.defaultTranscriptionsModel',
      titleKey: 'Preference.DefaultTranscriptionsModelSelection',
      descriptionKey: 'Preference.DefaultTranscriptionsModelSelectionDescription',
    },
    {
      type: 'custom',
      componentId: 'externalAPI.defaultFreeModel',
      titleKey: 'Preference.DefaultFreeModelSelection',
      descriptionKey: 'Preference.DefaultFreeModelSelectionDescription',
    },
    {
      type: 'custom',
      componentId: 'externalAPI.modelParameters',
      titleKey: 'Preference.ModelParameters',
      descriptionKey: 'Preference.ModelParametersDescription',
      ns: 'agent',
    },
  ],
};
