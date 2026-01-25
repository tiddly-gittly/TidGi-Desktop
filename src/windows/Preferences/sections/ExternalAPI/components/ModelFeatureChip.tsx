import { Chip } from '@mui/material';
import defaultProvidersConfig from '@services/externalAPI/defaultProviders';
import { useTranslation } from 'react-i18next';

export function ModelFeatureChip({ feature }: { feature: string }) {
  const { t } = useTranslation('agent');

  const getFeatureLabel = (featureValue: string) => {
    const featureDefinition = defaultProvidersConfig.modelFeatures.find(f => f.value === featureValue);
    if (featureDefinition) {
      // featureDefinition.i18nKey is "ModelFeature.Language" etc.
      // pass it to t()
      return t(featureDefinition.i18nKey);
    }
    return featureValue;
  };

  return (
    <Chip
      label={getFeatureLabel(feature)}
      size='small'
      variant='outlined'
      sx={{ fontSize: '0.7rem', height: 20 }}
    />
  );
}
