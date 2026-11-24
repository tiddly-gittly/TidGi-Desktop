import type { PromptEditorLabels } from '@memeloop/react-ui/web';
import type { TFunction } from 'i18next';

export function getPromptEditorLabels(t: TFunction<'agent'>): PromptEditorLabels {
  return {
    tagsPlaceholder: t('PromptConfig.Tags.Placeholder'),
    tagsHelperText: t('PromptConfig.Tags.HelperText'),
    noneOption: t('PromptConfig.NoneOption'),
    configurationSections: t('PromptConfig.ConfigurationSections'),
    arrayItem: (title, index) => title ? `${title} ${index + 1}` : t('PromptConfig.ItemIndex', { index: index + 1 }),
    expandArrayItem: t('PromptConfig.Expand'),
    collapseArrayItem: t('PromptConfig.Collapse'),
  };
}
